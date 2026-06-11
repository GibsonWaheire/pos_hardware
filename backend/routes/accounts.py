from flask import Blueprint, jsonify, request
from db import db
from models import CustomerAccount, AccountTransaction
from auth_utils import get_current_user
from datetime import date

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
