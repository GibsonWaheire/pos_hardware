import json
from flask import Blueprint, jsonify, request, session
from db import db
from models import (PurchaseOrder, PurchaseOrderItem, Product, StockAdjustment,
                    Staff, PurchaserLimit, GoodsReceivedNote, GRNItem, StockMovement)
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


def _session_role():
    return session.get('role', ''), session.get('staff_id'), session.get('staff_name', '')


def _require_manager():
    role, _, _ = _session_role()
    if role not in ('manager', 'admin'):
        return jsonify({'error': 'Manager or admin required'}), 403
    return None


@bp.route('', methods=['GET'])
def list_pos():
    role, staff_id, _ = _session_role()
    status = request.args.get('status')
    supplier_id = request.args.get('supplier_id')

    query = PurchaseOrder.query

    # Purchaser sees only their own POs
    if role == 'purchasing':
        query = query.filter_by(created_by_id=staff_id)

    # Supplier role sees only POs for their linked supplier
    elif role == 'supplier':
        member = Staff.query.get(staff_id) if staff_id else None
        if not member or not member.supplier_id:
            return jsonify([])
        query = query.filter_by(supplier_id=member.supplier_id)

    if status:
        query = query.filter_by(status=status)
    if supplier_id:
        query = query.filter_by(supplier_id=int(supplier_id))

    pos = query.order_by(PurchaseOrder.created_at.desc()).all()
    return jsonify([po.to_dict() for po in pos])


@bp.route('/<int:po_id>', methods=['GET'])
def get_po(po_id):
    role, staff_id, _ = _session_role()
    po = PurchaseOrder.query.get_or_404(po_id)

    # Purchaser can only see their own
    if role == 'purchasing' and po.created_by_id != staff_id:
        return jsonify({'error': 'Forbidden'}), 403

    # Supplier can only see POs for their supplier
    if role == 'supplier':
        member = Staff.query.get(staff_id) if staff_id else None
        if not member or po.supplier_id != member.supplier_id:
            return jsonify({'error': 'Forbidden'}), 403

    return jsonify(po.to_dict())


@bp.route('', methods=['POST'])
def create_po():
    role, staff_id, staff_name = _session_role()

    # Supplier role cannot create POs
    if role == 'supplier':
        return jsonify({'error': 'Suppliers cannot create purchase orders'}), 403

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

    # ── Purchaser limit checks ────────────────────────────────────────────────
    po_status = 'draft'

    if role == 'purchasing' and staff_id:
        limit = PurchaserLimit.query.filter_by(staff_id=staff_id).first()
        if limit:
            # Check supplier restriction
            if limit.allowed_supplier_ids and data.get('supplier_id'):
                allowed = json.loads(limit.allowed_supplier_ids)
                if data['supplier_id'] not in allowed:
                    return jsonify({'error': 'This supplier is not in your allowed list'}), 403

            # Check category restriction
            if limit.allowed_category_ids:
                allowed_cats = json.loads(limit.allowed_category_ids)
                for item in items_data:
                    if item.get('product_id'):
                        prod = Product.query.get(item['product_id'])
                        if prod and prod.category_id and prod.category_id not in allowed_cats:
                            return jsonify({'error': f'Product category not in your allowed list'}), 403

            # Check single-PO value limit
            if limit.max_po_value is not None and total_cost > limit.max_po_value:
                po_status = 'pending_approval'

            # Check daily total limit (skip if already flagged)
            if po_status == 'draft' and limit.max_daily_total is not None:
                today_start = datetime.combine(date.today(), datetime.min.time())
                today_total = (
                    db.session.query(db.func.sum(PurchaseOrder.total_cost))
                    .filter(
                        PurchaseOrder.created_by_id == staff_id,
                        PurchaseOrder.created_at >= today_start,
                        PurchaseOrder.status.notin_(['cancelled', 'rejected']),
                    )
                    .scalar() or 0.0
                )
                if today_total + total_cost > limit.max_daily_total:
                    po_status = 'pending_approval'

    po = PurchaseOrder(
        po_number=_generate_po_number(),
        supplier_id=data.get('supplier_id'),
        supplier_name=supplier_name,
        status=po_status,
        notes=data.get('notes', ''),
        total_cost=round(total_cost, 2),
        created_by=staff_name,
        created_by_id=staff_id,
        created_by_name=staff_name,
    )
    po.items = po_items
    db.session.add(po)
    db.session.commit()
    return jsonify(po.to_dict()), 201


@bp.route('/<int:po_id>/mark-ordered', methods=['POST'])
def mark_ordered(po_id):
    role, _, _ = _session_role()
    po = PurchaseOrder.query.get_or_404(po_id)
    if po.status not in ('draft',):
        return jsonify({'error': f'Cannot mark as ordered from status: {po.status}'}), 400
    # Supplier role cannot change order status
    if role == 'supplier':
        return jsonify({'error': 'Forbidden'}), 403
    po.status = 'ordered'
    po.ordered_at = datetime.utcnow()
    db.session.commit()
    return jsonify(po.to_dict())


@bp.route('/<int:po_id>/receive', methods=['POST'])
def receive_po(po_id):
    """
    Receive items. Body: { items: [{ po_item_id, qty_received }], received_by: str }
    Updates stock and creates stock adjustment entries.
    """
    role, staff_id, staff_name = _session_role()

    # Supplier cannot receive — only acknowledge dispatch
    if role == 'supplier':
        return jsonify({'error': 'Forbidden'}), 403

    po = PurchaseOrder.query.get_or_404(po_id)
    if po.status not in ('ordered', 'partial', 'draft'):
        return jsonify({'error': f'Cannot receive from status: {po.status}'}), 400

    # Purchaser can only receive their own POs
    if role == 'purchasing' and po.created_by_id != staff_id:
        return jsonify({'error': 'Forbidden'}), 403

    data = request.json or {}
    receive_data = {item['po_item_id']: int(item['qty_received']) for item in data.get('items', [])}
    received_by = data.get('received_by', staff_name)

    if not receive_data:
        return jsonify({'error': 'items list is required'}), 400

    grn_items = []
    for po_item in po.items:
        qty = receive_data.get(po_item.id, 0)
        if qty <= 0:
            continue
        po_item.qty_received += qty

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

                mv = StockMovement(
                    product_id=product.id, product_name=product.name,
                    qty_before=before, qty_change=qty, qty_after=product.stock_qty,
                    movement_type='po_receipt',
                    reference_type='po', reference_id=po.po_number,
                    user_id=staff_id, user_name=received_by,
                    user_role=session.get('role', ''),
                )
                db.session.add(mv)

        grn_items.append(GRNItem(
            product_id=po_item.product_id,
            product_name=po_item.product_name,
            qty_ordered=po_item.qty_ordered,
            qty_received=qty,
            unit_cost=po_item.unit_cost,
            variance=qty - po_item.qty_ordered,
        ))

    # Auto-generate GRN
    today = date.today().strftime('%Y%m%d')
    grn_prefix = f'GRN-{today}-'
    last_grn = (GoodsReceivedNote.query
                .filter(GoodsReceivedNote.grn_number.like(f'{grn_prefix}%'))
                .order_by(GoodsReceivedNote.grn_number.desc()).first())
    grn_seq = (int(last_grn.grn_number.split('-')[-1]) + 1) if last_grn else 1
    grn = GoodsReceivedNote(
        grn_number=f'{grn_prefix}{grn_seq:03d}',
        po_id=po.id,
        po_number=po.po_number,
        supplier_id=po.supplier_id,
        supplier_name=po.supplier_name,
        received_by_id=staff_id,
        received_by_name=received_by,
        status='draft',
    )
    grn.items = grn_items
    db.session.add(grn)

    all_received = all(i.qty_received >= i.qty_ordered for i in po.items)
    any_received = any(i.qty_received > 0 for i in po.items)
    if all_received:
        po.status = 'received'
        po.received_at = datetime.utcnow()
    elif any_received:
        po.status = 'partial'

    db.session.commit()
    return jsonify({**po.to_dict(), 'grn_number': grn.grn_number})


@bp.route('/<int:po_id>/cancel', methods=['POST'])
def cancel_po(po_id):
    role, staff_id, _ = _session_role()
    po = PurchaseOrder.query.get_or_404(po_id)
    if po.status == 'received':
        return jsonify({'error': 'Cannot cancel a fully received PO'}), 400
    if role == 'supplier':
        return jsonify({'error': 'Forbidden'}), 403
    # Purchaser can only cancel their own
    if role == 'purchasing' and po.created_by_id != staff_id:
        return jsonify({'error': 'Forbidden'}), 403
    po.status = 'cancelled'
    db.session.commit()
    return jsonify(po.to_dict())


# ── Approval workflow (manager/admin only) ────────────────────────────────────

@bp.route('/pending-approvals', methods=['GET'])
def pending_approvals():
    err = _require_manager()
    if err:
        return err
    pos = (PurchaseOrder.query
           .filter_by(status='pending_approval')
           .order_by(PurchaseOrder.created_at.asc())
           .all())
    return jsonify([po.to_dict() for po in pos])


@bp.route('/<int:po_id>/approve', methods=['POST'])
def approve_po(po_id):
    err = _require_manager()
    if err:
        return err
    _, staff_id, staff_name = _session_role()
    po = PurchaseOrder.query.get_or_404(po_id)
    if po.status != 'pending_approval':
        return jsonify({'error': f'PO is not pending approval (status: {po.status})'}), 400
    po.status = 'draft'
    po.approved_by_id = staff_id
    po.approved_by_name = staff_name
    po.approved_at = datetime.utcnow()
    db.session.commit()
    return jsonify(po.to_dict())


@bp.route('/<int:po_id>/reject', methods=['POST'])
def reject_po(po_id):
    err = _require_manager()
    if err:
        return err
    _, staff_id, staff_name = _session_role()
    po = PurchaseOrder.query.get_or_404(po_id)
    if po.status != 'pending_approval':
        return jsonify({'error': f'PO is not pending approval (status: {po.status})'}), 400
    data = request.json or {}
    po.status = 'rejected'
    po.approved_by_id = staff_id
    po.approved_by_name = staff_name
    po.approved_at = datetime.utcnow()
    if data.get('notes'):
        po.notes = (po.notes or '') + f'\nRejected by {staff_name}: {data["notes"]}'
    db.session.commit()
    return jsonify(po.to_dict())


# ── Supplier confirmation / dispatch ─────────────────────────────────────────

@bp.route('/<int:po_id>/confirm', methods=['POST'])
def supplier_confirm(po_id):
    """Supplier acknowledges/confirms a PO (read-only action, logs acknowledgement)."""
    role, staff_id, _ = _session_role()
    po = PurchaseOrder.query.get_or_404(po_id)

    if role == 'supplier':
        member = Staff.query.get(staff_id)
        if not member or po.supplier_id != member.supplier_id:
            return jsonify({'error': 'Forbidden'}), 403
    elif role not in ('manager', 'admin', 'purchasing'):
        return jsonify({'error': 'Forbidden'}), 403

    if po.status != 'ordered':
        return jsonify({'error': f'Can only confirm ordered POs (status: {po.status})'}), 400

    # We just note the confirmation in the notes — no status change
    po.notes = (po.notes or '') + f'\nConfirmed by supplier on {datetime.utcnow().strftime("%Y-%m-%d %H:%M")}'
    db.session.commit()
    return jsonify(po.to_dict())


@bp.route('/<int:po_id>/mark-dispatched', methods=['POST'])
def supplier_mark_dispatched(po_id):
    """Supplier marks the order as dispatched (triggers 'ordered' → still 'ordered' with dispatch note)."""
    role, staff_id, _ = _session_role()
    po = PurchaseOrder.query.get_or_404(po_id)

    if role == 'supplier':
        member = Staff.query.get(staff_id)
        if not member or po.supplier_id != member.supplier_id:
            return jsonify({'error': 'Forbidden'}), 403
    elif role not in ('manager', 'admin'):
        return jsonify({'error': 'Forbidden'}), 403

    if po.status != 'ordered':
        return jsonify({'error': f'Can only mark dispatched on ordered POs (status: {po.status})'}), 400

    po.notes = (po.notes or '') + f'\nDispatched by supplier on {datetime.utcnow().strftime("%Y-%m-%d %H:%M")}'
    db.session.commit()
    return jsonify(po.to_dict())
