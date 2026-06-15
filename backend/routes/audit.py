from flask import Blueprint, jsonify, request, session
from models import AuditLog, Sale, SaleItem, VoidLog, OverrideApproval, StockMovement
from db import db
from auth_utils import get_current_user, log_action
from datetime import datetime, date

bp = Blueprint('audit', __name__, url_prefix='/api/audit')


@bp.route('', methods=['GET'])
def list_logs():
    role = session.get('role', '')
    if role not in ('manager', 'admin'):
        return jsonify({'error': 'Access denied'}), 403

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

    limit = int(request.args.get('limit', 500))
    logs = q.limit(limit).all()
    return jsonify([l.to_dict() for l in logs])


@bp.route('/users', methods=['GET'])
def audit_users():
    """Distinct users who appear in the audit log — for filter dropdown."""
    role = session.get('role', '')
    if role not in ('manager', 'admin'):
        return jsonify({'error': 'Access denied'}), 403
    rows = db.session.query(
        AuditLog.user_id, AuditLog.user_name, AuditLog.user_role
    ).distinct().order_by(AuditLog.user_name).all()
    return jsonify([{'id': r[0], 'name': r[1], 'role': r[2]} for r in rows])


@bp.route('/reconciliation', methods=['GET'])
def reconciliation():
    """
    Unified reconciliation feed for a date range.
    Combines: audit_logs, void_logs, override_approvals, stock_movements, and full sale detail.
    Manager/admin only.
    """
    role = session.get('role', '')
    if role not in ('manager', 'admin'):
        return jsonify({'error': 'Access denied'}), 403

    date_from_str = request.args.get('date_from', date.today().isoformat())
    date_to_str   = request.args.get('date_to',   date.today().isoformat())
    limit = min(int(request.args.get('limit', 1000)), 5000)

    try:
        dt_from = datetime.fromisoformat(date_from_str)
        dt_to   = datetime.fromisoformat(date_to_str).replace(hour=23, minute=59, second=59)
    except ValueError:
        return jsonify({'error': 'Invalid date format'}), 400

    events = []

    # ── Audit log entries (logins, product changes, stock adjustments, etc.) ──
    audit_logs = (AuditLog.query
                  .filter(AuditLog.created_at >= dt_from, AuditLog.created_at <= dt_to)
                  .order_by(AuditLog.created_at)
                  .limit(limit).all())
    for al in audit_logs:
        d = al.to_dict()
        # Skip sale entries here — we'll pull sales separately with full item detail
        if d.get('entity_type') == 'sale' and d.get('action') == 'sale':
            continue
        events.append({
            'source':      'audit',
            'id':          f'audit-{al.id}',
            'time':        d['created_at'],
            'type':        d['action'],
            'category':    d['entity_type'],
            'user':        d['user_name'],
            'user_role':   d['user_role'],
            'entity':      d['entity_name'],
            'entity_id':   d['entity_id'],
            'details':     d['details'],
            'authorizer':  d['authorized_by_name'],
            'auth_method': d['auth_method'],
        })

    # ── Full sales with line items ──────────────────────────────────────────────
    import json as _json
    sales = (Sale.query
             .filter(Sale.created_at >= dt_from, Sale.created_at <= dt_to)
             .order_by(Sale.created_at)
             .limit(limit).all())
    for s in sales:
        tenders = None
        if s.tenders_json:
            try:
                tenders = _json.loads(s.tenders_json)
            except Exception:
                pass
        events.append({
            'source':    'sale',
            'id':        f'sale-{s.id}',
            'time':      s.created_at.isoformat() if s.created_at else None,
            'type':      s.status,   # 'completed' or 'voided'
            'category':  'sale',
            'user':      s.cashier_name,
            'user_role': 'cashier',
            'entity':    s.receipt_number,
            'entity_id': s.id,
            'details': {
                'receipt_number':  s.receipt_number,
                'subtotal':        s.subtotal,
                'discount_total':  s.discount_total,
                'tax_amount':      s.tax_amount,
                'total':           s.total,
                'payment_method':  s.payment_method,
                'cash_tendered':   s.cash_tendered,
                'change_given':    s.change_given,
                'card_amount':     s.card_amount,
                'mpesa_amount':    getattr(s, 'mpesa_amount', 0),
                'mpesa_ref':       s.mpesa_ref,
                'tenders':         tenders,
                'items': [
                    {
                        'product_id':   i.product_id,
                        'product_name': i.product_name,
                        'qty':          i.qty,
                        'unit_price':   i.unit_price,
                        'discount':     i.discount,
                        'tax_rate':     i.tax_rate,
                        'line_total':   i.line_total,
                    }
                    for i in s.items
                ],
            },
            'authorizer':  None,
            'auth_method': None,
        })

    # ── Void logs ──────────────────────────────────────────────────────────────
    voids = (VoidLog.query
             .filter(VoidLog.created_at >= dt_from, VoidLog.created_at <= dt_to)
             .order_by(VoidLog.created_at)
             .limit(limit).all())
    for v in voids:
        vd = v.to_dict()
        events.append({
            'source':    'void',
            'id':        f'void-{v.id}',
            'time':      vd.get('created_at'),
            'type':      vd.get('type', 'void_sale'),
            'category':  'void',
            'user':      vd.get('cashier_name'),
            'user_role': 'cashier',
            'entity':    vd.get('receipt_number') or 'No-Sale',
            'entity_id': vd.get('sale_id'),
            'details': {
                'reason':       vd.get('reason'),
                'manager':      vd.get('manager_name'),
                'amount':       vd.get('amount'),
                'terminal_id':  vd.get('terminal_id'),
            },
            'authorizer':  vd.get('manager_name'),
            'auth_method': 'pin',
        })

    # ── Override approvals ─────────────────────────────────────────────────────
    overrides = (OverrideApproval.query
                 .filter(OverrideApproval.created_at >= dt_from, OverrideApproval.created_at <= dt_to)
                 .order_by(OverrideApproval.created_at)
                 .limit(limit).all())
    for ov in overrides:
        events.append({
            'source':    'override',
            'id':        f'override-{ov.id}',
            'time':      ov.created_at.isoformat() if ov.created_at else None,
            'type':      'override',
            'category':  'override',
            'user':      ov.cashier_name,
            'user_role': 'cashier',
            'entity':    ov.item_name,
            'entity_id': ov.sale_id,
            'details': {
                'action':       ov.action,
                'item_name':    ov.item_name,
                'original_qty': ov.original_qty,
                'new_qty':      ov.new_qty,
                'used_at':      ov.used_at.isoformat() if ov.used_at else None,
            },
            'authorizer':  ov.manager_name,
            'auth_method': ov.auth_method,
        })

    # ── Stock movements ────────────────────────────────────────────────────────
    movements = (StockMovement.query
                 .filter(StockMovement.created_at >= dt_from, StockMovement.created_at <= dt_to)
                 .order_by(StockMovement.created_at)
                 .limit(limit).all())
    for mv in movements:
        mvd = mv.to_dict()
        events.append({
            'source':    'stock',
            'id':        f'stock-{mv.id}',
            'time':      mvd.get('created_at'),
            'type':      mvd.get('movement_type'),
            'category':  'stock',
            'user':      mvd.get('user_name'),
            'user_role': mvd.get('user_role'),
            'entity':    mvd.get('product_name'),
            'entity_id': mvd.get('product_id'),
            'details': {
                'qty_before':     mvd.get('qty_before'),
                'qty_change':     mvd.get('qty_change'),
                'qty_after':      mvd.get('qty_after'),
                'reference_type': mvd.get('reference_type'),
                'reference_id':   mvd.get('reference_id'),
                'notes':          mvd.get('notes'),
            },
            'authorizer':  None,
            'auth_method': None,
        })

    # Sort all events chronologically
    events.sort(key=lambda e: e.get('time') or '')

    # Summary stats for header
    completed_sales = [e for e in events if e['source'] == 'sale' and e['type'] == 'completed']

    voided_sales    = [e for e in events if e['source'] == 'sale' and e['type'] == 'voided']
    total_revenue   = sum(e['details'].get('total', 0) for e in completed_sales)
    total_discounts = sum(e['details'].get('discount_total', 0) for e in completed_sales)
    total_tax       = sum(e['details'].get('tax_amount', 0) for e in completed_sales)
    void_amount     = sum(e['details'].get('amount') or e['details'].get('total', 0)
                         for e in events if e['source'] == 'void' and e['type'] == 'void_sale')

    return jsonify({
        'date_from': date_from_str,
        'date_to':   date_to_str,
        'summary': {
            'sales_count':      len(completed_sales),
            'voided_count':     len(voided_sales),
            'void_log_count':   len(voids),
            'override_count':   len(overrides),
            'stock_move_count': len(movements),
            'total_revenue':    round(total_revenue, 2),
            'total_discounts':  round(total_discounts, 2),
            'total_tax':        round(total_tax, 2),
            'void_amount':      round(void_amount, 2),
            'event_count':      len(events),
        },
        'events': events,
    })


@bp.route('/eod/complete', methods=['POST'])
def eod_complete():
    """Log an end-of-day completion event. Manager/admin only."""
    role = session.get('role', '')
    if role not in ('manager', 'admin'):
        return jsonify({'error': 'Access denied'}), 403

    user = get_current_user()
    data = request.json or {}
    log_action(user, 'eod_complete', 'shift', None, date.today().isoformat(),
               details={
                   'checks_passed': data.get('checks_passed', []),
                   'manual_confirmed': data.get('manual_confirmed', []),
                   'today_sales': data.get('today_sales'),
                   'today_revenue': data.get('today_revenue'),
               })
    db.session.commit()
    return jsonify({'ok': True, 'logged_at': datetime.utcnow().isoformat()})
