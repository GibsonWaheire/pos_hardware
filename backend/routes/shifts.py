from flask import Blueprint, jsonify, request
from db import db
from models import Shift, Sale, Return, OverrideApproval
from auth_utils import get_current_user
from datetime import datetime

bp = Blueprint('shifts', __name__, url_prefix='/api/shifts')


@bp.route('', methods=['GET'])
def list_shifts():
    limit = min(int(request.args.get('limit', 50)), 200)
    shifts = Shift.query.order_by(Shift.opened_at.desc()).limit(limit).all()
    return jsonify([s.to_dict() for s in shifts])


@bp.route('/current', methods=['GET'])
def get_current_shift():
    """Return the currently open or pending-close shift, if any."""
    shift = Shift.query.filter(Shift.status.in_(['open', 'pending_close'])).order_by(Shift.opened_at.desc()).first()
    if not shift:
        return jsonify({'shift': None})
    return jsonify({'shift': shift.to_dict()})


@bp.route('/open', methods=['POST'])
def open_shift():
    data = request.json or {}

    # Prevent opening a second shift while one is already open or pending close
    existing = Shift.query.filter(Shift.status.in_(['open', 'pending_close'])).first()
    if existing:
        return jsonify({'error': 'A shift is already open', 'shift': existing.to_dict()}), 409

    # Gate: last closed shift must have a FILED report before a new one can open
    from models import ShiftReport
    last_closed = (Shift.query
                   .filter(Shift.status == 'closed')
                   .order_by(Shift.closed_at.desc())
                   .first())
    if last_closed:
        last_report = ShiftReport.query.filter_by(
            shift_id=last_closed.id, type='SHIFT_DAILY'
        ).first()
        if last_report and last_report.status != 'FILED':
            return jsonify({
                'error': 'Previous shift report must be filed before opening a new shift',
                'report_id': last_report.id,
                'report_number': last_report.report_number,
                'report_status': last_report.status,
            }), 409

    user = get_current_user()
    cashier_id   = user['id']   if user else data.get('cashier_id')
    cashier_name = user['name'] if user else data.get('cashier_name', '')

    shift = Shift(
        cashier_id=cashier_id,
        cashier_name=cashier_name,
        opening_float=float(data.get('opening_float', 0)),
        status='open',
    )
    db.session.add(shift)
    db.session.commit()
    return jsonify(shift.to_dict()), 201


@bp.route('/<int:shift_id>/reconciliation', methods=['GET'])
def get_reconciliation(shift_id):
    """
    Compute expected tender totals and override summary for a shift.
    Manager/admin only.
    """
    user = get_current_user()
    if not user or user.get('role') not in ('manager', 'admin'):
        return jsonify({'error': 'Manager or admin access required'}), 403

    shift = Shift.query.get_or_404(shift_id)

    sales = [s for s in shift.sales if s.status == 'completed']

    # ── Expected cash ──────────────────────────────────────────────────────────
    cash_sales   = sum(s.total for s in sales if s.payment_method == 'cash')
    split_cash   = sum((s.cash_tendered or 0) for s in sales if s.payment_method == 'split')

    # Returns linked to this shift (via original_sale.shift_id)
    shift_sale_ids = {s.id for s in shift.sales}
    all_returns = Return.query.filter(
        Return.original_sale_id.in_(shift_sale_ids),
        Return.status == 'completed',
    ).all()

    cash_refunds  = sum(r.total_refund for r in all_returns if r.refund_method == 'cash')
    mpesa_refunds = sum(r.total_refund for r in all_returns if r.refund_method == 'mpesa')
    card_refunds  = sum(r.total_refund for r in all_returns if r.refund_method == 'card')

    expected_cash = round(shift.opening_float + cash_sales + split_cash - cash_refunds, 2)

    # ── Expected M-Pesa ────────────────────────────────────────────────────────
    mpesa_sales   = sum(
        s.total for s in sales
        if s.payment_method == 'mpesa' and s.mpesa_ref
    )
    expected_mpesa = round(mpesa_sales - mpesa_refunds, 2)

    # ── Expected card ──────────────────────────────────────────────────────────
    card_sales  = sum(s.total for s in sales if s.payment_method == 'card')
    split_card  = sum((s.card_amount or 0) for s in sales if s.payment_method == 'split')
    expected_card = round(card_sales + split_card - card_refunds, 2)

    # ── Expected other (account / store_credit) ────────────────────────────────
    other_sales   = sum(
        s.total for s in sales
        if s.payment_method not in ('cash', 'mpesa', 'card', 'split')
    )
    expected_other = round(other_sales, 2)

    total_expected = round(expected_cash + expected_mpesa + expected_card + expected_other, 2)

    # ── Override approvals in this shift window ────────────────────────────────
    opened_at  = shift.opened_at
    now        = datetime.utcnow()
    closed_at  = shift.closed_at or now

    override_q = OverrideApproval.query.filter(
        OverrideApproval.created_at >= opened_at,
        OverrideApproval.created_at <= closed_at,
    )
    if shift.cashier_id:
        override_q = override_q.filter_by(cashier_id=shift.cashier_id)
    overrides = override_q.order_by(OverrideApproval.created_at).all()

    # Compute value impact per override where not already stored
    override_details = []
    total_value_impact = 0.0
    for oa in overrides:
        impact = oa.value_impact
        if impact is None:
            # Compute from qty delta
            up = oa.unit_price or 0
            if oa.action in ('REMOVE_ITEM', 'REMOVE_COMMITTED_ITEM'):
                impact = -round((oa.original_qty or 0) * up, 2)
            elif oa.action == 'ADJUST_QTY':
                impact = round(((oa.new_qty or 0) - (oa.original_qty or 0)) * up, 2)
            else:
                impact = 0
        total_value_impact += abs(impact or 0)
        override_details.append({
            'id':           oa.id,
            'time':         oa.created_at.isoformat() if oa.created_at else None,
            'cashier_name': oa.cashier_name,
            'manager_name': oa.manager_name,
            'action':       'REMOVE_ITEM' if oa.action == 'REMOVE_COMMITTED_ITEM' else oa.action,
            'item_name':    oa.item_name,
            'original_qty': oa.original_qty,
            'new_qty':      oa.new_qty,
            'unit_price':   oa.unit_price,
            'value_impact': round(impact, 2),
        })

    total_value_impact = round(total_value_impact, 2)
    pct_of_sales = round(total_value_impact / total_expected * 100, 2) if total_expected else 0
    flagged = pct_of_sales > 5

    # ── Transaction list ────────────────────────────────────────────────────────
    all_sales = sorted(shift.sales, key=lambda s: s.created_at or datetime.min)
    by_tender = {}
    for s in sales:
        m = s.payment_method
        if m not in by_tender:
            by_tender[m] = {'count': 0, 'total': 0.0}
        by_tender[m]['count'] += 1
        by_tender[m]['total'] = round(by_tender[m]['total'] + s.total, 2)

    txn_list = [
        {
            'time':           s.created_at.isoformat() if s.created_at else None,
            'receipt_number': s.receipt_number,
            'items_count':    len(s.items),
            'tender':         s.payment_method,
            'amount':         round(s.total, 2),
            'status':         s.status,
            'mpesa_ref':      s.mpesa_ref,
        }
        for s in all_sales
    ]

    return jsonify({
        'shift': shift.to_dict(),
        'expected': {
            'cash':  expected_cash,
            'mpesa': expected_mpesa,
            'card':  expected_card,
            'other': expected_other,
            'total': total_expected,
        },
        'refunds': {
            'cash':  round(cash_refunds, 2),
            'mpesa': round(mpesa_refunds, 2),
            'card':  round(card_refunds, 2),
        },
        'overrides': {
            'count':             len(overrides),
            'total_value_impact': total_value_impact,
            'pct_of_sales':      pct_of_sales,
            'flagged':           flagged,
            'details':           override_details,
        },
        'transactions': {
            'total_count': len(sales),
            'by_tender':   by_tender,
            'list':        txn_list,
        },
    })


@bp.route('/current/cashier-end', methods=['POST'])
def cashier_end_shift():
    """
    Cashier submits their cash count and hands off to manager for final close.
    Sets shift status to 'pending_close'. Cashier can no longer make sales after this.
    Body: { actual_cash: float, notes: str }
    """
    user = get_current_user()
    shift = Shift.query.filter(Shift.status.in_(['open', 'pending_close'])).order_by(Shift.opened_at.desc()).first()
    if not shift:
        return jsonify({'error': 'No open shift found'}), 404

    # Only the shift's cashier (or manager/admin) can end it
    if user and user.get('role') == 'cashier' and shift.cashier_id and shift.cashier_id != user.get('id'):
        return jsonify({'error': 'You can only end your own shift'}), 403

    data = request.json or {}
    shift.cashier_cash_count  = float(data.get('actual_cash', 0) or 0)
    shift.cashier_close_notes = data.get('notes', '')
    shift.cashier_ended_at    = datetime.utcnow()
    shift.status              = 'pending_close'
    db.session.commit()

    sales = [s for s in shift.sales if s.status == 'completed']
    return jsonify({
        'shift': shift.to_dict(),
        'summary': {
            'transaction_count': len(sales),
            'total_revenue': round(sum(s.total for s in sales), 2),
        },
        'message': 'Shift submitted for manager review',
    })


@bp.route('/<int:shift_id>/close', methods=['POST'])
def close_shift(shift_id):
    """
    Close a shift. Manager/admin only. Requires reconciliation or admin_bypass.
    Accepts both 'open' and 'pending_close' shifts.
    Body: {
      reconciliation_submitted: bool,
      actual_cash: float,
      actual_mpesa: float,
      actual_card: float,
      actual_other: float,
      notes: str,
      closed_without_print: bool,
      admin_bypass: bool  (admin only)
    }
    """
    user = get_current_user()

    # Cashiers cannot close shifts — they use cashier-end instead
    if user and user.get('role') == 'cashier':
        return jsonify({'error': 'Use "End Shift" to submit your cash count. Manager will finalize the close.'}), 403

    shift = Shift.query.get_or_404(shift_id)
    if shift.status not in ('open', 'pending_close'):
        return jsonify({'error': 'Shift is not open'}), 400

    data = request.json or {}
    role          = user.get('role') if user else None
    is_admin      = role == 'admin'
    is_manager    = role in ('manager', 'admin')
    admin_bypass  = bool(data.get('admin_bypass')) and is_admin
    recon_submitted = bool(data.get('reconciliation_submitted'))

    # Manager can close without reconciliation if they're closing a cashier's pending shift
    # (cashier already submitted their count); admin can always bypass
    if not recon_submitted and not admin_bypass:
        if shift.status != 'pending_close' or not is_manager:
            return jsonify({'error': 'Reconciliation required before closing shift'}), 400

    now = datetime.utcnow()

    # ── Compute expected per tender ────────────────────────────────────────────
    sales = [s for s in shift.sales if s.status == 'completed']

    cash_sales_only = sum(s.total for s in sales if s.payment_method == 'cash')
    split_cash      = sum((s.cash_tendered or 0) for s in sales if s.payment_method == 'split')

    shift_sale_ids = {s.id for s in shift.sales}
    all_returns = Return.query.filter(
        Return.original_sale_id.in_(shift_sale_ids),
        Return.status == 'completed',
    ).all() if shift_sale_ids else []

    cash_refunds  = sum(r.total_refund for r in all_returns if r.refund_method == 'cash')
    mpesa_refunds = sum(r.total_refund for r in all_returns if r.refund_method == 'mpesa')
    card_refunds  = sum(r.total_refund for r in all_returns if r.refund_method == 'card')

    expected_cash  = round(shift.opening_float + cash_sales_only + split_cash - cash_refunds, 2)
    expected_mpesa = round(
        sum(s.total for s in sales if s.payment_method == 'mpesa' and s.mpesa_ref) - mpesa_refunds, 2
    )
    expected_card  = round(
        sum(s.total for s in sales if s.payment_method == 'card') +
        sum((s.card_amount or 0) for s in sales if s.payment_method == 'split') - card_refunds, 2
    )
    expected_other = round(
        sum(s.total for s in sales if s.payment_method not in ('cash', 'mpesa', 'card', 'split')), 2
    )

    # Pre-fill from cashier's submitted count if manager didn't provide a value
    cashier_count = shift.cashier_cash_count or 0
    actual_cash  = float(data.get('actual_cash') if data.get('actual_cash') is not None else cashier_count)
    actual_mpesa = float(data.get('actual_mpesa', 0) or 0)
    actual_card  = float(data.get('actual_card', 0) or 0)
    actual_other = float(data.get('actual_other', 0) or 0)

    variance_cash  = round(actual_cash  - expected_cash,  2)
    variance_mpesa = round(actual_mpesa - expected_mpesa, 2)
    variance_card  = round(actual_card  - expected_card,  2)
    variance_other = round(actual_other - expected_other, 2)

    closed_without_print = bool(data.get('closed_without_print', False))

    # Populate shift fields
    shift.closing_float       = actual_cash
    shift.expected_cash       = expected_cash
    shift.variance            = variance_cash  # legacy field (cash only)
    shift.actual_cash         = actual_cash
    shift.actual_mpesa        = actual_mpesa
    shift.actual_card         = actual_card
    shift.actual_other        = actual_other
    shift.variance_cash       = variance_cash
    shift.variance_mpesa      = variance_mpesa
    shift.variance_card       = variance_card
    shift.variance_other      = variance_other
    shift.reconciled_by_id    = user['id']   if user else None
    shift.reconciled_by_name  = user['name'] if user else None
    shift.reconciled_at       = now
    shift.closed_without_print = closed_without_print
    shift.admin_bypass        = admin_bypass
    shift.status              = 'closed'
    shift.closed_at           = now
    shift.notes               = data.get('notes', '')

    db.session.commit()

    # Auto-generate immutable report snapshot
    rpt = None
    try:
        rpt = _generate_shift_report(shift, user, {
            'expected_cash': expected_cash, 'expected_mpesa': expected_mpesa,
            'expected_card': expected_card, 'expected_other': expected_other,
            'actual_cash': actual_cash, 'actual_mpesa': actual_mpesa,
            'actual_card': actual_card, 'actual_other': actual_other,
            'variance_cash': variance_cash, 'variance_mpesa': variance_mpesa,
            'variance_card': variance_card, 'variance_other': variance_other,
            'closed_without_print': closed_without_print,
            'admin_bypass': admin_bypass,
            'all_returns': all_returns,
        })
        db.session.add(rpt)
        db.session.commit()
    except Exception as e:
        print(f'[ShiftClose] Report generation error: {e}')
        import traceback; traceback.print_exc()
        # Shift is already closed — return success even if report gen failed
        db.session.rollback()
        result = shift.to_dict()
        result['report_id']     = None
        result['report_number'] = None
        result['report_warning'] = f'Shift closed but report generation failed: {e}'
        return jsonify(result)

    result = shift.to_dict()
    result['report_id']     = rpt.id
    result['report_number'] = rpt.report_number
    return jsonify(result)


def _generate_shift_report(shift, user, reconciliation=None):
    """Build a ShiftReport for a just-closed shift."""
    from models import (ShiftReport, Store, VoidLog, OverrideApproval,
                        StockMovement, AccountTransaction, LoyaltyTransaction)
    import json

    store = Store.query.first()
    sales     = [s for s in shift.sales if s.status == 'completed']
    all_sales = sorted(shift.sales, key=lambda x: x.created_at or datetime.min)

    cash_only    = sum(s.total for s in sales if s.payment_method == 'cash')
    card_only    = sum(s.total for s in sales if s.payment_method == 'card')
    mpesa_only   = sum(s.total for s in sales if s.payment_method == 'mpesa')
    split_only   = sum(s.total for s in sales if s.payment_method == 'split')
    account_only = sum(s.total for s in sales if s.payment_method == 'account')
    total_rev    = sum(s.total for s in sales)

    voids = VoidLog.query.filter(
        VoidLog.created_at >= shift.opened_at,
        VoidLog.created_at <= shift.closed_at,
    ).all()
    void_list    = [v for v in voids if v.type == 'void_sale']
    no_sale_list = [v for v in voids if v.type == 'no_sale']

    override_query = OverrideApproval.query.filter(
        OverrideApproval.created_at >= shift.opened_at,
        OverrideApproval.created_at <= shift.closed_at,
    )
    if shift.cashier_id:
        override_query = override_query.filter_by(cashier_id=shift.cashier_id)
    override_approvals = override_query.order_by(OverrideApproval.created_at).all()

    stock_movements = StockMovement.query.filter(
        StockMovement.created_at >= shift.opened_at,
        StockMovement.created_at <= shift.closed_at,
    ).order_by(StockMovement.created_at).all()

    account_txns = AccountTransaction.query.filter(
        AccountTransaction.created_at >= shift.opened_at,
        AccountTransaction.created_at <= shift.closed_at,
    ).order_by(AccountTransaction.created_at).all()

    loyalty_txns = LoyaltyTransaction.query.filter(
        LoyaltyTransaction.created_at >= shift.opened_at,
        LoyaltyTransaction.created_at <= shift.closed_at,
    ).order_by(LoyaltyTransaction.created_at).all()

    # ── Build override detail list ─────────────────────────────────────────────
    override_details = []
    total_value_impact = 0.0
    for oa in override_approvals:
        impact = oa.value_impact
        if impact is None:
            up = oa.unit_price or 0
            if oa.action in ('REMOVE_ITEM', 'REMOVE_COMMITTED_ITEM'):
                impact = -round((oa.original_qty or 0) * up, 2)
            elif oa.action == 'ADJUST_QTY':
                impact = round(((oa.new_qty or 0) - (oa.original_qty or 0)) * up, 2)
            else:
                impact = 0
        total_value_impact += abs(impact or 0)
        override_details.append({
            'id': oa.id, 'time': oa.created_at.isoformat() if oa.created_at else None,
            'cashier_name': oa.cashier_name, 'manager_name': oa.manager_name,
            'action': 'REMOVE_ITEM' if oa.action == 'REMOVE_COMMITTED_ITEM' else oa.action,
            'item_name': oa.item_name,
            'original_qty': oa.original_qty, 'new_qty': oa.new_qty,
            'unit_price': oa.unit_price, 'value_impact': round(impact, 2),
        })

    # ── Build tenders section (Phase 39 format) ────────────────────────────────
    all_returns = (reconciliation or {}).get('all_returns', [])
    reco = reconciliation or {}

    expected_cash  = reco.get('expected_cash',  0)
    expected_mpesa = reco.get('expected_mpesa', 0)
    expected_card  = reco.get('expected_card',  0)
    expected_other = reco.get('expected_other', 0)
    actual_cash    = reco.get('actual_cash',    shift.actual_cash or 0)
    actual_mpesa   = reco.get('actual_mpesa',   shift.actual_mpesa or 0)
    actual_card    = reco.get('actual_card',    shift.actual_card or 0)
    actual_other   = reco.get('actual_other',   shift.actual_other or 0)
    variance_cash  = reco.get('variance_cash',  shift.variance_cash or 0)
    variance_mpesa = reco.get('variance_mpesa', shift.variance_mpesa or 0)
    variance_card  = reco.get('variance_card',  shift.variance_card or 0)
    variance_other = reco.get('variance_other', shift.variance_other or 0)

    def tender_status(v):
        if v == 0:    return 'BALANCED'
        elif v < 0:   return 'SHORT'
        else:         return 'OVER'

    tenders = []
    if expected_cash or actual_cash:
        tenders.append({'tender': 'cash', 'expected': expected_cash, 'actual': actual_cash,
                        'variance': variance_cash, 'status': tender_status(variance_cash),
                        'formula_notes': 'opening_float + cash_sales + split_cash − cash_refunds'})
    if expected_mpesa or actual_mpesa:
        tenders.append({'tender': 'mpesa', 'expected': expected_mpesa, 'actual': actual_mpesa,
                        'variance': variance_mpesa, 'status': tender_status(variance_mpesa),
                        'daraja_note': 'Verifiable against M-Pesa statement'})
    if expected_card or actual_card:
        tenders.append({'tender': 'card', 'expected': expected_card, 'actual': actual_card,
                        'variance': variance_card, 'status': tender_status(variance_card)})
    if expected_other or actual_other:
        tenders.append({'tender': 'other', 'expected': expected_other, 'actual': actual_other,
                        'variance': variance_other, 'status': tender_status(variance_other)})

    total_expected = round(expected_cash + expected_mpesa + expected_card + expected_other, 2)
    total_actual   = round(actual_cash + actual_mpesa + actual_card + actual_other, 2)
    total_variance = round(total_actual - total_expected, 2)
    has_discrepancy = any(t['variance'] != 0 for t in tenders)

    overall_status = 'BALANCED'
    if any(t['status'] == 'SHORT' for t in tenders):
        overall_status = 'SHORT'
    elif any(t['status'] == 'OVER' for t in tenders):
        overall_status = 'OVER'

    by_tender = {}
    for s in sales:
        m = s.payment_method
        if m not in by_tender:
            by_tender[m] = {'count': 0, 'total': 0.0}
        by_tender[m]['count'] += 1
        by_tender[m]['total'] = round(by_tender[m]['total'] + s.total, 2)

    pct_of_sales = round(total_value_impact / total_expected * 100, 2) if total_expected else 0

    # Reconciliation report number: SR-YYYYMMDD-NNNN
    today  = shift.closed_at.strftime('%Y%m%d')
    sr_prefix = f'SR-{today}-'
    rpt_prefix = f'RPT-{today}-'
    # Use SR prefix for new reports; check for existing to get sequence
    last_sr = (ShiftReport.query
               .filter(ShiftReport.report_number.like(f'{sr_prefix}%'))
               .order_by(ShiftReport.report_number.desc())
               .first())
    last_rpt = (ShiftReport.query
                .filter(ShiftReport.report_number.like(f'{rpt_prefix}%'))
                .order_by(ShiftReport.report_number.desc())
                .first())
    sr_seq  = (int(last_sr.report_number.split('-')[-1])  + 1) if last_sr  else 1
    rpt_seq = (int(last_rpt.report_number.split('-')[-1]) + 1) if last_rpt else 1
    seq = max(sr_seq, rpt_seq)

    reconciler = shift.reconciled_by_name or (user['name'] if user else shift.cashier_name)

    content = {
        'report_id':   f'{sr_prefix}{seq:04d}',
        'generated_at': datetime.utcnow().isoformat() + 'Z',
        'store':  store.to_dict() if store else {},
        'shift':  shift.to_dict(),
        'reconciled_by': {
            'id':   shift.reconciled_by_id,
            'name': reconciler,
            'role': user['role'] if user else 'manager',
        },
        'closed_without_print': reco.get('closed_without_print', False),
        'admin_bypass':         reco.get('admin_bypass', False),
        'overall_status':       overall_status,
        'tenders':              tenders,
        'total_expected_revenue': total_expected,
        'total_actual_revenue':   total_actual,
        'total_variance':         total_variance,
        'overrides': {
            'count':             len(override_approvals),
            'voided_value':      round(sum(abs(d['value_impact']) for d in override_details
                                          if d['action'] == 'REMOVE_ITEM'), 2),
            'adjusted_items':    sum(1 for d in override_details if d['action'] == 'ADJUST_QTY'),
            'total_value_impact': round(total_value_impact, 2),
            'pct_of_sales':      pct_of_sales,
            'flagged':           pct_of_sales > 5,
            'details':           override_details,
        },
        'transactions': {
            'total_count': len(sales),
            'by_tender':   by_tender,
            'list': [
                {
                    'time':           s.created_at.isoformat() if s.created_at else None,
                    'receipt_number': s.receipt_number,
                    'items_count':    len(s.items),
                    'tender':         s.payment_method,
                    'amount':         round(s.total, 2),
                    'status':         s.status,
                }
                for s in all_sales
            ],
        },
        'refunds': {
            'cash':  round(sum(r.total_refund for r in all_returns if r.refund_method == 'cash'), 2),
            'mpesa': round(sum(r.total_refund for r in all_returns if r.refund_method == 'mpesa'), 2),
            'card':  round(sum(r.total_refund for r in all_returns if r.refund_method == 'card'), 2),
        },
        # Legacy sections (backward compat with old print function)
        'summary': {
            'transaction_count': len(sales),
            'total_revenue':     round(total_rev, 2),
            'cash_sales':        round(cash_only, 2),
            'card_sales':        round(card_only, 2),
            'mpesa_sales':       round(mpesa_only, 2),
            'split_sales':       round(split_only, 2),
            'account_sales':     round(account_only, 2),
            'total_tax':         round(sum(s.tax_amount     for s in sales), 2),
            'total_discounts':   round(sum(s.discount_total for s in sales), 2),
        },
        'item_overrides': {
            'count': len(override_approvals),
            'details': override_details,
        },
        # Full sales log
        'sales_log': [
            {
                'receipt_number': s.receipt_number,
                'created_at':     s.created_at.isoformat() if s.created_at else None,
                'status':         s.status,
                'payment_method': s.payment_method,
                'items_count':    len(s.items),
                'subtotal':       round(s.subtotal, 2),
                'discount_total': round(s.discount_total, 2),
                'tax_amount':     round(s.tax_amount, 2),
                'total':          round(s.total, 2),
                'cash_tendered':  round(s.cash_tendered, 2) if s.cash_tendered else None,
                'change_given':   round(s.change_given, 2)  if s.change_given  else None,
                'cashier_name':   s.cashier_name,
                'mpesa_ref':      s.mpesa_ref,
            }
            for s in all_sales
        ],
        'inventory_log': [
            {
                'created_at':     sm.created_at.isoformat() if sm.created_at else None,
                'product_name':   sm.product_name,
                'movement_type':  sm.movement_type,
                'qty_before':     sm.qty_before,
                'qty_change':     sm.qty_change,
                'qty_after':      sm.qty_after,
                'reference_type': sm.reference_type,
                'reference_id':   sm.reference_id,
                'user_name':      sm.user_name,
                'notes':          sm.notes,
            }
            for sm in stock_movements
        ],
        'account_log': [
            {
                'created_at':     at.created_at.isoformat() if at.created_at else None,
                'type':           at.type,
                'amount':         round(at.amount, 2),
                'balance_after':  round(at.balance_after, 2),
                'receipt_number': at.receipt_number,
                'payment_method': at.payment_method,
                'cashier_name':   at.cashier_name,
                'notes':          at.notes,
            }
            for at in account_txns
        ],
        'loyalty_log': [
            {
                'created_at':    lt.created_at.isoformat() if lt.created_at else None,
                'type':          lt.type,
                'points':        lt.points,
                'balance_after': lt.balance_after,
                'notes':         lt.notes,
            }
            for lt in loyalty_txns
        ],
    }

    return ShiftReport(
        report_number=f'{sr_prefix}{seq:04d}',
        type='SHIFT_DAILY',
        shift_id=shift.id,
        period_start=shift.opened_at,
        period_end=shift.closed_at,
        generated_by_id=user['id']   if user else None,
        generated_by_name=user['name'] if user else shift.cashier_name,
        generated_by_role=user['role'] if user else 'system',
        status='GENERATED',
        content=json.dumps(content),
        print_count=0,
        closed_without_print=reco.get('closed_without_print', False),
        has_discrepancy=has_discrepancy,
    )


@bp.route('/<int:shift_id>/summary', methods=['GET'])
def shift_summary(shift_id):
    """Detailed summary: sales counts, totals by payment method."""
    shift = Shift.query.get_or_404(shift_id)
    sales = [s for s in shift.sales if s.status == 'completed']

    total_revenue  = sum(s.total for s in sales)
    cash_sales     = sum(s.total for s in sales if s.payment_method == 'cash')
    card_sales     = sum(s.total for s in sales if s.payment_method == 'card')
    split_sales    = sum(s.total for s in sales if s.payment_method == 'split')
    total_tax      = sum(s.tax_amount for s in sales)
    total_discounts = sum(s.discount_total for s in sales)

    return jsonify({
        'shift': shift.to_dict(),
        'transaction_count': len(sales),
        'total_revenue':   round(total_revenue, 2),
        'cash_sales':      round(cash_sales, 2),
        'card_sales':      round(card_sales, 2),
        'split_sales':     round(split_sales, 2),
        'total_tax':       round(total_tax, 2),
        'total_discounts': round(total_discounts, 2),
    })
