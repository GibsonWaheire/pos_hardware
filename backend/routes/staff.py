from datetime import datetime
from flask import Blueprint, jsonify, request, session
from db import db
from models import Staff, AuditLog
from auth_utils import get_current_user, hash_pin, check_pin, needs_hashing, log_action

bp = Blueprint('staff', __name__, url_prefix='/api/staff')


@bp.route('', methods=['GET'])
def list_staff():
    include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
    q = Staff.query if include_inactive else Staff.query.filter_by(is_active=True)
    staff = q.order_by(Staff.name).all()
    return jsonify([s.to_dict() for s in staff])


@bp.route('', methods=['POST'])
def create_staff():
    caller = get_current_user()
    if not caller or caller['role'] not in ('manager', 'admin'):
        return jsonify({'error': 'Manager or admin access required'}), 403

    data = request.json or {}
    if not data.get('name'):
        return jsonify({'error': 'name is required'}), 400

    raw_pin      = data.get('pin')
    raw_personal = data.get('personal_pin')
    raw_dept     = data.get('department_pin')

    member = Staff(
        name=data['name'].strip()[:100],
        pin=hash_pin(raw_pin) if raw_pin else None,
        personal_pin=hash_pin(raw_personal) if raw_personal else None,
        department_pin=hash_pin(raw_dept) if raw_dept else None,
        role=data.get('role', 'cashier'),
        supplier_id=data.get('supplier_id'),
    )
    db.session.add(member)
    db.session.flush()

    log_action(caller, 'create', 'staff', member.id, member.name)
    db.session.commit()
    return jsonify(member.to_dict()), 201


@bp.route('/<int:staff_id>', methods=['PUT'])
def update_staff(staff_id):
    caller = get_current_user()
    if not caller or caller['role'] not in ('manager', 'admin'):
        return jsonify({'error': 'Manager or admin access required'}), 403

    member = Staff.query.get_or_404(staff_id)
    data = request.json or {}

    if 'name' in data:
        member.name = data['name'].strip()[:100]
    if 'pin' in data and data['pin']:
        member.pin = hash_pin(str(data['pin']))
    if 'personal_pin' in data and data['personal_pin']:
        member.personal_pin = hash_pin(str(data['personal_pin']))
    if 'department_pin' in data and data['department_pin']:
        member.department_pin = hash_pin(str(data['department_pin']))
    if 'role' in data:
        member.role = data['role']
    if 'is_active' in data:
        member.is_active = bool(data['is_active'])
    if 'supplier_id' in data:
        member.supplier_id = data['supplier_id']

    log_action(caller, 'update', 'staff', member.id, member.name)
    db.session.commit()
    return jsonify(member.to_dict())


@bp.route('/<int:staff_id>/unlock', methods=['POST'])
def unlock_staff(staff_id):
    """Manager/admin can unlock a locked staff account."""
    caller = get_current_user()
    if not caller or caller['role'] not in ('manager', 'admin'):
        return jsonify({'error': 'Manager or admin access required'}), 403

    member = Staff.query.get_or_404(staff_id)
    member.login_attempts = 0
    member.locked_until   = None

    log_action(caller, 'unlock_account', 'staff', member.id, member.name)
    db.session.commit()
    return jsonify({'message': f'{member.name} account unlocked', 'staff': member.to_dict()})


@bp.route('/<int:staff_id>/activity', methods=['GET'])
def staff_activity(staff_id):
    """Last N audit events for a staff member. Manager/admin only."""
    caller = get_current_user()
    if not caller or caller['role'] not in ('manager', 'admin'):
        return jsonify({'error': 'Manager or admin access required'}), 403

    limit = min(int(request.args.get('limit', 20)), 100)
    logs = (AuditLog.query
            .filter_by(user_id=staff_id)
            .order_by(AuditLog.created_at.desc())
            .limit(limit).all())
    return jsonify([l.to_dict() for l in logs])


@bp.route('/verify-pin', methods=['POST'])
def verify_pin():
    """Quick PIN login for cashiers at the terminal."""
    data = request.json or {}
    pin = data.get('pin', '').strip()
    if not pin:
        return jsonify({'error': 'PIN is required'}), 400

    candidates = Staff.query.filter_by(is_active=True).all()
    for member in candidates:
        if member.pin and check_pin(pin, member.pin):
            if needs_hashing(member.pin):
                member.pin = hash_pin(pin)
                db.session.commit()
            return jsonify({'staff': member.to_dict()})

    return jsonify({'error': 'Invalid PIN'}), 401
