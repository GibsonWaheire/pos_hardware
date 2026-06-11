"""
Shift report filing system (Phase 14).

Lifecycle: GENERATED → PRINTED → FILED
- Generate: auto-created when a shift is closed (in shifts.py)
- Print:    manager / admin / inventory / purchasing
- File:     manager / admin only

Shift-open gate: the previous shift's SHIFT_DAILY report must be FILED before
a new shift can open (enforced in shifts.py open_shift).
"""

from flask import Blueprint, jsonify, request
from db import db
from models import ShiftReport, ReportPrintEvent
from auth_utils import get_current_user
from datetime import datetime

bp = Blueprint('shift_reports', __name__, url_prefix='/api/shift-reports')

# Roles that can print a report
PRINT_ROLES = {'manager', 'admin', 'inventory', 'purchasing'}
# Roles that can mark a report as filed
FILE_ROLES  = {'manager', 'admin'}


def _auth(allowed_roles=None):
    """Return (user, error_response). error_response is None if OK."""
    user = get_current_user()
    if not user:
        return None, (jsonify({'error': 'Not authenticated'}), 401)
    if allowed_roles and user.get('role') not in allowed_roles:
        return None, (jsonify({'error': 'Insufficient role'}), 403)
    return user, None


# ── List / query ──────────────────────────────────────────────────────────────

@bp.route('', methods=['GET'])
def list_reports():
    user, err = _auth()
    if err:
        return err

    status = request.args.get('status')
    rtype  = request.args.get('type')
    limit  = min(int(request.args.get('limit', 50)), 200)

    q = ShiftReport.query
    if status:
        q = q.filter_by(status=status)
    if rtype:
        q = q.filter_by(type=rtype)

    reports = q.order_by(ShiftReport.created_at.desc()).limit(limit).all()
    return jsonify([r.to_dict() for r in reports])


@bp.route('/pending', methods=['GET'])
def pending_reports():
    """Reports that have not yet been filed (GENERATED or PRINTED)."""
    user, err = _auth(FILE_ROLES)
    if err:
        return err

    reports = (ShiftReport.query
               .filter(ShiftReport.status.in_(['GENERATED', 'PRINTED']))
               .order_by(ShiftReport.created_at.desc())
               .all())
    return jsonify([r.to_dict() for r in reports])


@bp.route('/<int:report_id>', methods=['GET'])
def get_report(report_id):
    user, err = _auth()
    if err:
        return err
    report = ShiftReport.query.get_or_404(report_id)
    return jsonify(report.to_dict())


# ── Actions ───────────────────────────────────────────────────────────────────

@bp.route('/<int:report_id>/print', methods=['POST'])
def print_report(report_id):
    """
    Record a print event and advance status from GENERATED → PRINTED.
    Accessible to manager, admin, inventory, and purchasing roles.
    """
    user, err = _auth(PRINT_ROLES)
    if err:
        return err

    report = ShiftReport.query.get_or_404(report_id)
    report.print_count = (report.print_count or 0) + 1
    if report.status == 'GENERATED':
        report.status = 'PRINTED'
    report.printed_at = datetime.utcnow()

    evt = ReportPrintEvent(
        report_id=report.id,
        printed_by_id=user['id'],
        printed_by_name=user['name'],
        printed_by_role=user['role'],
        copy_number=report.print_count,
    )
    db.session.add(evt)
    db.session.commit()
    return jsonify(report.to_dict())


@bp.route('/<int:report_id>/file', methods=['POST'])
def file_report(report_id):
    """
    Mark report as FILED. Manager / admin only.
    Body: { signed_note: str }
    """
    user, err = _auth(FILE_ROLES)
    if err:
        return err

    report = ShiftReport.query.get_or_404(report_id)
    if report.status == 'FILED':
        return jsonify({'error': 'Report is already filed'}), 400

    data = request.json or {}
    report.status      = 'FILED'
    report.filed_by_id = user['id']
    report.filed_by_name = user['name']
    report.filed_at    = datetime.utcnow()
    report.signed_note = data.get('signed_note', '')
    db.session.commit()
    return jsonify(report.to_dict())
