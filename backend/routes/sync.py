import os
import threading
from flask import Blueprint, jsonify, request
from db import db
from models import SyncLog, Sale, Customer
from datetime import datetime

bp = Blueprint('sync', __name__)

_sync_lock = threading.Lock()   # prevent concurrent syncs


def _do_sync(app):
    from sync.cloud_sync import sync_all
    with _sync_lock:
        result = sync_all(app)

    with app.app_context():
        log = SyncLog(
            sales_synced=result['sales'],
            customers_synced=result['customers'],
            inventory_synced=result['inventory'],
            status='error' if result['errors'] else 'success',
            error_message='; '.join(result['errors']) if result['errors'] else None,
        )
        db.session.add(log)
        db.session.commit()

    return result


@bp.route('/api/sync/status')
def sync_status():
    """Current sync state: pending counts + last run."""
    cloud_url_set = bool(os.getenv('CLOUD_DB_URL'))

    pending_sales = Sale.query.filter(
        Sale.status == 'completed',
        Sale.cloud_synced_at == None,  # noqa: E711
    ).count()
    pending_customers = Customer.query.filter(
        Customer.cloud_synced_at == None,  # noqa: E711
    ).count()

    last_log = SyncLog.query.order_by(SyncLog.created_at.desc()).first()

    return jsonify({
        'cloud_configured': cloud_url_set,
        'store_id': os.getenv('STORE_ID', 'not-set'),
        'pending_sales': pending_sales,
        'pending_customers': pending_customers,
        'last_sync': last_log.to_dict() if last_log else None,
        'auto_sync': os.getenv('CLOUD_SYNC_AUTO', '0') == '1',
        'sync_interval_minutes': int(os.getenv('SYNC_INTERVAL_MINUTES', 15)),
    })


@bp.route('/api/sync/run', methods=['POST'])
def run_sync():
    """Trigger a manual sync. Runs in background thread."""
    from flask import current_app
    if not os.getenv('CLOUD_DB_URL'):
        return jsonify({'error': 'CLOUD_DB_URL is not configured'}), 503

    if _sync_lock.locked():
        return jsonify({'error': 'Sync already in progress'}), 409

    app = current_app._get_current_object()
    t = threading.Thread(target=_do_sync, args=(app,), daemon=True)
    t.start()

    return jsonify({'ok': True, 'message': 'Sync started in background'})


@bp.route('/api/sync/run-sync', methods=['POST'])
def run_sync_blocking():
    """Trigger sync and wait for result (use for small datasets)."""
    from flask import current_app
    if not os.getenv('CLOUD_DB_URL'):
        return jsonify({'error': 'CLOUD_DB_URL is not configured'}), 503

    app = current_app._get_current_object()
    result = _do_sync(app)
    return jsonify(result)


@bp.route('/api/sync/logs')
def sync_logs():
    limit = min(int(request.args.get('limit', 20)), 100)
    logs = SyncLog.query.order_by(SyncLog.created_at.desc()).limit(limit).all()
    return jsonify([l.to_dict() for l in logs])


@bp.route('/api/sync/cloud-dashboard')
def cloud_dashboard_view():
    """Query the cloud PostgreSQL and return all-stores summary."""
    if not os.getenv('CLOUD_DB_URL'):
        return jsonify({'error': 'CLOUD_DB_URL is not configured', 'stores': []}), 503

    from flask import current_app
    from sync.cloud_sync import cloud_dashboard
    data = cloud_dashboard(current_app._get_current_object())
    return jsonify(data)


@bp.route('/api/sync/mark-all-pending', methods=['POST'])
def mark_all_pending():
    """Reset cloud_synced_at so all records will re-sync on next run."""
    Sale.query.update({'cloud_synced_at': None})
    Customer.query.update({'cloud_synced_at': None})
    db.session.commit()
    return jsonify({'ok': True})
