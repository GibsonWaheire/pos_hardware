from flask import Blueprint, jsonify, request, session
from db import db
from models import Supplier, Staff

bp = Blueprint('suppliers', __name__, url_prefix='/api/suppliers')


def _supplier_scope():
    """
    Returns (role, supplier_id_for_role).
    For supplier-role staff, supplier_id_for_role is their linked supplier.
    For all others it is None (no scope restriction).
    """
    role = session.get('role', '')
    if role == 'supplier':
        staff_id = session.get('staff_id')
        member = Staff.query.get(staff_id) if staff_id else None
        return role, (member.supplier_id if member else None)
    return role, None


@bp.route('', methods=['GET'])
def list_suppliers():
    role, scoped_supplier_id = _supplier_scope()

    # Supplier-role staff can only see their own supplier record
    if role == 'supplier':
        if not scoped_supplier_id:
            return jsonify([])
        s = Supplier.query.get(scoped_supplier_id)
        return jsonify([s.to_dict()] if s else [])

    active_only = request.args.get('active', 'true').lower() == 'true'
    q = request.args.get('q', '').strip()
    query = Supplier.query
    if active_only:
        query = query.filter_by(is_active=True)
    if q:
        query = query.filter(Supplier.name.ilike(f'%{q}%'))
    return jsonify([s.to_dict() for s in query.order_by(Supplier.name).all()])


@bp.route('/<int:supplier_id>', methods=['GET'])
def get_supplier(supplier_id):
    role, scoped_supplier_id = _supplier_scope()
    if role == 'supplier' and scoped_supplier_id != supplier_id:
        return jsonify({'error': 'Forbidden'}), 403
    return jsonify(Supplier.query.get_or_404(supplier_id).to_dict())


@bp.route('', methods=['POST'])
def create_supplier():
    role, _ = _supplier_scope()
    if role == 'supplier':
        return jsonify({'error': 'Forbidden'}), 403
    data = request.json or {}
    if not data.get('name'):
        return jsonify({'error': 'name is required'}), 400
    supplier = Supplier(
        name=data['name'],
        contact_name=data.get('contact_name'),
        phone=data.get('phone'),
        email=data.get('email'),
        address=data.get('address'),
        notes=data.get('notes'),
    )
    db.session.add(supplier)
    db.session.commit()
    return jsonify(supplier.to_dict()), 201


@bp.route('/<int:supplier_id>', methods=['PUT'])
def update_supplier(supplier_id):
    role, _ = _supplier_scope()
    if role == 'supplier':
        return jsonify({'error': 'Forbidden'}), 403
    supplier = Supplier.query.get_or_404(supplier_id)
    data = request.json or {}
    for field in ('name', 'contact_name', 'phone', 'email', 'address', 'notes', 'is_active'):
        if field in data:
            setattr(supplier, field, data[field])
    db.session.commit()
    return jsonify(supplier.to_dict())


@bp.route('/<int:supplier_id>', methods=['DELETE'])
def delete_supplier(supplier_id):
    role, _ = _supplier_scope()
    if role == 'supplier':
        return jsonify({'error': 'Forbidden'}), 403
    supplier = Supplier.query.get_or_404(supplier_id)
    supplier.is_active = False
    db.session.commit()
    return jsonify({'message': 'Supplier deactivated'})
