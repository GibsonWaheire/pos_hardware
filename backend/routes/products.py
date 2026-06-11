from flask import Blueprint, jsonify, request
from db import db
from models import Product, Category

bp = Blueprint('products', __name__, url_prefix='/api')


# ── Categories ──────────────────────────────────────────────────────────────

@bp.route('/categories', methods=['GET'])
def list_categories():
    cats = Category.query.order_by(Category.name).all()
    return jsonify([c.to_dict() for c in cats])


@bp.route('/categories', methods=['POST'])
def create_category():
    data = request.json or {}
    if not data.get('name'):
        return jsonify({'error': 'name is required'}), 400
    cat = Category(name=data['name'], tax_class=data.get('tax_class', 'standard'))
    db.session.add(cat)
    db.session.commit()
    return jsonify(cat.to_dict()), 201


# ── Products ─────────────────────────────────────────────────────────────────

@bp.route('/products', methods=['GET'])
def list_products():
    q = request.args.get('q', '').strip()
    category_id = request.args.get('category_id')
    active_only = request.args.get('active', 'true').lower() == 'true'

    query = Product.query
    if active_only:
        query = query.filter_by(is_active=True)
    if category_id:
        query = query.filter_by(category_id=int(category_id))
    if q:
        query = query.filter(
            db.or_(
                Product.name.ilike(f'%{q}%'),
                Product.barcode.ilike(f'%{q}%'),
            )
        )
    products = query.order_by(Product.name).all()
    return jsonify([p.to_dict() for p in products])


@bp.route('/products/barcode/<barcode>', methods=['GET'])
def get_by_barcode(barcode):
    """Barcode scanner lookup — fast single product fetch."""
    product = Product.query.filter_by(barcode=barcode, is_active=True).first()
    if not product:
        return jsonify({'error': 'Product not found'}), 404
    return jsonify(product.to_dict())


@bp.route('/products/<int:product_id>', methods=['GET'])
def get_product(product_id):
    product = Product.query.get_or_404(product_id)
    return jsonify(product.to_dict())


@bp.route('/products', methods=['POST'])
def create_product():
    data = request.json or {}
    required = ['name', 'price']
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({'error': f'Missing fields: {", ".join(missing)}'}), 400

    # Duplicate barcode check
    if data.get('barcode'):
        existing = Product.query.filter_by(barcode=data['barcode']).first()
        if existing:
            return jsonify({'error': 'Barcode already registered to another product'}), 409

    product = Product(
        name=data['name'],
        barcode=data.get('barcode') or None,
        price=float(data['price']),
        tax_class=data.get('tax_class', 'standard'),
        tax_rate=float(data.get('tax_rate', 0.0)),
        stock_qty=int(data.get('stock_qty', 0)),
        low_stock_threshold=int(data.get('low_stock_threshold', 5)),
        category_id=data.get('category_id'),
    )
    db.session.add(product)
    db.session.commit()
    return jsonify(product.to_dict()), 201


@bp.route('/products/<int:product_id>', methods=['PUT'])
def update_product(product_id):
    product = Product.query.get_or_404(product_id)
    data = request.json or {}

    if 'name' in data:
        product.name = data['name']
    if 'price' in data:
        product.price = float(data['price'])
    if 'barcode' in data:
        new_barcode = data['barcode'] or None
        if new_barcode and new_barcode != product.barcode:
            conflict = Product.query.filter_by(barcode=new_barcode).first()
            if conflict and conflict.id != product_id:
                return jsonify({'error': 'Barcode already in use'}), 409
        product.barcode = new_barcode
    if 'tax_class' in data:
        product.tax_class = data['tax_class']
    if 'tax_rate' in data:
        product.tax_rate = float(data['tax_rate'])
    if 'stock_qty' in data:
        product.stock_qty = int(data['stock_qty'])
    if 'low_stock_threshold' in data:
        product.low_stock_threshold = int(data['low_stock_threshold'])
    if 'category_id' in data:
        product.category_id = data['category_id']
    if 'is_active' in data:
        product.is_active = bool(data['is_active'])

    db.session.commit()
    return jsonify(product.to_dict())


@bp.route('/products/<int:product_id>', methods=['DELETE'])
def delete_product(product_id):
    product = Product.query.get_or_404(product_id)
    product.is_active = False   # soft delete — preserve sale history
    db.session.commit()
    return jsonify({'message': 'Product deactivated'})


@bp.route('/products/low-stock', methods=['GET'])
def low_stock():
    products = Product.query.filter(
        Product.is_active == True,
        Product.stock_qty <= Product.low_stock_threshold,
    ).all()
    return jsonify([p.to_dict() for p in products])
