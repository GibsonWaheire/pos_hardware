from flask import Blueprint, jsonify, request
from db import db
from models import Product, StockAdjustment
from auth_utils import get_current_user, stamp
from sqlalchemy import func, case
from datetime import datetime

bp = Blueprint('inventory', __name__, url_prefix='/api/inventory')


@bp.route('/overview', methods=['GET'])
def overview():
    """Dashboard stats for the inventory page."""
    products = Product.query.filter_by(is_active=True).all()

    total_products = len(products)
    total_stock_value = sum(p.price * p.stock_qty for p in products)
    low_stock = [p for p in products if 0 < p.stock_qty <= p.low_stock_threshold]
    out_of_stock = [p for p in products if p.stock_qty == 0]

    return jsonify({
        'total_products': total_products,
        'total_stock_value': round(total_stock_value, 2),
        'low_stock_count': len(low_stock),
        'out_of_stock_count': len(out_of_stock),
        'low_stock_products': [p.to_dict() for p in low_stock],
        'out_of_stock_products': [p.to_dict() for p in out_of_stock],
    })


@bp.route('/adjust', methods=['POST'])
def adjust_stock():
    """
    Manually adjust stock for a product.
    Body: { product_id, qty_change, reason, cashier_name }
    qty_change can be positive (add) or negative (remove).
    """
    data = request.json or {}
    product_id = data.get('product_id')
    qty_change = data.get('qty_change')

    if not product_id or qty_change is None:
        return jsonify({'error': 'product_id and qty_change are required'}), 400

    qty_change = int(qty_change)
    product = Product.query.get_or_404(product_id)

    user = get_current_user()
    cashier_name = user['name'] if user else 'System'

    before = product.stock_qty
    product.stock_qty = max(0, product.stock_qty + qty_change)
    actual_change = product.stock_qty - before  # may differ if we hit 0 floor
    stamp(product, user, is_create=False)       # sets updated_at + updated_by_*

    adj = StockAdjustment(
        product_id=product.id,
        product_name=product.name,
        qty_before=before,
        qty_change=actual_change,
        qty_after=product.stock_qty,
        reason=data.get('reason', 'manual'),
        reference_id=data.get('reference_id', ''),
        cashier_name=cashier_name,
    )
    db.session.add(adj)
    db.session.commit()
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
    # Use COALESCE so products with no update yet fall back to created_at for ordering
    last_touched = func.coalesce(Product.updated_at, Product.created_at)
    products = (Product.query
                .filter_by(is_active=True)
                .order_by(
                    case((Product.stock_qty == 0, 1), else_=0),  # out-of-stock → bottom
                    last_touched.desc(),                          # most recently touched → top
                )
                .all())
    return jsonify([p.to_dict() for p in products])
