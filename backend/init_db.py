"""Initialize the local SQLite database and seed default data."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app import app
from db import db
from models import Category, Product, Staff, PurchaserLimit, ShiftReport, ReportPrintEvent  # noqa: F401 — ensure all models registered


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
            # Staff — two-step auth + card
            _add_column_if_missing(conn, 'staff', 'personal_pin',   'VARCHAR(10)')
            _add_column_if_missing(conn, 'staff', 'department_pin', 'VARCHAR(10)')
            _add_column_if_missing(conn, 'staff', 'auth_card_code', 'VARCHAR(100)')
            # AuditLog — authorization fields
            _add_column_if_missing(conn, 'audit_logs', 'authorized_by_id',   'INTEGER')
            _add_column_if_missing(conn, 'audit_logs', 'authorized_by_name', 'VARCHAR(100)')
            _add_column_if_missing(conn, 'audit_logs', 'authorized_by_role', 'VARCHAR(20)')
            _add_column_if_missing(conn, 'audit_logs', 'auth_method',        'VARCHAR(20)')
            # Shifts — opened_by + auth_method
            _add_column_if_missing(conn, 'shifts', 'opened_by_id',   'INTEGER')
            _add_column_if_missing(conn, 'shifts', 'opened_by_name', 'VARCHAR(100)')
            _add_column_if_missing(conn, 'shifts', 'auth_method',    'VARCHAR(20)')
            # Staff — supplier link (Phase 9 RBAC)
            _add_column_if_missing(conn, 'staff', 'supplier_id', 'INTEGER')
            # PurchaseOrder — creator + approval tracking (Phase 9 RBAC)
            _add_column_if_missing(conn, 'purchase_orders', 'created_by_id',   'INTEGER')
            _add_column_if_missing(conn, 'purchase_orders', 'created_by_name', 'VARCHAR(100)')
            _add_column_if_missing(conn, 'purchase_orders', 'approved_by_id',   'INTEGER')
            _add_column_if_missing(conn, 'purchase_orders', 'approved_by_name', 'VARCHAR(100)')
            _add_column_if_missing(conn, 'purchase_orders', 'approved_at',      'DATETIME')
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
            # Phase 39 — per-tender reconciliation on shifts
            _add_column_if_missing(conn, 'shifts', 'actual_cash',          'FLOAT')
            _add_column_if_missing(conn, 'shifts', 'actual_mpesa',         'FLOAT')
            _add_column_if_missing(conn, 'shifts', 'actual_card',          'FLOAT')
            _add_column_if_missing(conn, 'shifts', 'actual_other',         'FLOAT')
            _add_column_if_missing(conn, 'shifts', 'variance_cash',        'FLOAT')
            _add_column_if_missing(conn, 'shifts', 'variance_mpesa',       'FLOAT')
            _add_column_if_missing(conn, 'shifts', 'variance_card',        'FLOAT')
            _add_column_if_missing(conn, 'shifts', 'variance_other',       'FLOAT')
            _add_column_if_missing(conn, 'shifts', 'reconciled_by_id',     'INTEGER')
            _add_column_if_missing(conn, 'shifts', 'reconciled_by_name',   'VARCHAR(100)')
            _add_column_if_missing(conn, 'shifts', 'reconciled_at',        'DATETIME')
            _add_column_if_missing(conn, 'shifts', 'closed_without_print', 'BOOLEAN DEFAULT 0')
            _add_column_if_missing(conn, 'shifts', 'admin_bypass',         'BOOLEAN DEFAULT 0')
            # Phase 39 — override approval value tracking
            _add_column_if_missing(conn, 'override_approvals', 'value_impact', 'FLOAT')
            _add_column_if_missing(conn, 'override_approvals', 'shift_id',     'INTEGER')
            _add_column_if_missing(conn, 'override_approvals', 'unit_price',   'FLOAT')
            # Phase 39 — shift report flags
            _add_column_if_missing(conn, 'shift_reports', 'closed_without_print', 'BOOLEAN DEFAULT 0')
            _add_column_if_missing(conn, 'shift_reports', 'has_discrepancy',      'BOOLEAN DEFAULT 0')
            # Returns — approval tracking columns (Phase 20)
            _add_column_if_missing(conn, 'returns', 'approved_by_id',   'INTEGER')
            _add_column_if_missing(conn, 'returns', 'approved_by_name', 'VARCHAR(100)')
            _add_column_if_missing(conn, 'returns', 'approved_at',      'DATETIME')
            conn.commit()
        finally:
            conn.close()

        # Seed categories — add any missing ones from the full set
        CAT_NAMES = [
            'Cement & Aggregates', 'Steel & Reinforcement', 'Roofing',
            'Timber & Wood', 'Paint & Finishes', 'Plumbing', 'Electrical',
            'Fasteners & Fixings', 'Hardware & Tools',
        ]
        added_cats = 0
        for name in CAT_NAMES:
            if not Category.query.filter_by(name=name).first():
                db.session.add(Category(name=name, tax_class='standard'))
                added_cats += 1
        if added_cats:
            db.session.commit()
            print(f"Added {added_cats} categories.")

        # Seed default staff — add any that are missing (safe to re-run)
        default_staff = [
            dict(name='Admin',        pin='0000', personal_pin='0000', department_pin='0000', role='admin'),
            dict(name='Manager',      pin='1111', personal_pin='1111', department_pin='1111', role='manager'),
            dict(name='Cashier 1',    pin='2222', personal_pin='1234', department_pin='2222', role='cashier'),
            dict(name='Cashier 2',    pin='2222', personal_pin='5678', department_pin='2222', role='cashier'),
            dict(name='Inventory',    pin='3333', personal_pin='3333', department_pin='3333', role='inventory'),
            dict(name='Purchasing',   pin='4444', personal_pin='4444', department_pin='4444', role='purchasing'),
        ]
        added_staff = 0
        for s in default_staff:
            if not Staff.query.filter_by(name=s['name'], role=s['role']).first():
                db.session.add(Staff(**s))
                added_staff += 1
        if added_staff:
            db.session.commit()
            print(f"Seeded {added_staff} default staff members.")
            print("  Dept PINs: Admin=0000 Manager=1111 Cashier=2222 Inventory=3333 Purchasing=4444")
            print("  Personal PINs: Admin=0000 Manager=1111 Cashier1=1234 Cashier2=5678 Inventory=3333 Purchasing=4444")

        if Staff.query.count() > 0:
            # Migrate existing staff: copy pin → personal_pin if personal_pin not set
            from sqlalchemy import text
            db.session.execute(text(
                "UPDATE staff SET personal_pin = pin WHERE personal_pin IS NULL AND pin IS NOT NULL"
            ))
            db.session.commit()

        # Seed Kenyan hardware catalog
        # Replaces placeholder "Sample Item" records; skips if real products exist
        total_prods  = Product.query.count()
        sample_prods = Product.query.filter(Product.name.like('Sample Item%')).count()
        if total_prods == 0 or total_prods == sample_prods:
            # Remove placeholder items
            if sample_prods:
                Product.query.filter(Product.name.like('Sample Item%')).delete()
                db.session.flush()

            # Build category id lookup
            cid = {c.name: c.id for c in Category.query.all()}

            def c(name): return cid.get(name)

            def p(name, plu, cat_name, wb=False, unit='pce', threshold=5):
                return Product(
                    name=name, plu_code=plu, price=0, tax_rate=0.16,
                    is_weight_based=wb, weight_unit=unit,
                    stock_qty=0, low_stock_threshold=threshold,
                    category_id=c(cat_name), is_active=True,
                )

            CA = 'Cement & Aggregates'
            ST = 'Steel & Reinforcement'
            RO = 'Roofing'
            TW = 'Timber & Wood'
            PA = 'Paint & Finishes'
            PL = 'Plumbing'
            EL = 'Electrical'
            FA = 'Fasteners & Fixings'
            HT = 'Hardware & Tools'

            catalog = [
                # ── Cement & Aggregates ──────────────────────────────────────
                p('Bamburi Cement 50kg',        'C01', CA, threshold=20),
                p('Savannah Cement 50kg',        'C02', CA, threshold=20),
                p('Mombasa Cement 50kg',         'C03', CA, threshold=20),
                p('River Sand',                  'S01', CA, wb=True, unit='tonne', threshold=5),
                p('Ballast / Hardcore',          'S02', CA, wb=True, unit='tonne', threshold=5),
                p('Crushed Stone',               'S03', CA, wb=True, unit='tonne', threshold=5),

                # ── Steel & Reinforcement ────────────────────────────────────
                p('Steel Bar Y8 (6m)',           'R01', ST, threshold=20),
                p('Steel Bar Y10 (6m)',          'R02', ST, threshold=20),
                p('Steel Bar Y12 (6m)',          'R03', ST, threshold=20),
                p('Steel Bar Y16 (6m)',          'R04', ST, threshold=20),
                p('Steel Bar Y20 (6m)',          'R05', ST, threshold=10),
                p('Round Bar R6 (6m)',           'R06', ST, threshold=10),
                p('Binding Wire',                'R07', ST, wb=True, unit='kg'),
                p('BRC Mesh A142',               'R08', ST, threshold=10),
                p('BRC Mesh A193',               'R09', ST, threshold=10),

                # ── Roofing ──────────────────────────────────────────────────
                p('Mabati G28 2m',               'M01', RO, threshold=20),
                p('Mabati G28 2.5m',             'M02', RO, threshold=20),
                p('Mabati G28 3m',               'M03', RO, threshold=20),
                p('Mabati G30 2m',               'M04', RO, threshold=20),
                p('Mabati G30 2.5m',             'M05', RO, threshold=20),
                p('Mabati G30 3m',               'M06', RO, threshold=20),
                p('Mabati G32 2m',               'M07', RO, threshold=10),
                p('Mabati G32 3m',               'M08', RO, threshold=10),
                p('Ridge Cap',                   'M09', RO),
                p('Roofing Nails',               'M10', RO, wb=True, unit='kg'),
                p('Screw Cap Nails',             'M11', RO, wb=True, unit='kg'),

                # ── Timber & Wood ────────────────────────────────────────────
                p('Timber 2x2 (per ft)',         'T01', TW, threshold=50),
                p('Timber 2x4 (per ft)',         'T02', TW, threshold=50),
                p('Timber 2x6 (per ft)',         'T03', TW, threshold=30),
                p('Timber 3x2 (per ft)',         'T04', TW, threshold=30),
                p('Plywood 18mm 4x8',            'T05', TW),
                p('Plywood 12mm 4x8',            'T06', TW),
                p('Blockboard 18mm 4x8',         'T07', TW),
                p('MDF 18mm 4x8',                'T08', TW),

                # ── Paint & Finishes ─────────────────────────────────────────
                p('Crown Emulsion 1L',           'P01', PA),
                p('Crown Emulsion 4L',           'P02', PA),
                p('Crown Emulsion 20L',          'P03', PA),
                p('Crown Gloss 1L',              'P04', PA),
                p('Crown Gloss 4L',              'P05', PA),
                p('Crown Gloss 20L',             'P06', PA),
                p('Sadolin Superdec 1L',         'P07', PA),
                p('Sadolin Superdec 4L',         'P08', PA),
                p('Basco Emulsion 4L',           'P09', PA),
                p('Basco Gloss 4L',              'P10', PA),
                p('Undercoat 4L',                'P11', PA),
                p('Paint Thinner 1L',            'P12', PA),

                # ── Plumbing ─────────────────────────────────────────────────
                p('PPR Pipe 1/2" (4m)',          'W01', PL, threshold=10),
                p('PPR Pipe 3/4" (4m)',          'W02', PL, threshold=10),
                p('PPR Pipe 1" (4m)',            'W03', PL, threshold=10),
                p('PVC Waste Pipe 2" (3m)',      'W04', PL),
                p('PVC Waste Pipe 3" (3m)',      'W05', PL),
                p('PVC Waste Pipe 4" (3m)',      'W06', PL),
                p('PPR Elbow 1/2"',             'W07', PL),
                p('PPR Elbow 3/4"',             'W08', PL),
                p('PPR Tee 1/2"',               'W09', PL),
                p('Ball Valve 1/2"',            'W10', PL),
                p('Ball Valve 3/4"',            'W11', PL),
                p('Gate Valve 1/2"',            'W12', PL),
                p('Pillar Tap',                  'W13', PL),
                p('Water Tank Float Valve',      'W14', PL),

                # ── Electrical ───────────────────────────────────────────────
                p('Cable 1.5mm T&E (per m)',     'E01', EL),
                p('Cable 2.5mm T&E (per m)',     'E02', EL),
                p('Cable 4.0mm T&E (per m)',     'E03', EL),
                p('Cable 6.0mm T&E (per m)',     'E04', EL),
                p('Single Socket 13A',           'E05', EL),
                p('Double Socket 13A',           'E06', EL),
                p('Single Switch',               'E07', EL),
                p('2-Gang Switch',               'E08', EL),
                p('MCB 20A',                     'E09', EL),
                p('MCB 32A',                     'E10', EL),
                p('LED Bulb 9W',                 'E11', EL),
                p('LED Bulb 18W',                'E12', EL),
                p('Conduit 20mm (per m)',         'E13', EL),

                # ── Fasteners & Fixings ──────────────────────────────────────
                p('Wire Nails 2"',               'N01', FA, wb=True, unit='kg'),
                p('Wire Nails 3"',               'N02', FA, wb=True, unit='kg'),
                p('Wire Nails 4"',               'N03', FA, wb=True, unit='kg'),
                p('Wire Nails 6"',               'N04', FA, wb=True, unit='kg'),
                p('Bolts & Nuts 1/2" (per kg)',  'N05', FA, wb=True, unit='kg'),
                p('Steel Hinge 4" (pair)',        'N06', FA),
                p('Padlock 50mm',                'N07', FA),
                p('Padlock 70mm',                'N08', FA),

                # ── Hardware & Tools ─────────────────────────────────────────
                p('Claw Hammer',                 'H01', HT),
                p('Tape Measure 5m',             'H02', HT),
                p('Tape Measure 8m',             'H03', HT),
                p('Spirit Level 600mm',          'H04', HT),
                p('Masonry Trowel',              'H05', HT),
                p('Hand Saw',                    'H06', HT),
                p('Wheelbarrow',                 'H07', HT),
                p('Shovel',                      'H08', HT),
                p('Paint Brush 2"',              'H09', HT),
                p('Paint Brush 4"',              'H10', HT),
                p('Paint Roller Set',            'H11', HT),
            ]
            db.session.add_all(catalog)
            db.session.commit()
            print(f"Seeded {len(catalog)} Kenyan hardware products (prices set to 0 — edit in Products).")

        print("Database initialization complete.")


if __name__ == '__main__':
    init_db()
