"""
Google Sheets export — one-way push, append-only.

Credentials: Google service account JSON stored in Store.sheets_config['service_account_json']
Spreadsheet: Store.sheets_config['spreadsheet_id']  (or extracted from a full URL)

Tabs pushed:
  Daily Sales   — one summary row per calendar day
  Stock Levels  — full current stock snapshot
  Shift Reports — one row per closed shift (last 7 days)
  Top Products  — top 20 by qty sold this week
  Accounts      — customer prepaid/credit accounts snapshot
"""

import json
import re
from datetime import datetime, timedelta, timezone

try:
    from googleapiclient.discovery import build
    from google.oauth2.service_account import Credentials
    SHEETS_AVAILABLE = True
except ImportError:
    SHEETS_AVAILABLE = False

from db import db

SCOPES = ['https://www.googleapis.com/auth/spreadsheets']


# ── Config helpers ─────────────────────────────────────────────────────────────

def get_sheets_config(store):
    """Parse sheets config from Store.sheets_config JSON blob."""
    try:
        cfg = json.loads(store.sheets_config or '{}') if store.sheets_config else {}
    except Exception:
        cfg = {}
    return {
        'enabled':              cfg.get('enabled', False),
        'spreadsheet_id':       _extract_id(cfg.get('spreadsheet_id', '')),
        'service_account_json': cfg.get('service_account_json', ''),
        'tabs': {
            'daily_sales':   cfg.get('tabs', {}).get('daily_sales', True),
            'stock_levels':  cfg.get('tabs', {}).get('stock_levels', True),
            'shift_reports': cfg.get('tabs', {}).get('shift_reports', True),
            'top_products':  cfg.get('tabs', {}).get('top_products', True),
            'accounts':      cfg.get('tabs', {}).get('accounts', True),
        },
        'last_push_at':     cfg.get('last_push_at'),
        'last_push_result': cfg.get('last_push_result'),
    }


def _extract_id(url_or_id):
    """Extract spreadsheet ID from a full Google Sheets URL, or return the raw value."""
    if not url_or_id:
        return ''
    m = re.search(r'/spreadsheets/d/([a-zA-Z0-9_-]+)', url_or_id)
    return m.group(1) if m else url_or_id.strip()


# ── Google API helpers ─────────────────────────────────────────────────────────

def _get_service(service_account_json_str):
    """Build the Sheets API service from a service account JSON string."""
    if not SHEETS_AVAILABLE:
        raise RuntimeError(
            'google-api-python-client not installed. '
            'Run: pip install google-api-python-client google-auth'
        )
    creds_dict = json.loads(service_account_json_str)
    creds = Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
    return build('sheets', 'v4', credentials=creds, cache_discovery=False)


def _ensure_tab(service, spreadsheet_id, title):
    """Create a sheet tab with a header row if it doesn't exist."""
    meta = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    for s in meta.get('sheets', []):
        if s['properties']['title'] == title:
            return  # already exists

    headers = _tab_headers(title)
    service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={'requests': [{'addSheet': {'properties': {'title': title}}}]},
    ).execute()
    if headers:
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"'{title}'!A1",
            valueInputOption='USER_ENTERED',
            body={'values': [headers]},
        ).execute()


def _tab_headers(title):
    HEADERS = {
        'Daily Sales':   ['Date', 'Transactions', 'Total (KES)', 'Cash', 'M-Pesa', 'Card', 'Account', 'Split', 'Avg Basket', 'Exported At'],
        'Stock Levels':  ['SKU', 'Product', 'Category', 'Qty', 'Reorder Point', 'Low Stock?', 'Cost', 'Price', 'Unit', 'Exported At'],
        'Shift Reports': ['Shift ID', 'Cashier', 'Opened', 'Closed', 'Opening Float', 'Closing Float', 'Difference', 'Status', 'Exported At'],
        'Top Products':  ['Rank', 'Product', 'Qty Sold (7d)', 'Revenue (7d)', 'Exported At'],
        'Accounts':      ['Customer', 'Phone', 'Balance (KES)', 'Credit Limit', 'Available', 'Last Txn', 'Exported At'],
    }
    return HEADERS.get(title, [])


def _append(service, spreadsheet_id, tab_title, rows):
    """Append rows to a sheet tab (after ensuring it exists)."""
    _ensure_tab(service, spreadsheet_id, tab_title)
    service.spreadsheets().values().append(
        spreadsheetId=spreadsheet_id,
        range=f"'{tab_title}'!A1",
        valueInputOption='USER_ENTERED',
        insertDataOption='INSERT_ROWS',
        body={'values': rows},
    ).execute()


def _fmt(v):
    if v is None:
        return ''
    if isinstance(v, datetime):
        return v.strftime('%Y-%m-%d %H:%M:%S')
    return v


# ── Per-tab push functions ─────────────────────────────────────────────────────

def push_daily_sales(service, spreadsheet_id, app):
    """Append today's sales summary row."""
    from models import Sale
    today = datetime.utcnow().date()
    with app.app_context():
        sales = Sale.query.filter(
            db.func.date(Sale.created_at) == str(today)
        ).all()
    if not sales:
        return
    total_rev   = sum(s.total for s in sales)
    pm          = lambda m: sum(s.total for s in sales if s.payment_method == m)
    row = [
        str(today),
        len(sales),
        round(total_rev, 2),
        round(pm('cash'), 2),
        round(pm('mpesa'), 2),
        round(pm('card'), 2),
        round(pm('account'), 2),
        round(pm('split'), 2),
        round(total_rev / len(sales), 2),
        _fmt(datetime.utcnow()),
    ]
    _append(service, spreadsheet_id, 'Daily Sales', [row])


def push_stock_levels(service, spreadsheet_id, app):
    """Append full stock snapshot."""
    from models import Product
    with app.app_context():
        products = Product.query.order_by(Product.name).all()
    rows = []
    for p in products:
        qty     = p.qty or 0
        reorder = getattr(p, 'reorder_point', 0) or 0
        rows.append([
            p.sku or '',
            p.name,
            getattr(p, 'category', '') or '',
            round(qty, 2),
            reorder,
            'YES' if qty <= reorder else 'no',
            round(p.cost_price or 0, 2),
            round(p.selling_price or 0, 2),
            p.unit or '',
            _fmt(datetime.utcnow()),
        ])
    if rows:
        _append(service, spreadsheet_id, 'Stock Levels', rows)


def push_shift_reports(service, spreadsheet_id, app):
    """Append closed shifts from the past 7 days."""
    from models import Shift
    cutoff = datetime.utcnow() - timedelta(days=7)
    with app.app_context():
        shifts = (Shift.query
                  .filter(Shift.status == 'closed', Shift.closed_at >= cutoff)
                  .order_by(Shift.closed_at.desc())
                  .all())
    rows = []
    for sh in shifts:
        rows.append([
            sh.id,
            sh.cashier_name or '',
            _fmt(sh.opened_at),
            _fmt(sh.closed_at),
            round(sh.opening_float or 0, 2),
            round(sh.closing_float or 0, 2),
            round((sh.closing_float or 0) - (sh.opening_float or 0), 2),
            sh.status,
            _fmt(datetime.utcnow()),
        ])
    if rows:
        _append(service, spreadsheet_id, 'Shift Reports', rows)


def push_top_products(service, spreadsheet_id, app):
    """Append top 20 products by qty sold this week."""
    from models import SaleItem, Sale
    from sqlalchemy import func, text
    cutoff = datetime.utcnow() - timedelta(days=7)
    with app.app_context():
        results = (
            db.session.query(
                SaleItem.product_name,
                func.sum(SaleItem.qty).label('total_qty'),
                func.sum(SaleItem.line_total).label('total_revenue'),
            )
            .join(Sale, SaleItem.sale_id == Sale.id)
            .filter(Sale.created_at >= cutoff)
            .group_by(SaleItem.product_name)
            .order_by(text('total_qty DESC'))
            .limit(20)
            .all()
        )
    rows = [
        [i, r.product_name, round(float(r.total_qty or 0), 2),
         round(float(r.total_revenue or 0), 2), _fmt(datetime.utcnow())]
        for i, r in enumerate(results, 1)
    ]
    if rows:
        _append(service, spreadsheet_id, 'Top Products', rows)


def push_accounts(service, spreadsheet_id, app):
    """Append customer account snapshots."""
    from models import Account
    with app.app_context():
        accounts = Account.query.order_by(Account.customer_name).all()
    rows = []
    for a in accounts:
        bal    = a.balance or 0
        limit  = a.credit_limit or 0
        rows.append([
            a.customer_name or '',
            a.customer_phone or '',
            round(bal, 2),
            round(limit, 2),
            round(bal + limit, 2),
            _fmt(getattr(a, 'last_transaction_at', None)),
            _fmt(datetime.utcnow()),
        ])
    if rows:
        _append(service, spreadsheet_id, 'Accounts', rows)


# ── Master push ────────────────────────────────────────────────────────────────

PUSHERS = [
    ('daily_sales',   push_daily_sales),
    ('stock_levels',  push_stock_levels),
    ('shift_reports', push_shift_reports),
    ('top_products',  push_top_products),
    ('accounts',      push_accounts),
]


def push_all(app):
    """
    Master export — called by the nightly scheduler or "Push Now" endpoint.
    Returns { ok, pushed, error, pushed_at }.
    """
    from models import Store
    now = datetime.now(timezone.utc)

    with app.app_context():
        store = Store.query.first()
        if not store:
            return {'ok': False, 'error': 'No store configured', 'pushed': [], 'pushed_at': now.isoformat()}

        cfg = get_sheets_config(store)
        if not cfg['enabled']:
            return {'ok': False, 'error': 'Sheets export not enabled', 'pushed': [], 'pushed_at': now.isoformat()}
        if not cfg['spreadsheet_id']:
            return {'ok': False, 'error': 'No spreadsheet ID configured', 'pushed': [], 'pushed_at': now.isoformat()}
        if not cfg['service_account_json']:
            return {'ok': False, 'error': 'No service account credentials', 'pushed': [], 'pushed_at': now.isoformat()}

        try:
            service = _get_service(cfg['service_account_json'])
        except Exception as e:
            _record_result(store, cfg, now, str(e), [])
            return {'ok': False, 'error': str(e), 'pushed': [], 'pushed_at': now.isoformat()}

        pushed = []
        errors = []
        for tab_key, pusher in PUSHERS:
            if cfg['tabs'].get(tab_key, True):
                try:
                    pusher(service, cfg['spreadsheet_id'], app)
                    pushed.append(tab_key)
                except Exception as e:
                    errors.append(f'{tab_key}: {e}')

        err_str = '; '.join(errors) if errors else None
        _record_result(store, cfg, now, err_str, pushed)
        return {'ok': not errors, 'pushed': pushed, 'error': err_str, 'pushed_at': now.isoformat()}


def _record_result(store, cfg, now, error, pushed):
    """Save last push time and result back into store.sheets_config."""
    try:
        raw = json.loads(store.sheets_config or '{}') if store.sheets_config else {}
        raw['last_push_at']     = now.isoformat()
        raw['last_push_result'] = {'ok': not error, 'pushed': pushed, 'error': error}
        store.sheets_config = json.dumps(raw)
        db.session.commit()
    except Exception:
        pass
