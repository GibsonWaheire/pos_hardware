"""
Offline sync processor.

When the terminal is offline, sales are stored in the local SQLite OfflineQueue.
Run this module (or call process_queue()) when connectivity is restored to push
pending sales to the cloud database.

Usage:
    python -m sync.offline_queue

Or call process_queue() from a background thread / scheduled job.
"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


def process_queue(app=None):
    """
    Replay all pending offline sales against the local API.
    Must be called within a Flask app context.
    """
    if app is None:
        from app import app as flask_app
        app = flask_app

    with app.app_context():
        from db import db
        from models import OfflineQueue, Sale
        from datetime import datetime

        pending = OfflineQueue.query.filter_by(status='pending').order_by(OfflineQueue.created_at).all()

        if not pending:
            print('[Sync] No pending offline sales.')
            return

        print(f'[Sync] Processing {len(pending)} offline sales...')

        for entry in pending:
            try:
                payload = json.loads(entry.payload)

                # Check for duplicate (already synced via another path)
                if Sale.query.filter_by(offline_id=entry.offline_id).first():
                    entry.status = 'synced'
                    entry.synced_at = datetime.utcnow()
                    db.session.commit()
                    print(f'[Sync] {entry.offline_id} — already exists, marked synced')
                    continue

                # Import and call create_sale logic directly (avoids HTTP round-trip)
                from routes.sales import create_sale
                from flask import current_app

                # Inject offline_id into payload so the sale route handles idempotency
                payload['offline_id'] = entry.offline_id

                with current_app.test_request_context(
                    '/api/sales',
                    method='POST',
                    json=payload,
                    content_type='application/json',
                ):
                    from flask import request
                    response = create_sale()
                    if isinstance(response, tuple):
                        resp, status = response
                    else:
                        resp, status = response, 200

                    if status in (200, 201):
                        entry.status = 'synced'
                        entry.synced_at = datetime.utcnow()
                        print(f'[Sync] {entry.offline_id} — synced OK')
                    else:
                        entry.status = 'failed'
                        entry.error_message = str(resp.get_json())
                        print(f'[Sync] {entry.offline_id} — FAILED: {entry.error_message}')

                db.session.commit()

            except Exception as e:
                entry.status = 'failed'
                entry.error_message = str(e)
                db.session.commit()
                print(f'[Sync] {entry.offline_id} — ERROR: {e}')

        synced = OfflineQueue.query.filter_by(status='synced').count()
        failed = OfflineQueue.query.filter_by(status='failed').count()
        print(f'[Sync] Done. Synced: {synced}  Failed: {failed}')


if __name__ == '__main__':
    process_queue()
