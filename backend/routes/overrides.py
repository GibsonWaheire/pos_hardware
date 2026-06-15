from flask import Blueprint, jsonify, request
from db import db
from models import Staff, OverrideApproval
from auth_utils import (
    get_current_user, check_pin, hash_pin, needs_hashing, log_action,
)
from datetime import datetime

bp = Blueprint('overrides', __name__, url_prefix='/api/overrides')

_ALLOWED_ACTIONS = ('ADJUST_QTY', 'REMOVE_COMMITTED_ITEM', 'VOID_ALL')


@bp.route('', methods=['GET'])
def list_overrides():
    """
    List override approvals — for shift reconciliation and store audit.
    Query params: cashier_id, date_from (ISO), date_to (ISO), limit (max 500)
    Requires authenticated manager/admin or the cashier themselves.
    """
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Not authenticated'}), 401

    cashier_id = request.args.get('cashier_id')
    date_from  = request.args.get('date_from')
    date_to    = request.args.get('date_to')
    limit      = min(int(request.args.get('limit', 200)), 500)

    # Cashier role can only see their own overrides
    if user['role'] == 'cashier':
        cashier_id = str(user['id'])

    q = OverrideApproval.query
    if cashier_id:
        try:
            q = q.filter_by(cashier_id=int(cashier_id))
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid cashier_id'}), 400
    if date_from:
        q = q.filter(OverrideApproval.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.filter(OverrideApproval.created_at <= datetime.fromisoformat(date_to))

    overrides = q.order_by(OverrideApproval.created_at.desc()).limit(limit).all()
    return jsonify([{
        'id':           oa.id,
        'cashier_id':   oa.cashier_id,
        'cashier_name': oa.cashier_name,
        'manager_name': oa.manager_name,
        'manager_role': oa.manager_role,
        'auth_method':  oa.auth_method,
        'action':       oa.action,
        'item_name':    oa.item_name,
        'original_qty': oa.original_qty,
        'new_qty':      oa.new_qty,
        'sale_id':      oa.sale_id,
        'used_at':      oa.used_at.isoformat() if oa.used_at else None,
        'created_at':   oa.created_at.isoformat() if oa.created_at else None,
    } for oa in overrides])


@bp.route('/approve', methods=['POST'])
def approve():
    """
    Validate manager card/PIN, create an OverrideApproval record, and return its ID.
    The frontend collects these IDs and includes them in the sale payload.
    The sale endpoint validates each ID before committing.
    """
    data = request.json or {}
    card_code = data.get('card_code', '').strip()
    pin       = str(data.get('pin', '')).strip()
    action    = data.get('action', '').strip()
    item_name    = data.get('item_name', '')
    original_qty = data.get('original_qty')
    new_qty      = data.get('new_qty')

    if action not in _ALLOWED_ACTIONS:
        return jsonify({'error': f'Invalid action. Must be one of: {", ".join(_ALLOWED_ACTIONS)}'}), 400

    # Authenticate manager
    manager = None
    method  = None

    if card_code:
        manager = Staff.query.filter_by(auth_card_code=card_code, is_active=True).first()
        method  = 'card'

    if not manager and pin:
        candidates = Staff.query.filter(
            Staff.is_active == True,
            Staff.role.in_(['manager', 'admin'])
        ).all()
        for m in candidates:
            if (m.personal_pin and check_pin(pin, m.personal_pin)) or \
               (m.pin and check_pin(pin, m.pin)):
                manager = m
                method  = 'pin'
                if m.personal_pin and needs_hashing(m.personal_pin):
                    m.personal_pin = hash_pin(pin)
                    db.session.flush()
                break

    if not manager:
        return jsonify({'error': 'Invalid card or PIN'}), 401

    if manager.role not in ('manager', 'admin'):
        return jsonify({'error': 'Manager or admin authorization required'}), 403

    # Resolve the current cashier from session (may be None in offline / kiosk mode)
    cashier = get_current_user()

    approval = OverrideApproval(
        cashier_id   = cashier['id']   if cashier else None,
        cashier_name = cashier['name'] if cashier else 'Unknown',
        manager_id   = manager.id,
        manager_name = manager.name,
        manager_role = manager.role,
        auth_method  = method,
        action       = action,
        item_name    = str(item_name)[:200],
        original_qty = int(original_qty) if original_qty is not None else None,
        new_qty      = int(new_qty)      if new_qty      is not None else None,
        created_at   = datetime.utcnow(),
    )
    db.session.add(approval)

    log_action(
        cashier,
        f'override_approve:{action}',
        'override_approval',
        entity_name=str(item_name)[:200],
        details={'action': action, 'original_qty': original_qty, 'new_qty': new_qty},
        authorizer={'id': manager.id, 'name': manager.name, 'role': manager.role},
        auth_method=method,
    )

    db.session.commit()

    return jsonify({
        'id':           approval.id,
        'manager_name': manager.name,
        'manager_role': manager.role,
        'action':       action,
        'item_name':    approval.item_name,
    }), 201


@bp.route('/self-approve', methods=['POST'])
def self_approve():
    """
    Manager/admin self-authorizes an override using their own session.
    No card or PIN required — their elevated role is the authorization.
    Used when manager is operating the POS directly.
    """
    user = get_current_user()
    if not user or user.get('role') not in ('manager', 'admin'):
        return jsonify({'error': 'Manager or admin session required'}), 403

    data     = request.json or {}
    action   = data.get('action', '').strip()
    if action not in _ALLOWED_ACTIONS:
        return jsonify({'error': f'Invalid action. Must be one of: {", ".join(_ALLOWED_ACTIONS)}'}), 400

    item_name    = data.get('item_name', '')
    original_qty = data.get('original_qty')
    new_qty      = data.get('new_qty')

    approval = OverrideApproval(
        cashier_id   = user['id'],
        cashier_name = user['name'],
        manager_id   = user['id'],
        manager_name = user['name'],
        manager_role = user['role'],
        auth_method  = 'self',
        action       = action,
        item_name    = str(item_name)[:200],
        original_qty = int(original_qty) if original_qty is not None else None,
        new_qty      = int(new_qty)      if new_qty      is not None else None,
        created_at   = datetime.utcnow(),
    )
    db.session.add(approval)
    db.session.commit()

    return jsonify({
        'id':           approval.id,
        'manager_name': user['name'],
        'manager_role': user['role'],
        'action':       action,
        'item_name':    approval.item_name,
    }), 201
