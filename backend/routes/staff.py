from flask import Blueprint, jsonify, request
from db import db
from models import Staff

bp = Blueprint('staff', __name__, url_prefix='/api/staff')


@bp.route('', methods=['GET'])
def list_staff():
    staff = Staff.query.filter_by(is_active=True).order_by(Staff.name).all()
    return jsonify([s.to_dict() for s in staff])


@bp.route('', methods=['POST'])
def create_staff():
    data = request.json or {}
    if not data.get('name'):
        return jsonify({'error': 'name is required'}), 400

    member = Staff(
        name=data['name'],
        pin=data.get('pin'),
        role=data.get('role', 'cashier'),
    )
    db.session.add(member)
    db.session.commit()
    return jsonify(member.to_dict()), 201


@bp.route('/<int:staff_id>', methods=['PUT'])
def update_staff(staff_id):
    member = Staff.query.get_or_404(staff_id)
    data = request.json or {}
    if 'name' in data:
        member.name = data['name']
    if 'pin' in data:
        member.pin = data['pin']
    if 'role' in data:
        member.role = data['role']
    if 'is_active' in data:
        member.is_active = bool(data['is_active'])
    db.session.commit()
    return jsonify(member.to_dict())


@bp.route('/verify-pin', methods=['POST'])
def verify_pin():
    """Quick PIN login for cashiers at the terminal."""
    data = request.json or {}
    pin = data.get('pin', '').strip()
    if not pin:
        return jsonify({'error': 'PIN is required'}), 400

    member = Staff.query.filter_by(pin=pin, is_active=True).first()
    if not member:
        return jsonify({'error': 'Invalid PIN'}), 401

    return jsonify({'staff': member.to_dict()})
