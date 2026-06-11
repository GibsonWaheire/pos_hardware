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


@bp.route('/products/plu/<plu_code>', methods=['GET'])
def get_by_plu(plu_code):
    """PLU code lookup for produce/weight-based items without barcodes."""
    product = Product.query.filter_by(plu_code=plu_code, is_active=True).first()
    if not product:
        return jsonify({'error': 'PLU code not found'}), 404
    return jsonify(product.to_dict())


@bp.route('/scale/read', methods=['GET'])
def read_scale():
    """Read current weight from the connected scale hardware."""
    try:
        from hardware.scale import read_weight
        result = read_weight()
        if result is None:
            return jsonify({'error': 'Scale not available or not connected'}), 503
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


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

    if data.get('plu_code'):
        if Product.query.filter_by(plu_code=data['plu_code']).first():
            return jsonify({'error': 'PLU code already in use'}), 409

    product = Product(
        name=data['name'],
        barcode=data.get('barcode') or None,
        plu_code=data.get('plu_code') or None,
        price=float(data['price']),
        tax_class=data.get('tax_class', 'standard'),
        tax_rate=float(data.get('tax_rate', 0.0)),
        is_weight_based=bool(data.get('is_weight_based', False)),
        weight_unit=data.get('weight_unit', 'kg'),
        age_restricted=bool(data.get('age_restricted', False)),
        age_restriction_type=data.get('age_restriction_type') or None,
        min_age=int(data.get('min_age', 18)),
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
    if 'plu_code' in data:
        new_plu = data['plu_code'] or None
        if new_plu and new_plu != product.plu_code:
            conflict = Product.query.filter_by(plu_code=new_plu).first()
            if conflict and conflict.id != product_id:
                return jsonify({'error': 'PLU code already in use'}), 409
        product.plu_code = new_plu
    if 'tax_class' in data:
        product.tax_class = data['tax_class']
    if 'tax_rate' in data:
        product.tax_rate = float(data['tax_rate'])
    if 'is_weight_based' in data:
        product.is_weight_based = bool(data['is_weight_based'])
    if 'weight_unit' in data:
        product.weight_unit = data['weight_unit']
    if 'age_restricted' in data:
        product.age_restricted = bool(data['age_restricted'])
    if 'age_restriction_type' in data:
        product.age_restriction_type = data['age_restriction_type'] or None
    if 'min_age' in data:
        product.min_age = int(data['min_age'])
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
