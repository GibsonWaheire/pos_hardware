from flask import Blueprint, jsonify, session, current_app
from models import Store
from sheets_export import push_all, get_sheets_config

bp = Blueprint('sheets', __name__, url_prefix='/api/sheets')


def _deny(msg='Access denied'):
    return jsonify({'error': msg}), 403


@bp.route('/push-now', methods=['POST'])
def push_now():
    """Trigger an immediate Google Sheets export. Admin only."""
    if session.get('role') != 'admin':
        return _deny()
    result = push_all(current_app._get_current_object())
    return jsonify(result)


@bp.route('/status', methods=['GET'])
def get_status():
    """Return last push time and result. Admin only."""
    if session.get('role') != 'admin':
        return _deny()
    store = Store.query.first()
    if not store:
        return jsonify({'last_push_at': None, 'last_push_result': None})
    cfg = get_sheets_config(store)
    return jsonify({
        'last_push_at':     cfg['last_push_at'],
        'last_push_result': cfg['last_push_result'],
    })
