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
STORE_NAME = os.getenv('STORE_NAME', 'POS Hardware Store')
STORE_ADDRESS = os.getenv('STORE_ADDRESS', '')
STORE_PHONE = os.getenv('STORE_PHONE', '')
STORE_TAX_ID = os.getenv('STORE_TAX_ID', '')


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
            vendor = int(os.getenv('PRINTER_USB_VENDOR', '0x04b8'), 16)
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


def print_receipt(sale: dict) -> bool:
    """
    Print a formatted receipt for a completed sale.

    Args:
        sale: sale dict from Sale.to_dict()

    Returns:
        True on success, False on any error.
    """
    try:
        p = _get_printer()
    except Exception as e:
        print(f'[Printer] Could not connect: {e}')
        return False

    try:
        # ── Header ───────────────────────────────────────────────────────────
        p.set(align='center', bold=True, height=2, width=2)
        p.text(f'{STORE_NAME}\n')
        p.set(align='center', bold=False, height=1, width=1)
        if STORE_ADDRESS:
            p.text(f'{STORE_ADDRESS}\n')
        if STORE_PHONE:
            p.text(f'Tel: {STORE_PHONE}\n')
        if STORE_TAX_ID:
            p.text(f'Tax ID: {STORE_TAX_ID}\n')
        p.text('-' * 32 + '\n')

        # ── Receipt info ─────────────────────────────────────────────────────
        p.set(align='left')
        created = sale.get('created_at', '')
        if created:
            try:
                dt = datetime.fromisoformat(created)
                created = dt.strftime('%Y-%m-%d %H:%M')
            except Exception:
                pass
        p.text(f'Receipt: {sale.get("receipt_number", "")}\n')
        p.text(f'Date:    {created}\n')
        if sale.get('cashier_name'):
            p.text(f'Cashier: {sale["cashier_name"]}\n')
        p.text('-' * 32 + '\n')

        # ── Line items ───────────────────────────────────────────────────────
        for item in sale.get('items', []):
            name = item['product_name'][:20]
            qty = item['qty']
            price = item['unit_price']
            total = item['line_total']
            # Format: "Name x2          $19.98"
            left = f'{name} x{qty}'
            right = f'${total:.2f}'
            p.text(f'{left:<24}{right:>8}\n')
            if item.get('discount', 0) > 0:
                disc = item['discount'] * qty
                p.text(f'  Discount        -${disc:.2f}\n')

        p.text('-' * 32 + '\n')

        # ── Totals ───────────────────────────────────────────────────────────
        subtotal = sale.get('subtotal', 0)
        discount_total = sale.get('discount_total', 0)
        tax_amount = sale.get('tax_amount', 0)
        total = sale.get('total', 0)

        p.text(f'{"Subtotal":<24}{"$" + f"{subtotal:.2f}":>8}\n')
        if discount_total > 0:
            p.text(f'{"Discounts":<24}{"-$" + f"{discount_total:.2f}":>8}\n')
        if tax_amount > 0:
            p.text(f'{"Tax":<24}{"$" + f"{tax_amount:.2f}":>8}\n')

        p.set(bold=True)
        p.text(f'{"TOTAL":<24}{"$" + f"{total:.2f}":>8}\n')
        p.set(bold=False)
        p.text('-' * 32 + '\n')

        # ── Payment ──────────────────────────────────────────────────────────
        method = sale.get('payment_method', '').upper()
        p.text(f'Payment: {method}\n')
        if sale.get('cash_tendered'):
            p.text(f'{"Cash Tendered":<24}{"$" + f"{sale["cash_tendered"]:.2f}":>8}\n')
            p.text(f'{"Change":<24}{"$" + f"{sale.get("change_given", 0):.2f}":>8}\n')

        # ── Footer ───────────────────────────────────────────────────────────
        p.set(align='center')
        p.text('\nThank you for your purchase!\n')
        p.text('Please come again.\n')
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
