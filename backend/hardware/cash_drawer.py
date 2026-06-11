"""
Cash drawer control.

Most cash drawers are triggered via the receipt printer's RJ-11/RJ-12 port,
which means printing a receipt already opens the drawer automatically on some
printer models. This module handles the alternative: direct serial trigger.

ESC/POS cash drawer kick command: ESC p m t1 t2
  ESC = 0x1B, p = 0x70, m = 0 (port), t1 = on-time (25×2ms), t2 = off-time (250×2ms)
"""

import os

CASH_DRAWER_PORT = os.getenv('CASH_DRAWER_PORT', '/dev/ttyUSB0')
DRAWER_OPEN_CMD = bytes([0x1B, 0x70, 0x00, 0x19, 0xFA])  # ESC p 0 25 250


def open_drawer() -> bool:
    """
    Send the cash drawer kick command via serial port.

    Returns True on success, False on failure (non-fatal).
    Requires pyserial: pip install pyserial
    """
    try:
        import serial
        with serial.Serial(CASH_DRAWER_PORT, baudrate=9600, timeout=1) as ser:
            ser.write(DRAWER_OPEN_CMD)
        print(f'[CashDrawer] Opened via {CASH_DRAWER_PORT}')
        return True
    except ImportError:
        print('[CashDrawer] pyserial not installed. Run: pip install pyserial')
        return False
    except Exception as e:
        print(f'[CashDrawer] Error opening drawer on {CASH_DRAWER_PORT}: {e}')
        return False
