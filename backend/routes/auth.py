import uuid
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request, session
from db import db
from models import Staff
from auth_utils import (
    log_action, issue_auth_token, consume_auth_token,
    get_current_user, check_pin, hash_pin, needs_hashing,
)

bp = Blueprint('auth', __name__, url_prefix='/api/auth')

# Lockout settings
_MAX_ATTEMPTS  = 5
_LOCKOUT_MINS  = 30


def _check_lockout(member):
    """Return (is_locked, minutes_remaining) for the given staff member."""
    if not member.locked_until:
        return False, 0
    if datetime.utcnow() < member.locked_until:
        remaining = int((member.locked_until - datetime.utcnow()).total_seconds() / 60) + 1
        return True, remaining
    # Lock expired — clear it
    member.locked_until = None
    member.login_attempts = 0
    return False, 0


def _record_failure(member):
    """Increment failure counter; lock account after _MAX_ATTEMPTS."""
    member.login_attempts = (member.login_attempts or 0) + 1
    if member.login_attempts >= _MAX_ATTEMPTS:
        member.locked_until = datetime.utcnow() + timedelta(minutes=_LOCKOUT_MINS)
    db.session.commit()


def _record_success(member):
    """Reset failure counter on successful login; re-hash plain-text PIN if needed."""
    member.login_attempts = 0
    member.locked_until   = None
    db.session.commit()


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

    # Find any active staff member whose department_pin matches
    candidates = Staff.query.filter_by(is_active=True).filter(
        Staff.department_pin.isnot(None)
    ).all()

    matched_role = None
    for m in candidates:
        if check_pin(dept_pin, m.department_pin):
            # Re-hash if plain-text
            if needs_hashing(m.department_pin):
                m.department_pin = hash_pin(dept_pin)
            matched_role = m.role
            break

    db.session.commit()

    if not matched_role:
        return jsonify({'error': 'Invalid department PIN'}), 401

    staff_count = Staff.query.filter_by(role=matched_role, is_active=True).count()
    return jsonify({'role': matched_role, 'staff_count': staff_count})


@bp.route('/login', methods=['POST'])
def login():
    """
    Step 2 — verify personal PIN within a known department/role.
    Creates the session.
    """
    data = request.json or {}
    role     = data.get('role', '').strip()
    pers_pin = str(data.get('personal_pin', data.get('pin', ''))).strip()
    staff_id = data.get('staff_id')

    if not pers_pin:
        return jsonify({'error': 'Personal PIN is required'}), 400

    query = Staff.query.filter_by(is_active=True)
    if role:
        query = query.filter_by(role=role)
    if staff_id:
        try:
            query = query.filter_by(id=int(staff_id))
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid staff_id'}), 400

    candidates = query.all()
    member = None
    matched_field = None

    for m in candidates:
        if m.personal_pin and check_pin(pers_pin, m.personal_pin):
            member = m
            matched_field = 'personal_pin'
            break
        if m.pin and check_pin(pers_pin, m.pin):
            member = m
            matched_field = 'pin'
            break

    if not member:
        # Still increment attempt counter on the specific staff if they identified themselves
        if staff_id:
            target = Staff.query.get(int(staff_id))
            if target:
                locked, _ = _check_lockout(target)
                if not locked:
                    _record_failure(target)
        return jsonify({'error': 'Invalid PIN'}), 401

    # Check lockout
    locked, mins_left = _check_lockout(member)
    if locked:
        return jsonify({'error': f'Account locked. Try again in {mins_left} minute{"s" if mins_left != 1 else ""}'}), 403

    # Re-hash plain-text PIN on successful login
    if matched_field == 'personal_pin' and needs_hashing(member.personal_pin):
        member.personal_pin = hash_pin(pers_pin)
    elif matched_field == 'pin' and needs_hashing(member.pin):
        member.pin = hash_pin(pers_pin)

    _record_success(member)

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
        candidates = Staff.query.filter(
            Staff.is_active == True,
            Staff.role.in_(['manager', 'admin'])
        ).all()
        for m in candidates:
            if (m.personal_pin and check_pin(pin, m.personal_pin)) or \
               (m.pin and check_pin(pin, m.pin)):
                member = m
                method = 'pin'
                # Re-hash if plain-text
                if m.personal_pin and needs_hashing(m.personal_pin):
                    m.personal_pin = hash_pin(pin)
                    db.session.commit()
                break

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
    """Generate a new auth card code for a manager/admin staff member. Requires admin session."""
    caller = get_current_user()
    if not caller or caller['role'] != 'admin':
        return jsonify({'error': 'Admin access required'}), 403

    member = Staff.query.get_or_404(staff_id)
    if member.role not in ('manager', 'admin'):
        return jsonify({'error': 'Auth cards are only for manager/admin roles'}), 400

    code = f"MGR-{uuid.uuid4().hex[:24].upper()}"
    member.auth_card_code = code
    db.session.commit()

    log_action(caller, 'generate_card', 'staff', member.id, member.name)
    db.session.commit()

    return jsonify({'auth_card_code': code, 'staff': member.to_dict()})


@bp.route('/revoke-card/<int:staff_id>', methods=['POST'])
def revoke_card(staff_id):
    """Revoke a staff member's auth card. Requires admin session."""
    caller = get_current_user()
    if not caller or caller['role'] != 'admin':
        return jsonify({'error': 'Admin access required'}), 403

    member = Staff.query.get_or_404(staff_id)
    member.auth_card_code = None
    db.session.commit()

    log_action(caller, 'revoke_card', 'staff', member.id, member.name)
    db.session.commit()

    return jsonify({'message': 'Card revoked', 'staff': member.to_dict()})


@bp.route('/verify-manager', methods=['POST'])
def verify_manager():
    """
    Verify that a PIN belongs to an active manager or admin.
    Used by POS for inline manager approvals (loyalty redemption, etc.)
    Returns manager info if valid; 403 otherwise.
    Does NOT create a session.
    """
    data = request.json or {}
    pin  = str(data.get('pin', '')).strip()
    if not pin:
        return jsonify({'error': 'PIN required'}), 400

    managers = Staff.query.filter(
        Staff.role.in_(['manager', 'admin']),
        Staff.is_active == True,
    ).all()

    for m in managers:
        locked, _ = _check_lockout(m)
        if locked:
            continue
        if (m.personal_pin and check_pin(pin, m.personal_pin)) or \
           (m.pin and check_pin(pin, m.pin)):
            _record_success(m)
            return jsonify({
                'id':   m.id,
                'name': m.name,
                'role': m.role,
            })
        _record_failure(m)

    return jsonify({'error': 'Invalid manager PIN'}), 403


@bp.route('/current-shift', methods=['GET'])
def current_shift():
    """Check if the currently logged-in cashier has an open shift."""
    staff_id = session.get('staff_id')
    if not staff_id:
        return jsonify({'error': 'Not authenticated'}), 401

    from models import Shift
    shift = Shift.query.filter_by(cashier_id=staff_id, status='open').order_by(Shift.opened_at.desc()).first()
    if not shift:
        return jsonify({'shift': None})
    return jsonify({'shift': shift.to_dict()})
