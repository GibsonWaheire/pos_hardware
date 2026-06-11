import uuid
from flask import Blueprint, jsonify, request, session
from db import db
from models import Staff
from auth_utils import log_action, issue_auth_token, consume_auth_token

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


@bp.route('/authorize', methods=['POST'])
def authorize():
    """
    Sudo-style manager authorization. Accepts card_code OR pin.
    Does NOT change the session — returns a short-lived single-use token.

    Body: { card_code? | pin?, action?, context? }
    Returns: { token, authorizer: { id, name, role }, expires_in: 30 }
    """
    data = request.json or {}
    card_code = data.get('card_code', '').strip()
    pin       = str(data.get('pin', '')).strip()

    member = None
    method = None

    if card_code:
        member = Staff.query.filter_by(auth_card_code=card_code, is_active=True).first()
        method = 'card'

    if not member and pin:
        # Accept any manager/admin PIN
        m = Staff.query.filter(
            Staff.is_active == True,
            Staff.role.in_(['manager', 'admin'])
        ).filter(
            db.or_(Staff.personal_pin == pin, Staff.pin == pin)
        ).first()
        member = m
        method = 'pin'

    if not member:
        return jsonify({'error': 'Invalid card or PIN'}), 401

    if member.role not in ('manager', 'admin'):
        return jsonify({'error': 'Manager or admin authorization required'}), 403

    token = issue_auth_token(
        {'id': member.id, 'name': member.name, 'role': member.role},
        ttl_seconds=30
    )

    return jsonify({
        'token': token,
        'authorizer': {'id': member.id, 'name': member.name, 'role': member.role},
        'expires_in': 30,
        'auth_method': method,
    })


@bp.route('/consume-token', methods=['POST'])
def consume_token():
    """Consume a single-use auth token. Returns authorizer or 401."""
    data  = request.json or {}
    token = data.get('token', '').strip()
    authorizer = consume_auth_token(token)
    if not authorizer:
        return jsonify({'error': 'Token expired or invalid'}), 401
    return jsonify({'authorizer': authorizer})


@bp.route('/generate-card/<int:staff_id>', methods=['POST'])
def generate_card(staff_id):
    """Generate a new auth card code for a manager/admin staff member."""
    member = Staff.query.get_or_404(staff_id)
    if member.role not in ('manager', 'admin'):
        return jsonify({'error': 'Auth cards are only for manager/admin roles'}), 400

    code = f"MGR-{uuid.uuid4().hex[:24].upper()}"
    member.auth_card_code = code
    db.session.commit()

    return jsonify({'auth_card_code': code, 'staff': member.to_dict()})


@bp.route('/revoke-card/<int:staff_id>', methods=['POST'])
def revoke_card(staff_id):
    """Revoke a staff member's auth card — immediately stops it working."""
    member = Staff.query.get_or_404(staff_id)
    member.auth_card_code = None
    db.session.commit()
    return jsonify({'message': 'Card revoked', 'staff': member.to_dict()})


@bp.route('/current-shift', methods=['GET'])
def current_shift():
    """
    Check if the currently logged-in cashier has an open shift.
    Used by the POS gate on login.
    """
    staff_id = session.get('staff_id')
    if not staff_id:
        return jsonify({'error': 'Not authenticated'}), 401

    from models import Shift
    shift = Shift.query.filter_by(cashier_id=staff_id, status='open').order_by(Shift.opened_at.desc()).first()
    if not shift:
        return jsonify({'shift': None})
    return jsonify({'shift': shift.to_dict()})
