from flask import Blueprint, jsonify, request
from db import db
from models import Shift, Sale
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
    """Return the currently open shift, if any."""
    shift = Shift.query.filter_by(status='open').order_by(Shift.opened_at.desc()).first()
    if not shift:
        return jsonify({'shift': None})
    return jsonify({'shift': shift.to_dict()})


@bp.route('/open', methods=['POST'])
def open_shift():
    data = request.json or {}

    # Prevent opening a second shift while one is already open
    existing = Shift.query.filter_by(status='open').first()
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


@bp.route('/<int:shift_id>/close', methods=['POST'])
def close_shift(shift_id):
    """
    Close a shift with a cash count reconciliation.
    Body: { closing_float: float, notes: str }
    Auto-generates an immutable ShiftReport snapshot on close.
    """
    shift = Shift.query.get_or_404(shift_id)
    if shift.status != 'open':
        return jsonify({'error': 'Shift is not open'}), 400

    data = request.json or {}
    user = get_current_user()
    closing_float = float(data.get('closing_float', 0))

    # Cash from split is cash_tendered portion only
    cash_from_split = sum(
        (s.cash_tendered or 0) for s in shift.sales
        if s.status == 'completed' and s.payment_method == 'split'
    )
    cash_sales_only = sum(
        s.total for s in shift.sales
        if s.status == 'completed' and s.payment_method == 'cash'
    )

    expected = round(shift.opening_float + cash_sales_only + cash_from_split, 2)
    variance = round(closing_float - expected, 2)

    shift.closing_float = closing_float
    shift.expected_cash = expected
    shift.variance      = variance
    shift.status        = 'closed'
    shift.closed_at     = datetime.utcnow()
    shift.notes         = data.get('notes', '')

    db.session.commit()

    # Auto-generate immutable report snapshot
    rpt = _generate_shift_report(shift, user)
    db.session.add(rpt)
    db.session.commit()

    result = shift.to_dict()
    result['report_id']     = rpt.id
    result['report_number'] = rpt.report_number
    return jsonify(result)


def _generate_shift_report(shift, user):
    """Build a ShiftReport for a just-closed shift. Call after shift.closed_at is set."""
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

    # Manager override approvals during this shift (for this cashier)
    override_query = OverrideApproval.query.filter(
        OverrideApproval.created_at >= shift.opened_at,
        OverrideApproval.created_at <= shift.closed_at,
    )
    if shift.cashier_id:
        override_query = override_query.filter_by(cashier_id=shift.cashier_id)
    override_approvals = override_query.order_by(OverrideApproval.created_at).all()

    # Stock movements during this shift
    stock_movements = StockMovement.query.filter(
        StockMovement.created_at >= shift.opened_at,
        StockMovement.created_at <= shift.closed_at,
    ).order_by(StockMovement.created_at).all()

    # Account transactions during this shift
    account_txns = AccountTransaction.query.filter(
        AccountTransaction.created_at >= shift.opened_at,
        AccountTransaction.created_at <= shift.closed_at,
    ).order_by(AccountTransaction.created_at).all()

    # Loyalty transactions during this shift
    loyalty_txns = LoyaltyTransaction.query.filter(
        LoyaltyTransaction.created_at >= shift.opened_at,
        LoyaltyTransaction.created_at <= shift.closed_at,
    ).order_by(LoyaltyTransaction.created_at).all()

    content = {
        'store': store.to_dict() if store else {},
        'shift': shift.to_dict(),
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
        'overrides': {
            'void_count':   len(void_list),
            'void_amount':  round(sum(v.amount or 0 for v in void_list), 2),
            'void_details': [v.to_dict() for v in void_list],
            'no_sale_count': len(no_sale_list),
        },
        'item_overrides': {
            'count': len(override_approvals),
            'details': [
                {
                    'id':           oa.id,
                    'action':       oa.action,
                    'item_name':    oa.item_name,
                    'original_qty': oa.original_qty,
                    'new_qty':      oa.new_qty,
                    'manager_name': oa.manager_name,
                    'manager_role': oa.manager_role,
                    'auth_method':  oa.auth_method,
                    'cashier_name': oa.cashier_name,
                    'sale_id':      oa.sale_id,
                    'created_at':   oa.created_at.isoformat() if oa.created_at else None,
                }
                for oa in override_approvals
            ],
        },
        # Full transaction log (all sales including voided)
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
                'items': [
                    {
                        'product_name': it.product_name,
                        'qty':          it.qty,
                        'unit_price':   round(it.unit_price, 2),
                        'discount':     round(it.discount, 2),
                        'line_total':   round(it.line_total, 2),
                    }
                    for it in s.items
                ],
            }
            for s in all_sales
        ],
        # Inventory movement log
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
        # Customer account charges and deposits
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
        # Loyalty programme activity
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

    today  = shift.closed_at.strftime('%Y%m%d')
    prefix = f'RPT-{today}-'
    last   = (ShiftReport.query
              .filter(ShiftReport.report_number.like(f'{prefix}%'))
              .order_by(ShiftReport.report_number.desc())
              .first())
    seq = (int(last.report_number.split('-')[-1]) + 1) if last else 1

    return ShiftReport(
        report_number=f'{prefix}{seq:04d}',
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
