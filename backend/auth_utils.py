"""
auth_utils.py — session helpers, audit logging, manager authorization, and security helpers.
"""
import json
import re
import uuid
import bcrypt
from datetime import datetime, timedelta
from flask import session
from db import db

# ── PIN Hashing ───────────────────────────────────────────────────────────────

def hash_pin(plain: str) -> str:
    """Return a bcrypt hash of the given PIN string."""
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def check_pin(plain: str, stored: str) -> bool:
    """
    Verify a PIN against a stored value.
    Handles both bcrypt hashes ($2b$...) and legacy plain-text PINs.
    """
    if not plain or not stored:
        return False
    if stored.startswith('$2b$') or stored.startswith('$2a$'):
        return bcrypt.checkpw(plain.encode(), stored.encode())
    # Legacy plain-text comparison (migration path)
    return plain == stored


def needs_hashing(stored: str) -> bool:
    """Return True if the stored PIN is plain-text and should be re-hashed."""
    if not stored:
        return False
    return not (stored.startswith('$2b$') or stored.startswith('$2a$'))


# ── Input Validation ──────────────────────────────────────────────────────────

def validate_str(val, max_len: int, field_name: str = 'field'):
    """Return an error message string if val is invalid, else None."""
    if val is None:
        return None
    s = str(val).strip()
    if len(s) > max_len:
        return f'{field_name} must be {max_len} characters or fewer'
    # Basic HTML tag stripping check
    if re.search(r'<[^>]+>', s):
        return f'{field_name} must not contain HTML'
    return None


def validate_positive(val, field_name: str = 'value'):
    """Return an error message string if val is not a positive number, else None."""
    try:
        if float(val) < 0:
            return f'{field_name} must not be negative'
    except (TypeError, ValueError):
        return f'{field_name} must be a number'
    return None


def validate_email(val: str):
    """Return an error message string if email format is invalid, else None."""
    if not val:
        return None
    pattern = r'^[^@\s]+@[^@\s]+\.[^@\s]+$'
    if not re.match(pattern, str(val).strip()):
        return 'Invalid email address'
    return None


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


def prune_old_logs():
    """
    Tiered log retention — called automatically on every shift close.
    Retention policy:
      auth events (login/logout/pin_change)  →  7 days
      all other audit events                 →  90 days
      stock_movements                        →  90 days
    Sales, returns, products etc. are in their own tables and NOT touched here.
    """
    try:
        from models import AuditLog, StockMovement
        now = datetime.utcnow()

        AUTH_ACTIONS = ('login', 'logout', 'pin_change', 'lock', 'unlock', 'session_expire')

        # Short-lived: auth/session events
        cutoff_auth = now - timedelta(days=7)
        n_auth = AuditLog.query.filter(
            AuditLog.created_at < cutoff_auth,
            AuditLog.action.in_(AUTH_ACTIONS),
        ).delete(synchronize_session=False)

        # Standard: all other audit events (financial accountability)
        cutoff_std = now - timedelta(days=90)
        n_std = AuditLog.query.filter(
            AuditLog.created_at < cutoff_std,
            ~AuditLog.action.in_(AUTH_ACTIONS),
        ).delete(synchronize_session=False)

        # Stock movements
        n_stock = StockMovement.query.filter(StockMovement.created_at < cutoff_std).delete(synchronize_session=False)

        db.session.commit()
        print(f'[prune] Removed {n_auth} auth events (>7d), {n_std} audit events (>90d), {n_stock} stock movements (>90d)')
    except Exception as e:
        db.session.rollback()
        print(f'[prune] Log pruning failed (non-fatal): {e}')


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
