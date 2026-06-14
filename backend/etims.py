"""
KRA eTIMS (Electronic Tax Invoice Management System) integration.

Sandbox URL : https://etims-sbx.kra.go.ke/etims-api/{tin}/{bhf_id}/api/method/{endpoint}
Production  : https://etims.kra.go.ke/etims-api/{tin}/{bhf_id}/api/method/{endpoint}

When mode='sandbox' and no real credentials are configured, calls are simulated locally
so development works without KRA access.
"""

import json
import hashlib
import hmac
import requests
from datetime import datetime, timezone


SANDBOX_BASE = 'https://etims-sbx.kra.go.ke/etims-api'
PROD_BASE    = 'https://etims.kra.go.ke/etims-api'

# KRA VAT category codes
VAT_CAT = {
    0.0:  'E',   # Exempt
    0.08: 'C',   # 8% tourism levy (uncommon)
    0.16: 'B',   # Standard 16%
}


def get_etims_config(store):
    """Parse eTIMS config from Store.etims_config JSON blob.
    Returns dict with keys: enabled, mode, tin, bhf_id, device_serial, dvc_srl_no."""
    try:
        cfg = json.loads(store.etims_config or '{}') if store.etims_config else {}
    except Exception:
        cfg = {}
    return {
        'enabled':       cfg.get('enabled', False),
        'mode':          cfg.get('mode', 'sandbox'),      # 'sandbox' | 'production'
        'tin':           cfg.get('tin', '').strip(),
        'bhf_id':        cfg.get('bhf_id', '00').strip(),
        'device_serial': cfg.get('device_serial', '').strip(),
        'dvc_srl_no':    cfg.get('device_serial', '').strip(),
    }


def _base_url(cfg):
    return PROD_BASE if cfg['mode'] == 'production' else SANDBOX_BASE


def _call_api(endpoint, payload, cfg, timeout=15):
    """POST to KRA eTIMS API. Returns (result_code, result_msg, data_dict)."""
    tin    = cfg['tin']
    bhf_id = cfg['bhf_id']
    url    = f"{_base_url(cfg)}/{tin}/{bhf_id}/api/method/{endpoint}"
    headers = {
        'Content-Type': 'application/json',
        'tin':          tin,
        'bhfId':        bhf_id,
    }
    resp = requests.post(url, json=payload, headers=headers, timeout=timeout)
    resp.raise_for_status()
    body = resp.json()
    return (
        body.get('resultCd', '000'),
        body.get('resultMsg', ''),
        body.get('data', {}),
    )


def _sandbox_response(invoice):
    """Generate a realistic simulated eTIMS response for sandbox/dev mode."""
    now_str = datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')
    seq     = invoice.id or 1
    cu_num  = f'SBX{invoice.invoice_number.replace("-", "")}'
    # Build a fake but deterministic signature
    raw     = f'{invoice.invoice_number}|{invoice.total}|{now_str}'
    sig     = hashlib.sha256(raw.encode()).hexdigest()[:24].upper()
    # QR data: pipe-delimited string that would be QR-encoded
    qr_data = f'{cu_num}|{invoice.total:.2f}|{now_str}|{sig}'
    return ('000', 'Simulated OK (sandbox)', {
        'rcptNo':          seq,
        'intrlData':       sig,
        'rcptSign':        sig,
        'vsdcRcptPbctDt':  now_str[:8],
        'sdcId':           'SBX-DEVICE-001',
        'mrcNo':           f'{seq:04d}',
        'qrCode':          qr_data,
        'cu_invoice_number': cu_num,
    })


def _build_invoice_payload(invoice, cfg):
    """Convert our Invoice model into the KRA eTIMS saveTrnsSaleRcptKey payload."""
    items = json.loads(invoice.items_json or '[]')
    now   = datetime.now(timezone.utc)
    cfm_dt  = now.strftime('%Y%m%d%H%M%S')
    sale_dt = now.strftime('%Y%m%d')

    # Aggregate tax by VAT category
    tax_b_taxable = 0.0
    tax_b_amount  = 0.0
    tax_e_taxable = 0.0
    item_list     = []

    for i, item in enumerate(items, 1):
        rate       = float(item.get('tax_rate', 0.16))
        line_total = float(item.get('line_total', 0))
        qty        = float(item.get('qty', 1))
        unit_price = float(item.get('unit_price', 0))
        discount   = float(item.get('discount', 0))
        sply_amt   = round(unit_price * qty - discount, 2)
        vat_cat    = VAT_CAT.get(round(rate, 2), 'B')
        taxbl_amt  = round(sply_amt / (1 + rate), 2) if rate > 0 else sply_amt
        tax_amt    = round(sply_amt - taxbl_amt, 2) if rate > 0 else 0.0

        if vat_cat == 'B':
            tax_b_taxable = round(tax_b_taxable + taxbl_amt, 2)
            tax_b_amount  = round(tax_b_amount  + tax_amt,   2)
        else:
            tax_e_taxable = round(tax_e_taxable + taxbl_amt, 2)

        # KRA item classification code — use generic for hardware items
        item_cls = '10102303'  # General hardware/building materials

        item_list.append({
            'itemSeq':     i,
            'itemCd':      f'KE2NTXU{i:07d}',
            'itemClsCd':   item_cls,
            'itemNm':      item.get('product_name', 'Item')[:100],
            'bcd':         None,
            'pkgUnitCd':   'NT',
            'pkg':         qty,
            'qtyUnitCd':   'U',
            'qty':         qty,
            'prc':         unit_price,
            'splyAmt':     sply_amt,
            'dcRt':        0,
            'dcAmt':       discount,
            'isrccCd':     None,
            'isrccNm':     None,
            'isrcRt':      None,
            'isrcAmt':     None,
            'vatCatCd':    vat_cat,
            'exciseTxCatCd': None,
            'taxblAmt':    taxbl_amt,
            'taxAmt':      tax_amt,
            'totAmt':      round(taxbl_amt + tax_amt, 2),
        })

    tot_taxbl = round(tax_b_taxable + tax_e_taxable, 2)
    tot_tax   = round(tax_b_amount, 2)
    tot_amt   = round(invoice.total, 2)

    # Payment type code
    pm_codes = {
        'cash':    '01',
        'mpesa':   '02',
        'card':    '03',
        'account': '04',
        'split':   '05',
    }
    # We'd need the sale's payment_method — use generic '05' for unknown
    pmt_code = '01'

    return {
        'tin':          cfg['tin'],
        'bhfId':        cfg['bhf_id'],
        'invcNo':       invoice.id,
        'orgInvcNo':    0,
        'custTin':      invoice.customer_pin or None,
        'custNm':       invoice.customer_name or 'Cash Sale',
        'salesTyCd':    'N',
        'rcptTyCd':     'S',
        'pmtTyCd':      pmt_code,
        'salesSttsCd':  '02',
        'cfmDt':        cfm_dt,
        'salesDt':      sale_dt,
        'stockRlsDt':   None,
        'cnclReqDt':    None,
        'cnclDt':       None,
        'rfdDt':        None,
        'rfdRsnCd':     None,
        'totItemCnt':   len(item_list),
        'taxblAmtA':    0,
        'taxblAmtB':    tax_b_taxable,
        'taxblAmtC':    0,
        'taxblAmtD':    0,
        'taxblAmtE':    tax_e_taxable,
        'taxRtA':       0,
        'taxRtB':       16,
        'taxRtC':       0,
        'taxRtD':       0,
        'taxRtE':       0,
        'taxAmtA':      0,
        'taxAmtB':      tax_b_amount,
        'taxAmtC':      0,
        'taxAmtD':      0,
        'taxAmtE':      0,
        'totTaxblAmt':  tot_taxbl,
        'totTaxAmt':    tot_tax,
        'totAmt':       tot_amt,
        'prchrAcptcYn': 'N',
        'remark':       invoice.notes or None,
        'itemList':     item_list,
    }


def submit_invoice(invoice, store):
    """
    Submit an invoice to KRA eTIMS.
    Returns dict:
      { ok: bool, cu_invoice_number, qr_code, error, status, submitted_at }
    """
    cfg = get_etims_config(store)
    now = datetime.now(timezone.utc)

    if not cfg['enabled']:
        return {
            'ok': False, 'status': 'not_configured',
            'error': 'eTIMS not enabled in settings',
            'cu_invoice_number': None, 'qr_code': None, 'submitted_at': None,
        }

    # Sandbox mode with no real TIN — simulate
    use_simulation = (cfg['mode'] == 'sandbox' and not cfg['tin'])

    try:
        if use_simulation:
            result_cd, result_msg, data = _sandbox_response(invoice)
        else:
            payload = _build_invoice_payload(invoice, cfg)
            result_cd, result_msg, data = _call_api(
                'saveTrnsSaleRcptKey', payload, cfg
            )

        if result_cd == '000':
            cu_num  = data.get('cu_invoice_number') or data.get('mrcNo') or f'CU-{invoice.id}'
            qr_code = data.get('qrCode') or ''
            return {
                'ok': True, 'status': 'submitted',
                'cu_invoice_number': cu_num,
                'qr_code': qr_code,
                'error': None,
                'submitted_at': now.isoformat(),
            }
        else:
            return {
                'ok': False, 'status': 'error',
                'error': f'{result_cd}: {result_msg}',
                'cu_invoice_number': None, 'qr_code': None, 'submitted_at': now.isoformat(),
            }

    except requests.exceptions.ConnectionError:
        return {
            'ok': False, 'status': 'pending',
            'error': 'KRA eTIMS unreachable — will retry',
            'cu_invoice_number': None, 'qr_code': None, 'submitted_at': now.isoformat(),
        }
    except Exception as e:
        return {
            'ok': False, 'status': 'error',
            'error': str(e),
            'cu_invoice_number': None, 'qr_code': None, 'submitted_at': now.isoformat(),
        }


def test_connection(cfg):
    """Ping KRA eTIMS to verify credentials. Returns (ok: bool, message: str)."""
    if not cfg.get('tin'):
        return False, 'TIN not configured'
    if cfg.get('mode') == 'sandbox' and not cfg.get('tin'):
        return True, 'Sandbox mode — simulated OK'
    try:
        result_cd, result_msg, _ = _call_api(
            'selectInitOsdcInfo',
            {'tin': cfg['tin'], 'bhfId': cfg['bhf_id'], 'dvcSrlNo': cfg['device_serial']},
            cfg,
            timeout=10,
        )
        ok = result_cd == '000'
        return ok, result_msg or ('Connected' if ok else 'API error')
    except requests.exceptions.ConnectionError:
        return False, 'Cannot reach KRA eTIMS server'
    except Exception as e:
        return False, str(e)
