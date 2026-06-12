from flask import Blueprint, jsonify, request, session
from db import db
from models import Invoice, CreditNote, Sale, SaleItem, Customer
from auth_utils import get_current_user
from datetime import datetime, date
import json

bp = Blueprint('invoices', __name__, url_prefix='/api')

MANAGER_ROLES = {'manager', 'admin'}
ISSUE_ROLES   = {'cashier', 'manager', 'admin'}   # who can issue invoices


def _role():
    return session.get('role', '')


def _deny(msg='Access denied'):
    return jsonify({'error': msg}), 403


def _gen_invoice_number():
    """INV-YYYY-NNNN — resets each calendar year."""
    year = datetime.utcnow().year
    prefix = f'INV-{year}-'
    last = (Invoice.query
            .filter(Invoice.invoice_number.like(f'{prefix}%'))
            .order_by(Invoice.invoice_number.desc())
            .first())
    seq = (int(last.invoice_number.split('-')[-1]) + 1) if last else 1
    return f'{prefix}{seq:04d}'


def _gen_credit_note_number():
    """CN-YYYY-NNNN — resets each calendar year."""
    year = datetime.utcnow().year
    prefix = f'CN-{year}-'
    last = (CreditNote.query
            .filter(CreditNote.credit_note_number.like(f'{prefix}%'))
            .order_by(CreditNote.credit_note_number.desc())
            .first())
    seq = (int(last.credit_note_number.split('-')[-1]) + 1) if last else 1
    return f'{prefix}{seq:04d}'


# ── Invoice endpoints ──────────────────────────────────────────────────────────

@bp.route('/sales/<int:sale_id>/invoice', methods=['GET'])
def get_sale_invoice(sale_id):
    """Return the existing invoice for a sale, or 404."""
    if _role() not in ISSUE_ROLES:
        return _deny()
    inv = Invoice.query.filter_by(sale_id=sale_id).first()
    if not inv:
        return jsonify({'error': 'No invoice for this sale'}), 404
    return jsonify(inv.to_dict())


@bp.route('/sales/<int:sale_id>/invoice', methods=['POST'])
def create_or_get_sale_invoice(sale_id):
    """
    Idempotent — returns existing invoice if one already exists for this sale.
    Body (all optional):
      customer_pin, customer_address, payment_terms, notes
    """
    if _role() not in ISSUE_ROLES:
        return _deny()

    # Idempotency: return if already exists
    existing = Invoice.query.filter_by(sale_id=sale_id).first()
    if existing:
        return jsonify(existing.to_dict()), 200

    sale = Sale.query.get_or_404(sale_id)
    user = get_current_user()
    data = request.json or {}

    # Snapshot sale items
    items_snapshot = []
    for item in sale.items:
        items_snapshot.append({
            'product_name': item.product_name,
            'qty': item.qty,
            'unit_price': item.unit_price,
            'discount': item.discount or 0,
            'tax_rate': item.tax_rate or 0,
            'line_total': item.line_total,
            'item_type': item.item_type or 'product',
        })

    # Resolve customer details
    customer_name    = sale.customer_name or data.get('customer_name', '')
    customer_id      = sale.customer_id
    customer_pin     = data.get('customer_pin', '')
    customer_address = data.get('customer_address', '')

    # If customer in DB and no override provided, try to fill from record
    if customer_id and not customer_pin:
        cust = Customer.query.get(customer_id)
        if cust:
            customer_name    = customer_name or cust.name
            customer_address = customer_address or (cust.notes or '')

    inv = Invoice(
        invoice_number   = _gen_invoice_number(),
        sale_id          = sale_id,
        receipt_number   = sale.receipt_number,
        customer_id      = customer_id,
        customer_name    = customer_name,
        customer_pin     = customer_pin,
        customer_address = customer_address,
        subtotal         = sale.subtotal,
        discount_total   = sale.discount_total or 0,
        tax_amount       = sale.tax_amount or 0,
        total            = sale.total,
        payment_terms    = data.get('payment_terms', 'Cash on delivery'),
        notes            = data.get('notes', ''),
        status           = 'issued',
        issued_by_id     = user['id']   if user else None,
        issued_by_name   = user['name'] if user else 'Unknown',
        items_json       = json.dumps(items_snapshot),
    )
    db.session.add(inv)
    db.session.commit()
    return jsonify(inv.to_dict()), 201


@bp.route('/invoices', methods=['GET'])
def list_invoices():
    """List all invoices. Manager/admin only."""
    if _role() not in MANAGER_ROLES:
        return _deny()
    customer_id = request.args.get('customer_id')
    limit = min(int(request.args.get('limit', 200)), 1000)
    query = Invoice.query
    if customer_id:
        query = query.filter_by(customer_id=int(customer_id))
    invoices = query.order_by(Invoice.created_at.desc()).limit(limit).all()
    return jsonify([i.to_dict() for i in invoices])


@bp.route('/invoices/<int:inv_id>', methods=['GET'])
def get_invoice(inv_id):
    """Get a single invoice. Manager/admin or issuer."""
    if _role() not in ISSUE_ROLES:
        return _deny()
    inv = Invoice.query.get_or_404(inv_id)
    return jsonify(inv.to_dict())


@bp.route('/invoices/<int:inv_id>/void', methods=['POST'])
def void_invoice(inv_id):
    """Void an invoice. Manager/admin only."""
    if _role() not in MANAGER_ROLES:
        return _deny()
    inv = Invoice.query.get_or_404(inv_id)
    if inv.status == 'voided':
        return jsonify({'error': 'Invoice already voided'}), 400
    inv.status = 'voided'
    db.session.commit()
    return jsonify(inv.to_dict())


@bp.route('/customers/<int:customer_id>/invoices', methods=['GET'])
def customer_invoices(customer_id):
    """List all invoices for a customer. Manager/admin only."""
    if _role() not in MANAGER_ROLES:
        return _deny()
    invoices = (Invoice.query
                .filter_by(customer_id=customer_id)
                .order_by(Invoice.created_at.desc())
                .all())
    return jsonify([i.to_dict() for i in invoices])


# ── Credit Note endpoints ──────────────────────────────────────────────────────

@bp.route('/credit-notes', methods=['GET'])
def list_credit_notes():
    """List credit notes. Manager/admin only."""
    if _role() not in MANAGER_ROLES:
        return _deny()
    customer_id = request.args.get('customer_id')
    limit = min(int(request.args.get('limit', 200)), 1000)
    query = CreditNote.query
    if customer_id:
        query = query.filter_by(customer_id=int(customer_id))
    notes = query.order_by(CreditNote.created_at.desc()).limit(limit).all()
    return jsonify([n.to_dict() for n in notes])


@bp.route('/credit-notes/<int:cn_id>', methods=['GET'])
def get_credit_note(cn_id):
    if _role() not in ISSUE_ROLES:
        return _deny()
    cn = CreditNote.query.get_or_404(cn_id)
    return jsonify(cn.to_dict())
