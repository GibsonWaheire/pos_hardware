from flask import Blueprint, jsonify, request
from db import db
from models import CustomerAccount, AccountTransaction
from auth_utils import get_current_user
from datetime import date, datetime

bp = Blueprint('accounts', __name__, url_prefix='/api/accounts')


def _gen_deposit_receipt():
    today = date.today().strftime('%Y%m%d')
    prefix = f'DEP-{today}-'
    last = (AccountTransaction.query
            .filter(AccountTransaction.receipt_number.like(f'{prefix}%'))
            .order_by(AccountTransaction.receipt_number.desc())
            .first())
    seq = int(last.receipt_number.split('-')[-1]) + 1 if last else 1
    return f'{prefix}{seq:04d}'


@bp.route('/alerts', methods=['GET'])
def get_alerts():
    """Return accounts that are over or near (≥90%) their credit limit."""
    accounts = CustomerAccount.query.filter_by(is_active=True).all()
    alerts = []
    for acct in accounts:
        if acct.credit_limit > 0:
            used = -acct.balance  # balance negative = money owed
            pct = used / acct.credit_limit
            if pct >= 1.0:
                alerts.append({'account': acct.to_dict(), 'type': 'over_limit', 'pct': round(pct * 100, 1)})
            elif pct >= 0.9:
                alerts.append({'account': acct.to_dict(), 'type': 'near_limit', 'pct': round(pct * 100, 1)})
    return jsonify(alerts)


@bp.route('', methods=['GET'])
def list_accounts():
    show_all = request.args.get('all', '0') == '1'
    q = CustomerAccount.query
    if not show_all:
        q = q.filter_by(is_active=True)
    accounts = q.order_by(CustomerAccount.customer_name).all()
    return jsonify([a.to_dict() for a in accounts])


@bp.route('', methods=['POST'])
def create_account():
    data = request.json or {}
    if not data.get('customer_name'):
        return jsonify({'error': 'customer_name required'}), 400

    cust_id = data.get('customer_id') or None
    if cust_id and CustomerAccount.query.filter_by(customer_id=cust_id).first():
        return jsonify({'error': 'Account already exists for this customer'}), 409

    acct = CustomerAccount(
        customer_id=cust_id,
        customer_name=data['customer_name'].strip(),
        customer_phone=data.get('customer_phone', '').strip(),
        credit_limit=float(data.get('credit_limit', 0)),
        notes=data.get('notes', ''),
    )
    db.session.add(acct)
    db.session.commit()
    return jsonify(acct.to_dict()), 201


@bp.route('/lookup', methods=['GET'])
def lookup_account():
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify([])
    results = CustomerAccount.query.filter(
        CustomerAccount.is_active == True,
        db.or_(
            CustomerAccount.customer_name.ilike(f'%{q}%'),
            CustomerAccount.customer_phone.ilike(f'%{q}%'),
        )
    ).limit(10).all()
    return jsonify([a.to_dict() for a in results])


@bp.route('/by-customer/<int:customer_id>', methods=['GET'])
def get_by_customer(customer_id):
    acct = CustomerAccount.query.filter_by(customer_id=customer_id).first()
    if not acct:
        return jsonify({'found': False}), 200
    return jsonify({'found': True, 'account': acct.to_dict()})


@bp.route('/<int:account_id>', methods=['GET'])
def get_account(account_id):
    acct = CustomerAccount.query.get_or_404(account_id)
    return jsonify(acct.to_dict(include_transactions=True))


@bp.route('/<int:account_id>/statement', methods=['GET'])
def get_statement(account_id):
    acct = CustomerAccount.query.get_or_404(account_id)
    date_from = request.args.get('date_from')  # YYYY-MM-DD
    date_to   = request.args.get('date_to')    # YYYY-MM-DD

    txns_q = AccountTransaction.query.filter_by(account_id=account_id)

    # Opening balance: balance_after of last transaction strictly before date_from
    opening_balance = 0.0
    if date_from:
        cutoff = datetime.strptime(date_from, '%Y-%m-%d')
        prev = (AccountTransaction.query
                .filter(AccountTransaction.account_id == account_id,
                        AccountTransaction.created_at < cutoff)
                .order_by(AccountTransaction.created_at.desc())
                .first())
        if prev:
            opening_balance = prev.balance_after
        txns_q = txns_q.filter(AccountTransaction.created_at >= cutoff)

    if date_to:
        end = datetime.strptime(date_to, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
        txns_q = txns_q.filter(AccountTransaction.created_at <= end)

    txns = txns_q.order_by(AccountTransaction.created_at).all()
    closing_balance = txns[-1].balance_after if txns else opening_balance

    return jsonify({
        'account': acct.to_dict(),
        'date_from': date_from,
        'date_to': date_to,
        'opening_balance': opening_balance,
        'closing_balance': closing_balance,
        'transactions': [t.to_dict() for t in txns],
    })


@bp.route('/<int:account_id>', methods=['PUT'])
def update_account(account_id):
    acct = CustomerAccount.query.get_or_404(account_id)
    data = request.json or {}
    for field in ('customer_name', 'customer_phone', 'credit_limit', 'notes', 'is_active'):
        if field in data:
            setattr(acct, field, data[field])
    db.session.commit()
    return jsonify(acct.to_dict())


@bp.route('/<int:account_id>/deposit', methods=['POST'])
def deposit(account_id):
    acct = CustomerAccount.query.get_or_404(account_id)
    data = request.json or {}
    amount = float(data.get('amount', 0))
    if amount <= 0:
        return jsonify({'error': 'Amount must be positive'}), 400

    user = get_current_user()
    cashier_name = user['name'] if user else 'System'

    acct.balance = round(acct.balance + amount, 2)
    acct.total_deposited = round(acct.total_deposited + amount, 2)

    txn = AccountTransaction(
        account_id=acct.id,
        type='deposit',
        amount=amount,
        balance_after=acct.balance,
        receipt_number=_gen_deposit_receipt(),
        payment_method=data.get('payment_method', 'cash'),
        mpesa_ref=data.get('mpesa_ref', '') or None,
        cashier_name=cashier_name,
        notes=data.get('notes', '') or None,
    )
    db.session.add(txn)
    db.session.commit()
    return jsonify({'account': acct.to_dict(), 'transaction': txn.to_dict()}), 201


@bp.route('/<int:account_id>/adjust', methods=['POST'])
def adjust(account_id):
    acct = CustomerAccount.query.get_or_404(account_id)
    data = request.json or {}
    amount = float(data.get('amount', 0))
    if amount == 0:
        return jsonify({'error': 'Amount cannot be zero'}), 400

    user = get_current_user()
    cashier_name = user['name'] if user else 'System'

    acct.balance = round(acct.balance + amount, 2)

    txn = AccountTransaction(
        account_id=acct.id,
        type='adjustment',
        amount=amount,
        balance_after=acct.balance,
        cashier_name=cashier_name,
        notes=data.get('notes', '') or None,
    )
    db.session.add(txn)
    db.session.commit()
    return jsonify({'account': acct.to_dict(), 'transaction': txn.to_dict()}), 201
