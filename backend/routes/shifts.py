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
    from models import ShiftReport, Store, VoidLog
    import json

    store = Store.query.first()
    sales = [s for s in shift.sales if s.status == 'completed']

    cash_only  = sum(s.total for s in sales if s.payment_method == 'cash')
    card_only  = sum(s.total for s in sales if s.payment_method == 'card')
    mpesa_only = sum(s.total for s in sales if s.payment_method == 'mpesa')
    split_only = sum(s.total for s in sales if s.payment_method == 'split')
    total_rev  = sum(s.total for s in sales)

    voids = VoidLog.query.filter(
        VoidLog.created_at >= shift.opened_at,
        VoidLog.created_at <= shift.closed_at,
    ).all()
    void_list    = [v for v in voids if v.type == 'void_sale']
    no_sale_list = [v for v in voids if v.type == 'no_sale']

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
            'total_tax':         round(sum(s.tax_amount    for s in sales), 2),
            'total_discounts':   round(sum(s.discount_total for s in sales), 2),
        },
        'overrides': {
            'void_count':  len(void_list),
            'void_amount': round(sum(v.amount or 0 for v in void_list), 2),
            'void_details': [v.to_dict() for v in void_list],
            'no_sale_count': len(no_sale_list),
        },
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
