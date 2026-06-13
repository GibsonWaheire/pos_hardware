"""
Payment integrations:
  - Stripe Terminal (card payments)
  - Safaricom M-Pesa STK Push (Daraja API)

M-Pesa env vars required (sandbox defaults provided for dev):
  MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET
  MPESA_SHORTCODE (default: 174379 sandbox)
  MPESA_PASSKEY
  MPESA_CALLBACK_URL
  MPESA_SANDBOX=1  (set to 0 for production)
"""

from flask import Blueprint, jsonify, request
import os
import time
import base64

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


# ── M-Pesa STK Push (Safaricom Daraja) ───────────────────────────────────────

def _mpesa_token():
    """Fetch OAuth token from Daraja. Returns token string or raises."""
    sandbox = os.getenv('MPESA_SANDBOX', '1') == '1'
    base    = 'https://sandbox.safaricom.co.ke' if sandbox else 'https://api.safaricom.co.ke'
    key     = os.getenv('MPESA_CONSUMER_KEY', '')
    secret  = os.getenv('MPESA_CONSUMER_SECRET', '')
    creds   = base64.b64encode(f'{key}:{secret}'.encode()).decode()
    import requests as req
    r = req.get(
        f'{base}/oauth/v1/generate?grant_type=client_credentials',
        headers={'Authorization': f'Basic {creds}'},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()['access_token'], base


def _format_phone(phone):
    """Normalise phone to 254XXXXXXXXX format."""
    p = str(phone).strip().lstrip('+').replace(' ', '').replace('-', '')
    if p.startswith('0') and len(p) == 10:
        return '254' + p[1:]
    if p.startswith('254') and len(p) == 12:
        return p
    if p.startswith('7') and len(p) == 9:
        return '254' + p
    return p  # return as-is; Daraja will validate


@bp.route('/mpesa/stk-push', methods=['POST'])
def mpesa_stk_push():
    """
    Initiate STK Push to customer's phone.
    Body: { phone, amount, reference? }
    Returns: { checkout_request_id, message, simulated? }
    """
    data      = request.json or {}
    phone     = str(data.get('phone', '')).strip()
    amount    = data.get('amount')
    reference = str(data.get('reference', 'POS Sale'))[:12]  # Daraja max 12 chars

    if not phone:
        return jsonify({'error': 'Phone number is required'}), 400
    if not amount or float(amount) <= 0:
        return jsonify({'error': 'Amount must be greater than 0'}), 400

    consumer_key = os.getenv('MPESA_CONSUMER_KEY', '')
    shortcode    = os.getenv('MPESA_SHORTCODE', '174379')
    passkey      = os.getenv('MPESA_PASSKEY', '')
    callback_url = os.getenv('MPESA_CALLBACK_URL', 'https://example.com/mpesa/callback')
    sandbox      = os.getenv('MPESA_SANDBOX', '1') == '1'

    # Simulate if credentials not configured
    if not consumer_key:
        sim_id = f'ws_CO_SIM_{int(time.time())}_{phone[-4:]}'
        return jsonify({
            'checkout_request_id': sim_id,
            'message': 'STK Push simulated (set MPESA_CONSUMER_KEY to use live Daraja)',
            'simulated': True,
        })

    try:
        access_token, base = _mpesa_token()
    except Exception as e:
        return jsonify({'error': f'M-Pesa auth failed: {str(e)}'}), 503

    timestamp = time.strftime('%Y%m%d%H%M%S')
    password  = base64.b64encode(f'{shortcode}{passkey}{timestamp}'.encode()).decode()
    phone_e164 = _format_phone(phone)
    amt_int    = max(1, int(float(amount)))

    import requests as req
    try:
        r = req.post(
            f'{base}/mpesa/stkpush/v1/processrequest',
            json={
                'BusinessShortCode': shortcode,
                'Password':          password,
                'Timestamp':         timestamp,
                'TransactionType':   'CustomerPayBillOnline',
                'Amount':            amt_int,
                'PartyA':            phone_e164,
                'PartyB':            shortcode,
                'PhoneNumber':       phone_e164,
                'CallBackURL':       callback_url,
                'AccountReference':  reference,
                'TransactionDesc':   reference,
            },
            headers={
                'Authorization': f'Bearer {access_token}',
                'Content-Type':  'application/json',
            },
            timeout=15,
        )
        resp = r.json()
        if resp.get('ResponseCode') != '0':
            msg = resp.get('errorMessage') or resp.get('ResponseDescription', 'STK Push failed')
            return jsonify({'error': msg}), 502

        return jsonify({
            'checkout_request_id': resp['CheckoutRequestID'],
            'merchant_request_id': resp.get('MerchantRequestID'),
            'message': resp.get('CustomerMessage', 'STK Push sent'),
        })

    except req.exceptions.Timeout:
        return jsonify({'error': 'M-Pesa gateway timed out — check network and try again'}), 504
    except Exception as e:
        return jsonify({'error': f'STK Push failed: {str(e)}'}), 500


@bp.route('/mpesa/stk-status', methods=['POST'])
def mpesa_stk_status():
    """
    Query STK Push status (poll until confirmed or failed).
    Body: { checkout_request_id }
    Returns: { status: 'pending'|'completed'|'failed', mpesa_ref?, error_message? }
    """
    data       = request.json or {}
    request_id = str(data.get('checkout_request_id', '')).strip()

    if not request_id:
        return jsonify({'error': 'checkout_request_id is required'}), 400

    # Simulated request — always return pending (frontend shows manual fallback)
    if request_id.startswith('ws_CO_SIM_'):
        return jsonify({'status': 'pending', 'simulated': True})

    consumer_key = os.getenv('MPESA_CONSUMER_KEY', '')
    if not consumer_key:
        return jsonify({'status': 'pending', 'simulated': True})

    shortcode = os.getenv('MPESA_SHORTCODE', '174379')
    passkey   = os.getenv('MPESA_PASSKEY', '')

    try:
        access_token, base = _mpesa_token()
    except Exception as e:
        return jsonify({'error': f'M-Pesa auth failed: {str(e)}'}), 503

    timestamp = time.strftime('%Y%m%d%H%M%S')
    password  = base64.b64encode(f'{shortcode}{passkey}{timestamp}'.encode()).decode()

    import requests as req
    try:
        r = req.post(
            f'{base}/mpesa/stkpush/v1/querystkpush',
            json={
                'BusinessShortCode': shortcode,
                'Password':          password,
                'Timestamp':         timestamp,
                'CheckoutRequestID': request_id,
            },
            headers={
                'Authorization': f'Bearer {access_token}',
                'Content-Type':  'application/json',
            },
            timeout=10,
        )
        resp = r.json()
        code = str(resp.get('ResultCode', ''))

        if code == '0':
            return jsonify({
                'status':    'completed',
                'mpesa_ref': resp.get('MpesaReceiptNumber') or request_id,
                'message':   resp.get('ResultDesc', 'Payment confirmed'),
            })
        elif code == '1032':
            # User cancelled
            return jsonify({'status': 'cancelled', 'error_message': 'Customer cancelled the request'})
        elif code in ('1', '1037', '2001'):
            return jsonify({'status': 'failed', 'error_message': resp.get('ResultDesc', 'Payment failed')})
        else:
            # Still pending (e.g. waiting for PIN)
            return jsonify({'status': 'pending'})

    except req.exceptions.Timeout:
        return jsonify({'status': 'pending'})  # treat timeout as still pending
    except Exception as e:
        return jsonify({'error': str(e)}), 500
