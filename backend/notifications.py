"""
Phase 35 — Notification dispatch (SMS via Africa's Talking, Email via SMTP).

Usage:
    from notifications import notify
    notify(event_type='reorder_alert', message='5 products need restocking',
           recipient='0712345678', recipient_name='Purchasing Officer',
           channel='sms')
"""

import json
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime


def _get_config():
    """Return the notification_config dict from the Store row."""
    from models import Store
    store = Store.query.first()
    if not store or not store.notification_config:
        return {}
    try:
        return json.loads(store.notification_config)
    except Exception:
        return {}


def send_sms(phone: str, message: str, config: dict | None = None) -> tuple[bool, str]:
    """
    Send SMS via Africa's Talking.
    Returns (success: bool, error_or_message_id: str).
    """
    cfg = config or _get_config()
    api_key  = cfg.get('at_api_key', '').strip()
    username = cfg.get('at_username', '').strip()
    sender   = cfg.get('at_sender', '').strip() or None

    if not api_key or not username:
        return False, 'Africa\'s Talking API key / username not configured'

    try:
        import africastalking
        africastalking.initialize(username, api_key)
        sms = africastalking.SMS
        result = sms.send(message, [phone], sender_id=sender)
        recipients = result.get('SMSMessageData', {}).get('Recipients', [])
        if recipients and recipients[0].get('status') == 'Success':
            return True, recipients[0].get('messageId', 'sent')
        err = recipients[0].get('status', 'unknown') if recipients else 'no recipients returned'
        return False, err
    except ImportError:
        return False, 'africastalking package not installed — run: pip install africastalking'
    except Exception as e:
        return False, str(e)


def send_email(to_email: str, subject: str, body: str, config: dict | None = None) -> tuple[bool, str]:
    """
    Send email via SMTP (supports TLS on port 587 and SSL on port 465).
    Returns (success: bool, error: str).
    """
    cfg = config or _get_config()
    host      = cfg.get('smtp_host', '').strip()
    port      = int(cfg.get('smtp_port', 587) or 587)
    user      = cfg.get('smtp_user', '').strip()
    password  = cfg.get('smtp_pass', '').strip()
    from_addr = cfg.get('smtp_from', user).strip() or user

    if not host or not user or not password:
        return False, 'SMTP not configured — enter host, user, and password in Settings'

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From']    = from_addr
        msg['To']      = to_email
        msg.attach(MIMEText(body, 'plain', 'utf-8'))

        if port == 465:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=ctx) as server:
                server.login(user, password)
                server.sendmail(from_addr, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(host, port) as server:
                server.ehlo()
                server.starttls(context=ssl.create_default_context())
                server.login(user, password)
                server.sendmail(from_addr, [to_email], msg.as_string())
        return True, 'sent'
    except Exception as e:
        return False, str(e)


def notify(event_type: str, message: str, recipient: str,
           recipient_name: str = '', channel: str = 'sms',
           subject: str = '') -> dict:
    """
    Send a notification and log it to the Notification table.
    Returns the Notification.to_dict().
    """
    from db import db
    from models import Notification

    cfg = _get_config()

    if channel == 'sms':
        ok, err = send_sms(recipient, message, cfg)
    elif channel == 'email':
        ok, err = send_email(recipient, subject or event_type.replace('_', ' ').title(),
                             message, cfg)
    else:
        ok, err = False, f'Unknown channel: {channel}'

    notif = Notification(
        event_type=event_type,
        channel=channel,
        recipient=recipient,
        recipient_name=recipient_name,
        message=message,
        status='sent' if ok else 'failed',
        error=None if ok else err,
    )
    db.session.add(notif)
    db.session.commit()
    return notif.to_dict()
