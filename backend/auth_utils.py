"""
auth_utils.py — session helpers, audit logging, and manager authorization.
"""
import json
import uuid
from datetime import datetime, timedelta
from flask import session
from db import db

# ── In-memory token store (single process) ────────────────────────────────────
# { token_str: { 'authorizer': {...}, 'expires_at': datetime, 'used': bool } }
_auth_tokens = {}


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


# ── Manager authorization (card or PIN) ───────────────────────────────────────

def issue_auth_token(authorizer: dict, ttl_seconds: int = 30) -> str:
    """
    Create a short-lived single-use authorization token.
    authorizer = { id, name, role }
    Returns the token string.
    """
    _cleanup_expired_tokens()
    token = str(uuid.uuid4())
    _auth_tokens[token] = {
        'authorizer': authorizer,
        'expires_at': datetime.utcnow() + timedelta(seconds=ttl_seconds),
        'used': False,
    }
    return token


def consume_auth_token(token: str):
    """
    Validate and consume a token. Returns authorizer dict or None.
    Token is marked used immediately — cannot be replayed.
    """
    _cleanup_expired_tokens()
    entry = _auth_tokens.get(token)
    if not entry:
        return None
    if entry['used']:
        return None
    if datetime.utcnow() > entry['expires_at']:
        del _auth_tokens[token]
        return None
    entry['used'] = True
    return entry['authorizer']


def _cleanup_expired_tokens():
    now = datetime.utcnow()
    expired = [k for k, v in _auth_tokens.items() if now > v['expires_at']]
    for k in expired:
        del _auth_tokens[k]


# ── Audit logging ─────────────────────────────────────────────────────────────

def log_action(user, action, entity_type, entity_id=None, entity_name=None,
               details=None, authorizer=None, auth_method=None):
    """
    Write a row to audit_logs.
    user/authorizer — dict with id/name/role, or None.
    """
    try:
        from models import AuditLog
        entry = AuditLog(
            user_id            = user['id']          if user       else None,
            user_name          = user['name']         if user       else 'System',
            user_role          = user['role']         if user       else 'system',
            action             = action,
            entity_type        = entity_type,
            entity_id          = entity_id,
            entity_name        = entity_name,
            details            = json.dumps(details) if details    else None,
            authorized_by_id   = authorizer['id']    if authorizer else None,
            authorized_by_name = authorizer['name']  if authorizer else None,
            authorized_by_role = authorizer['role']  if authorizer else None,
            auth_method        = auth_method,
            created_at         = datetime.utcnow(),
        )
        db.session.add(entry)
        db.session.flush()
    except Exception as e:
        print(f'[audit] log_action failed: {e}')


def stamp(obj, user, is_create=False):
    """Stamp created_by_* or updated_by_* on a model instance."""
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
