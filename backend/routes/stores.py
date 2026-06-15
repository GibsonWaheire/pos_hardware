import json
from flask import Blueprint, jsonify, request, session
from db import db
from models import Store

bp = Blueprint('stores', __name__)


@bp.route('/api/stores/config', methods=['GET'])
def get_config():
    store = Store.query.first()
    if not store:
        store = Store(name='My Store')
        db.session.add(store)
        db.session.commit()
    return jsonify(store.to_dict())


@bp.route('/api/stores/config', methods=['PUT'])
def update_config():
    store = Store.query.first()
    if not store:
        store = Store()
        db.session.add(store)

    d = request.json or {}
    role = session.get('role', '')

    # Store identity — admin only
    if role == 'admin':
        for field in ('name', 'address', 'phone', 'email', 'currency',
                      'timezone', 'receipt_header', 'receipt_footer', 'tax_number'):
            if field in d:
                setattr(store, field, d[field])

    # Business rules — manager + admin
    if role in ('manager', 'admin'):
        for field in ('returns_approval_threshold', 'default_tax_rate',
                      'default_low_stock_threshold', 'session_timeout_minutes'):
            if field in d:
                setattr(store, field, d[field])

    # JSON blob configs — admin only
    if role == 'admin':
        if 'notification_config' in d:
            store.notification_config = json.dumps(d['notification_config'])
        if 'etims_config' in d:
            store.etims_config = json.dumps(d['etims_config'])
        if 'sheets_config' in d:
            store.sheets_config = json.dumps(d['sheets_config'])
        if 'printer_config' in d:
            store.printer_config = json.dumps(d['printer_config'])

    # Cashier self-close — manager/admin can toggle
    if 'allow_cashier_self_close' in d and role in ('manager', 'admin'):
        store.allow_cashier_self_close = bool(d['allow_cashier_self_close'])

    db.session.commit()
    return jsonify(store.to_dict())
