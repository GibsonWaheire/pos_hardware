"""
Stripe Terminal integration.

Flow:
  1. POST /api/payments/terminal/connection-token  → client SDK uses this to connect reader
  2. POST /api/payments/terminal/create-intent     → creates PaymentIntent
  3. POST /api/payments/terminal/capture           → captures after reader collects payment
  4. POST /api/payments/terminal/cancel-intent     → cancels if user cancels

Requires STRIPE_SECRET_KEY env var. If not set, routes return a 503 with a clear message.
"""

from flask import Blueprint, jsonify, request
import os

bp = Blueprint('payments', __name__, url_prefix='/api/payments')


def _stripe():
    """Return configured stripe module, or None if key not set."""
    key = os.getenv('STRIPE_SECRET_KEY')
    if not key:
        return None
    import stripe
    stripe.api_key = key
    return stripe


@bp.route('/terminal/connection-token', methods=['POST'])
def connection_token():
    stripe = _stripe()
    if not stripe:
        return jsonify({'error': 'Stripe not configured — set STRIPE_SECRET_KEY'}), 503
    try:
        token = stripe.terminal.ConnectionToken.create()
        return jsonify({'secret': token.secret})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/terminal/create-intent', methods=['POST'])
def create_intent():
    stripe = _stripe()
    if not stripe:
        return jsonify({'error': 'Stripe not configured — set STRIPE_SECRET_KEY'}), 503

    data = request.json or {}
    amount = data.get('amount')  # amount in cents
    if not amount:
        return jsonify({'error': 'amount (cents) is required'}), 400

    try:
        intent = stripe.PaymentIntent.create(
            amount=int(amount),
            currency=data.get('currency', 'usd'),
            payment_method_types=['card_present'],
            capture_method='manual',
        )
        return jsonify({
            'payment_intent_id': intent.id,
            'client_secret': intent.client_secret,
            'status': intent.status,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/terminal/capture', methods=['POST'])
def capture_intent():
    stripe = _stripe()
    if not stripe:
        return jsonify({'error': 'Stripe not configured — set STRIPE_SECRET_KEY'}), 503

    data = request.json or {}
    intent_id = data.get('payment_intent_id')
    if not intent_id:
        return jsonify({'error': 'payment_intent_id is required'}), 400

    try:
        intent = stripe.PaymentIntent.capture(intent_id)
        return jsonify({
            'payment_intent_id': intent.id,
            'status': intent.status,
            'amount': intent.amount,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/terminal/cancel-intent', methods=['POST'])
def cancel_intent():
    stripe = _stripe()
    if not stripe:
        return jsonify({'error': 'Stripe not configured — set STRIPE_SECRET_KEY'}), 503

    data = request.json or {}
    intent_id = data.get('payment_intent_id')
    if not intent_id:
        return jsonify({'error': 'payment_intent_id is required'}), 400

    try:
        intent = stripe.PaymentIntent.cancel(intent_id)
        return jsonify({'payment_intent_id': intent.id, 'status': intent.status})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
