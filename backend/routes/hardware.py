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
    from hardware.printer import _get_printer_config
    cfg = _get_printer_config()
    dev_mode = cfg.get('type', 'none') == 'none'
    success = print_receipt(sale.to_dict())
    if success:
        return jsonify({'message': 'Receipt printed', 'dev_mode': dev_mode})
    return jsonify({'error': 'Printer unavailable — check connection and PRINTER_TYPE in .env'}), 503


@bp.route('/open-drawer', methods=['POST'])
def open_drawer_endpoint():
    """Trigger the cash drawer."""
    from hardware.cash_drawer import open_drawer

    success = open_drawer()
    if success:
        return jsonify({'message': 'Cash drawer opened'})
    return jsonify({'error': 'Cash drawer unavailable — check CASH_DRAWER_PORT in .env'}), 503


@bp.route('/test-printer', methods=['POST'])
def test_printer_endpoint():
    """Print a test page to verify printer connection."""
    from hardware.printer import _get_printer, _get_printer_config
    cfg = _get_printer_config()
    ptype = cfg.get('type', 'none')

    if ptype == 'none':
        return jsonify({'ok': True, 'message': 'Dev mode — no printer configured (type=none)'})

    try:
        p = _get_printer(cfg)
        if p is None:
            return jsonify({'ok': True, 'message': 'Dev mode — no printer configured'})
        p.set(align='center', bold=True)
        p.text('POS Hardware\n')
        p.set(bold=False)
        p.text('Printer test OK\n\n\n')
        p.cut()
        p.close()
        return jsonify({'ok': True, 'message': 'Test page printed'})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 503


@bp.route('/status', methods=['GET'])
def hardware_status():
    """Non-blocking hardware status — reports config, does not attempt to connect."""
    from hardware.printer import _get_printer_config
    import os
    cfg = _get_printer_config()
    return jsonify({
        'printer': cfg,
        'cash_drawer': {
            'port': os.getenv('CASH_DRAWER_PORT', '/dev/ttyUSB0'),
        },
    })
