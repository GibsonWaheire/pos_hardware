"""
Multi-lane terminal management.

Each POS terminal registers itself on startup with a unique terminal_id.
Terminals send periodic heartbeats so the dashboard can show online/offline status.
Sales record which terminal processed them.
"""

from flask import Blueprint, jsonify, request
from db import db
from models import Terminal, Sale
from datetime import datetime, timedelta

bp = Blueprint('terminals', __name__, url_prefix='/api/terminals')


@bp.route('', methods=['GET'])
def list_terminals():
    terminals = Terminal.query.order_by(Terminal.terminal_id).all()
    now = datetime.utcnow()
    result = []
    for t in terminals:
        d = t.to_dict()
        # Mark online if last heartbeat within 2 minutes
        d['online'] = (
            t.last_seen is not None and
            (now - t.last_seen).total_seconds() < 120
        )
        result.append(d)
    return jsonify(result)


@bp.route('/register', methods=['POST'])
def register():
    """Register or update a terminal. Call on startup."""
    data = request.json or {}
    terminal_id = data.get('terminal_id', '').strip()
    if not terminal_id:
        return jsonify({'error': 'terminal_id is required'}), 400

    terminal = Terminal.query.filter_by(terminal_id=terminal_id).first()
    if terminal:
        # Update existing
        terminal.name = data.get('name', terminal.name)
        terminal.location = data.get('location', terminal.location)
        terminal.ip_address = request.remote_addr
        terminal.last_seen = datetime.utcnow()
        terminal.is_active = True
    else:
        terminal = Terminal(
            terminal_id=terminal_id,
            name=data.get('name', terminal_id),
            location=data.get('location', ''),
            ip_address=request.remote_addr,
            last_seen=datetime.utcnow(),
        )
        db.session.add(terminal)

    db.session.commit()
    return jsonify(terminal.to_dict()), 200


@bp.route('/heartbeat', methods=['POST'])
def heartbeat():
    """Lightweight ping to keep terminal marked as online."""
    data = request.json or {}
    terminal_id = data.get('terminal_id', '').strip()
    if not terminal_id:
        return jsonify({'error': 'terminal_id is required'}), 400

    terminal = Terminal.query.filter_by(terminal_id=terminal_id).first()
    if not terminal:
        return jsonify({'error': 'Terminal not registered'}), 404

    terminal.last_seen = datetime.utcnow()
    terminal.ip_address = request.remote_addr
    db.session.commit()
    return jsonify({'status': 'ok', 'terminal_id': terminal_id})


@bp.route('/<terminal_id>/sales', methods=['GET'])
def terminal_sales(terminal_id):
    """Sales processed by a specific terminal."""
    limit = min(int(request.args.get('limit', 50)), 200)
    sales = (Sale.query
             .filter_by(terminal_id=terminal_id, status='completed')
             .order_by(Sale.created_at.desc())
             .limit(limit)
             .all())
    return jsonify([s.to_dict() for s in sales])


@bp.route('/<int:terminal_db_id>', methods=['PUT'])
def update_terminal(terminal_db_id):
    terminal = Terminal.query.get_or_404(terminal_db_id)
    data = request.json or {}
    for field in ('name', 'location', 'is_active'):
        if field in data:
            setattr(terminal, field, data[field])
    db.session.commit()
    return jsonify(terminal.to_dict())
