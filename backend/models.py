from db import db
from datetime import datetime


# ── Phase 1 Models ─────────────────────────────────────────────────────────────

class Category(db.Model):
    __tablename__ = 'categories'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    tax_class = db.Column(db.String(20), default='standard')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    products = db.relationship('Product', backref='category_obj', lazy=True)

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'tax_class': self.tax_class}


class Product(db.Model):
    __tablename__ = 'products'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    barcode = db.Column(db.String(50), unique=True, index=True)
    plu_code = db.Column(db.String(20), unique=True, index=True)
    price = db.Column(db.Float, nullable=False)
    tax_class = db.Column(db.String(20), default='standard')
    tax_rate = db.Column(db.Float, default=0.0)
    is_weight_based = db.Column(db.Boolean, default=False)
    weight_unit = db.Column(db.String(10), default='kg')
    age_restricted = db.Column(db.Boolean, default=False)
    age_restriction_type = db.Column(db.String(20))
    min_age = db.Column(db.Integer, default=18)
    stock_qty = db.Column(db.Integer, default=0)
    low_stock_threshold = db.Column(db.Integer, default=5)
    reorder_point = db.Column(db.Integer, default=0)
    reorder_qty   = db.Column(db.Integer, default=0)
    supplier_id   = db.Column(db.Integer, db.ForeignKey('suppliers.id'), nullable=True)
    supplier_name = db.Column(db.String(200), nullable=True)
    image_url = db.Column(db.String(500), nullable=True)
    category_id = db.Column(db.Integer, db.ForeignKey('categories.id'), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    # Signature fields
    created_by_id   = db.Column(db.Integer, nullable=True)
    created_by_name = db.Column(db.String(100))
    created_by_role = db.Column(db.String(20))
    updated_by_id   = db.Column(db.Integer, nullable=True)
    updated_by_name = db.Column(db.String(100))
    updated_by_role = db.Column(db.String(20))
    updated_at      = db.Column(db.DateTime)

    sale_items = db.relationship('SaleItem', backref='product', lazy=True)
    stock_adjustments = db.relationship('StockAdjustment', backref='product', lazy=True)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'barcode': self.barcode,
            'plu_code': self.plu_code, 'price': self.price,
            'tax_class': self.tax_class, 'tax_rate': self.tax_rate,
            'is_weight_based': self.is_weight_based, 'weight_unit': self.weight_unit,
            'age_restricted': self.age_restricted,
            'age_restriction_type': self.age_restriction_type, 'min_age': self.min_age,
            'stock_qty': self.stock_qty, 'low_stock_threshold': self.low_stock_threshold,
            'reorder_point': self.reorder_point or 0, 'reorder_qty': self.reorder_qty or 0,
            'supplier_id': self.supplier_id, 'supplier_name': self.supplier_name,
            'image_url': self.image_url,
            'category_id': self.category_id,
            'category_name': self.category_obj.name if self.category_obj else None,
            'is_active': self.is_active,
            'created_by_id': self.created_by_id, 'created_by_name': self.created_by_name,
            'created_by_role': self.created_by_role,
            'updated_by_id': self.updated_by_id, 'updated_by_name': self.updated_by_name,
            'updated_by_role': self.updated_by_role,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def to_dict_cashier(self):
        """Cashier-safe product dict — omits all stock/inventory fields."""
        return {
            'id': self.id, 'name': self.name, 'barcode': self.barcode,
            'plu_code': self.plu_code, 'price': self.price,
            'tax_class': self.tax_class, 'tax_rate': self.tax_rate,
            'is_weight_based': self.is_weight_based, 'weight_unit': self.weight_unit,
            'age_restricted': self.age_restricted,
            'age_restriction_type': self.age_restriction_type, 'min_age': self.min_age,
            'image_url': self.image_url,
            'category_id': self.category_id,
            'category_name': self.category_obj.name if self.category_obj else None,
            'is_active': self.is_active,
        }


class Staff(db.Model):
    __tablename__ = 'staff'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    pin = db.Column(db.String(100))              # legacy — kept for backwards compat (bcrypt hash)
    personal_pin = db.Column(db.String(100))     # unique per individual (Step 2 login, bcrypt hash)
    department_pin = db.Column(db.String(100))   # shared by all staff in same role (Step 1, bcrypt hash)
    auth_card_code = db.Column(db.String(100), unique=True, nullable=True)  # manager auth card
    role = db.Column(db.String(20), default='cashier')  # admin/cashier/manager/inventory/purchasing/supplier
    supplier_id = db.Column(db.Integer, db.ForeignKey('suppliers.id'), nullable=True)  # for supplier-role staff
    is_active = db.Column(db.Boolean, default=True)
    login_attempts = db.Column(db.Integer, default=0)   # consecutive failed logins
    locked_until = db.Column(db.DateTime, nullable=True)  # account locked until this time
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    shifts = db.relationship('Shift', backref='cashier', lazy=True)
    appointments = db.relationship('Appointment', backref='staff', lazy=True)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'role': self.role,
            'supplier_id': self.supplier_id,
            'is_active': self.is_active,
            'has_personal_pin': bool(self.personal_pin or self.pin),
            'has_auth_card': bool(self.auth_card_code),
        }


# ── Audit Log ─────────────────────────────────────────────────────────────────

class OverrideApproval(db.Model):
    """Server-side record of every manager-authorised modification to a locked bill item."""
    __tablename__ = 'override_approvals'

    id            = db.Column(db.Integer, primary_key=True)
    cashier_id    = db.Column(db.Integer, nullable=True)
    cashier_name  = db.Column(db.String(100))
    manager_id    = db.Column(db.Integer, nullable=True)
    manager_name  = db.Column(db.String(100))
    manager_role  = db.Column(db.String(20))
    auth_method   = db.Column(db.String(20))   # card | pin
    action        = db.Column(db.String(50))   # ADJUST_QTY | REMOVE_ITEM
    item_name     = db.Column(db.String(200))
    original_qty  = db.Column(db.Integer)
    new_qty       = db.Column(db.Integer, nullable=True)
    unit_price    = db.Column(db.Float, nullable=True)   # Phase 39 — snapshot for value calc
    value_impact  = db.Column(db.Float, nullable=True)   # Phase 39 — KES impact
    shift_id      = db.Column(db.Integer, nullable=True)  # Phase 39 — denormalised
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    used_at       = db.Column(db.DateTime, nullable=True)
    sale_id       = db.Column(db.Integer, nullable=True)

    def to_dict(self):
        return {
            'id': self.id, 'manager_name': self.manager_name,
            'action': self.action, 'item_name': self.item_name,
            'original_qty': self.original_qty, 'new_qty': self.new_qty,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class AuditLog(db.Model):
    __tablename__ = 'audit_logs'

    id          = db.Column(db.Integer, primary_key=True)
    user_id     = db.Column(db.Integer, nullable=True)
    user_name   = db.Column(db.String(100))
    user_role   = db.Column(db.String(20))
    action      = db.Column(db.String(50))   # create/update/delete/login/logout/void/deposit/receive_po
    entity_type = db.Column(db.String(50))   # product/sale/purchase_order/stock_adjustment/quote/account/staff
    entity_id   = db.Column(db.Integer, nullable=True)
    entity_name        = db.Column(db.String(200))
    details            = db.Column(db.Text)         # JSON string of before/after values
    authorized_by_id   = db.Column(db.Integer, nullable=True)
    authorized_by_name = db.Column(db.String(100))
    authorized_by_role = db.Column(db.String(20))
    auth_method        = db.Column(db.String(20))   # card | pin | manager_login | self
    created_at         = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        import json
        return {
            'id': self.id, 'user_id': self.user_id, 'user_name': self.user_name,
            'user_role': self.user_role, 'action': self.action,
            'entity_type': self.entity_type, 'entity_id': self.entity_id,
            'entity_name': self.entity_name,
            'details': json.loads(self.details) if self.details else None,
            'authorized_by_id': self.authorized_by_id,
            'authorized_by_name': self.authorized_by_name,
            'authorized_by_role': self.authorized_by_role,
            'auth_method': self.auth_method,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Sale(db.Model):
    __tablename__ = 'sales'

    id = db.Column(db.Integer, primary_key=True)
    receipt_number = db.Column(db.String(30), unique=True, index=True)
    subtotal = db.Column(db.Float, nullable=False)
    tax_amount = db.Column(db.Float, default=0.0)
    discount_total = db.Column(db.Float, default=0.0)
    total = db.Column(db.Float, nullable=False)
    payment_method = db.Column(db.String(20), nullable=False)
    cash_tendered = db.Column(db.Float)
    change_given = db.Column(db.Float, default=0.0)
    card_amount = db.Column(db.Float, default=0.0)
    cashier_id = db.Column(db.Integer, db.ForeignKey('staff.id'), nullable=True)
    cashier_name = db.Column(db.String(100))
    shift_id = db.Column(db.Integer, db.ForeignKey('shifts.id'), nullable=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=True)
    customer_name = db.Column(db.String(100))
    loyalty_points_earned = db.Column(db.Integer, default=0)
    loyalty_points_redeemed = db.Column(db.Integer, default=0)
    loyalty_discount = db.Column(db.Float, default=0.0)
    terminal_id = db.Column(db.String(50))
    age_verified = db.Column(db.Boolean, default=False)

    # Phase 4 — Salon fields
    sale_type = db.Column(db.String(20), default='retail')  # retail / salon
    tip_amount = db.Column(db.Float, default=0.0)
    tip_method = db.Column(db.String(20))   # cash / card
    tip_staff_id = db.Column(db.Integer, db.ForeignKey('staff.id'), nullable=True)
    tip_staff_name = db.Column(db.String(100))
    appointment_id = db.Column(db.Integer, db.ForeignKey('appointments.id'), nullable=True)

    status = db.Column(db.String(20), default='completed')
    offline_id = db.Column(db.String(50), unique=True, nullable=True)
    stripe_payment_intent_id = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    # Phase 6 — cloud sync tracking
    cloud_synced_at = db.Column(db.DateTime, nullable=True)

    # Phase 7 — M-Pesa and customer account (deposit/credit)
    mpesa_ref = db.Column(db.String(50))            # M-Pesa confirmation code
    mpesa_amount = db.Column(db.Float, default=0.0) # M-Pesa portion in multi-tender
    account_id = db.Column(db.Integer, db.ForeignKey('customer_accounts.id'), nullable=True)
    account_balance_before = db.Column(db.Float)   # balance before this charge
    account_balance_after = db.Column(db.Float)    # balance after this charge
    tenders_json = db.Column(db.Text, nullable=True)  # JSON list of tenders for multi-method payment

    items = db.relationship('SaleItem', backref='sale', lazy=True, cascade='all, delete-orphan')
    returns = db.relationship('Return', backref='original_sale', lazy=True)

    def to_dict(self):
        return {
            'id': self.id, 'receipt_number': self.receipt_number,
            'subtotal': self.subtotal, 'tax_amount': self.tax_amount,
            'discount_total': self.discount_total, 'total': self.total,
            'payment_method': self.payment_method, 'cash_tendered': self.cash_tendered,
            'change_given': self.change_given, 'card_amount': self.card_amount,
            'mpesa_amount': self.mpesa_amount or 0.0,
            'cashier_name': self.cashier_name, 'shift_id': self.shift_id,
            'customer_id': self.customer_id, 'customer_name': self.customer_name,
            'loyalty_points_earned': self.loyalty_points_earned,
            'loyalty_points_redeemed': self.loyalty_points_redeemed,
            'loyalty_discount': self.loyalty_discount,
            'terminal_id': self.terminal_id, 'age_verified': self.age_verified,
            'sale_type': self.sale_type,
            'tip_amount': self.tip_amount, 'tip_method': self.tip_method,
            'tip_staff_name': self.tip_staff_name,
            'appointment_id': self.appointment_id,
            'mpesa_ref': self.mpesa_ref,
            'account_id': self.account_id,
            'account_balance_before': self.account_balance_before,
            'account_balance_after': self.account_balance_after,
            'status': self.status, 'offline_id': self.offline_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'items': [i.to_dict() for i in self.items],
        }


class SaleItem(db.Model):
    __tablename__ = 'sale_items'

    id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(db.Integer, db.ForeignKey('sales.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=True)
    product_name = db.Column(db.String(200), nullable=False)
    unit_price = db.Column(db.Float, nullable=False)
    qty = db.Column(db.Integer, nullable=False, default=1)
    weight = db.Column(db.Float)
    discount = db.Column(db.Float, default=0.0)
    tax_rate = db.Column(db.Float, default=0.0)
    line_total = db.Column(db.Float, nullable=False)

    # Phase 4 — Salon fields
    item_type = db.Column(db.String(20), default='product')  # product / service
    service_id = db.Column(db.Integer, db.ForeignKey('services.id'), nullable=True)
    staff_id = db.Column(db.Integer, db.ForeignKey('staff.id'), nullable=True)
    staff_name = db.Column(db.String(100))

    def to_dict(self):
        return {
            'id': self.id, 'product_id': self.product_id, 'product_name': self.product_name,
            'unit_price': self.unit_price, 'qty': self.qty, 'weight': self.weight,
            'discount': self.discount, 'tax_rate': self.tax_rate, 'line_total': self.line_total,
            'item_type': self.item_type, 'service_id': self.service_id,
            'staff_id': self.staff_id, 'staff_name': self.staff_name,
        }


class OfflineQueue(db.Model):
    __tablename__ = 'offline_queue'

    id = db.Column(db.Integer, primary_key=True)
    offline_id = db.Column(db.String(50), unique=True, nullable=False)
    payload = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default='pending')
    error_message = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    synced_at = db.Column(db.DateTime)

    def to_dict(self):
        return {
            'id': self.id, 'offline_id': self.offline_id, 'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'synced_at': self.synced_at.isoformat() if self.synced_at else None,
        }


# ── Phase 2 Models ─────────────────────────────────────────────────────────────

class Supplier(db.Model):
    __tablename__ = 'suppliers'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    contact_name = db.Column(db.String(100))
    phone = db.Column(db.String(30))
    email = db.Column(db.String(100))
    address = db.Column(db.Text)
    notes = db.Column(db.Text)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    purchase_orders = db.relationship('PurchaseOrder', backref='supplier', lazy=True)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'contact_name': self.contact_name,
            'phone': self.phone, 'email': self.email, 'address': self.address,
            'notes': self.notes, 'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class PurchaseOrder(db.Model):
    __tablename__ = 'purchase_orders'

    id = db.Column(db.Integer, primary_key=True)
    po_number = db.Column(db.String(30), unique=True, index=True)
    supplier_id = db.Column(db.Integer, db.ForeignKey('suppliers.id'), nullable=True)
    supplier_name = db.Column(db.String(200))
    status = db.Column(db.String(20), default='draft')
    # status: draft | pending_approval | ordered | partial | received | cancelled | rejected
    notes = db.Column(db.Text)
    total_cost = db.Column(db.Float, default=0.0)
    created_by = db.Column(db.String(100))     # legacy plain string, kept for compat
    created_by_id   = db.Column(db.Integer, nullable=True)
    created_by_name = db.Column(db.String(100))
    approved_by_id   = db.Column(db.Integer, nullable=True)
    approved_by_name = db.Column(db.String(100))
    approved_at      = db.Column(db.DateTime)
    ordered_at = db.Column(db.DateTime)
    received_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    # Phase 23B — dispatch details (set by supplier when marking dispatched)
    dispatched_at       = db.Column(db.DateTime, nullable=True)
    dispatched_by_name  = db.Column(db.String(100), nullable=True)
    dispatch_details    = db.Column(db.Text, nullable=True)  # JSON blob

    items = db.relationship('PurchaseOrderItem', backref='purchase_order', lazy=True,
                            cascade='all, delete-orphan')

    def to_dict(self):
        import json as _json
        dd = None
        if self.dispatch_details:
            try: dd = _json.loads(self.dispatch_details)
            except Exception: dd = None
        return {
            'id': self.id, 'po_number': self.po_number, 'supplier_id': self.supplier_id,
            'supplier_name': self.supplier_name, 'status': self.status, 'notes': self.notes,
            'total_cost': self.total_cost, 'created_by': self.created_by,
            'created_by_id': self.created_by_id, 'created_by_name': self.created_by_name,
            'approved_by_id': self.approved_by_id, 'approved_by_name': self.approved_by_name,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
            'ordered_at': self.ordered_at.isoformat() if self.ordered_at else None,
            'received_at': self.received_at.isoformat() if self.received_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'dispatched_at': self.dispatched_at.isoformat() if self.dispatched_at else None,
            'dispatched_by_name': self.dispatched_by_name,
            'dispatch_details': dd,
            'items': [i.to_dict() for i in self.items],
        }


class PurchaseOrderItem(db.Model):
    __tablename__ = 'purchase_order_items'

    id = db.Column(db.Integer, primary_key=True)
    po_id = db.Column(db.Integer, db.ForeignKey('purchase_orders.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=True)
    product_name = db.Column(db.String(200), nullable=False)
    qty_ordered = db.Column(db.Integer, nullable=False)
    qty_received = db.Column(db.Integer, default=0)
    unit_cost = db.Column(db.Float, nullable=False)
    line_cost = db.Column(db.Float, nullable=False)

    def to_dict(self):
        return {
            'id': self.id, 'product_id': self.product_id, 'product_name': self.product_name,
            'qty_ordered': self.qty_ordered, 'qty_received': self.qty_received,
            'unit_cost': self.unit_cost, 'line_cost': self.line_cost,
        }


class Return(db.Model):
    __tablename__ = 'returns'

    id = db.Column(db.Integer, primary_key=True)
    return_number = db.Column(db.String(30), unique=True, index=True)
    original_sale_id = db.Column(db.Integer, db.ForeignKey('sales.id'), nullable=True)
    original_receipt = db.Column(db.String(30))
    reason = db.Column(db.String(200))
    refund_method = db.Column(db.String(20), default='cash')
    total_refund = db.Column(db.Float, nullable=False)
    cashier_id = db.Column(db.Integer, db.ForeignKey('staff.id'), nullable=True)
    cashier_name = db.Column(db.String(100))
    # status: pending_approval | completed | rejected
    status = db.Column(db.String(20), default='completed')
    notes = db.Column(db.Text)
    # Approval tracking (for refunds above threshold)
    approved_by_id   = db.Column(db.Integer, nullable=True)
    approved_by_name = db.Column(db.String(100))
    approved_at      = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    items = db.relationship('ReturnItem', backref='return_obj', lazy=True,
                            cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id, 'return_number': self.return_number,
            'original_sale_id': self.original_sale_id, 'original_receipt': self.original_receipt,
            'reason': self.reason, 'refund_method': self.refund_method,
            'total_refund': self.total_refund, 'cashier_name': self.cashier_name,
            'status': self.status, 'notes': self.notes,
            'approved_by_name': self.approved_by_name,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'items': [i.to_dict() for i in self.items],
        }


class ReturnItem(db.Model):
    __tablename__ = 'return_items'

    id = db.Column(db.Integer, primary_key=True)
    return_id = db.Column(db.Integer, db.ForeignKey('returns.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=True)
    product_name = db.Column(db.String(200), nullable=False)
    qty = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Float, nullable=False)
    line_refund = db.Column(db.Float, nullable=False)
    restock = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            'id': self.id, 'product_id': self.product_id, 'product_name': self.product_name,
            'qty': self.qty, 'unit_price': self.unit_price, 'line_refund': self.line_refund,
            'restock': self.restock,
        }


class Shift(db.Model):
    __tablename__ = 'shifts'

    id = db.Column(db.Integer, primary_key=True)
    cashier_id     = db.Column(db.Integer, db.ForeignKey('staff.id'), nullable=True)
    cashier_name   = db.Column(db.String(100))
    status         = db.Column(db.String(20), default='open')  # open | pending_reconciliation | reconciled | voided
    opening_float  = db.Column(db.Float, default=0.0)
    closing_float  = db.Column(db.Float)
    expected_cash  = db.Column(db.Float)
    variance       = db.Column(db.Float)
    opened_at      = db.Column(db.DateTime, default=datetime.utcnow)
    closed_at      = db.Column(db.DateTime)
    notes          = db.Column(db.Text)
    # Authorization fields
    opened_by_id   = db.Column(db.Integer, nullable=True)
    opened_by_name = db.Column(db.String(100))
    auth_method    = db.Column(db.String(20))   # card | pin | manager_login

    # Phase 39 — per-tender reconciliation
    actual_cash          = db.Column(db.Float, nullable=True)
    actual_mpesa         = db.Column(db.Float, nullable=True)
    actual_card          = db.Column(db.Float, nullable=True)
    actual_other         = db.Column(db.Float, nullable=True)
    variance_cash        = db.Column(db.Float, nullable=True)
    variance_mpesa       = db.Column(db.Float, nullable=True)
    variance_card        = db.Column(db.Float, nullable=True)
    variance_other       = db.Column(db.Float, nullable=True)
    reconciled_by_id     = db.Column(db.Integer, nullable=True)
    reconciled_by_name   = db.Column(db.String(100), nullable=True)
    reconciled_at        = db.Column(db.DateTime, nullable=True)
    closed_without_print = db.Column(db.Boolean, default=False)
    admin_bypass         = db.Column(db.Boolean, default=False)

    sales = db.relationship('Sale', backref='shift', lazy=True)

    def to_dict(self):
        return {
            'id': self.id, 'cashier_id': self.cashier_id, 'cashier_name': self.cashier_name,
            'status': self.status, 'opening_float': self.opening_float,
            'closing_float': self.closing_float, 'expected_cash': self.expected_cash,
            'variance': self.variance,
            'opened_at': self.opened_at.isoformat() if self.opened_at else None,
            'closed_at': self.closed_at.isoformat() if self.closed_at else None,
            'notes': self.notes,
            'opened_by_id': self.opened_by_id, 'opened_by_name': self.opened_by_name,
            'auth_method': self.auth_method,
            'actual_cash': self.actual_cash, 'actual_mpesa': self.actual_mpesa,
            'actual_card': self.actual_card, 'actual_other': self.actual_other,
            'variance_cash': self.variance_cash, 'variance_mpesa': self.variance_mpesa,
            'variance_card': self.variance_card, 'variance_other': self.variance_other,
            'reconciled_by_name': self.reconciled_by_name,
            'reconciled_at': self.reconciled_at.isoformat() if self.reconciled_at else None,
            'closed_without_print': self.closed_without_print,
            'admin_bypass': self.admin_bypass,
        }


class StockAdjustment(db.Model):
    __tablename__ = 'stock_adjustments'

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    product_name = db.Column(db.String(200))
    qty_before = db.Column(db.Integer, nullable=False)
    qty_change = db.Column(db.Integer, nullable=False)
    qty_after = db.Column(db.Integer, nullable=False)
    reason = db.Column(db.String(200))
    reference_id = db.Column(db.String(50))
    cashier_name = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'product_id': self.product_id, 'product_name': self.product_name,
            'qty_before': self.qty_before, 'qty_change': self.qty_change, 'qty_after': self.qty_after,
            'reason': self.reason, 'reference_id': self.reference_id, 'cashier_name': self.cashier_name,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


# ── Phase 17 Models ────────────────────────────────────────────────────────────

class StockMovement(db.Model):
    """Unified, immutable log of every stock level change."""
    __tablename__ = 'stock_movements'

    id             = db.Column(db.Integer, primary_key=True)
    product_id     = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    product_name   = db.Column(db.String(200))
    qty_before     = db.Column(db.Integer, nullable=False)
    qty_change     = db.Column(db.Integer, nullable=False)
    qty_after      = db.Column(db.Integer, nullable=False)
    # movement_type: sale | po_receipt | manual_add | manual_remove |
    #                damage | write_off | theft | count_correction | return
    movement_type  = db.Column(db.String(30), nullable=False, index=True)
    reference_type = db.Column(db.String(20))   # sale | po | adjustment | damage_report
    reference_id   = db.Column(db.String(50))   # receipt/PO/DMG number
    notes          = db.Column(db.Text)
    user_id        = db.Column(db.Integer, nullable=True)
    user_name      = db.Column(db.String(100))
    user_role      = db.Column(db.String(20))
    created_at     = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            'id': self.id, 'product_id': self.product_id, 'product_name': self.product_name,
            'qty_before': self.qty_before, 'qty_change': self.qty_change, 'qty_after': self.qty_after,
            'movement_type': self.movement_type,
            'reference_type': self.reference_type, 'reference_id': self.reference_id,
            'notes': self.notes,
            'user_name': self.user_name, 'user_role': self.user_role,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class GoodsReceivedNote(db.Model):
    __tablename__ = 'goods_received_notes'

    id                = db.Column(db.Integer, primary_key=True)
    grn_number        = db.Column(db.String(30), unique=True, index=True)
    po_id             = db.Column(db.Integer, db.ForeignKey('purchase_orders.id'), nullable=False)
    po_number         = db.Column(db.String(30))
    supplier_id       = db.Column(db.Integer, nullable=True)
    supplier_name     = db.Column(db.String(200))
    received_by_id    = db.Column(db.Integer, nullable=True)
    received_by_name  = db.Column(db.String(100))
    received_at       = db.Column(db.DateTime, default=datetime.utcnow)
    notes             = db.Column(db.Text)
    status            = db.Column(db.String(20), default='draft')  # draft | confirmed | signed_off
    signed_off_by_id  = db.Column(db.Integer, nullable=True)
    signed_off_by_name= db.Column(db.String(100))
    signed_off_at     = db.Column(db.DateTime)
    created_at        = db.Column(db.DateTime, default=datetime.utcnow)

    items = db.relationship('GRNItem', backref='grn', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id, 'grn_number': self.grn_number,
            'po_id': self.po_id, 'po_number': self.po_number,
            'supplier_id': self.supplier_id, 'supplier_name': self.supplier_name,
            'received_by_name': self.received_by_name,
            'received_at': self.received_at.isoformat() if self.received_at else None,
            'notes': self.notes, 'status': self.status,
            'signed_off_by_name': self.signed_off_by_name,
            'signed_off_at': self.signed_off_at.isoformat() if self.signed_off_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'items': [i.to_dict() for i in self.items],
        }


class GRNItem(db.Model):
    __tablename__ = 'grn_items'

    id           = db.Column(db.Integer, primary_key=True)
    grn_id       = db.Column(db.Integer, db.ForeignKey('goods_received_notes.id'), nullable=False)
    product_id   = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=True)
    product_name = db.Column(db.String(200))
    qty_ordered  = db.Column(db.Integer, default=0)
    qty_received = db.Column(db.Integer, default=0)
    unit_cost    = db.Column(db.Float, default=0.0)
    variance     = db.Column(db.Integer, default=0)  # qty_received - qty_ordered

    def to_dict(self):
        return {
            'id': self.id, 'product_id': self.product_id, 'product_name': self.product_name,
            'qty_ordered': self.qty_ordered, 'qty_received': self.qty_received,
            'unit_cost': self.unit_cost, 'variance': self.variance,
        }


class DamageReport(db.Model):
    __tablename__ = 'damage_reports'

    id               = db.Column(db.Integer, primary_key=True)
    report_number    = db.Column(db.String(30), unique=True, index=True)
    product_id       = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    product_name     = db.Column(db.String(200))
    qty              = db.Column(db.Integer, nullable=False)
    reason           = db.Column(db.String(200))
    details          = db.Column(db.Text)
    estimated_value  = db.Column(db.Float, default=0.0)
    status           = db.Column(db.String(20), default='raised')  # raised | pending_approval | approved | rejected
    raised_by_id     = db.Column(db.Integer, nullable=True)
    raised_by_name   = db.Column(db.String(100))
    raised_at        = db.Column(db.DateTime, default=datetime.utcnow)
    reviewed_by_id   = db.Column(db.Integer, nullable=True)
    reviewed_by_name = db.Column(db.String(100))
    reviewed_at      = db.Column(db.DateTime)
    review_notes     = db.Column(db.Text)
    stock_adjusted   = db.Column(db.Boolean, default=False)
    created_at       = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'report_number': self.report_number,
            'product_id': self.product_id, 'product_name': self.product_name,
            'qty': self.qty, 'reason': self.reason, 'details': self.details,
            'estimated_value': self.estimated_value, 'status': self.status,
            'raised_by_name': self.raised_by_name,
            'raised_at': self.raised_at.isoformat() if self.raised_at else None,
            'reviewed_by_name': self.reviewed_by_name,
            'reviewed_at': self.reviewed_at.isoformat() if self.reviewed_at else None,
            'review_notes': self.review_notes,
            'stock_adjusted': self.stock_adjusted,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


# ── Phase 3 Models ─────────────────────────────────────────────────────────────

class LoyaltyTier(db.Model):
    __tablename__ = 'loyalty_tiers'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    min_points = db.Column(db.Integer, default=0)
    discount_percent = db.Column(db.Float, default=0.0)
    points_multiplier = db.Column(db.Float, default=1.0)
    description = db.Column(db.String(200))
    color = db.Column(db.String(20), default='#888888')
    sort_order = db.Column(db.Integer, default=0)

    customers = db.relationship('Customer', backref='tier', lazy=True)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'min_points': self.min_points,
            'discount_percent': self.discount_percent, 'points_multiplier': self.points_multiplier,
            'description': self.description, 'color': self.color, 'sort_order': self.sort_order,
        }


class Customer(db.Model):
    __tablename__ = 'customers'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(30), unique=True, index=True)
    email = db.Column(db.String(100))
    member_id = db.Column(db.String(30), unique=True, index=True)
    date_of_birth = db.Column(db.Date)
    loyalty_points = db.Column(db.Integer, default=0)
    tier_id = db.Column(db.Integer, db.ForeignKey('loyalty_tiers.id'), nullable=True)
    total_spent = db.Column(db.Float, default=0.0)
    visit_count = db.Column(db.Integer, default=0)
    is_active = db.Column(db.Boolean, default=True)
    notes = db.Column(db.Text)
    # Phase 4 — salon preferences
    preferences = db.Column(db.Text)   # free-text notes (allergies, style prefs)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    # Phase 6 — cloud sync tracking
    cloud_synced_at = db.Column(db.DateTime, nullable=True)

    sales = db.relationship('Sale', backref='customer', lazy=True)
    loyalty_transactions = db.relationship('LoyaltyTransaction', backref='customer', lazy=True)
    appointments = db.relationship('Appointment', backref='client', lazy=True)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'phone': self.phone, 'email': self.email,
            'member_id': self.member_id,
            'date_of_birth': self.date_of_birth.isoformat() if self.date_of_birth else None,
            'loyalty_points': self.loyalty_points,
            'tier_id': self.tier_id,
            'tier_name': self.tier.name if self.tier else None,
            'tier_color': self.tier.color if self.tier else None,
            'tier_discount_percent': self.tier.discount_percent if self.tier else 0.0,
            'total_spent': self.total_spent, 'visit_count': self.visit_count,
            'is_active': self.is_active, 'notes': self.notes, 'preferences': self.preferences,
        }


class LoyaltyTransaction(db.Model):
    __tablename__ = 'loyalty_transactions'

    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=False)
    sale_id = db.Column(db.Integer, db.ForeignKey('sales.id'), nullable=True)
    type = db.Column(db.String(20), nullable=False)
    points = db.Column(db.Integer, nullable=False)
    balance_after = db.Column(db.Integer, nullable=False)
    notes = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'customer_id': self.customer_id, 'sale_id': self.sale_id,
            'type': self.type, 'points': self.points, 'balance_after': self.balance_after,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Terminal(db.Model):
    __tablename__ = 'terminals'

    id = db.Column(db.Integer, primary_key=True)
    terminal_id = db.Column(db.String(50), unique=True, nullable=False)
    name = db.Column(db.String(100))
    location = db.Column(db.String(100))
    ip_address = db.Column(db.String(45))
    last_seen = db.Column(db.DateTime)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'terminal_id': self.terminal_id, 'name': self.name,
            'location': self.location, 'ip_address': self.ip_address,
            'last_seen': self.last_seen.isoformat() if self.last_seen else None,
            'is_active': self.is_active,
        }


class VoidLog(db.Model):
    __tablename__ = 'void_logs'

    id = db.Column(db.Integer, primary_key=True)
    type = db.Column(db.String(20), nullable=False)
    sale_id = db.Column(db.Integer, db.ForeignKey('sales.id'), nullable=True)
    receipt_number = db.Column(db.String(30))
    terminal_id = db.Column(db.String(50))
    cashier_name = db.Column(db.String(100))
    manager_name = db.Column(db.String(100))
    reason = db.Column(db.String(200))
    amount = db.Column(db.Float)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'type': self.type, 'sale_id': self.sale_id,
            'receipt_number': self.receipt_number, 'terminal_id': self.terminal_id,
            'cashier_name': self.cashier_name, 'manager_name': self.manager_name,
            'reason': self.reason, 'amount': self.amount,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


# ── Phase 5 Models ─────────────────────────────────────────────────────────────

class Store(db.Model):
    """Store / location configuration — one row per installation."""
    __tablename__ = 'stores'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), default='My Store')
    address = db.Column(db.Text)
    phone = db.Column(db.String(30))
    email = db.Column(db.String(100))
    currency = db.Column(db.String(10), default='USD')
    timezone = db.Column(db.String(50), default='UTC')
    tax_number = db.Column(db.String(50))
    receipt_header = db.Column(db.Text)   # custom text above items
    receipt_footer = db.Column(db.Text)   # custom text below totals
    returns_approval_threshold = db.Column(db.Float, default=5000.0)  # refunds above this need manager OK
    default_tax_rate = db.Column(db.Float, default=0.16)              # 16% Kenya standard VAT
    default_low_stock_threshold = db.Column(db.Integer, default=5)    # global low-stock alert level
    session_timeout_minutes = db.Column(db.Integer, default=10)       # idle timeout before lock screen
    notification_config = db.Column(db.Text, nullable=True)           # JSON blob — AT + SMTP + event toggles
    etims_config        = db.Column(db.Text, nullable=True)           # JSON blob — KRA eTIMS credentials/settings
    sheets_config       = db.Column(db.Text, nullable=True)           # JSON blob — Google Sheets export settings
    printer_config      = db.Column(db.Text, nullable=True)           # JSON blob — ESC/POS printer connection settings
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        import json as _json
        notif = {}
        try: notif = _json.loads(self.notification_config) if self.notification_config else {}
        except: pass
        etims = {}
        try: etims = _json.loads(self.etims_config) if self.etims_config else {}
        except: pass
        sheets = {}
        try: sheets = _json.loads(self.sheets_config) if self.sheets_config else {}
        except: pass
        printer = {}
        try: printer = _json.loads(self.printer_config) if self.printer_config else {}
        except: pass
        return {
            'id': self.id, 'name': self.name, 'address': self.address,
            'phone': self.phone, 'email': self.email, 'currency': self.currency,
            'timezone': self.timezone, 'tax_number': self.tax_number,
            'receipt_header': self.receipt_header, 'receipt_footer': self.receipt_footer,
            'returns_approval_threshold': self.returns_approval_threshold or 5000.0,
            'default_tax_rate': self.default_tax_rate if self.default_tax_rate is not None else 0.16,
            'default_low_stock_threshold': self.default_low_stock_threshold or 5,
            'session_timeout_minutes': self.session_timeout_minutes or 10,
            'notification_config': notif,
            'etims_config': etims,
            'sheets_config': sheets,
            'printer_config': printer,
        }


class Notification(db.Model):
    """Log of every notification sent (or attempted) by the system."""
    __tablename__ = 'notifications'

    id            = db.Column(db.Integer, primary_key=True)
    event_type    = db.Column(db.String(50), nullable=False)   # reorder_alert, daily_summary, etc.
    channel       = db.Column(db.String(10), nullable=False)   # sms | email
    recipient     = db.Column(db.String(200))                  # phone number or email address
    recipient_name = db.Column(db.String(100))
    message       = db.Column(db.Text)
    status        = db.Column(db.String(20), default='pending')  # sent | failed | pending
    error         = db.Column(db.Text)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'event_type': self.event_type, 'channel': self.channel,
            'recipient': self.recipient, 'recipient_name': self.recipient_name,
            'message': self.message, 'status': self.status, 'error': self.error,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class SyncLog(db.Model):
    """One row per sync run — tracks what was pushed to cloud."""
    __tablename__ = 'sync_logs'

    id = db.Column(db.Integer, primary_key=True)
    sales_synced = db.Column(db.Integer, default=0)
    customers_synced = db.Column(db.Integer, default=0)
    inventory_synced = db.Column(db.Integer, default=0)
    status = db.Column(db.String(20), default='success')   # success | error
    error_message = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'sales_synced': self.sales_synced,
            'customers_synced': self.customers_synced,
            'inventory_synced': self.inventory_synced,
            'status': self.status,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


# ── Phase 7 Models ─────────────────────────────────────────────────────────────

class CustomerAccount(db.Model):
    """
    Prepaid deposit account for a customer (common in Kenyan hardware stores).
    Customer deposits a lump sum in advance; items are charged against the balance.
    Balance can go negative (debt) up to credit_limit.
    """
    __tablename__ = 'customer_accounts'

    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customers.id'), unique=True, nullable=True)
    customer_name = db.Column(db.String(100), nullable=False)
    customer_phone = db.Column(db.String(30))
    balance = db.Column(db.Float, default=0.0)          # positive = credit, negative = owes
    total_deposited = db.Column(db.Float, default=0.0)
    total_charged = db.Column(db.Float, default=0.0)
    credit_limit = db.Column(db.Float, default=0.0)     # max allowed negative balance (0 = no credit line)
    is_active = db.Column(db.Boolean, default=True)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    transactions = db.relationship('AccountTransaction', backref='account', lazy=True,
                                   cascade='all, delete-orphan', order_by='AccountTransaction.created_at')
    sales = db.relationship('Sale', backref='account', lazy=True, foreign_keys='Sale.account_id')

    def to_dict(self, include_transactions=False):
        d = {
            'id': self.id,
            'customer_id': self.customer_id,
            'customer_name': self.customer_name,
            'customer_phone': self.customer_phone,
            'balance': round(self.balance, 2),
            'total_deposited': round(self.total_deposited, 2),
            'total_charged': round(self.total_charged, 2),
            'credit_limit': round(self.credit_limit, 2),
            'is_active': self.is_active,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_transactions:
            d['transactions'] = [t.to_dict() for t in self.transactions]
        return d


class AccountTransaction(db.Model):
    """Every credit or debit on a customer account."""
    __tablename__ = 'account_transactions'

    id = db.Column(db.Integer, primary_key=True)
    account_id = db.Column(db.Integer, db.ForeignKey('customer_accounts.id'), nullable=False)
    type = db.Column(db.String(20), nullable=False)   # deposit | charge | refund | adjustment
    amount = db.Column(db.Float, nullable=False)       # positive = money in, negative = money out
    balance_after = db.Column(db.Float, nullable=False)
    sale_id = db.Column(db.Integer, db.ForeignKey('sales.id'), nullable=True)
    receipt_number = db.Column(db.String(30))          # DEP-YYYYMMDD-XXXX for deposits
    payment_method = db.Column(db.String(20))          # cash | mpesa | card (for deposits)
    mpesa_ref = db.Column(db.String(50))               # M-Pesa confirmation code
    cashier_name = db.Column(db.String(100))
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'account_id': self.account_id,
            'type': self.type,
            'amount': round(self.amount, 2),
            'balance_after': round(self.balance_after, 2),
            'sale_id': self.sale_id,
            'receipt_number': self.receipt_number,
            'payment_method': self.payment_method,
            'mpesa_ref': self.mpesa_ref,
            'cashier_name': self.cashier_name,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


# ── Phase 4 Models ─────────────────────────────────────────────────────────────

class ServiceCategory(db.Model):
    """Salon service categories (Hair, Nails, Wax, Facial, etc.)"""
    __tablename__ = 'service_categories'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    color = db.Column(db.String(20), default='#4f6ef7')  # calendar color
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    services = db.relationship('Service', backref='service_category', lazy=True)

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'color': self.color}


class Service(db.Model):
    """Salon service — haircut, colour, manicure, etc."""
    __tablename__ = 'services'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    price = db.Column(db.Float, nullable=False)
    duration_minutes = db.Column(db.Integer, default=60)
    category_id = db.Column(db.Integer, db.ForeignKey('service_categories.id'), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    appointment_services = db.relationship('AppointmentService', backref='service', lazy=True)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'description': self.description,
            'price': self.price, 'duration_minutes': self.duration_minutes,
            'category_id': self.category_id,
            'category_name': self.service_category.name if self.service_category else None,
            'category_color': self.service_category.color if self.service_category else '#4f6ef7',
            'is_active': self.is_active,
        }


class Appointment(db.Model):
    """Salon appointment — links client, staff, services, and eventually a sale."""
    __tablename__ = 'appointments'

    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=True)
    client_name = db.Column(db.String(100))    # denormalized for walk-ins
    client_phone = db.Column(db.String(30))
    staff_id = db.Column(db.Integer, db.ForeignKey('staff.id'), nullable=True)
    staff_name = db.Column(db.String(100))
    start_time = db.Column(db.DateTime, nullable=False)
    end_time = db.Column(db.DateTime, nullable=False)
    status = db.Column(db.String(20), default='scheduled')
    # scheduled / confirmed / checked_in / in_progress / completed / cancelled / no_show
    notes = db.Column(db.Text)
    total_price = db.Column(db.Float, default=0.0)
    sale_id = db.Column(db.Integer, db.ForeignKey('sales.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    services = db.relationship('AppointmentService', backref='appointment', lazy=True,
                               cascade='all, delete-orphan')
    sale = db.relationship('Sale', foreign_keys=[sale_id], backref='appointment_ref', lazy=True)

    def to_dict(self):
        return {
            'id': self.id, 'client_id': self.client_id, 'client_name': self.client_name,
            'client_phone': self.client_phone, 'staff_id': self.staff_id,
            'staff_name': self.staff_name,
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'end_time': self.end_time.isoformat() if self.end_time else None,
            'status': self.status, 'notes': self.notes, 'total_price': self.total_price,
            'sale_id': self.sale_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'services': [s.to_dict() for s in self.services],
        }


class AppointmentService(db.Model):
    """Services booked within a single appointment."""
    __tablename__ = 'appointment_services'

    id = db.Column(db.Integer, primary_key=True)
    appointment_id = db.Column(db.Integer, db.ForeignKey('appointments.id'), nullable=False)
    service_id = db.Column(db.Integer, db.ForeignKey('services.id'), nullable=True)
    service_name = db.Column(db.String(200))   # denormalized
    staff_id = db.Column(db.Integer, db.ForeignKey('staff.id'), nullable=True)
    staff_name = db.Column(db.String(100))
    price = db.Column(db.Float, nullable=False)
    duration_minutes = db.Column(db.Integer, default=60)

    def to_dict(self):
        return {
            'id': self.id, 'service_id': self.service_id, 'service_name': self.service_name,
            'staff_id': self.staff_id, 'staff_name': self.staff_name,
            'price': self.price, 'duration_minutes': self.duration_minutes,
        }


# ── Phase 8 Models ─────────────────────────────────────────────────────────────

class Quote(db.Model):
    """
    Proforma invoice / quotation for a hardware store customer.
    Can be converted to a sale in one click.
    """
    __tablename__ = 'quotes'

    id = db.Column(db.Integer, primary_key=True)
    quote_number = db.Column(db.String(30), unique=True, index=True)  # QUO-YYYYMMDD-XXXX
    customer_id = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=True)
    customer_name = db.Column(db.String(100))
    customer_phone = db.Column(db.String(30))
    account_id = db.Column(db.Integer, db.ForeignKey('customer_accounts.id'), nullable=True)

    status = db.Column(db.String(20), default='draft')
    # draft | sent | accepted | converted | expired

    subtotal = db.Column(db.Float, default=0.0)
    tax_amount = db.Column(db.Float, default=0.0)
    discount_total = db.Column(db.Float, default=0.0)
    total = db.Column(db.Float, default=0.0)

    notes = db.Column(db.Text)
    valid_until = db.Column(db.DateTime, nullable=True)
    cashier_name = db.Column(db.String(100))

    # Filled when converted to a sale
    sale_id = db.Column(db.Integer, db.ForeignKey('sales.id'), nullable=True)
    converted_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    items = db.relationship('QuoteItem', backref='quote', lazy=True, cascade='all, delete-orphan')

    def to_dict(self, include_items=True):
        d = {
            'id': self.id,
            'quote_number': self.quote_number,
            'customer_id': self.customer_id,
            'customer_name': self.customer_name,
            'customer_phone': self.customer_phone,
            'account_id': self.account_id,
            'status': self.status,
            'subtotal': round(self.subtotal, 2),
            'tax_amount': round(self.tax_amount, 2),
            'discount_total': round(self.discount_total, 2),
            'total': round(self.total, 2),
            'notes': self.notes,
            'cashier_name': self.cashier_name,
            'valid_until': self.valid_until.isoformat() if self.valid_until else None,
            'sale_id': self.sale_id,
            'converted_at': self.converted_at.isoformat() if self.converted_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_items:
            d['items'] = [i.to_dict() for i in self.items]
        return d


class QuoteItem(db.Model):
    __tablename__ = 'quote_items'

    id = db.Column(db.Integer, primary_key=True)
    quote_id = db.Column(db.Integer, db.ForeignKey('quotes.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=True)
    product_name = db.Column(db.String(200), nullable=False)
    unit_price = db.Column(db.Float, nullable=False)
    qty = db.Column(db.Integer, nullable=False, default=1)
    discount = db.Column(db.Float, default=0.0)
    tax_rate = db.Column(db.Float, default=0.0)
    line_total = db.Column(db.Float, nullable=False)
    notes = db.Column(db.String(200))

    def to_dict(self):
        return {
            'id': self.id,
            'product_id': self.product_id,
            'product_name': self.product_name,
            'unit_price': self.unit_price,
            'qty': self.qty,
            'discount': self.discount,
            'tax_rate': self.tax_rate,
            'line_total': round(self.line_total, 2),
            'notes': self.notes,
        }


# ── Phase 9 Models ─────────────────────────────────────────────────────────────

class PurchaserLimit(db.Model):
    """
    Per-purchaser spending limits set by manager/admin.
    When a PO exceeds these limits it is saved with status='pending_approval'
    and lands in the manager approval queue — no card scan at the counter.
    """
    __tablename__ = 'purchaser_limits'

    id = db.Column(db.Integer, primary_key=True)
    staff_id = db.Column(db.Integer, db.ForeignKey('staff.id'), unique=True, nullable=False)
    staff_name = db.Column(db.String(100))
    max_po_value = db.Column(db.Float, nullable=True)      # max single PO total (None = unlimited)
    max_daily_total = db.Column(db.Float, nullable=True)   # max sum of POs in one calendar day
    allowed_supplier_ids = db.Column(db.Text, nullable=True)   # JSON list of ints; None = all
    allowed_category_ids = db.Column(db.Text, nullable=True)   # JSON list of ints; None = all
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    staff = db.relationship('Staff', backref=db.backref('purchaser_limit', uselist=False), lazy=True)

    def to_dict(self):
        import json
        return {
            'id': self.id,
            'staff_id': self.staff_id,
            'staff_name': self.staff_name,
            'max_po_value': self.max_po_value,
            'max_daily_total': self.max_daily_total,
            'allowed_supplier_ids': json.loads(self.allowed_supplier_ids) if self.allowed_supplier_ids else None,
            'allowed_category_ids': json.loads(self.allowed_category_ids) if self.allowed_category_ids else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


# ── Phase 14 Models ─────────────────────────────────────────────────────────────

class ShiftReport(db.Model):
    """
    Immutable end-of-shift report snapshot. Generated automatically when a shift
    is closed. Must be printed and filed before the next shift can open.
    """
    __tablename__ = 'shift_reports'

    id = db.Column(db.Integer, primary_key=True)
    report_number  = db.Column(db.String(30), unique=True, index=True)  # RPT-YYYYMMDD-XXXX
    type           = db.Column(db.String(30), default='SHIFT_DAILY')    # SHIFT_DAILY | INVENTORY | WEEKLY_SUMMARY
    shift_id       = db.Column(db.Integer, db.ForeignKey('shifts.id'), nullable=True)
    period_start   = db.Column(db.DateTime, nullable=True)
    period_end     = db.Column(db.DateTime, nullable=True)
    generated_by_id   = db.Column(db.Integer, nullable=True)
    generated_by_name = db.Column(db.String(100))
    generated_by_role = db.Column(db.String(20))
    # Status lifecycle: GENERATED → PRINTED → FILED
    status         = db.Column(db.String(20), default='GENERATED')
    # Immutable JSON snapshot captured at generation time — never updated after creation
    content        = db.Column(db.Text, nullable=False)
    print_count    = db.Column(db.Integer, default=0)
    printed_at     = db.Column(db.DateTime, nullable=True)
    filed_by_id    = db.Column(db.Integer, nullable=True)
    filed_by_name  = db.Column(db.String(100))
    filed_at       = db.Column(db.DateTime, nullable=True)
    signed_note    = db.Column(db.Text)
    # Phase 39
    closed_without_print = db.Column(db.Boolean, default=False)
    has_discrepancy      = db.Column(db.Boolean, default=False)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)

    print_events = db.relationship('ReportPrintEvent', backref='report', lazy=True,
                                   cascade='all, delete-orphan')

    def to_dict(self):
        import json
        return {
            'id': self.id,
            'report_number': self.report_number,
            'type': self.type,
            'shift_id': self.shift_id,
            'period_start': self.period_start.isoformat() if self.period_start else None,
            'period_end': self.period_end.isoformat() if self.period_end else None,
            'generated_by_id': self.generated_by_id,
            'generated_by_name': self.generated_by_name,
            'generated_by_role': self.generated_by_role,
            'status': self.status,
            'content': json.loads(self.content) if self.content else {},
            'print_count': self.print_count,
            'printed_at': self.printed_at.isoformat() if self.printed_at else None,
            'filed_by_name': self.filed_by_name,
            'filed_at': self.filed_at.isoformat() if self.filed_at else None,
            'signed_note': self.signed_note,
            'closed_without_print': self.closed_without_print,
            'has_discrepancy': self.has_discrepancy,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class ReportPrintEvent(db.Model):
    """Every time a ShiftReport is printed — tracks who printed and copy number."""
    __tablename__ = 'report_print_events'

    id             = db.Column(db.Integer, primary_key=True)
    report_id      = db.Column(db.Integer, db.ForeignKey('shift_reports.id'), nullable=False)
    printed_by_id  = db.Column(db.Integer, nullable=True)
    printed_by_name = db.Column(db.String(100))
    printed_by_role = db.Column(db.String(20))
    printed_at     = db.Column(db.DateTime, default=datetime.utcnow)
    copy_number    = db.Column(db.Integer, default=1)

    def to_dict(self):
        return {
            'id': self.id,
            'report_id': self.report_id,
            'printed_by_name': self.printed_by_name,
            'printed_by_role': self.printed_by_role,
            'printed_at': self.printed_at.isoformat() if self.printed_at else None,
            'copy_number': self.copy_number,
        }


# ── Phase 19 Models ─────────────────────────────────────────────────────────────

class Invoice(db.Model):
    """
    KRA-compliant A4 tax invoice — one per sale (created on demand).
    Sequential numbering: INV-YYYY-NNNN.
    """
    __tablename__ = 'invoices'

    id             = db.Column(db.Integer, primary_key=True)
    invoice_number = db.Column(db.String(30), unique=True, index=True)
    sale_id        = db.Column(db.Integer, db.ForeignKey('sales.id'), nullable=False)
    receipt_number = db.Column(db.String(30))       # denormalised for easy lookup

    # Buyer details (B2B optional)
    customer_id    = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=True)
    customer_name  = db.Column(db.String(150))
    customer_pin   = db.Column(db.String(30))       # KRA PIN of buyer if B2B
    customer_address = db.Column(db.Text)

    # Financials (denormalised snapshot from sale)
    subtotal       = db.Column(db.Float, nullable=False)
    discount_total = db.Column(db.Float, default=0.0)
    tax_amount     = db.Column(db.Float, default=0.0)
    total          = db.Column(db.Float, nullable=False)

    # Terms
    payment_terms  = db.Column(db.String(50), default='Cash on delivery')
    due_date       = db.Column(db.Date, nullable=True)
    notes          = db.Column(db.Text)

    # Status: draft | issued | voided
    status         = db.Column(db.String(20), default='issued')

    # Issued by
    issued_by_id   = db.Column(db.Integer, nullable=True)
    issued_by_name = db.Column(db.String(100))

    # Items snapshot (JSON) — copied from SaleItems at invoice creation time
    items_json     = db.Column(db.Text)   # list of {product_name, qty, unit_price, discount, tax_rate, line_total}

    created_at     = db.Column(db.DateTime, default=datetime.utcnow)

    # KRA eTIMS fields
    etims_status           = db.Column(db.String(20), nullable=True)   # pending | submitted | error | not_configured
    etims_cu_invoice_number = db.Column(db.String(50), nullable=True)  # KRA-assigned CU invoice number
    etims_qr_code          = db.Column(db.Text, nullable=True)         # QR data string from KRA
    etims_submitted_at     = db.Column(db.DateTime, nullable=True)
    etims_error            = db.Column(db.Text, nullable=True)

    credit_notes   = db.relationship('CreditNote', backref='invoice', lazy=True)

    def to_dict(self):
        import json
        return {
            'id': self.id,
            'invoice_number': self.invoice_number,
            'sale_id': self.sale_id,
            'receipt_number': self.receipt_number,
            'customer_id': self.customer_id,
            'customer_name': self.customer_name,
            'customer_pin': self.customer_pin,
            'customer_address': self.customer_address,
            'subtotal': self.subtotal,
            'discount_total': self.discount_total,
            'tax_amount': self.tax_amount,
            'total': self.total,
            'payment_terms': self.payment_terms,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'notes': self.notes,
            'status': self.status,
            'issued_by_name': self.issued_by_name,
            'items': json.loads(self.items_json) if self.items_json else [],
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'etims_status': self.etims_status,
            'etims_cu_invoice_number': self.etims_cu_invoice_number,
            'etims_qr_code': self.etims_qr_code,
            'etims_submitted_at': self.etims_submitted_at.isoformat() if self.etims_submitted_at else None,
            'etims_error': self.etims_error,
        }


class CreditNote(db.Model):
    """
    Issued when goods from an invoiced sale are returned.
    Links back to the original invoice. Sequential: CN-YYYY-NNNN.
    """
    __tablename__ = 'credit_notes'

    id                  = db.Column(db.Integer, primary_key=True)
    credit_note_number  = db.Column(db.String(30), unique=True, index=True)
    invoice_id          = db.Column(db.Integer, db.ForeignKey('invoices.id'), nullable=True)
    invoice_number      = db.Column(db.String(30))      # denormalised
    return_id           = db.Column(db.Integer, db.ForeignKey('returns.id'), nullable=True)
    return_number       = db.Column(db.String(30))      # denormalised
    original_sale_id    = db.Column(db.Integer, db.ForeignKey('sales.id'), nullable=True)
    original_receipt    = db.Column(db.String(30))

    customer_id         = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=True)
    customer_name       = db.Column(db.String(150))

    reason              = db.Column(db.String(200))
    items_json          = db.Column(db.Text)   # list of {product_name, qty, unit_price, line_refund}
    total_credit        = db.Column(db.Float, nullable=False)
    refund_method       = db.Column(db.String(20))  # cash | card | store_credit

    issued_by_id        = db.Column(db.Integer, nullable=True)
    issued_by_name      = db.Column(db.String(100))
    created_at          = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        import json
        return {
            'id': self.id,
            'credit_note_number': self.credit_note_number,
            'invoice_id': self.invoice_id,
            'invoice_number': self.invoice_number,
            'return_id': self.return_id,
            'return_number': self.return_number,
            'original_sale_id': self.original_sale_id,
            'original_receipt': self.original_receipt,
            'customer_id': self.customer_id,
            'customer_name': self.customer_name,
            'reason': self.reason,
            'items': json.loads(self.items_json) if self.items_json else [],
            'total_credit': self.total_credit,
            'refund_method': self.refund_method,
            'issued_by_name': self.issued_by_name,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

