from flask import Blueprint, jsonify, request
from db import db
from models import Quote, QuoteItem, Product, Sale, SaleItem, CustomerAccount, AccountTransaction
from datetime import date, datetime

bp = Blueprint('quotes', __name__, url_prefix='/api/quotes')

EDITABLE_STATUSES = ('draft', 'sent')


def _gen_quote_number():
    today = date.today().strftime('%Y%m%d')
    prefix = f'QUO-{today}-'
    last = (Quote.query
            .filter(Quote.quote_number.like(f'{prefix}%'))
            .order_by(Quote.quote_number.desc())
            .first())
    seq = int(last.quote_number.split('-')[-1]) + 1 if last else 1
    return f'{prefix}{seq:04d}'


def _gen_receipt_number():
    today = date.today().strftime('%Y%m%d')
    prefix = f'RCP-{today}-'
    last = (Sale.query
            .filter(Sale.receipt_number.like(f'{prefix}%'))
            .order_by(Sale.receipt_number.desc())
            .first())
    seq = int(last.receipt_number.split('-')[-1]) + 1 if last else 1
    return f'{prefix}{seq:04d}'


def _calc_totals(items_data):
    subtotal = 0.0
    tax_amount = 0.0
    discount_total = 0.0
    for item in items_data:
        qty = int(item.get('qty', 1))
        unit_price = float(item.get('unit_price', 0))
        discount = float(item.get('discount', 0))
        tax_rate = float(item.get('tax_rate', 0))
        line_pre = (unit_price - discount) * qty
        line_tax = line_pre * tax_rate
        subtotal += unit_price * qty
        discount_total += discount * qty
        tax_amount += line_tax
    total = round(subtotal - discount_total + tax_amount, 2)
    return round(subtotal, 2), round(tax_amount, 2), round(discount_total, 2), total


@bp.route('', methods=['GET'])
def list_quotes():
    status = request.args.get('status')
    q = request.args.get('q', '').strip()
    limit = min(int(request.args.get('limit', 100)), 500)

    query = Quote.query
    if status:
        query = query.filter_by(status=status)
    if q:
        query = query.filter(
            db.or_(
                Quote.customer_name.ilike(f'%{q}%'),
                Quote.quote_number.ilike(f'%{q}%'),
                Quote.customer_phone.ilike(f'%{q}%'),
            )
        )
    quotes = query.order_by(Quote.created_at.desc()).limit(limit).all()
    return jsonify([qt.to_dict(include_items=False) for qt in quotes])


@bp.route('/<int:quote_id>', methods=['GET'])
def get_quote(quote_id):
    qt = Quote.query.get_or_404(quote_id)
    return jsonify(qt.to_dict())


@bp.route('', methods=['POST'])
def create_quote():
    data = request.json or {}
    items_data = data.get('items', [])
    if not items_data:
        return jsonify({'error': 'Quote must have at least one item'}), 400

    subtotal, tax_amount, discount_total, total = _calc_totals(items_data)

    valid_until = None
    if data.get('valid_until'):
        try:
            valid_until = datetime.fromisoformat(data['valid_until'])
        except Exception:
            pass

    qt = Quote(
        quote_number=_gen_quote_number(),
        customer_id=data.get('customer_id') or None,
        customer_name=data.get('customer_name', '').strip(),
        customer_phone=data.get('customer_phone', '').strip(),
        account_id=data.get('account_id') or None,
        status='draft',
        subtotal=subtotal,
        tax_amount=tax_amount,
        discount_total=discount_total,
        total=total,
        notes=data.get('notes', ''),
        cashier_name=data.get('cashier_name', ''),
        valid_until=valid_until,
    )

    for item_data in items_data:
        qty = int(item_data.get('qty', 1))
        unit_price = float(item_data.get('unit_price', 0))
        discount = float(item_data.get('discount', 0))
        tax_rate = float(item_data.get('tax_rate', 0))
        line_pre = (unit_price - discount) * qty
        line_total = round(line_pre * (1 + tax_rate), 2)

        product_name = item_data.get('product_name', '')
        product_id = item_data.get('product_id') or None
        if product_id:
            p = Product.query.get(product_id)
            if p:
                product_name = p.name
                tax_rate = p.tax_rate

        qt.items.append(QuoteItem(
            product_id=product_id,
            product_name=product_name,
            unit_price=unit_price,
            qty=qty,
            discount=discount,
            tax_rate=tax_rate,
            line_total=line_total,
            notes=item_data.get('notes', '') or None,
        ))

    db.session.add(qt)
    db.session.commit()
    return jsonify(qt.to_dict()), 201


@bp.route('/<int:quote_id>', methods=['PUT'])
def update_quote(quote_id):
    qt = Quote.query.get_or_404(quote_id)
    if qt.status not in EDITABLE_STATUSES:
        return jsonify({'error': f'Cannot edit a quote with status: {qt.status}'}), 400

    data = request.json or {}

    for field in ('customer_name', 'customer_phone', 'notes', 'cashier_name', 'account_id', 'customer_id'):
        if field in data:
            setattr(qt, field, data[field] or None if field in ('account_id', 'customer_id') else data[field])

    if 'valid_until' in data:
        try:
            qt.valid_until = datetime.fromisoformat(data['valid_until']) if data['valid_until'] else None
        except Exception:
            pass

    if 'items' in data:
        items_data = data['items']
        if not items_data:
            return jsonify({'error': 'Quote must have at least one item'}), 400
        # Replace items
        for item in list(qt.items):
            db.session.delete(item)
        for item_data in items_data:
            qty = int(item_data.get('qty', 1))
            unit_price = float(item_data.get('unit_price', 0))
            discount = float(item_data.get('discount', 0))
            tax_rate = float(item_data.get('tax_rate', 0))
            product_id = item_data.get('product_id') or None
            product_name = item_data.get('product_name', '')
            if product_id:
                p = Product.query.get(product_id)
                if p:
                    product_name = p.name
                    tax_rate = p.tax_rate
            line_pre = (unit_price - discount) * qty
            line_total = round(line_pre * (1 + tax_rate), 2)
            qt.items.append(QuoteItem(
                product_id=product_id, product_name=product_name,
                unit_price=unit_price, qty=qty, discount=discount,
                tax_rate=tax_rate, line_total=line_total,
                notes=item_data.get('notes', '') or None,
            ))
        subtotal, tax_amount, discount_total, total = _calc_totals(items_data)
        qt.subtotal = subtotal
        qt.tax_amount = tax_amount
        qt.discount_total = discount_total
        qt.total = total

    db.session.commit()
    return jsonify(qt.to_dict())


@bp.route('/<int:quote_id>/status', methods=['POST'])
def update_status(quote_id):
    qt = Quote.query.get_or_404(quote_id)
    new_status = (request.json or {}).get('status')
    valid = ('draft', 'sent', 'accepted', 'expired')
    if new_status not in valid:
        return jsonify({'error': f'status must be one of: {", ".join(valid)}'}), 400
    qt.status = new_status
    db.session.commit()
    return jsonify(qt.to_dict())


@bp.route('/<int:quote_id>/convert', methods=['POST'])
def convert_to_sale(quote_id):
    """Convert an accepted/sent/draft quote into a completed sale."""
    qt = Quote.query.get_or_404(quote_id)
    if qt.status == 'converted':
        return jsonify({'error': 'Quote already converted', 'sale_id': qt.sale_id}), 409

    data = request.json or {}
    payment_method = data.get('payment_method', 'cash')
    if payment_method not in ('cash', 'card', 'mpesa', 'account', 'split'):
        return jsonify({'error': 'Invalid payment_method'}), 400

    # Account payment validation
    account = None
    account_balance_before = None
    account_balance_after = None
    if payment_method == 'account':
        acct_id = data.get('account_id') or qt.account_id
        if not acct_id:
            return jsonify({'error': 'account_id required for account payment'}), 400
        account = CustomerAccount.query.get(acct_id)
        if not account or not account.is_active:
            return jsonify({'error': 'Account not found or inactive'}), 404
        available = round(account.balance + account.credit_limit, 2)
        if qt.total > available:
            return jsonify({'error': f'Insufficient balance. Available: KES {available:,.2f}'}), 400
        account_balance_before = account.balance
        account.balance = round(account.balance - qt.total, 2)
        account.total_charged = round(account.total_charged + qt.total, 2)
        account_balance_after = account.balance

    # Build sale items and deduct stock
    sale_items = []
    for qi in qt.items:
        if qi.product_id:
            p = Product.query.get(qi.product_id)
            if p:
                p.stock_qty = max(0, p.stock_qty - qi.qty)
        sale_items.append(SaleItem(
            product_id=qi.product_id,
            product_name=qi.product_name,
            unit_price=qi.unit_price,
            qty=qi.qty,
            discount=qi.discount,
            tax_rate=qi.tax_rate,
            line_total=qi.line_total,
        ))

    sale = Sale(
        receipt_number=_gen_receipt_number(),
        subtotal=qt.subtotal,
        tax_amount=qt.tax_amount,
        discount_total=qt.discount_total,
        total=qt.total,
        payment_method=payment_method,
        cash_tendered=float(data.get('cash_tendered') or qt.total) if payment_method in ('cash', 'split') else None,
        change_given=0.0,
        card_amount=float(data.get('card_amount') or 0),
        cashier_name=data.get('cashier_name') or qt.cashier_name or '',
        customer_id=qt.customer_id,
        customer_name=qt.customer_name,
        mpesa_ref=data.get('mpesa_ref') or None,
        account_id=account.id if account else None,
        account_balance_before=account_balance_before,
        account_balance_after=account_balance_after,
    )
    sale.items = sale_items
    db.session.add(sale)
    db.session.flush()

    if account:
        txn = AccountTransaction(
            account_id=account.id,
            type='charge',
            amount=-qt.total,
            balance_after=account_balance_after,
            sale_id=sale.id,
            cashier_name=data.get('cashier_name') or qt.cashier_name or '',
            notes=f'Quote {qt.quote_number} converted to sale',
        )
        db.session.add(txn)

    qt.status = 'converted'
    qt.sale_id = sale.id
    qt.converted_at = datetime.utcnow()
    db.session.commit()

    return jsonify({'quote': qt.to_dict(), 'sale': sale.to_dict()}), 201


@bp.route('/<int:quote_id>', methods=['DELETE'])
def delete_quote(quote_id):
    qt = Quote.query.get_or_404(quote_id)
    if qt.status not in ('draft', 'expired'):
        return jsonify({'error': 'Can only delete draft or expired quotes'}), 400
    db.session.delete(qt)
    db.session.commit()
    return jsonify({'deleted': True})
