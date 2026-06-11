"""
Weighing scale integration.

Supports two connection modes:
  serial — RS-232/USB serial scale (most common)
  tcp    — network scale (Ethernet interface)

Config via environment variables:
  SCALE_TYPE=serial|tcp
  SCALE_PORT=/dev/ttyUSB1   (serial)
  SCALE_BAUDRATE=9600       (serial)
  SCALE_HOST=192.168.1.200  (tcp)
  SCALE_TCP_PORT=8000       (tcp)

Most serial scales use the A&D or Mettler-Toledo protocol and continuously
broadcast weight as ASCII lines like:
  "+    1.250 kg\r\n"  (stable)
  "U    1.250 kg\r\n"  (unstable)

This module reads the latest stable weight from the scale.
If no scale is connected, read_weight() returns None (non-fatal).
"""

import os
import re

SCALE_TYPE = os.getenv('SCALE_TYPE', 'serial')
SCALE_PORT = os.getenv('SCALE_PORT', '/dev/ttyUSB1')
SCALE_BAUDRATE = int(os.getenv('SCALE_BAUDRATE', 9600))
SCALE_HOST = os.getenv('SCALE_HOST', '192.168.1.200')
SCALE_TCP_PORT = int(os.getenv('SCALE_TCP_PORT', 8000))

# Pattern matches weight lines:  "+    1.250 kg"  or  "ST,+  1.250kg"
_WEIGHT_PATTERN = re.compile(r'[+\-]?\s*([\d]+\.[\d]+)\s*(kg|lb|g)', re.IGNORECASE)


def _parse_weight_line(line: str):
    """Extract (value_float, unit_str) from a scale output line, or None."""
    m = _WEIGHT_PATTERN.search(line)
    if not m:
        return None
    value = float(m.group(1))
    unit = m.group(2).lower()
    return value, unit


def read_weight(timeout: float = 2.0):
    """
    Read current weight from scale.

    Returns:
        dict: { 'value': float, 'unit': str, 'stable': bool }
        None: if no scale / read error (non-fatal)
    """
    try:
        if SCALE_TYPE == 'serial':
            return _read_serial(timeout)
        elif SCALE_TYPE == 'tcp':
            return _read_tcp(timeout)
        else:
            print(f'[Scale] Unknown SCALE_TYPE: {SCALE_TYPE}')
            return None
    except ImportError as e:
        print(f'[Scale] Missing dependency: {e}')
        return None
    except Exception as e:
        print(f'[Scale] Read error: {e}')
        return None


def _read_serial(timeout):
    import serial
    with serial.Serial(SCALE_PORT, baudrate=SCALE_BAUDRATE, timeout=timeout) as ser:
        # Read up to 10 lines to find a stable reading
        for _ in range(10):
            raw = ser.readline().decode('ascii', errors='ignore').strip()
            if not raw:
                continue
            stable = raw.startswith('+') or 'ST' in raw
            parsed = _parse_weight_line(raw)
            if parsed:
                value, unit = parsed
                return {'value': value, 'unit': unit, 'stable': stable, 'raw': raw}
    return None


def _read_tcp(timeout):
    import socket
    with socket.create_connection((SCALE_HOST, SCALE_TCP_PORT), timeout=timeout) as sock:
        data = sock.recv(256).decode('ascii', errors='ignore')
        for line in data.splitlines():
            parsed = _parse_weight_line(line.strip())
            if parsed:
                value, unit = parsed
                return {'value': value, 'unit': unit, 'stable': True, 'raw': line.strip()}
    return None
