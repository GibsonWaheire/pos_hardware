from flask import Blueprint, jsonify, request
from db import db
from models import Sale, SaleItem, Product, OfflineQueue, CustomerAccount, AccountTransaction, OverrideApproval
from auth_utils import get_current_user
from datetime import datetime, date
from hardware.printer import print_receipt
from hardware.cash_drawer import open_drawer
import json
import uuid

bp = Blueprint('sales', __name__, url_prefix='/api')


def generate_receipt_number():
    """RCP-YYYYMMDD-XXXX (4-digit sequence per day)."""
    today = date.today().strftime('%Y%m%d')
    prefix = f'RCP-{today}-'
    last = (Sale.query
            .filter(Sale.receipt_number.like(f'{prefix}%'))
            .order_by(Sale.receipt_number.desc())
            .first())
    if last:
        seq = int(last.receipt_number.split('-')[-1]) + 1
    else:
        seq = 1
    return f'{prefix}{seq:04d}'


@bp.route('/sales', methods=['POST'])
def create_sale():
    data = request.json or {}

    # Idempotency: if offline_id already exists, return the existing sale
    offline_id = data.get('offline_id')
    if offline_id:
        existing = Sale.query.filter_by(offline_id=offline_id).first()
        if existing:
            return jsonify(existing.to_dict()), 200

    # Resolve cashier from server-side session — never trust the request body for identity
    user = get_current_user()
    cashier_id   = user['id']   if user else None
    cashier_name = user['name'] if user else 'Unknown'

    items_data = data.get('items', [])
    if not items_data:
        return jsonify({'error': 'Sale must have at least one item'}), 400

    payment_method = data.get('payment_method', 'cash')
    if payment_method not in ('cash', 'card', 'split', 'mpesa', 'account'):
        return jsonify({'error': 'payment_method must be cash, card, split, mpesa, or account'}), 400

    # Build sale items and deduct stock
    sale_items = []
    subtotal = 0.0
    tax_amount = 0.0
    discount_total = 0.0

    for item_data in items_data:
        qty = int(item_data.get('qty', 1))
        unit_price = float(item_data.get('unit_price', 0))
        discount = float(item_data.get('discount', 0))
        tax_rate = float(item_data.get('tax_rate', 0))
        product_id = item_data.get('product_id')
        product_name = item_data.get('product_name', '') or ''

        # Hard blocks — reject zero-price and zero-qty lines
        if qty <= 0:
            return jsonify({'error': f'Item "{product_name}" has invalid quantity ({qty}). Minimum is 1.'}), 400
        if unit_price <= 0:
            return jsonify({'error': f'Item "{product_name}" has no valid price. Set a price before selling.'}), 400

        if product_id:
            product = Product.query.get(product_id)
            if product:
                product_name = product.name
                tax_rate = product.tax_rate
                # Deduct stock — allow negative (pending recount for purchaser to resolve)
                product.stock_qty -= qty

        line_pre_tax = (unit_price - discount) * qty
        line_tax = line_pre_tax * tax_rate
        line_total = line_pre_tax + line_tax

        sale_items.append(SaleItem(
            product_id=product_id,
            product_name=product_name,
            unit_price=unit_price,
            qty=qty,
            discount=discount,
            tax_rate=tax_rate,
            line_total=round(line_total, 2),
        ))

        subtotal += unit_price * qty
        discount_total += discount * qty
        tax_amount += line_tax

    total = round(subtotal - discount_total + tax_amount, 2)

    # Anti-theft: validate override approval IDs supplied by the frontend
    override_ids = data.get('override_approval_ids') or []
    validated_approvals = []
    for oid in override_ids:
        try:
            oid = int(oid)
        except (TypeError, ValueError):
            return jsonify({'error': f'Invalid override_approval_id: {oid}'}), 400
        approval = OverrideApproval.query.get(oid)
        if not approval:
            return jsonify({'error': f'Override approval {oid} not found'}), 400
        if approval.used_at is not None:
            return jsonify({'error': f'Override approval {oid} has already been used'}), 400
        validated_approvals.append(approval)

    # Phase 7 — customer account payment
    account = None
    account_balance_before = None
    account_balance_after = None

    if payment_method == 'account':
        acct_id = data.get('account_id')
        if not acct_id:
            return jsonify({'error': 'account_id required for account payment'}), 400
        account = CustomerAccount.query.get(acct_id)
        if not account or not account.is_active:
            return jsonify({'error': 'Account not found or inactive'}), 404
        available = round(account.balance + account.credit_limit, 2)
        if total > available:
            return jsonify({
                'error': f'Insufficient balance. Available: KES {available:,.2f}, Required: KES {total:,.2f}'
            }), 400
        account_balance_before = account.balance
        account.balance = round(account.balance - total, 2)
        account.total_charged = round(account.total_charged + total, 2)
        account_balance_after = account.balance

    cash_tendered = float(data.get('cash_tendered') or 0)
    card_amount = float(data.get('card_amount') or 0)
    change_given = round(cash_tendered - total, 2) if payment_method in ('cash', 'split') else 0.0

    sale = Sale(
        receipt_number=generate_receipt_number(),
        subtotal=round(subtotal, 2),
        tax_amount=round(tax_amount, 2),
        discount_total=round(discount_total, 2),
        total=total,
        payment_method=payment_method,
        cash_tendered=cash_tendered if payment_method in ('cash', 'split') else None,
        change_given=change_given,
        card_amount=card_amount,
        cashier_id=cashier_id,
        cashier_name=cashier_name,
        offline_id=offline_id,
        stripe_payment_intent_id=data.get('stripe_payment_intent_id'),
        mpesa_ref=data.get('mpesa_ref') or None,
        account_id=account.id if account else None,
        account_balance_before=account_balance_before,
        account_balance_after=account_balance_after,
    )
    sale.items = sale_items

    db.session.add(sale)
    db.session.flush()   # get sale.id before committing

    # Create account charge transaction
    if account:
        txn = AccountTransaction(
            account_id=account.id,
            type='charge',
            amount=-total,   # negative = money out of account
            balance_after=account_balance_after,
            sale_id=sale.id,
            cashier_name=cashier_name,
            notes=f'Sale charged to account',
        )
        db.session.add(txn)

    # Mark override approvals as used and link to this sale
    for approval in validated_approvals:
        approval.used_at = datetime.utcnow()
        approval.sale_id = sale.id

    db.session.commit()

    # Hardware actions (non-blocking — failures don't abort the sale)
    sale_dict = sale.to_dict()
    try:
        print_receipt(sale_dict)
    except Exception as e:
        print(f'Printer error (non-fatal): {e}')

    if payment_method in ('cash', 'split'):
        try:
            open_drawer()
        except Exception as e:
            print(f'Cash drawer error (non-fatal): {e}')

    # If this came from offline queue, mark as synced
    if offline_id:
        queued = OfflineQueue.query.filter_by(offline_id=offline_id).first()
        if queued:
            queued.status = 'synced'
            queued.synced_at = datetime.utcnow()
            db.session.commit()

    return jsonify(sale_dict), 201


@bp.route('/sales', methods=['GET'])
def list_sales():
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    cashier_id = request.args.get('cashier_id')
    status = request.args.get('status', 'completed')
    limit = min(int(request.args.get('limit', 100)), 500)

    query = Sale.query
    if status:
        query = query.filter_by(status=status)
    if cashier_id:
        query = query.filter_by(cashier_id=int(cashier_id))
    if date_from:
        query = query.filter(Sale.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        query = query.filter(Sale.created_at <= datetime.fromisoformat(date_to))

    sales = query.order_by(Sale.created_at.desc()).limit(limit).all()
    return jsonify([s.to_dict() for s in sales])


@bp.route('/sales/<int:sale_id>', methods=['GET'])
def get_sale(sale_id):
    sale = Sale.query.get_or_404(sale_id)
    return jsonify(sale.to_dict())


@bp.route('/sales/<int:sale_id>/void', methods=['POST'])
def void_sale(sale_id):
    sale = Sale.query.get_or_404(sale_id)
    if sale.status != 'completed':
        return jsonify({'error': f'Cannot void a sale with status: {sale.status}'}), 400

    # Restore stock
    for item in sale.items:
        if item.product_id:
            product = Product.query.get(item.product_id)
            if product:
                product.stock_qty += item.qty

    sale.status = 'voided'
    db.session.commit()
    return jsonify(sale.to_dict())


@bp.route('/sales/daily-totals', methods=['GET'])
def daily_totals():
    target_date = request.args.get('date', date.today().isoformat())
    dt = date.fromisoformat(target_date)

    day_start = datetime(dt.year, dt.month, dt.day, 0, 0, 0)
    day_end = datetime(dt.year, dt.month, dt.day, 23, 59, 59)

    sales = Sale.query.filter(
        Sale.status == 'completed',
        Sale.created_at >= day_start,
        Sale.created_at <= day_end,
    ).all()

    total_revenue = sum(s.total for s in sales)
    total_tax = sum(s.tax_amount for s in sales)
    total_discounts = sum(s.discount_total for s in sales)
    transaction_count = len(sales)
    cash_sales = sum(s.total for s in sales if s.payment_method == 'cash')
    card_sales = sum(s.total for s in sales if s.payment_method == 'card')
    split_sales = sum(s.total for s in sales if s.payment_method == 'split')

    return jsonify({
        'date': target_date,
        'transaction_count': transaction_count,
        'total_revenue': round(total_revenue, 2),
        'total_tax': round(total_tax, 2),
        'total_discounts': round(total_discounts, 2),
        'cash_sales': round(cash_sales, 2),
        'card_sales': round(card_sales, 2),
        'split_sales': round(split_sales, 2),
    })


# ── Offline Queue ─────────────────────────────────────────────────────────────

@bp.route('/offline-queue', methods=['POST'])
def enqueue_offline_sale():
    """Client stores a sale locally and queues it here when connectivity returns."""
    data = request.json or {}
    offline_id = data.get('offline_id') or str(uuid.uuid4())

    existing = OfflineQueue.query.filter_by(offline_id=offline_id).first()
    if existing:
        return jsonify(existing.to_dict()), 200

    entry = OfflineQueue(
        offline_id=offline_id,
        payload=json.dumps(data),
    )
    db.session.add(entry)
    db.session.commit()
    return jsonify(entry.to_dict()), 201


@bp.route('/offline-queue/pending', methods=['GET'])
def pending_queue():
    entries = OfflineQueue.query.filter_by(status='pending').order_by(OfflineQueue.created_at).all()
    return jsonify([e.to_dict() for e in entries])
