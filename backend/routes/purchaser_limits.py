import json
from flask import Blueprint, jsonify, request, session
from db import db
from models import PurchaserLimit, Staff

bp = Blueprint('purchaser_limits', __name__, url_prefix='/api/purchaser-limits')


def _require_manager():
    role = session.get('role', '')
    if role not in ('manager', 'admin'):
        return jsonify({'error': 'Manager or admin required'}), 403
    return None


@bp.route('', methods=['GET'])
def list_limits():
    err = _require_manager()
    if err:
        return err
    limits = PurchaserLimit.query.order_by(PurchaserLimit.staff_name).all()
    return jsonify([lim.to_dict() for lim in limits])


@bp.route('/<int:staff_id>', methods=['GET'])
def get_limit(staff_id):
    # Purchaser can view their own; manager/admin can view anyone
    role = session.get('role', '')
    sid = session.get('staff_id')
    if role not in ('manager', 'admin') and sid != staff_id:
        return jsonify({'error': 'Forbidden'}), 403
    lim = PurchaserLimit.query.filter_by(staff_id=staff_id).first()
    if not lim:
        return jsonify(None)
    return jsonify(lim.to_dict())


@bp.route('/<int:staff_id>', methods=['PUT'])
def set_limit(staff_id):
    err = _require_manager()
    if err:
        return err
    member = Staff.query.get_or_404(staff_id)
    if member.role not in ('purchasing', 'inventory'):
        return jsonify({'error': 'Limits only apply to purchasing or inventory roles'}), 400

    data = request.json or {}
    lim = PurchaserLimit.query.filter_by(staff_id=staff_id).first()
    if not lim:
        lim = PurchaserLimit(staff_id=staff_id)
        db.session.add(lim)

    lim.staff_name = member.name

    if 'max_po_value' in data:
        lim.max_po_value = data['max_po_value']  # None clears the limit
    if 'max_daily_total' in data:
        lim.max_daily_total = data['max_daily_total']
    if 'allowed_supplier_ids' in data:
        v = data['allowed_supplier_ids']
        lim.allowed_supplier_ids = json.dumps(v) if v is not None else None
    if 'allowed_category_ids' in data:
        v = data['allowed_category_ids']
        lim.allowed_category_ids = json.dumps(v) if v is not None else None

    db.session.commit()
    return jsonify(lim.to_dict())


@bp.route('/<int:staff_id>', methods=['DELETE'])
def delete_limit(staff_id):
    err = _require_manager()
    if err:
        return err
    lim = PurchaserLimit.query.filter_by(staff_id=staff_id).first()
    if lim:
        db.session.delete(lim)
        db.session.commit()
    return jsonify({'message': 'Limits removed'})
