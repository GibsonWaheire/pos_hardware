"""
Hardware control endpoints — printer and cash drawer.

POST /api/hardware/print-receipt/<sale_id>  — (re)print a receipt
POST /api/hardware/open-drawer              — trigger cash drawer
GET  /api/hardware/status                   — quick hardware ping (non-blocking)
"""
from flask import Blueprint, jsonify
from db import db

bp = Blueprint('hardware', __name__, url_prefix='/api/hardware')


@bp.route('/print-receipt/<int:sale_id>', methods=['POST'])
def print_receipt_endpoint(sale_id):
    """Reprint the receipt for a completed sale."""
    from models import Sale
    from hardware.printer import print_receipt

    sale = Sale.query.get_or_404(sale_id)
    success = print_receipt(sale.to_dict())
    if success:
        return jsonify({'message': 'Receipt printed'})
    return jsonify({'error': 'Printer unavailable — check connection and PRINTER_TYPE in .env'}), 503


@bp.route('/open-drawer', methods=['POST'])
def open_drawer_endpoint():
    """Trigger the cash drawer."""
    from hardware.cash_drawer import open_drawer

    success = open_drawer()
    if success:
        return jsonify({'message': 'Cash drawer opened'})
    return jsonify({'error': 'Cash drawer unavailable — check CASH_DRAWER_PORT in .env'}), 503


@bp.route('/status', methods=['GET'])
def hardware_status():
    """
    Non-blocking hardware status check.
    Just reports what's configured — does not attempt to connect.
    """
    import os
    return jsonify({
        'printer': {
            'type': os.getenv('PRINTER_TYPE', 'network'),
            'host': os.getenv('PRINTER_HOST') if os.getenv('PRINTER_TYPE') == 'network' else None,
            'port': os.getenv('PRINTER_SERIAL_PORT') if os.getenv('PRINTER_TYPE') == 'serial' else None,
        },
        'cash_drawer': {
            'port': os.getenv('CASH_DRAWER_PORT', '/dev/ttyUSB0'),
        },
    })
