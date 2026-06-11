from flask import Blueprint, jsonify, request
from db import db
from models import Shift, Sale
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

    shift = Shift(
        cashier_id=data.get('cashier_id'),
        cashier_name=data.get('cashier_name', ''),
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
    """
    shift = Shift.query.get_or_404(shift_id)
    if shift.status != 'open':
        return jsonify({'error': 'Shift is not open'}), 400

    data = request.json or {}
    closing_float = float(data.get('closing_float', 0))

    # Calculate expected cash: opening float + all cash sales - cash refunds this shift
    cash_sales = sum(
        s.total for s in shift.sales
        if s.status == 'completed' and s.payment_method in ('cash', 'split')
    )
    # Cash from split is cash_tendered portion only
    cash_from_split = sum(
        (s.cash_tendered or 0) for s in shift.sales
        if s.status == 'completed' and s.payment_method == 'split'
    )
    # For split, only count cash_tendered not the full total
    cash_sales_only = sum(
        s.total for s in shift.sales
        if s.status == 'completed' and s.payment_method == 'cash'
    )

    expected = round(shift.opening_float + cash_sales_only + cash_from_split, 2)
    variance = round(closing_float - expected, 2)

    shift.closing_float = closing_float
    shift.expected_cash = expected
    shift.variance = variance
    shift.status = 'closed'
    shift.closed_at = datetime.utcnow()
    shift.notes = data.get('notes', '')

    db.session.commit()
    return jsonify(shift.to_dict())


@bp.route('/<int:shift_id>/summary', methods=['GET'])
def shift_summary(shift_id):
    """Detailed summary: sales counts, totals by payment method."""
    shift = Shift.query.get_or_404(shift_id)
    sales = [s for s in shift.sales if s.status == 'completed']

    total_revenue = sum(s.total for s in sales)
    cash_sales = sum(s.total for s in sales if s.payment_method == 'cash')
    card_sales = sum(s.total for s in sales if s.payment_method == 'card')
    split_sales = sum(s.total for s in sales if s.payment_method == 'split')
    total_tax = sum(s.tax_amount for s in sales)
    total_discounts = sum(s.discount_total for s in sales)

    return jsonify({
        'shift': shift.to_dict(),
        'transaction_count': len(sales),
        'total_revenue': round(total_revenue, 2),
        'cash_sales': round(cash_sales, 2),
        'card_sales': round(card_sales, 2),
        'split_sales': round(split_sales, 2),
        'total_tax': round(total_tax, 2),
        'total_discounts': round(total_discounts, 2),
    })
