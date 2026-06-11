"""
auth_utils.py — session helpers and audit logging used by all routes.
"""
import json
from datetime import datetime
from flask import session
from db import db


# ── Current user ──────────────────────────────────────────────────────────────

def get_current_user():
    """Return dict with id/name/role from session, or None."""
    uid = session.get('staff_id')
    if not uid:
        return None
    return {
        'id':   uid,
        'name': session.get('staff_name', 'Unknown'),
        'role': session.get('role', 'unknown'),
    }


# ── Audit logging ─────────────────────────────────────────────────────────────

def log_action(user, action, entity_type, entity_id=None, entity_name=None, details=None):
    """
    Write a row to audit_logs.

    user     — dict with id/name/role (from get_current_user())
               or None for system actions
    action   — 'create' | 'update' | 'delete' | 'login' | 'logout' |
               'void' | 'deposit' | 'adjust' | 'receive_po'
    details  — dict of before/after or any relevant metadata
    """
    try:
        from models import AuditLog
        entry = AuditLog(
            user_id     = user['id']   if user else None,
            user_name   = user['name'] if user else 'System',
            user_role   = user['role'] if user else 'system',
            action      = action,
            entity_type = entity_type,
            entity_id   = entity_id,
            entity_name = entity_name,
            details     = json.dumps(details) if details else None,
            created_at  = datetime.utcnow(),
        )
        db.session.add(entry)
        # flush only — caller commits with their own transaction
        db.session.flush()
    except Exception as e:
        # Never let audit logging break a business operation
        print(f'[audit] log_action failed: {e}')


def stamp(obj, user, is_create=False):
    """
    Stamp created_by_* or updated_by_* on a model instance.
    Call before db.session.commit().
    """
    if not user:
        return
    if is_create:
        obj.created_by_id   = user['id']
        obj.created_by_name = user['name']
        obj.created_by_role = user['role']
    else:
        obj.updated_by_id   = user['id']
        obj.updated_by_name = user['name']
        obj.updated_by_role = user['role']
        obj.updated_at      = datetime.utcnow()
