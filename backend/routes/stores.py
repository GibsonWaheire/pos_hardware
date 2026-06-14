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
    for field in ('name', 'address', 'phone', 'email', 'currency',
                  'timezone', 'receipt_header', 'receipt_footer', 'tax_number',
                  'returns_approval_threshold', 'default_tax_rate',
                  'default_low_stock_threshold'):
        if field in d:
            setattr(store, field, d[field])

    # Notification config — only admin can update; stored as JSON blob
    if 'notification_config' in d and session.get('role') == 'admin':
        store.notification_config = json.dumps(d['notification_config'])

    # eTIMS config — admin only
    if 'etims_config' in d and session.get('role') == 'admin':
        store.etims_config = json.dumps(d['etims_config'])

    # Google Sheets config — admin only
    if 'sheets_config' in d and session.get('role') == 'admin':
        store.sheets_config = json.dumps(d['sheets_config'])

    db.session.commit()
    return jsonify(store.to_dict())
