from flask import Blueprint, jsonify, request
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
                  'timezone', 'receipt_header', 'receipt_footer', 'tax_number'):
        if field in d:
            setattr(store, field, d[field])

    db.session.commit()
    return jsonify(store.to_dict())
