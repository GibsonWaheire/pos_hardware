from flask import Blueprint, jsonify, request, session
from db import db
from models import Staff
from auth_utils import log_action

bp = Blueprint('auth', __name__, url_prefix='/api/auth')

# Default department PINs by role (overridable per-staff via department_pin field)
DEFAULT_DEPT_PINS = {
    'admin':      '0000',
    'manager':    '1111',
    'cashier':    '2222',
    'inventory':  '3333',
    'purchasing': '4444',
}


@bp.route('/department', methods=['POST'])
def verify_department():
    """
    Step 1 — verify a department PIN.
    Returns the role name if valid, so the frontend can show Step 2.
    Does NOT create a session yet.
    """
    data = request.json or {}
    dept_pin = str(data.get('department_pin', '')).strip()
    if not dept_pin:
        return jsonify({'error': 'Department PIN is required'}), 400

    # Check against default role mappings first, then individual staff department_pin
    role = next((r for r, p in DEFAULT_DEPT_PINS.items() if p == dept_pin), None)

    if not role:
        # Also allow custom department_pin set on any active staff member
        member = Staff.query.filter_by(department_pin=dept_pin, is_active=True).first()
        role = member.role if member else None

    if not role:
        return jsonify({'error': 'Invalid department PIN'}), 401

    # Count staff in this department to tell the frontend how many to show
    staff_count = Staff.query.filter_by(role=role, is_active=True).count()

    return jsonify({'role': role, 'staff_count': staff_count})


@bp.route('/login', methods=['POST'])
def login():
    """
    Step 2 — verify personal PIN within a known department/role.
    Creates the session.

    Also supports legacy single-step login: { pin } without department_pin.
    """
    data = request.json or {}
    role     = data.get('role', '').strip()        # set by Step 1
    pers_pin = str(data.get('personal_pin', data.get('pin', ''))).strip()
    staff_id = data.get('staff_id')

    if not pers_pin:
        return jsonify({'error': 'Personal PIN is required'}), 400

    # Build query
    query = Staff.query.filter_by(is_active=True)
    if role:
        query = query.filter_by(role=role)
    if staff_id:
        query = query.filter_by(id=int(staff_id))

    # Try personal_pin first, then legacy pin field
    member = query.filter_by(personal_pin=pers_pin).first()
    if not member:
        member = query.filter_by(pin=pers_pin).first()

    if not member:
        return jsonify({'error': 'Invalid PIN'}), 401

    session.permanent = True
    session['staff_id']   = member.id
    session['staff_name'] = member.name
    session['role']       = member.role

    log_action(
        {'id': member.id, 'name': member.name, 'role': member.role},
        'login', 'staff', member.id, member.name
    )
    db.session.commit()

    return jsonify({'staff': member.to_dict()})


@bp.route('/me', methods=['GET'])
def me():
    staff_id = session.get('staff_id')
    if not staff_id:
        return jsonify({'error': 'Not authenticated'}), 401

    member = Staff.query.get(staff_id)
    if not member or not member.is_active:
        session.clear()
        return jsonify({'error': 'Not authenticated'}), 401

    return jsonify({'staff': member.to_dict()})


@bp.route('/logout', methods=['POST'])
def logout():
    staff_id = session.get('staff_id')
    if staff_id:
        member = Staff.query.get(staff_id)
        if member:
            log_action(
                {'id': member.id, 'name': member.name, 'role': member.role},
                'logout', 'staff', member.id, member.name
            )
            db.session.commit()
    session.clear()
    return jsonify({'message': 'Logged out'})


@bp.route('/staff-in-role', methods=['GET'])
def staff_in_role():
    """Return staff list for a given role (for Step 2 name selector)."""
    role = request.args.get('role', '').strip()
    if not role:
        return jsonify([])
    members = Staff.query.filter_by(role=role, is_active=True).order_by(Staff.name).all()
    return jsonify([{'id': m.id, 'name': m.name} for m in members])
