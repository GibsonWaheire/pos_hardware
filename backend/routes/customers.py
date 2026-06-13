from flask import Blueprint, jsonify, request
from db import db
from models import Customer, LoyaltyTier
from auth_utils import get_current_user, log_action, validate_str, validate_email

bp = Blueprint('customers', __name__, url_prefix='/api/customers')


@bp.route('', methods=['GET'])
def list_customers():
    q = request.args.get('q', '').strip()
    query = Customer.query.filter_by(is_active=True)
    if q:
        query = query.filter(
            db.or_(
                Customer.name.ilike(f'%{q}%'),
                Customer.phone.ilike(f'%{q}%'),
                Customer.member_id.ilike(f'%{q}%'),
                Customer.email.ilike(f'%{q}%'),
            )
        )
    customers = query.order_by(Customer.name).limit(100).all()
    return jsonify([c.to_dict() for c in customers])


@bp.route('/lookup', methods=['GET'])
def lookup():
    """Fast lookup for POS checkout — by phone, member_id, or email."""
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify({'error': 'q is required'}), 400
    customer = Customer.query.filter(
        db.or_(
            Customer.phone == q,
            Customer.member_id == q,
            Customer.email == q,
        )
    ).filter_by(is_active=True).first()
    if not customer:
        return jsonify({'customer': None, 'found': False})
    return jsonify({'customer': customer.to_dict(), 'found': True})


@bp.route('/<int:customer_id>', methods=['GET'])
def get_customer(customer_id):
    return jsonify(Customer.query.get_or_404(customer_id).to_dict())


@bp.route('', methods=['POST'])
def create_customer():
    caller = get_current_user()
    data = request.json or {}
    if not data.get('name'):
        return jsonify({'error': 'name is required'}), 400

    err = validate_str(data['name'], 120, 'name')
    if err:
        return jsonify({'error': err}), 400
    if data.get('phone'):
        ph_err = validate_str(data['phone'], 20, 'phone')
        if ph_err:
            return jsonify({'error': ph_err}), 400
    if data.get('email'):
        em_err = validate_email(data['email'])
        if em_err:
            return jsonify({'error': em_err}), 400

    if data.get('phone'):
        if Customer.query.filter_by(phone=data['phone']).first():
            return jsonify({'error': 'Phone number already registered'}), 409

    # Auto-assign best matching tier based on starting points (usually 0)
    tier = LoyaltyTier.query.filter(
        LoyaltyTier.min_points <= 0
    ).order_by(LoyaltyTier.min_points.desc()).first()

    from datetime import date
    dob = None
    if data.get('date_of_birth'):
        try:
            dob = date.fromisoformat(data['date_of_birth'])
        except ValueError:
            pass

    # Generate member_id if not provided
    member_id = data.get('member_id')
    if not member_id:
        import uuid
        member_id = 'M' + uuid.uuid4().hex[:7].upper()

    customer = Customer(
        name=data['name'],
        phone=data.get('phone'),
        email=data.get('email'),
        member_id=member_id,
        date_of_birth=dob,
        tier_id=tier.id if tier else None,
        notes=data.get('notes'),
    )
    db.session.add(customer)
    db.session.commit()
    log_action(caller, 'create', 'customer', customer.id, customer.name)
    return jsonify(customer.to_dict()), 201


@bp.route('/<int:customer_id>', methods=['PUT'])
def update_customer(customer_id):
    caller = get_current_user()
    customer = Customer.query.get_or_404(customer_id)
    data = request.json or {}

    if 'name' in data:
        err = validate_str(data['name'], 120, 'name')
        if err:
            return jsonify({'error': err}), 400
    if 'phone' in data and data['phone']:
        err = validate_str(data['phone'], 20, 'phone')
        if err:
            return jsonify({'error': err}), 400
    if 'email' in data and data['email']:
        err = validate_email(data['email'])
        if err:
            return jsonify({'error': err}), 400

    credit_limit_before = getattr(customer, 'credit_limit', None)

    for field in ('name', 'phone', 'email', 'notes', 'is_active', 'tier_id'):
        if field in data:
            setattr(customer, field, data[field])
    if 'date_of_birth' in data:
        from datetime import date
        try:
            customer.date_of_birth = date.fromisoformat(data['date_of_birth']) if data['date_of_birth'] else None
        except ValueError:
            pass

    extra = {}
    if 'credit_limit' in data and data['credit_limit'] != credit_limit_before:
        extra['credit_limit_before'] = credit_limit_before
        extra['credit_limit_after']  = data['credit_limit']
        if hasattr(customer, 'credit_limit'):
            customer.credit_limit = data['credit_limit']

    db.session.commit()
    log_action(caller, 'update', 'customer', customer.id, customer.name, extra=extra or None)
    return jsonify(customer.to_dict())


@bp.route('/<int:customer_id>/transactions', methods=['GET'])
def customer_transactions(customer_id):
    customer = Customer.query.get_or_404(customer_id)
    txns = sorted(customer.loyalty_transactions, key=lambda t: t.created_at, reverse=True)
    return jsonify({
        'customer': customer.to_dict(),
        'transactions': [t.to_dict() for t in txns[:50]],
    })
