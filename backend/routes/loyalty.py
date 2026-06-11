"""
Loyalty program routes.

Points system config (environment variables or defaults):
  LOYALTY_POINTS_PER_DOLLAR  = 1   (earn 1 point per $1 spent)
  LOYALTY_CENTS_PER_POINT    = 1   (1 point = $0.01 redemption value)

Tier upgrade is evaluated automatically after each sale.
"""

from flask import Blueprint, jsonify, request
from db import db
from models import LoyaltyTier, Customer, LoyaltyTransaction
import os

bp = Blueprint('loyalty', __name__, url_prefix='/api/loyalty')

POINTS_PER_DOLLAR = float(os.getenv('LOYALTY_POINTS_PER_DOLLAR', 1))
CENTS_PER_POINT = float(os.getenv('LOYALTY_CENTS_PER_POINT', 1))  # 1 point = $0.01


# ── Tiers ─────────────────────────────────────────────────────────────────────

@bp.route('/tiers', methods=['GET'])
def list_tiers():
    tiers = LoyaltyTier.query.order_by(LoyaltyTier.sort_order, LoyaltyTier.min_points).all()
    return jsonify([t.to_dict() for t in tiers])


@bp.route('/tiers', methods=['POST'])
def create_tier():
    data = request.json or {}
    if not data.get('name'):
        return jsonify({'error': 'name is required'}), 400
    tier = LoyaltyTier(
        name=data['name'],
        min_points=int(data.get('min_points', 0)),
        discount_percent=float(data.get('discount_percent', 0)),
        points_multiplier=float(data.get('points_multiplier', 1.0)),
        description=data.get('description', ''),
        color=data.get('color', '#888888'),
        sort_order=int(data.get('sort_order', 0)),
    )
    db.session.add(tier)
    db.session.commit()
    return jsonify(tier.to_dict()), 201


@bp.route('/tiers/<int:tier_id>', methods=['PUT'])
def update_tier(tier_id):
    tier = LoyaltyTier.query.get_or_404(tier_id)
    data = request.json or {}
    for field in ('name', 'min_points', 'discount_percent', 'points_multiplier',
                  'description', 'color', 'sort_order'):
        if field in data:
            setattr(tier, field, data[field])
    db.session.commit()
    return jsonify(tier.to_dict())


@bp.route('/tiers/<int:tier_id>', methods=['DELETE'])
def delete_tier(tier_id):
    tier = LoyaltyTier.query.get_or_404(tier_id)
    if tier.customers:
        return jsonify({'error': 'Cannot delete a tier with assigned customers'}), 400
    db.session.delete(tier)
    db.session.commit()
    return jsonify({'message': 'Tier deleted'})


# ── Earn / Redeem ─────────────────────────────────────────────────────────────

@bp.route('/earn', methods=['POST'])
def earn_points():
    """Called after a completed sale to credit loyalty points."""
    data = request.json or {}
    customer_id = data.get('customer_id')
    sale_id = data.get('sale_id')
    sale_total = float(data.get('sale_total', 0))

    if not customer_id or sale_total <= 0:
        return jsonify({'error': 'customer_id and sale_total are required'}), 400

    customer = Customer.query.get_or_404(customer_id)

    multiplier = customer.tier.points_multiplier if customer.tier else 1.0
    points_earned = max(1, int(sale_total * POINTS_PER_DOLLAR * multiplier))

    customer.loyalty_points += points_earned
    customer.total_spent += sale_total
    customer.visit_count += 1

    # Tier upgrade check
    _maybe_upgrade_tier(customer)

    txn = LoyaltyTransaction(
        customer_id=customer.id,
        sale_id=sale_id,
        type='earn',
        points=points_earned,
        balance_after=customer.loyalty_points,
        notes=f'Earned from sale {sale_id}',
    )
    db.session.add(txn)
    db.session.commit()

    return jsonify({
        'points_earned': points_earned,
        'new_balance': customer.loyalty_points,
        'tier': customer.tier.name if customer.tier else None,
        'customer': customer.to_dict(),
    })


@bp.route('/redeem', methods=['POST'])
def redeem_points():
    """Redeem points for a discount. Returns discount_amount in dollars."""
    data = request.json or {}
    customer_id = data.get('customer_id')
    points_to_redeem = int(data.get('points', 0))

    if not customer_id or points_to_redeem <= 0:
        return jsonify({'error': 'customer_id and points are required'}), 400

    customer = Customer.query.get_or_404(customer_id)

    if customer.loyalty_points < points_to_redeem:
        return jsonify({'error': f'Insufficient points. Balance: {customer.loyalty_points}'}), 400

    discount_amount = round(points_to_redeem * CENTS_PER_POINT / 100, 2)
    customer.loyalty_points -= points_to_redeem

    txn = LoyaltyTransaction(
        customer_id=customer.id,
        sale_id=data.get('sale_id'),
        type='redeem',
        points=-points_to_redeem,
        balance_after=customer.loyalty_points,
        notes=f'Redeemed for ${discount_amount:.2f} discount',
    )
    db.session.add(txn)
    db.session.commit()

    return jsonify({
        'points_redeemed': points_to_redeem,
        'discount_amount': discount_amount,
        'new_balance': customer.loyalty_points,
        'customer': customer.to_dict(),
    })


@bp.route('/adjust', methods=['POST'])
def manual_adjust():
    """Manual point adjustment by manager (add or remove)."""
    data = request.json or {}
    customer_id = data.get('customer_id')
    points = int(data.get('points', 0))
    if not customer_id or points == 0:
        return jsonify({'error': 'customer_id and points are required'}), 400

    customer = Customer.query.get_or_404(customer_id)
    customer.loyalty_points = max(0, customer.loyalty_points + points)
    _maybe_upgrade_tier(customer)

    txn_type = 'manual_add' if points > 0 else 'manual_remove'
    txn = LoyaltyTransaction(
        customer_id=customer.id,
        type=txn_type,
        points=points,
        balance_after=customer.loyalty_points,
        notes=data.get('notes', 'Manual adjustment'),
    )
    db.session.add(txn)
    db.session.commit()
    return jsonify({'new_balance': customer.loyalty_points, 'customer': customer.to_dict()})


@bp.route('/config', methods=['GET'])
def get_config():
    return jsonify({
        'points_per_dollar': POINTS_PER_DOLLAR,
        'cents_per_point': CENTS_PER_POINT,
        'redemption_rate': f'1 point = ${CENTS_PER_POINT / 100:.4f}',
    })


# ── Helpers ───────────────────────────────────────────────────────────────────

def _maybe_upgrade_tier(customer):
    """Check if customer has crossed a tier threshold and upgrade if so."""
    best = (LoyaltyTier.query
            .filter(LoyaltyTier.min_points <= customer.loyalty_points)
            .order_by(LoyaltyTier.min_points.desc())
            .first())
    if best and best.id != customer.tier_id:
        customer.tier_id = best.id
