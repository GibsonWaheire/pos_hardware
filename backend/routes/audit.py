from flask import Blueprint, jsonify, request
from models import AuditLog

bp = Blueprint('audit', __name__, url_prefix='/api/audit')


@bp.route('', methods=['GET'])
def list_logs():
    q = AuditLog.query.order_by(AuditLog.created_at.desc())

    if request.args.get('user_id'):
        q = q.filter_by(user_id=int(request.args['user_id']))
    if request.args.get('user_role'):
        q = q.filter_by(user_role=request.args['user_role'])
    if request.args.get('action'):
        q = q.filter_by(action=request.args['action'])
    if request.args.get('entity_type'):
        q = q.filter_by(entity_type=request.args['entity_type'])
    if request.args.get('date_from'):
        q = q.filter(AuditLog.created_at >= request.args['date_from'])
    if request.args.get('date_to'):
        q = q.filter(AuditLog.created_at <= request.args['date_to'] + 'T23:59:59')

    limit = int(request.args.get('limit', 200))
    logs = q.limit(limit).all()
    return jsonify([l.to_dict() for l in logs])


@bp.route('/users', methods=['GET'])
def audit_users():
    """Distinct users who appear in the audit log — for filter dropdown."""
    from db import db
    rows = db.session.query(
        AuditLog.user_id, AuditLog.user_name, AuditLog.user_role
    ).distinct().order_by(AuditLog.user_name).all()
    return jsonify([{'id': r[0], 'name': r[1], 'role': r[2]} for r in rows])
