from flask import Blueprint, jsonify, request
from db import db
from models import Return, ReturnItem, Sale, Product, StockAdjustment, Invoice, CreditNote
from auth_utils import get_current_user
from datetime import date, datetime
import json

bp = Blueprint('returns', __name__, url_prefix='/api/returns')


def _generate_return_number():
    today = date.today().strftime('%Y%m%d')
    prefix = f'RTN-{today}-'
    last = (Return.query
            .filter(Return.return_number.like(f'{prefix}%'))
            .order_by(Return.return_number.desc())
            .first())
    seq = (int(last.return_number.split('-')[-1]) + 1) if last else 1
    return f'{prefix}{seq:04d}'


@bp.route('', methods=['GET'])
def list_returns():
    returns = Return.query.order_by(Return.created_at.desc()).limit(200).all()
    return jsonify([r.to_dict() for r in returns])


@bp.route('/<int:return_id>', methods=['GET'])
def get_return(return_id):
    return jsonify(Return.query.get_or_404(return_id).to_dict())


@bp.route('', methods=['POST'])
def create_return():
    """
    Body:
    {
      original_sale_id: int (optional),
      reason: str,
      refund_method: 'cash' | 'card' | 'store_credit',
      cashier_name: str,
      notes: str,
      items: [
        { product_id, product_name, qty, unit_price, restock: bool }
      ]
    }
    """
    data = request.json or {}
    user = get_current_user()
    cashier_id   = user['id']   if user else None
    cashier_name = user['name'] if user else 'Unknown'

    items_data = data.get('items', [])
    if not items_data:
        return jsonify({'error': 'Return must have at least one item'}), 400

    refund_method = data.get('refund_method', 'cash')
    if refund_method not in ('cash', 'card', 'store_credit'):
        return jsonify({'error': 'refund_method must be cash, card, or store_credit'}), 400

    return_items = []
    total_refund = 0.0

    for item_data in items_data:
        qty = int(item_data.get('qty', 1))
        unit_price = float(item_data.get('unit_price', 0))
        line_refund = round(qty * unit_price, 2)
        restock = bool(item_data.get('restock', True))
        product_id = item_data.get('product_id')
        product_name = item_data.get('product_name', '')

        if product_id:
            product = Product.query.get(product_id)
            if product:
                product_name = product.name
                if restock:
                    before = product.stock_qty
                    product.stock_qty += qty
                    adj = StockAdjustment(
                        product_id=product.id,
                        product_name=product.name,
                        qty_before=before,
                        qty_change=qty,
                        qty_after=product.stock_qty,
                        reason='return',
                        cashier_name=cashier_name,
                    )
                    db.session.add(adj)

        return_items.append(ReturnItem(
            product_id=product_id,
            product_name=product_name,
            qty=qty,
            unit_price=unit_price,
            line_refund=line_refund,
            restock=restock,
        ))
        total_refund += line_refund

    # Mark original sale as refunded if it exists
    original_sale = None
    original_receipt = data.get('original_receipt', '')
    if data.get('original_sale_id'):
        original_sale = Sale.query.get(data['original_sale_id'])
        if original_sale:
            original_receipt = original_sale.receipt_number
            original_sale.status = 'refunded'

    ret = Return(
        return_number=_generate_return_number(),
        original_sale_id=data.get('original_sale_id'),
        original_receipt=original_receipt,
        reason=data.get('reason', ''),
        refund_method=refund_method,
        total_refund=round(total_refund, 2),
        cashier_id=cashier_id,
        cashier_name=cashier_name,
        notes=data.get('notes', ''),
    )
    ret.items = return_items
    db.session.add(ret)
    db.session.flush()   # assigns ret.id before generating credit note

    # Auto-generate credit note
    cn = _create_credit_note(ret, return_items, original_sale, user)
    if cn:
        db.session.add(cn)

    db.session.commit()
    result = ret.to_dict()
    if cn:
        result['credit_note'] = cn.to_dict()
    return jsonify(result), 201


def _gen_cn_number():
    year = datetime.utcnow().year
    prefix = f'CN-{year}-'
    last = (CreditNote.query
            .filter(CreditNote.credit_note_number.like(f'{prefix}%'))
            .order_by(CreditNote.credit_note_number.desc())
            .first())
    seq = (int(last.credit_note_number.split('-')[-1]) + 1) if last else 1
    return f'{prefix}{seq:04d}'


def _create_credit_note(ret, return_items, original_sale, user):
    """Build a CreditNote for a return. Links to invoice if one exists."""
    items_snapshot = [
        {
            'product_name': ri.product_name,
            'qty': ri.qty,
            'unit_price': ri.unit_price,
            'line_refund': ri.line_refund,
        }
        for ri in return_items
    ]

    # Try to find linked invoice
    invoice_id     = None
    invoice_number = None
    customer_id    = None
    customer_name  = ret.cashier_name  # fallback
    if original_sale:
        customer_id   = original_sale.customer_id
        customer_name = original_sale.customer_name or ''
        inv = Invoice.query.filter_by(sale_id=original_sale.id).first()
        if inv:
            invoice_id     = inv.id
            invoice_number = inv.invoice_number

    return CreditNote(
        credit_note_number = _gen_cn_number(),
        invoice_id         = invoice_id,
        invoice_number     = invoice_number,
        return_id          = ret.id,
        return_number      = ret.return_number,
        original_sale_id   = ret.original_sale_id,
        original_receipt   = ret.original_receipt,
        customer_id        = customer_id,
        customer_name      = customer_name,
        reason             = ret.reason,
        items_json         = json.dumps(items_snapshot),
        total_credit       = ret.total_refund,
        refund_method      = ret.refund_method,
        issued_by_id       = user['id']   if user else None,
        issued_by_name     = user['name'] if user else 'Unknown',
    )
