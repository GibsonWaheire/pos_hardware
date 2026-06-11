"""
Void log and no-sale tracking.

Any void or no-sale (cash drawer open without a sale) requires manager PIN
authorization and is recorded here for audit purposes.
"""

from flask import Blueprint, jsonify, request
from db import db
from models import VoidLog, Sale, Staff, Product
from datetime import datetime

bp = Blueprint('voids', __name__, url_prefix='/api/voids')


def _verify_manager(pin):
    """Return manager/admin Staff if PIN is valid and has elevated role, else None."""
    if not pin:
        return None
    return Staff.query.filter(
        Staff.pin == pin,
        Staff.role.in_(['manager', 'admin']),
        Staff.is_active == True,
    ).first()


@bp.route('', methods=['GET'])
def list_voids():
    limit = min(int(request.args.get('limit', 100)), 500)
    logs = VoidLog.query.order_by(VoidLog.created_at.desc()).limit(limit).all()
    return jsonify([v.to_dict() for v in logs])


@bp.route('/void-sale', methods=['POST'])
def void_sale():
    """
    Void a completed sale. Requires manager PIN.
    Body: { sale_id, manager_pin, reason, cashier_name, terminal_id }
    """
    data = request.json or {}
    manager_pin = data.get('manager_pin', '')
    manager = _verify_manager(manager_pin)
    if not manager:
        return jsonify({'error': 'Invalid manager PIN'}), 401

    sale_id = data.get('sale_id')
    if not sale_id:
        return jsonify({'error': 'sale_id is required'}), 400

    sale = Sale.query.get_or_404(sale_id)
    if sale.status != 'completed':
        return jsonify({'error': f'Cannot void a sale with status: {sale.status}'}), 400

    # Restore stock
    for item in sale.items:
        if item.product_id:
            product = Product.query.get(item.product_id)
            if product:
                product.stock_qty += item.qty

    sale.status = 'voided'

    log = VoidLog(
        type='void_sale',
        sale_id=sale.id,
        receipt_number=sale.receipt_number,
        terminal_id=data.get('terminal_id', sale.terminal_id),
        cashier_name=data.get('cashier_name', sale.cashier_name),
        manager_name=manager.name,
        reason=data.get('reason', ''),
        amount=sale.total,
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({'sale': sale.to_dict(), 'void_log': log.to_dict()})


@bp.route('/no-sale', methods=['POST'])
def no_sale():
    """
    Record a no-sale (cash drawer opened without a transaction).
    Requires manager PIN. Optionally triggers the cash drawer.
    Body: { manager_pin, reason, cashier_name, terminal_id, open_drawer: bool }
    """
    data = request.json or {}
    manager_pin = data.get('manager_pin', '')
    manager = _verify_manager(manager_pin)
    if not manager:
        return jsonify({'error': 'Invalid manager PIN'}), 401

    log = VoidLog(
        type='no_sale',
        terminal_id=data.get('terminal_id', ''),
        cashier_name=data.get('cashier_name', ''),
        manager_name=manager.name,
        reason=data.get('reason', 'No-sale / count'),
    )
    db.session.add(log)
    db.session.commit()

    # Optionally open cash drawer
    drawer_opened = False
    if data.get('open_drawer', False):
        try:
            from hardware.cash_drawer import open_drawer
            drawer_opened = open_drawer()
        except Exception as e:
            print(f'[VoidLog] Cash drawer error: {e}')

    return jsonify({'void_log': log.to_dict(), 'drawer_opened': drawer_opened})


@bp.route('/stats', methods=['GET'])
def void_stats():
    """Summary of void activity for a date range."""
    from datetime import date
    date_from = request.args.get('date_from', date.today().isoformat())
    date_to = request.args.get('date_to', date.today().isoformat())

    start = datetime.fromisoformat(date_from)
    end = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59)

    logs = VoidLog.query.filter(
        VoidLog.created_at >= start,
        VoidLog.created_at <= end,
    ).all()

    void_sales = [l for l in logs if l.type == 'void_sale']
    no_sales = [l for l in logs if l.type == 'no_sale']

    return jsonify({
        'date_from': date_from,
        'date_to': date_to,
        'total_voids': len(void_sales),
        'total_no_sales': len(no_sales),
        'voided_amount': round(sum(l.amount or 0 for l in void_sales), 2),
        'recent': [l.to_dict() for l in sorted(logs, key=lambda l: l.created_at, reverse=True)[:20]],
    })
