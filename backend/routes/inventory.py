from flask import Blueprint, jsonify, request, session
from db import db
from models import Product, StockAdjustment, StockMovement, DamageReport
from auth_utils import get_current_user, stamp, log_action, validate_str, validate_positive
from sqlalchemy import func, case
from datetime import datetime, date

bp = Blueprint('inventory', __name__, url_prefix='/api/inventory')

# Maps manual adjustment reason → movement type
_REASON_TO_MTYPE = {
    'manual':     None,          # determined by sign
    'correction': 'count_correction',
    'damage':     'damage',
    'theft':      'theft',
    'sample':     'manual_remove',
    'po_receive': 'po_receipt',
    'other':      None,          # determined by sign
}


@bp.route('/overview', methods=['GET'])
def overview():
    """Dashboard stats for the inventory page."""
    role = session.get('role', '')
    products = Product.query.filter_by(is_active=True).all()

    total_products = len(products)
    low_stock = [p for p in products if 0 < p.stock_qty <= p.low_stock_threshold]
    out_of_stock = [p for p in products if p.stock_qty == 0]

    data = {
        'total_products': total_products,
        'low_stock_count': len(low_stock),
        'out_of_stock_count': len(out_of_stock),
        'low_stock_products': [p.to_dict() for p in low_stock],
        'out_of_stock_products': [p.to_dict() for p in out_of_stock],
    }
    # Stock value is financial data — manager and admin only
    if role in ('manager', 'admin'):
        data['total_stock_value'] = round(sum(p.price * p.stock_qty for p in products), 2)
    return jsonify(data)


@bp.route('/adjust', methods=['POST'])
def adjust_stock():
    """Manually adjust stock. Blocked for purchasing/supplier roles."""
    role = session.get('role', '')
    if role in ('purchasing', 'supplier', 'cashier', 'receiving'):
        return jsonify({'error': 'Not authorised to adjust stock'}), 403
    data = request.json or {}
    product_id = data.get('product_id')
    qty_change = data.get('qty_change')

    if not product_id or qty_change is None:
        return jsonify({'error': 'product_id and qty_change are required'}), 400

    err = validate_positive(product_id, 'product_id')
    if err:
        return jsonify({'error': err}), 400

    reason_err = validate_str(data.get('reason', 'manual'), 50, 'reason')
    if reason_err:
        return jsonify({'error': reason_err}), 400

    qty_change = int(qty_change)
    product = Product.query.get_or_404(product_id)

    user = get_current_user()
    cashier_name = user['name'] if user else 'System'

    before = product.stock_qty
    product.stock_qty = max(0, product.stock_qty + qty_change)
    actual_change = product.stock_qty - before  # may differ if we hit 0 floor
    stamp(product, user, is_create=False)       # sets updated_at + updated_by_*

    reason = data.get('reason', 'manual')
    adj = StockAdjustment(
        product_id=product.id,
        product_name=product.name,
        qty_before=before,
        qty_change=actual_change,
        qty_after=product.stock_qty,
        reason=reason,
        reference_id=data.get('reference_id', ''),
        cashier_name=cashier_name,
    )
    db.session.add(adj)

    # Unified movement log
    mtype = _REASON_TO_MTYPE.get(reason)
    if mtype is None:
        mtype = 'manual_add' if actual_change >= 0 else 'manual_remove'
    mv = StockMovement(
        product_id=product.id,
        product_name=product.name,
        qty_before=before,
        qty_change=actual_change,
        qty_after=product.stock_qty,
        movement_type=mtype,
        reference_type='adjustment',
        reference_id=data.get('reference_id', ''),
        notes=reason,
        user_id=user['id'] if user else None,
        user_name=cashier_name,
        user_role=user['role'] if user else '',
    )
    db.session.add(mv)
    db.session.commit()
    log_action(user, 'stock_adjust', 'product', product.id, product.name,
               details={'reason': reason, 'qty_change': actual_change,
                        'before': before, 'after': product.stock_qty})
    return jsonify({'product': product.to_dict(), 'adjustment': adj.to_dict()})


@bp.route('/adjustments', methods=['GET'])
def list_adjustments():
    product_id = request.args.get('product_id')
    limit = min(int(request.args.get('limit', 100)), 500)
    query = StockAdjustment.query
    if product_id:
        query = query.filter_by(product_id=int(product_id))
    adjs = query.order_by(StockAdjustment.created_at.desc()).limit(limit).all()
    return jsonify([a.to_dict() for a in adjs])


@bp.route('/stock-levels', methods=['GET'])
def stock_levels():
    """All active products: in-stock first (most recently updated first), out-of-stock last."""
    last_touched = func.coalesce(Product.updated_at, Product.created_at)
    products = (Product.query
                .filter_by(is_active=True)
                .order_by(
                    case((Product.stock_qty == 0, 1), else_=0),
                    last_touched.desc(),
                )
                .all())
    return jsonify([p.to_dict() for p in products])


# ── Phase 17B: Stock Movement Log ─────────────────────────────────────────────

@bp.route('/movements', methods=['GET'])
def stock_movements():
    """Unified stock movement log. inventory + receiving + manager + admin."""
    role = session.get('role', '')
    if role not in ('inventory', 'receiving', 'manager', 'admin'):
        return jsonify({'error': 'Access denied'}), 403

    product_id    = request.args.get('product_id')
    movement_type = request.args.get('type')
    date_from     = request.args.get('date_from')
    date_to       = request.args.get('date_to')
    limit = min(int(request.args.get('limit', 200)), 500)

    query = StockMovement.query
    if product_id:
        query = query.filter_by(product_id=int(product_id))
    if movement_type:
        query = query.filter_by(movement_type=movement_type)
    if date_from:
        query = query.filter(StockMovement.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        dt_end = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59)
        query = query.filter(StockMovement.created_at <= dt_end)

    movements = query.order_by(StockMovement.created_at.desc()).limit(limit).all()
    return jsonify([m.to_dict() for m in movements])


# ── Phase 17C: Damage & Write-off Workflow ────────────────────────────────────

def _gen_dmg_number():
    today = date.today().strftime('%Y%m%d')
    prefix = f'DMG-{today}-'
    last = (DamageReport.query
            .filter(DamageReport.report_number.like(f'{prefix}%'))
            .order_by(DamageReport.report_number.desc()).first())
    seq = (int(last.report_number.split('-')[-1]) + 1) if last else 1
    return f'{prefix}{seq:03d}'


@bp.route('/damage-reports', methods=['GET'])
def list_damage_reports():
    role = session.get('role', '')
    if role not in ('inventory', 'receiving', 'manager', 'admin'):
        return jsonify({'error': 'Access denied'}), 403
    status = request.args.get('status')
    query = DamageReport.query
    if status:
        query = query.filter_by(status=status)
    reports = query.order_by(DamageReport.created_at.desc()).all()
    return jsonify([r.to_dict() for r in reports])


@bp.route('/damage-reports', methods=['POST'])
def create_damage_report():
    role = session.get('role', '')
    if role not in ('inventory', 'receiving', 'manager', 'admin'):
        return jsonify({'error': 'Access denied'}), 403
    data = request.json or {}
    if not data.get('product_id') or not data.get('qty'):
        return jsonify({'error': 'product_id and qty are required'}), 400

    product = Product.query.get_or_404(int(data['product_id']))
    user = get_current_user()
    qty = int(data['qty'])

    report = DamageReport(
        report_number=_gen_dmg_number(),
        product_id=product.id,
        product_name=product.name,
        qty=qty,
        reason=data.get('reason', ''),
        details=data.get('details', ''),
        estimated_value=float(data.get('estimated_value', round(product.price * qty, 2))),
        status='raised',
        raised_by_id=user['id'] if user else None,
        raised_by_name=user['name'] if user else 'Unknown',
    )
    db.session.add(report)
    db.session.commit()
    return jsonify(report.to_dict()), 201


@bp.route('/damage-reports/<int:report_id>/approve', methods=['POST'])
def approve_damage_report(report_id):
    role = session.get('role', '')
    if role not in ('manager', 'admin'):
        return jsonify({'error': 'Manager or admin required'}), 403
    report = DamageReport.query.get_or_404(report_id)
    if report.status not in ('raised', 'pending_approval'):
        return jsonify({'error': f'Cannot approve from status: {report.status}'}), 400

    user = get_current_user()
    data = request.json or {}
    report.status = 'approved'
    report.reviewed_by_id   = user['id'] if user else None
    report.reviewed_by_name = user['name'] if user else 'Unknown'
    report.reviewed_at  = datetime.utcnow()
    report.review_notes = data.get('notes', '')

    if not report.stock_adjusted:
        product = Product.query.get(report.product_id)
        if product:
            before = product.stock_qty
            product.stock_qty = max(0, product.stock_qty - report.qty)
            actual = product.stock_qty - before   # negative

            mv = StockMovement(
                product_id=product.id, product_name=product.name,
                qty_before=before, qty_change=actual, qty_after=product.stock_qty,
                movement_type='write_off',
                reference_type='damage_report', reference_id=report.report_number,
                notes=report.reason,
                user_id=user['id'] if user else None,
                user_name=user['name'] if user else 'Unknown',
                user_role=role,
            )
            db.session.add(mv)

            adj = StockAdjustment(
                product_id=product.id, product_name=product.name,
                qty_before=before, qty_change=actual, qty_after=product.stock_qty,
                reason='damage', reference_id=report.report_number,
                cashier_name=user['name'] if user else 'Unknown',
            )
            db.session.add(adj)
            report.stock_adjusted = True

    db.session.commit()
    log_action(user, 'approve', 'damage_report', report.id, report.report_number,
               details={'product': report.product_name, 'qty': report.qty})
    return jsonify(report.to_dict())


@bp.route('/damage-reports/<int:report_id>/reject', methods=['POST'])
def reject_damage_report(report_id):
    role = session.get('role', '')
    if role not in ('manager', 'admin'):
        return jsonify({'error': 'Manager or admin required'}), 403
    report = DamageReport.query.get_or_404(report_id)
    if report.status not in ('raised', 'pending_approval'):
        return jsonify({'error': f'Cannot reject from status: {report.status}'}), 400

    user = get_current_user()
    data = request.json or {}
    report.status = 'rejected'
    report.reviewed_by_id   = user['id'] if user else None
    report.reviewed_by_name = user['name'] if user else 'Unknown'
    report.reviewed_at  = datetime.utcnow()
    report.review_notes = data.get('notes', '')
    db.session.commit()
    log_action(user, 'reject', 'damage_report', report.id, report.report_number,
               details={'product': report.product_name, 'qty': report.qty})
    return jsonify(report.to_dict())
