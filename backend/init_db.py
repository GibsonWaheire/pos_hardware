"""Initialize the local SQLite database and seed default data."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app import app
from db import db
from models import Category, Product, Staff


def _add_column_if_missing(conn, table, column, definition):
    """SQLite-safe ALTER TABLE ADD COLUMN — silently skips if column exists."""
    try:
        conn.execute(f'ALTER TABLE {table} ADD COLUMN {column} {definition}')
        print(f"  Added column {table}.{column}")
    except Exception:
        pass  # column already exists


def init_db():
    with app.app_context():
        db.create_all()
        print("Tables created.")

        # Column migrations (safe to run on existing DBs)
        conn = db.engine.raw_connection()
        try:
            # Staff — two-step auth
            _add_column_if_missing(conn, 'staff', 'personal_pin',   'VARCHAR(10)')
            _add_column_if_missing(conn, 'staff', 'department_pin', 'VARCHAR(10)')
            # Products
            _add_column_if_missing(conn, 'products', 'plu_code',              'VARCHAR(20)')
            _add_column_if_missing(conn, 'products', 'is_weight_based',       'BOOLEAN DEFAULT 0')
            _add_column_if_missing(conn, 'products', 'weight_unit',           'VARCHAR(10) DEFAULT "kg"')
            _add_column_if_missing(conn, 'products', 'age_restricted',        'BOOLEAN DEFAULT 0')
            _add_column_if_missing(conn, 'products', 'age_restriction_type',  'VARCHAR(20)')
            _add_column_if_missing(conn, 'products', 'min_age',               'INTEGER DEFAULT 18')
            # Product signature fields
            _add_column_if_missing(conn, 'products', 'created_by_id',   'INTEGER')
            _add_column_if_missing(conn, 'products', 'created_by_name', 'VARCHAR(100)')
            _add_column_if_missing(conn, 'products', 'created_by_role', 'VARCHAR(20)')
            _add_column_if_missing(conn, 'products', 'updated_by_id',   'INTEGER')
            _add_column_if_missing(conn, 'products', 'updated_by_name', 'VARCHAR(100)')
            _add_column_if_missing(conn, 'products', 'updated_by_role', 'VARCHAR(20)')
            _add_column_if_missing(conn, 'products', 'updated_at',      'DATETIME')
            try:
                conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS ix_products_plu_code ON products (plu_code) WHERE plu_code IS NOT NULL')
            except Exception:
                pass
            # SaleItems
            _add_column_if_missing(conn, 'sale_items', 'weight',       'FLOAT')
            _add_column_if_missing(conn, 'sale_items', 'item_type',    'VARCHAR(20) DEFAULT "product"')
            _add_column_if_missing(conn, 'sale_items', 'service_id',   'INTEGER')
            _add_column_if_missing(conn, 'sale_items', 'staff_id',     'INTEGER')
            _add_column_if_missing(conn, 'sale_items', 'staff_name',   'VARCHAR(100)')
            # Sales
            _add_column_if_missing(conn, 'sales', 'shift_id',               'INTEGER')
            _add_column_if_missing(conn, 'sales', 'customer_id',            'INTEGER')
            _add_column_if_missing(conn, 'sales', 'customer_name',          'VARCHAR(100)')
            _add_column_if_missing(conn, 'sales', 'loyalty_points_earned',  'INTEGER DEFAULT 0')
            _add_column_if_missing(conn, 'sales', 'loyalty_points_redeemed','INTEGER DEFAULT 0')
            _add_column_if_missing(conn, 'sales', 'loyalty_discount',       'FLOAT DEFAULT 0')
            _add_column_if_missing(conn, 'sales', 'terminal_id',            'VARCHAR(50)')
            _add_column_if_missing(conn, 'sales', 'age_verified',           'BOOLEAN DEFAULT 0')
            _add_column_if_missing(conn, 'sales', 'sale_type',              'VARCHAR(20) DEFAULT "retail"')
            _add_column_if_missing(conn, 'sales', 'tip_amount',             'FLOAT DEFAULT 0')
            _add_column_if_missing(conn, 'sales', 'tip_method',             'VARCHAR(20)')
            _add_column_if_missing(conn, 'sales', 'tip_staff_id',           'INTEGER')
            _add_column_if_missing(conn, 'sales', 'tip_staff_name',         'VARCHAR(100)')
            _add_column_if_missing(conn, 'sales', 'appointment_id',         'INTEGER')
            _add_column_if_missing(conn, 'sales', 'cloud_synced_at',        'DATETIME')
            _add_column_if_missing(conn, 'sales', 'mpesa_ref',              'VARCHAR(50)')
            _add_column_if_missing(conn, 'sales', 'account_id',             'INTEGER')
            _add_column_if_missing(conn, 'sales', 'account_balance_before', 'FLOAT')
            _add_column_if_missing(conn, 'sales', 'account_balance_after',  'FLOAT')
            conn.commit()
        finally:
            conn.close()

        # Seed default categories if none exist
        if Category.query.count() == 0:
            defaults = [
                Category(name='Building Materials', tax_class='standard'),
                Category(name='Plumbing',           tax_class='standard'),
                Category(name='Electrical',         tax_class='standard'),
                Category(name='Paint & Finishes',   tax_class='standard'),
                Category(name='Hand Tools',         tax_class='standard'),
                Category(name='Fasteners',          tax_class='standard'),
                Category(name='Timber & Wood',      tax_class='standard'),
            ]
            db.session.add_all(defaults)
            db.session.commit()
            print(f"Seeded {len(defaults)} hardware categories.")

        # Seed staff with hardware store roles if none exist
        if Staff.query.count() == 0:
            seed_staff = [
                Staff(name='Admin',        pin='0000', personal_pin='0000', department_pin='0000', role='admin'),
                Staff(name='Manager',      pin='1111', personal_pin='1111', department_pin='1111', role='manager'),
                Staff(name='Cashier 1',    pin='2222', personal_pin='1234', department_pin='2222', role='cashier'),
                Staff(name='Cashier 2',    pin='2222', personal_pin='5678', department_pin='2222', role='cashier'),
                Staff(name='Inventory',    pin='3333', personal_pin='3333', department_pin='3333', role='inventory'),
                Staff(name='Purchasing',   pin='4444', personal_pin='4444', department_pin='4444', role='purchasing'),
            ]
            db.session.add_all(seed_staff)
            db.session.commit()
            print("Seeded staff:")
            print("  Dept PINs: Admin=0000 Manager=1111 Cashier=2222 Inventory=3333 Purchasing=4444")
            print("  Personal PINs: Admin=0000 Manager=1111 Cashier1=1234 Cashier2=5678 Inventory=3333 Purchasing=4444")
        else:
            # Migrate existing staff: copy pin → personal_pin if personal_pin not set
            from sqlalchemy import text
            db.session.execute(text(
                "UPDATE staff SET personal_pin = pin WHERE personal_pin IS NULL AND pin IS NOT NULL"
            ))
            db.session.commit()

        # Seed sample products for development
        if Product.query.count() == 0:
            cat = Category.query.filter_by(name='General').first()
            samples = [
                Product(name='Sample Item A', barcode='1234567890123', price=9.99, tax_rate=0.16, stock_qty=50, category_id=cat.id if cat else None),
                Product(name='Sample Item B', barcode='9876543210987', price=4.50, tax_rate=0.16, stock_qty=100, category_id=cat.id if cat else None),
                Product(name='Sample Item C', barcode='5555555555555', price=19.99, tax_rate=0.16, stock_qty=25, category_id=cat.id if cat else None),
            ]
            db.session.add_all(samples)
            db.session.commit()
            print(f"Seeded {len(samples)} sample products.")

        print("Database initialization complete.")


if __name__ == '__main__':
    init_db()
