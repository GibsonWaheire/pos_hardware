from flask import Blueprint, jsonify, request, session
from db import db
from models import Notification

bp = Blueprint('notifications', __name__, url_prefix='/api/notifications')

ADMIN_ROLES = {'manager', 'admin'}


@bp.route('/log', methods=['GET'])
def get_log():
    if session.get('role') not in ADMIN_ROLES:
        return jsonify({'error': 'Access denied'}), 403
    limit = int(request.args.get('limit', 50))
    rows = Notification.query.order_by(Notification.created_at.desc()).limit(limit).all()
    return jsonify([r.to_dict() for r in rows])


@bp.route('/test', methods=['POST'])
def test_notification():
    if session.get('role') not in ADMIN_ROLES:
        return jsonify({'error': 'Access denied'}), 403
    data = request.json or {}
    channel   = data.get('channel', 'sms')
    recipient = data.get('recipient', '').strip()
    if not recipient:
        return jsonify({'error': 'recipient is required (phone for SMS, email for Email)'}), 400

    from notifications import send_sms, send_email
    if channel == 'sms':
        ok, detail = send_sms(recipient, 'Test SMS from your POS system. If you receive this, SMS is configured correctly.')
    else:
        ok, detail = send_email(recipient, 'POS Test Email',
                                'Test email from your POS system. If you receive this, email is configured correctly.')

    notif = Notification(
        event_type='test',
        channel=channel,
        recipient=recipient,
        recipient_name='Test',
        message='Test notification',
        status='sent' if ok else 'failed',
        error=None if ok else detail,
    )
    db.session.add(notif)
    db.session.commit()

    if ok:
        return jsonify({'ok': True, 'detail': detail})
    return jsonify({'ok': False, 'error': detail}), 200  # 200 so frontend can read the body
