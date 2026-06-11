from flask import Blueprint, jsonify, request
from db import db
from models import PurchaseOrder, PurchaseOrderItem, Product, StockAdjustment
from datetime import datetime, date

bp = Blueprint('purchase_orders', __name__, url_prefix='/api/purchase-orders')


def _generate_po_number():
    today = date.today().strftime('%Y%m%d')
    prefix = f'PO-{today}-'
    last = (PurchaseOrder.query
            .filter(PurchaseOrder.po_number.like(f'{prefix}%'))
            .order_by(PurchaseOrder.po_number.desc())
            .first())
    seq = (int(last.po_number.split('-')[-1]) + 1) if last else 1
    return f'{prefix}{seq:03d}'


@bp.route('', methods=['GET'])
def list_pos():
    status = request.args.get('status')
    supplier_id = request.args.get('supplier_id')
    query = PurchaseOrder.query
    if status:
        query = query.filter_by(status=status)
    if supplier_id:
        query = query.filter_by(supplier_id=int(supplier_id))
    pos = query.order_by(PurchaseOrder.created_at.desc()).all()
    return jsonify([po.to_dict() for po in pos])


@bp.route('/<int:po_id>', methods=['GET'])
def get_po(po_id):
    return jsonify(PurchaseOrder.query.get_or_404(po_id).to_dict())


@bp.route('', methods=['POST'])
def create_po():
    data = request.json or {}
    items_data = data.get('items', [])
    if not items_data:
        return jsonify({'error': 'Purchase order must have at least one item'}), 400

    po_items = []
    total_cost = 0.0
    for item in items_data:
        if not item.get('product_id') and not item.get('product_name'):
            return jsonify({'error': 'Each item needs product_id or product_name'}), 400
        qty = int(item.get('qty_ordered', 1))
        unit_cost = float(item.get('unit_cost', 0))
        line_cost = round(qty * unit_cost, 2)
        product_name = item.get('product_name', '')
        if item.get('product_id'):
            p = Product.query.get(item['product_id'])
            if p:
                product_name = p.name
        po_items.append(PurchaseOrderItem(
            product_id=item.get('product_id'),
            product_name=product_name,
            qty_ordered=qty,
            qty_received=0,
            unit_cost=unit_cost,
            line_cost=line_cost,
        ))
        total_cost += line_cost

    # Resolve supplier name
    supplier_name = data.get('supplier_name', '')
    if data.get('supplier_id'):
        from models import Supplier
        s = Supplier.query.get(data['supplier_id'])
        if s:
            supplier_name = s.name

    po = PurchaseOrder(
        po_number=_generate_po_number(),
        supplier_id=data.get('supplier_id'),
        supplier_name=supplier_name,
        status='draft',
        notes=data.get('notes', ''),
        total_cost=round(total_cost, 2),
        created_by=data.get('created_by', ''),
    )
    po.items = po_items
    db.session.add(po)
    db.session.commit()
    return jsonify(po.to_dict()), 201


@bp.route('/<int:po_id>/mark-ordered', methods=['POST'])
def mark_ordered(po_id):
    po = PurchaseOrder.query.get_or_404(po_id)
    if po.status != 'draft':
        return jsonify({'error': f'Cannot mark as ordered from status: {po.status}'}), 400
    po.status = 'ordered'
    po.ordered_at = datetime.utcnow()
    db.session.commit()
    return jsonify(po.to_dict())


@bp.route('/<int:po_id>/receive', methods=['POST'])
def receive_po(po_id):
    """
    Receive items. Body: { items: [{ po_item_id, qty_received }], received_by: str }
    Updates stock and creates audit trail entries.
    """
    po = PurchaseOrder.query.get_or_404(po_id)
    if po.status not in ('ordered', 'partial', 'draft'):
        return jsonify({'error': f'Cannot receive from status: {po.status}'}), 400

    data = request.json or {}
    receive_data = {item['po_item_id']: int(item['qty_received']) for item in data.get('items', [])}
    received_by = data.get('received_by', '')

    if not receive_data:
        return jsonify({'error': 'items list is required'}), 400

    for po_item in po.items:
        qty = receive_data.get(po_item.id, 0)
        if qty <= 0:
            continue
        po_item.qty_received += qty

        # Update product stock
        if po_item.product_id:
            product = Product.query.get(po_item.product_id)
            if product:
                before = product.stock_qty
                product.stock_qty += qty
                adj = StockAdjustment(
                    product_id=product.id,
                    product_name=product.name,
                    qty_before=before,
                    qty_change=qty,
                    qty_after=product.stock_qty,
                    reason='po_receive',
                    reference_id=po.po_number,
                    cashier_name=received_by,
                )
                db.session.add(adj)

    # Determine new PO status
    all_received = all(i.qty_received >= i.qty_ordered for i in po.items)
    any_received = any(i.qty_received > 0 for i in po.items)
    if all_received:
        po.status = 'received'
        po.received_at = datetime.utcnow()
    elif any_received:
        po.status = 'partial'

    db.session.commit()
    return jsonify(po.to_dict())


@bp.route('/<int:po_id>/cancel', methods=['POST'])
def cancel_po(po_id):
    po = PurchaseOrder.query.get_or_404(po_id)
    if po.status == 'received':
        return jsonify({'error': 'Cannot cancel a fully received PO'}), 400
    po.status = 'cancelled'
    db.session.commit()
    return jsonify(po.to_dict())
