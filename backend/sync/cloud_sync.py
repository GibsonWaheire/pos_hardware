"""
Cloud sync engine — pushes local SQLite data to a central PostgreSQL DB.

Environment variables:
    CLOUD_DB_URL    PostgreSQL DSN, e.g. postgresql://user:pass@host:5432/poscloud
    STORE_ID        Unique identifier for this store (e.g. "nairobi-01")
    STORE_NAME      Human-readable store name (falls back to Store table)

Tables created in cloud DB:
    cloud_sales         — one row per completed sale
    cloud_customers     — one row per customer (upserted)
    cloud_inventory     — current stock snapshot per product
"""

import os
import json
import logging
from datetime import datetime

log = logging.getLogger(__name__)

CLOUD_DB_URL = os.getenv('CLOUD_DB_URL', '')


def _get_conn():
    if not CLOUD_DB_URL:
        raise RuntimeError('CLOUD_DB_URL is not set')
    import psycopg2
    return psycopg2.connect(CLOUD_DB_URL)


def _ensure_tables(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cloud_sales (
            store_id        VARCHAR(100),
            local_id        INTEGER,
            store_name      VARCHAR(200),
            receipt_number  VARCHAR(30),
            total           DOUBLE PRECISION,
            subtotal        DOUBLE PRECISION,
            tax_amount      DOUBLE PRECISION,
            tip_amount      DOUBLE PRECISION,
            discount_total  DOUBLE PRECISION,
            payment_method  VARCHAR(20),
            cashier_name    VARCHAR(100),
            customer_name   VARCHAR(100),
            sale_type       VARCHAR(20),
            items_json      TEXT,
            created_at      TIMESTAMP,
            synced_at       TIMESTAMP,
            PRIMARY KEY (store_id, local_id)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cloud_customers (
            store_id        VARCHAR(100),
            local_id        INTEGER,
            store_name      VARCHAR(200),
            name            VARCHAR(100),
            phone           VARCHAR(30),
            email           VARCHAR(100),
            member_id       VARCHAR(30),
            loyalty_points  INTEGER,
            total_spent     DOUBLE PRECISION,
            visit_count     INTEGER,
            updated_at      TIMESTAMP,
            synced_at       TIMESTAMP,
            PRIMARY KEY (store_id, local_id)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cloud_inventory (
            store_id        VARCHAR(100),
            local_id        INTEGER,
            store_name      VARCHAR(200),
            product_name    VARCHAR(200),
            barcode         VARCHAR(50),
            sku             VARCHAR(50),
            stock_qty       INTEGER,
            price           DOUBLE PRECISION,
            low_stock_threshold INTEGER,
            updated_at      TIMESTAMP,
            synced_at       TIMESTAMP,
            PRIMARY KEY (store_id, local_id)
        )
    """)


def _resolve_store(app):
    """Return (store_id, store_name) from env or local Store table."""
    store_id = os.getenv('STORE_ID', '')
    store_name = os.getenv('STORE_NAME', '')
    if not store_id or not store_name:
        with app.app_context():
            from models import Store
            store = Store.query.first()
            if store:
                store_id = store_id or f'store-{store.id}'
                store_name = store_name or store.name
            else:
                store_id = store_id or 'store-1'
                store_name = store_name or 'My Store'
    return store_id, store_name


def sync_all(app):
    """
    Run a full sync: sales → customers → inventory.
    Returns a dict with counts and any error message.
    """
    result = {
        'sales': 0,
        'customers': 0,
        'inventory': 0,
        'errors': [],
        'started_at': datetime.utcnow().isoformat(),
    }

    try:
        conn = _get_conn()
    except Exception as e:
        result['errors'].append(str(e))
        return result

    try:
        store_id, store_name = _resolve_store(app)
        with conn.cursor() as cur:
            _ensure_tables(cur)
            conn.commit()

        result['sales'] = _sync_sales(conn, store_id, store_name, app)
        result['customers'] = _sync_customers(conn, store_id, store_name, app)
        result['inventory'] = _sync_inventory(conn, store_id, store_name, app)
    except Exception as e:
        log.exception('Cloud sync error')
        result['errors'].append(str(e))
    finally:
        conn.close()

    result['finished_at'] = datetime.utcnow().isoformat()
    return result


def _sync_sales(conn, store_id, store_name, app):
    with app.app_context():
        from models import Sale
        from db import db
        unsynced = Sale.query.filter(
            Sale.status == 'completed',
            Sale.cloud_synced_at == None,  # noqa: E711
        ).all()

        if not unsynced:
            return 0

        now = datetime.utcnow()
        with conn.cursor() as cur:
            for sale in unsynced:
                items_json = json.dumps([i.to_dict() for i in sale.items])
                cur.execute("""
                    INSERT INTO cloud_sales
                        (store_id, local_id, store_name, receipt_number,
                         total, subtotal, tax_amount, tip_amount, discount_total,
                         payment_method, cashier_name, customer_name,
                         sale_type, items_json, created_at, synced_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (store_id, local_id) DO UPDATE SET
                        total           = EXCLUDED.total,
                        receipt_number  = EXCLUDED.receipt_number,
                        synced_at       = EXCLUDED.synced_at
                """, (
                    store_id, sale.id, store_name,
                    sale.receipt_number,
                    sale.total, sale.subtotal,
                    sale.tax_amount, sale.tip_amount or 0.0,
                    sale.discount_total,
                    sale.payment_method, sale.cashier_name or '',
                    sale.customer_name or '',
                    sale.sale_type or 'retail',
                    items_json,
                    sale.created_at, now,
                ))
                sale.cloud_synced_at = now

        conn.commit()
        db.session.commit()
        return len(unsynced)


def _sync_customers(conn, store_id, store_name, app):
    with app.app_context():
        from models import Customer
        from db import db
        unsynced = Customer.query.filter(
            Customer.cloud_synced_at == None,  # noqa: E711
        ).all()

        if not unsynced:
            return 0

        now = datetime.utcnow()
        with conn.cursor() as cur:
            for c in unsynced:
                cur.execute("""
                    INSERT INTO cloud_customers
                        (store_id, local_id, store_name, name, phone, email,
                         member_id, loyalty_points, total_spent, visit_count,
                         updated_at, synced_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (store_id, local_id) DO UPDATE SET
                        name           = EXCLUDED.name,
                        loyalty_points = EXCLUDED.loyalty_points,
                        total_spent    = EXCLUDED.total_spent,
                        visit_count    = EXCLUDED.visit_count,
                        synced_at      = EXCLUDED.synced_at
                """, (
                    store_id, c.id, store_name,
                    c.name, c.phone or '', c.email or '',
                    c.member_id or '', c.loyalty_points, c.total_spent,
                    c.visit_count, now, now,
                ))
                c.cloud_synced_at = now

        conn.commit()
        db.session.commit()
        return len(unsynced)


def _sync_inventory(conn, store_id, store_name, app):
    with app.app_context():
        from models import Product
        products = Product.query.filter_by(is_active=True).all()
        if not products:
            return 0

        now = datetime.utcnow()
        with conn.cursor() as cur:
            for p in products:
                cur.execute("""
                    INSERT INTO cloud_inventory
                        (store_id, local_id, store_name, product_name, barcode,
                         sku, stock_qty, price, low_stock_threshold, updated_at, synced_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (store_id, local_id) DO UPDATE SET
                        stock_qty           = EXCLUDED.stock_qty,
                        price               = EXCLUDED.price,
                        updated_at          = EXCLUDED.updated_at,
                        synced_at           = EXCLUDED.synced_at
                """, (
                    store_id, p.id, store_name,
                    p.name, p.barcode or '', p.plu_code or '',
                    p.stock_qty, p.price, p.low_stock_threshold,
                    now, now,
                ))

        conn.commit()
        return len(products)


def cloud_dashboard(app):
    """
    Query the cloud DB and return per-store revenue summary.
    Used by the owner to see all stores at a glance.
    """
    try:
        conn = _get_conn()
    except Exception as e:
        return {'error': str(e), 'stores': []}

    try:
        with conn.cursor() as cur:
            _ensure_tables(cur)
            conn.commit()

            # Revenue per store — all time
            cur.execute("""
                SELECT store_id, store_name,
                       COUNT(*) AS transactions,
                       SUM(total) AS revenue,
                       MAX(created_at) AS last_sale
                FROM cloud_sales
                GROUP BY store_id, store_name
                ORDER BY SUM(total) DESC
            """)
            stores = []
            for row in cur.fetchall():
                stores.append({
                    'store_id': row[0],
                    'store_name': row[1],
                    'transactions': row[2],
                    'revenue': round(float(row[3] or 0), 2),
                    'last_sale': row[4].isoformat() if row[4] else None,
                })

            # Today's totals per store
            cur.execute("""
                SELECT store_id, SUM(total) AS today_revenue, COUNT(*) AS today_txns
                FROM cloud_sales
                WHERE created_at::date = CURRENT_DATE
                GROUP BY store_id
            """)
            today_map = {row[0]: {'revenue': round(float(row[1] or 0), 2), 'transactions': row[2]} for row in cur.fetchall()}

            for s in stores:
                s['today'] = today_map.get(s['store_id'], {'revenue': 0, 'transactions': 0})

            # Total cloud records
            cur.execute("SELECT COUNT(*) FROM cloud_sales")
            total_sales = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM cloud_customers")
            total_customers = cur.fetchone()[0]

        return {
            'stores': stores,
            'total_cloud_sales': total_sales,
            'total_cloud_customers': total_customers,
        }
    except Exception as e:
        log.exception('Cloud dashboard query error')
        return {'error': str(e), 'stores': []}
    finally:
        conn.close()
