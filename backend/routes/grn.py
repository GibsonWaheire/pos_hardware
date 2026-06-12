from flask import Blueprint, jsonify, request, session
from db import db
from models import GoodsReceivedNote
from datetime import datetime

bp = Blueprint('grn', __name__, url_prefix='/api/grns')


def _session_role():
    return session.get('role', ''), session.get('staff_id'), session.get('staff_name', '')


@bp.route('', methods=['GET'])
def list_grns():
    role, _, _ = _session_role()
    if role not in ('inventory', 'purchasing', 'manager', 'admin'):
        return jsonify({'error': 'Access denied'}), 403

    po_id  = request.args.get('po_id')
    status = request.args.get('status')
    limit  = min(int(request.args.get('limit', 100)), 500)

    query = GoodsReceivedNote.query
    if po_id:
        query = query.filter_by(po_id=int(po_id))
    if status:
        query = query.filter_by(status=status)
    grns = query.order_by(GoodsReceivedNote.created_at.desc()).limit(limit).all()
    return jsonify([g.to_dict() for g in grns])


@bp.route('/<int:grn_id>', methods=['GET'])
def get_grn(grn_id):
    role, _, _ = _session_role()
    if role not in ('inventory', 'purchasing', 'manager', 'admin'):
        return jsonify({'error': 'Access denied'}), 403
    grn = GoodsReceivedNote.query.get_or_404(grn_id)
    return jsonify(grn.to_dict())


@bp.route('/<int:grn_id>/confirm', methods=['POST'])
def confirm_grn(grn_id):
    """Receiving staff confirms GRN is accurate before manager signs off."""
    role, staff_id, staff_name = _session_role()
    if role not in ('inventory', 'purchasing', 'manager', 'admin'):
        return jsonify({'error': 'Access denied'}), 403
    grn = GoodsReceivedNote.query.get_or_404(grn_id)
    if grn.status != 'draft':
        return jsonify({'error': f'GRN is not in draft status (current: {grn.status})'}), 400
    data = request.json or {}
    grn.status = 'confirmed'
    if data.get('notes'):
        grn.notes = (grn.notes or '') + '\n' + data['notes']
    db.session.commit()
    return jsonify(grn.to_dict())


@bp.route('/<int:grn_id>/sign-off', methods=['POST'])
def sign_off_grn(grn_id):
    """Manager signs off / approves the GRN."""
    role, staff_id, staff_name = _session_role()
    if role not in ('manager', 'admin'):
        return jsonify({'error': 'Manager or admin required'}), 403
    grn = GoodsReceivedNote.query.get_or_404(grn_id)
    if grn.status == 'signed_off':
        return jsonify({'error': 'GRN already signed off'}), 400
    data = request.json or {}
    grn.status = 'signed_off'
    grn.signed_off_by_id   = staff_id
    grn.signed_off_by_name = staff_name
    grn.signed_off_at = datetime.utcnow()
    if data.get('notes'):
        grn.notes = (grn.notes or '') + '\n' + data['notes']
    db.session.commit()
    return jsonify(grn.to_dict())
