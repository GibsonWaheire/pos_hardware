from db import db
from datetime import datetime


# ── Phase 1 Models ─────────────────────────────────────────────────────────────

class Category(db.Model):
    __tablename__ = 'categories'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    tax_class = db.Column(db.String(20), default='standard')  # standard / reduced / exempt
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    products = db.relationship('Product', backref='category_obj', lazy=True)

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'tax_class': self.tax_class}


class Product(db.Model):
    __tablename__ = 'products'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    barcode = db.Column(db.String(50), unique=True, index=True)

    # Phase 3 — PLU code (produce, weight-based items without barcodes)
    plu_code = db.Column(db.String(20), unique=True, index=True)

    price = db.Column(db.Float, nullable=False)
    tax_class = db.Column(db.String(20), default='standard')
    tax_rate = db.Column(db.Float, default=0.0)

    # Phase 3 — Weight-based pricing (price per kg/lb)
    is_weight_based = db.Column(db.Boolean, default=False)
    weight_unit = db.Column(db.String(10), default='kg')  # kg | lb | g

    # Phase 3 — Age restriction
    age_restricted = db.Column(db.Boolean, default=False)
    age_restriction_type = db.Column(db.String(20))  # alcohol | tobacco | other
    min_age = db.Column(db.Integer, default=18)

    stock_qty = db.Column(db.Integer, default=0)
    low_stock_threshold = db.Column(db.Integer, default=5)
    category_id = db.Column(db.Integer, db.ForeignKey('categories.id'), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    sale_items = db.relationship('SaleItem', backref='product', lazy=True)
    stock_adjustments = db.relationship('StockAdjustment', backref='product', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'barcode': self.barcode,
            'plu_code': self.plu_code,
            'price': self.price,
            'tax_class': self.tax_class,
            'tax_rate': self.tax_rate,
            'is_weight_based': self.is_weight_based,
            'weight_unit': self.weight_unit,
            'age_restricted': self.age_restricted,
            'age_restriction_type': self.age_restriction_type,
            'min_age': self.min_age,
            'stock_qty': self.stock_qty,
            'low_stock_threshold': self.low_stock_threshold,
            'category_id': self.category_id,
            'category_name': self.category_obj.name if self.category_obj else None,
            'is_active': self.is_active,
        }


class Staff(db.Model):
    __tablename__ = 'staff'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    pin = db.Column(db.String(10))
    role = db.Column(db.String(20), default='cashier')  # admin / cashier / manager
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    shifts = db.relationship('Shift', backref='cashier', lazy=True)

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'role': self.role, 'is_active': self.is_active}


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

    # Phase 3 — Customer / loyalty
    customer_id = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=True)
    customer_name = db.Column(db.String(100))
    loyalty_points_earned = db.Column(db.Integer, default=0)
    loyalty_points_redeemed = db.Column(db.Integer, default=0)
    loyalty_discount = db.Column(db.Float, default=0.0)

    # Phase 3 — Terminal (multi-lane)
    terminal_id = db.Column(db.String(50))

    # Phase 3 — Age verification
    age_verified = db.Column(db.Boolean, default=False)

    status = db.Column(db.String(20), default='completed')
    offline_id = db.Column(db.String(50), unique=True, nullable=True)
    stripe_payment_intent_id = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    items = db.relationship('SaleItem', backref='sale', lazy=True, cascade='all, delete-orphan')
    returns = db.relationship('Return', backref='original_sale', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'receipt_number': self.receipt_number,
            'subtotal': self.subtotal,
            'tax_amount': self.tax_amount,
            'discount_total': self.discount_total,
            'total': self.total,
            'payment_method': self.payment_method,
            'cash_tendered': self.cash_tendered,
            'change_given': self.change_given,
            'card_amount': self.card_amount,
            'cashier_name': self.cashier_name,
            'shift_id': self.shift_id,
            'customer_id': self.customer_id,
            'customer_name': self.customer_name,
            'loyalty_points_earned': self.loyalty_points_earned,
            'loyalty_points_redeemed': self.loyalty_points_redeemed,
            'loyalty_discount': self.loyalty_discount,
            'terminal_id': self.terminal_id,
            'age_verified': self.age_verified,
            'status': self.status,
            'offline_id': self.offline_id,
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
    weight = db.Column(db.Float)          # for weight-based items (kg/lb)
    discount = db.Column(db.Float, default=0.0)
    tax_rate = db.Column(db.Float, default=0.0)
    line_total = db.Column(db.Float, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'product_id': self.product_id,
            'product_name': self.product_name,
            'unit_price': self.unit_price,
            'qty': self.qty,
            'weight': self.weight,
            'discount': self.discount,
            'tax_rate': self.tax_rate,
            'line_total': self.line_total,
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
            'id': self.id,
            'offline_id': self.offline_id,
            'status': self.status,
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
    notes = db.Column(db.Text)
    total_cost = db.Column(db.Float, default=0.0)
    created_by = db.Column(db.String(100))
    ordered_at = db.Column(db.DateTime)
    received_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    items = db.relationship('PurchaseOrderItem', backref='purchase_order', lazy=True,
                            cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id, 'po_number': self.po_number, 'supplier_id': self.supplier_id,
            'supplier_name': self.supplier_name, 'status': self.status, 'notes': self.notes,
            'total_cost': self.total_cost, 'created_by': self.created_by,
            'ordered_at': self.ordered_at.isoformat() if self.ordered_at else None,
            'received_at': self.received_at.isoformat() if self.received_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
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
    status = db.Column(db.String(20), default='completed')
    notes = db.Column(db.Text)
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
    cashier_id = db.Column(db.Integer, db.ForeignKey('staff.id'), nullable=True)
    cashier_name = db.Column(db.String(100))
    status = db.Column(db.String(20), default='open')
    opening_float = db.Column(db.Float, default=0.0)
    closing_float = db.Column(db.Float)
    expected_cash = db.Column(db.Float)
    variance = db.Column(db.Float)
    opened_at = db.Column(db.DateTime, default=datetime.utcnow)
    closed_at = db.Column(db.DateTime)
    notes = db.Column(db.Text)

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


# ── Phase 3 Models ─────────────────────────────────────────────────────────────

class LoyaltyTier(db.Model):
    """Member pricing tiers — Bronze / Silver / Gold etc."""
    __tablename__ = 'loyalty_tiers'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)           # Bronze / Silver / Gold
    min_points = db.Column(db.Integer, default=0)             # points needed to reach this tier
    discount_percent = db.Column(db.Float, default=0.0)       # auto discount at checkout
    points_multiplier = db.Column(db.Float, default=1.0)      # earn rate multiplier
    description = db.Column(db.String(200))
    color = db.Column(db.String(20), default='#888888')       # UI badge color
    sort_order = db.Column(db.Integer, default=0)

    customers = db.relationship('Customer', backref='tier', lazy=True)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'min_points': self.min_points,
            'discount_percent': self.discount_percent, 'points_multiplier': self.points_multiplier,
            'description': self.description, 'color': self.color, 'sort_order': self.sort_order,
        }


class Customer(db.Model):
    """Loyalty / member customer record."""
    __tablename__ = 'customers'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(30), unique=True, index=True)
    email = db.Column(db.String(100))
    member_id = db.Column(db.String(30), unique=True, index=True)  # loyalty card number
    date_of_birth = db.Column(db.Date)                             # for age verification
    loyalty_points = db.Column(db.Integer, default=0)
    tier_id = db.Column(db.Integer, db.ForeignKey('loyalty_tiers.id'), nullable=True)
    total_spent = db.Column(db.Float, default=0.0)
    visit_count = db.Column(db.Integer, default=0)
    is_active = db.Column(db.Boolean, default=True)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    sales = db.relationship('Sale', backref='customer', lazy=True)
    loyalty_transactions = db.relationship('LoyaltyTransaction', backref='customer', lazy=True)

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
            'total_spent': self.total_spent,
            'visit_count': self.visit_count,
            'is_active': self.is_active,
            'notes': self.notes,
        }


class LoyaltyTransaction(db.Model):
    """Points earn / redeem log."""
    __tablename__ = 'loyalty_transactions'

    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=False)
    sale_id = db.Column(db.Integer, db.ForeignKey('sales.id'), nullable=True)
    type = db.Column(db.String(20), nullable=False)   # earn | redeem | manual_add | manual_remove | expire
    points = db.Column(db.Integer, nullable=False)    # positive = earn, negative = redeem/remove
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
    """Multi-lane POS terminal registration."""
    __tablename__ = 'terminals'

    id = db.Column(db.Integer, primary_key=True)
    terminal_id = db.Column(db.String(50), unique=True, nullable=False)  # e.g. "LANE-1"
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
    """Audit log for void transactions and no-sale drawer opens."""
    __tablename__ = 'void_logs'

    id = db.Column(db.Integer, primary_key=True)
    type = db.Column(db.String(20), nullable=False)  # void_sale | no_sale | price_override
    sale_id = db.Column(db.Integer, db.ForeignKey('sales.id'), nullable=True)
    receipt_number = db.Column(db.String(30))
    terminal_id = db.Column(db.String(50))
    cashier_name = db.Column(db.String(100))
    manager_name = db.Column(db.String(100))
    reason = db.Column(db.String(200))
    amount = db.Column(db.Float)     # sale total for context
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'type': self.type, 'sale_id': self.sale_id,
            'receipt_number': self.receipt_number, 'terminal_id': self.terminal_id,
            'cashier_name': self.cashier_name, 'manager_name': self.manager_name,
            'reason': self.reason, 'amount': self.amount,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
