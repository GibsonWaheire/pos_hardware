"""
ESC/POS receipt printer integration.

Supports Network (IP), USB, and Serial connections.
Configure via environment variables (see .env.example).

python-escpos must be installed: pip install python-escpos
If not installed or printer is unavailable, print_receipt() logs and returns False.
"""

import os
from datetime import datetime

PRINTER_TYPE = os.getenv('PRINTER_TYPE', 'network')  # network | usb | serial

# Fallback values from env (overridden by store DB config when available)
_ENV_STORE_NAME    = os.getenv('STORE_NAME', 'POS Hardware Store')
_ENV_STORE_ADDRESS = os.getenv('STORE_ADDRESS', '')
_ENV_STORE_PHONE   = os.getenv('STORE_PHONE', '')
_ENV_STORE_TAX_ID  = os.getenv('STORE_TAX_ID', '')

LINE_WIDTH = 48   # characters — 80mm thermal (48 cols at 12cpi)


def _get_printer():
    """Return an escpos Printer instance based on env config."""
    try:
        if PRINTER_TYPE == 'network':
            from escpos.printer import Network
            host = os.getenv('PRINTER_HOST', '192.168.1.100')
            port = int(os.getenv('PRINTER_PORT', 9100))
            return Network(host, port=port)

        elif PRINTER_TYPE == 'usb':
            from escpos.printer import Usb
            vendor  = int(os.getenv('PRINTER_USB_VENDOR',  '0x04b8'), 16)
            product = int(os.getenv('PRINTER_USB_PRODUCT', '0x0202'), 16)
            return Usb(vendor, product)

        elif PRINTER_TYPE == 'serial':
            from escpos.printer import Serial
            port = os.getenv('PRINTER_SERIAL_PORT', '/dev/ttyUSB0')
            return Serial(port, baudrate=9600)

        else:
            raise ValueError(f'Unknown PRINTER_TYPE: {PRINTER_TYPE}')

    except ImportError:
        raise ImportError('python-escpos not installed. Run: pip install python-escpos')


def _get_store():
    """Load store config from DB, fall back to env vars."""
    try:
        from app import app
        from models import Store
        with app.app_context():
            store = Store.query.first()
            if store:
                return store.to_dict()
    except Exception:
        pass
    return {
        'name':           _ENV_STORE_NAME,
        'address':        _ENV_STORE_ADDRESS,
        'phone':          _ENV_STORE_PHONE,
        'tax_number':     _ENV_STORE_TAX_ID,
        'receipt_header': '',
        'receipt_footer': '',
    }


def _divider(p, char='-'):
    p.text(char * LINE_WIDTH + '\n')


def _row(left: str, right: str, width: int = LINE_WIDTH) -> str:
    """Left-align label, right-align value within width columns."""
    right = str(right)
    left = left[:width - len(right) - 1]
    return f'{left:<{width - len(right)}}{right}\n'


def print_receipt(sale: dict, store: dict = None) -> bool:
    """
    Print a formatted receipt for a completed sale.

    Args:
        sale:  sale dict from Sale.to_dict()
        store: optional store config dict (loaded from DB if not provided)

    Returns:
        True on success, False on any error.
    """
    try:
        p = _get_printer()
    except Exception as e:
        print(f'[Printer] Could not connect: {e}')
        return False

    if store is None:
        store = _get_store()

    try:
        W = LINE_WIDTH

        # ── Header ───────────────────────────────────────────────────────────
        p.set(align='center', bold=True, height=2, width=2)
        p.text(f'{store.get("name", "POS Store")}\n')
        p.set(align='center', bold=False, height=1, width=1)

        if store.get('address'):
            p.text(f'{store["address"]}\n')
        if store.get('phone'):
            p.text(f'Tel: {store["phone"]}\n')
        if store.get('tax_number'):
            p.text(f'KRA PIN: {store["tax_number"]}\n')
        if store.get('receipt_header'):
            p.text(f'{store["receipt_header"]}\n')

        _divider(p)

        # ── Receipt info ─────────────────────────────────────────────────────
        p.set(align='left')
        created = sale.get('created_at', '')
        if created:
            try:
                dt = datetime.fromisoformat(created)
                created = dt.strftime('%d %b %Y  %H:%M')
            except Exception:
                pass

        p.text(f'Receipt : {sale.get("receipt_number", "")}\n')
        p.text(f'Date    : {created}\n')
        if sale.get('cashier_name'):
            p.text(f'Cashier : {sale["cashier_name"]}\n')

        _divider(p)

        # ── Line items ───────────────────────────────────────────────────────
        for item in sale.get('items', []):
            name  = item.get('product_name', '')[:W - 14]
            qty   = item.get('qty', 1)
            price = item.get('unit_price', 0)
            total = item.get('line_total', 0)
            disc  = item.get('discount', 0)

            p.text(_row(f'{name} x{qty}', f'KES {total:,.2f}', W))
            if disc > 0:
                p.text(_row(f'  Discount', f'-KES {disc * qty:,.2f}', W))

        _divider(p)

        # ── Totals ───────────────────────────────────────────────────────────
        subtotal      = sale.get('subtotal', 0)
        discount_total = sale.get('discount_total', 0)
        tax_amount    = sale.get('tax_amount', 0)
        total         = sale.get('total', 0)

        p.text(_row('Subtotal', f'KES {subtotal:,.2f}', W))
        if discount_total > 0:
            p.text(_row('Discounts', f'-KES {discount_total:,.2f}', W))
        if tax_amount > 0:
            p.text(_row('VAT', f'KES {tax_amount:,.2f}', W))

        p.set(bold=True)
        p.text(_row('TOTAL', f'KES {total:,.2f}', W))
        p.set(bold=False)

        _divider(p)

        # ── Payment ──────────────────────────────────────────────────────────
        method = sale.get('payment_method', '').upper()
        p.text(f'Payment : {method}\n')

        if sale.get('mpesa_ref'):
            p.text(f'M-Pesa  : {sale["mpesa_ref"]}\n')
        if sale.get('cash_tendered'):
            p.text(_row('Cash Tendered', f'KES {sale["cash_tendered"]:,.2f}', W))
            p.text(_row('Change', f'KES {sale.get("change_given", 0):,.2f}', W))

        # ── Footer ───────────────────────────────────────────────────────────
        p.set(align='center')
        footer = store.get('receipt_footer') or 'Thank you for your business!'
        p.text(f'\n{footer}\n')
        p.text('\n\n\n')

        p.cut()
        return True

    except Exception as e:
        print(f'[Printer] Print error: {e}')
        return False
    finally:
        try:
            p.close()
        except Exception:
            pass
