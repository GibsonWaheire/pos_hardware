from db import db
from datetime import datetime


class Category(db.Model):
    __tablename__ = 'categories'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    tax_class = db.Column(db.String(20), default='standard')  # standard / reduced / exempt
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    products = db.relationship('Product', backref='category_obj', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'tax_class': self.tax_class,
        }


class Product(db.Model):
    __tablename__ = 'products'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    barcode = db.Column(db.String(50), unique=True, index=True)
    price = db.Column(db.Float, nullable=False)
    tax_class = db.Column(db.String(20), default='standard')  # standard / reduced / exempt
    tax_rate = db.Column(db.Float, default=0.0)  # e.g. 0.16 = 16%
    stock_qty = db.Column(db.Integer, default=0)
    low_stock_threshold = db.Column(db.Integer, default=5)
    category_id = db.Column(db.Integer, db.ForeignKey('categories.id'), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    sale_items = db.relationship('SaleItem', backref='product', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'barcode': self.barcode,
            'price': self.price,
            'tax_class': self.tax_class,
            'tax_rate': self.tax_rate,
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
    pin = db.Column(db.String(10))   # 4-digit PIN for quick terminal login
    role = db.Column(db.String(20), default='cashier')  # admin / cashier
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'role': self.role,
            'is_active': self.is_active,
        }


class Sale(db.Model):
    __tablename__ = 'sales'

    id = db.Column(db.Integer, primary_key=True)
    receipt_number = db.Column(db.String(30), unique=True, index=True)
    subtotal = db.Column(db.Float, nullable=False)
    tax_amount = db.Column(db.Float, default=0.0)
    discount_total = db.Column(db.Float, default=0.0)
    total = db.Column(db.Float, nullable=False)
    payment_method = db.Column(db.String(20), nullable=False)  # cash / card / split
    cash_tendered = db.Column(db.Float)
    change_given = db.Column(db.Float, default=0.0)
    card_amount = db.Column(db.Float, default=0.0)   # for split payments
    cashier_id = db.Column(db.Integer, db.ForeignKey('staff.id'), nullable=True)
    cashier_name = db.Column(db.String(100))
    status = db.Column(db.String(20), default='completed')  # completed / voided / refunded
    offline_id = db.Column(db.String(50), unique=True, nullable=True)  # UUID from offline client
    stripe_payment_intent_id = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    items = db.relationship('SaleItem', backref='sale', lazy=True, cascade='all, delete-orphan')

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
    product_name = db.Column(db.String(200), nullable=False)  # denormalized
    unit_price = db.Column(db.Float, nullable=False)
    qty = db.Column(db.Integer, nullable=False, default=1)
    discount = db.Column(db.Float, default=0.0)   # per-item discount amount
    tax_rate = db.Column(db.Float, default=0.0)
    line_total = db.Column(db.Float, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'product_id': self.product_id,
            'product_name': self.product_name,
            'unit_price': self.unit_price,
            'qty': self.qty,
            'discount': self.discount,
            'tax_rate': self.tax_rate,
            'line_total': self.line_total,
        }


class OfflineQueue(db.Model):
    """Stores sales created while offline for later cloud sync."""
    __tablename__ = 'offline_queue'

    id = db.Column(db.Integer, primary_key=True)
    offline_id = db.Column(db.String(50), unique=True, nullable=False)
    payload = db.Column(db.Text, nullable=False)  # JSON sale payload
    status = db.Column(db.String(20), default='pending')  # pending / synced / failed
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
