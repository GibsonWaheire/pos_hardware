import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import {
  getStaff, createStaff, updateStaff,
  getStoreConfig, updateStoreConfig,
  getSuppliers,
  generateAuthCard, revokeAuthCard,
  getNotificationLog, testNotification,
  testEtimsConnection, listPendingEtims, retryPendingEtims, submitEtims,
  pushSheetsNow, getSheetsStatus,
  testPrinter,
} from '../api'

const ROLES = ['cashier', 'inventory', 'receiving', 'purchasing', 'manager', 'admin', 'supplier']

const EMPTY_STAFF = {
  name: '', personal_pin: '', role: 'cashier',
  is_active: true, supplier_id: '',
}

const EMPTY_STORE = {
  name: '', address: '', phone: '', email: '',
  currency: 'KES', timezone: 'Africa/Nairobi',
  tax_number: '', receipt_header: '', receipt_footer: '',
  returns_approval_threshold: 5000,
  default_tax_rate: 16,      // stored as percent in UI, converted to decimal on save
  default_low_stock_threshold: 5,
}

const ROLE_LABELS = {
  cashier:    'Cashier — operates POS terminal, processes sales',
  inventory:  'Inventory — manages stock, adjustments, GRNs',
  receiving:  'Receiving — receiver bay: GRNs, damage reports, stock-in (no PO creation)',
  purchasing: 'Purchasing — creates/manages purchase orders and suppliers',
  manager:    'Manager — approves, reports, full store access (no system config)',
  admin:      'Admin — full access including system settings and cloud sync',
  supplier:   'Supplier — external vendor portal, own POs only',
}

export default function Settings() {
  const { user } = useAuth()
  const { setCurrency } = useCurrency()
  const isManager = user?.role === 'manager' || user?.role === 'admin'

  const [staff, setStaff]       = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [modal, setModal]       = useState(null)   // null | { mode:'add'|'edit', id?, staffObj? }
  const [form, setForm]         = useState(EMPTY_STAFF)
  const [cardCode, setCardCode] = useState(null)   // generated card code to display
  const [cardBusy, setCardBusy] = useState(false)
  const [storeForm, setStoreForm] = useState(EMPTY_STORE)
  const [storeSaving, setStoreSaving] = useState(false)
  const [storeMsg, setStoreMsg] = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  // Notification config state
  const EMPTY_NOTIF = {
    at_api_key: '', at_username: '', at_sender: '',
    smtp_host: '', smtp_port: '587', smtp_user: '', smtp_pass: '', smtp_from: '',
    events: {
      reorder_alert:   { enabled: false, channel: 'sms',   recipient: '' },
      daily_summary:   { enabled: false, channel: 'email', recipient: '' },
      shift_overdue:   { enabled: false, channel: 'sms',   recipient: '' },
      unfiled_reports: { enabled: false, channel: 'email', recipient: '' },
      return_pending:  { enabled: false, channel: 'sms',   recipient: '' },
      account_over_limit: { enabled: false, channel: 'sms', recipient: '' },
      sync_failure:    { enabled: false, channel: 'email', recipient: '' },
    },
  }
  const [notifForm, setNotifForm]   = useState(EMPTY_NOTIF)
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifMsg, setNotifMsg]     = useState('')
  const [notifLog, setNotifLog]     = useState([])
  const [testChannel, setTestChannel] = useState('sms')
  const [testRecipient, setTestRecipient] = useState('')
  const [testBusy, setTestBusy]     = useState(false)
  const [testResult, setTestResult] = useState(null)

  // Google Sheets state
  const EMPTY_SHEETS = {
    enabled: false, spreadsheet_id: '', service_account_json: '',
    tabs: { daily_sales: true, stock_levels: true, shift_reports: true, top_products: true, accounts: true },
  }
  const [sheetsForm, setSheetsForm]       = useState(EMPTY_SHEETS)
  const [sheetsSaving, setSheetsSaving]   = useState(false)
  const [sheetsMsg, setSheetsMsg]         = useState('')
  const [sheetsPushBusy, setSheetsPushBusy] = useState(false)
  const [sheetsPushResult, setSheetsPushResult] = useState(null)
  const [sheetsStatus, setSheetsStatus]   = useState(null)

  // Printer config state
  const EMPTY_PRINTER = { type: 'none', host: '', port: '9100', serial_port: '/dev/ttyUSB0', usb_vendor: '0x04b8', usb_product: '0x0202' }
  const [printerForm, setPrinterForm]       = useState(EMPTY_PRINTER)
  const [printerSaving, setPrinterSaving]   = useState(false)
  const [printerMsg, setPrinterMsg]         = useState('')
  const [printerTestBusy, setPrinterTestBusy] = useState(false)
  const [printerTestResult, setPrinterTestResult] = useState(null)

  // eTIMS state
  const EMPTY_ETIMS = { enabled: false, mode: 'sandbox', tin: '', bhf_id: '00', device_serial: '' }
  const [etimsForm, setEtimsForm]       = useState(EMPTY_ETIMS)
  const [etimsSaving, setEtimsSaving]   = useState(false)
  const [etimsMsg, setEtimsMsg]         = useState('')
  const [etimsTestResult, setEtimsTestResult] = useState(null)
  const [etimsTestBusy, setEtimsTestBusy]     = useState(false)
  const [etimsPending, setEtimsPending]       = useState([])
  const [etimsRetryBusy, setEtimsRetryBusy]   = useState(false)

  useEffect(() => { loadStaff(); loadStore(); loadSuppliers() }, [])
  useEffect(() => {
    if (user?.role === 'admin') {
      getNotificationLog({ limit: 20 }).then(r => setNotifLog(r.data || [])).catch(() => {})
      listPendingEtims().then(r => setEtimsPending(r.data || [])).catch(() => {})
      getSheetsStatus().then(r => setSheetsStatus(r.data)).catch(() => {})
    }
  }, [])

  async function loadStaff() {
    try { const res = await getStaff(); setStaff(res.data) }
    catch (e) { console.error(e) }
  }

  async function loadStore() {
    try {
      const res = await getStoreConfig()
      const d = res.data || {}
      setStoreForm({
        ...EMPTY_STORE, ...d,
        default_tax_rate: d.default_tax_rate != null ? Math.round(d.default_tax_rate * 100) : 16,
        default_low_stock_threshold: d.default_low_stock_threshold ?? 5,
        returns_approval_threshold: d.returns_approval_threshold ?? 5000,
      })
      if (d.notification_config && Object.keys(d.notification_config).length) {
        setNotifForm(prev => ({ ...prev, ...d.notification_config,
          events: { ...EMPTY_NOTIF.events, ...(d.notification_config.events || {}) }
        }))
      }
      if (d.etims_config && Object.keys(d.etims_config).length) {
        setEtimsForm(prev => ({ ...EMPTY_ETIMS, ...prev, ...d.etims_config }))
      }
      if (d.sheets_config && Object.keys(d.sheets_config).length) {
        setSheetsForm(prev => ({ ...EMPTY_SHEETS, ...prev, ...d.sheets_config,
          tabs: { ...EMPTY_SHEETS.tabs, ...(d.sheets_config.tabs || {}) }
        }))
      }
      if (d.printer_config && Object.keys(d.printer_config).length) {
        setPrinterForm(prev => ({ ...EMPTY_PRINTER, ...prev, ...d.printer_config }))
      }
    } catch (e) { console.error(e) }
  }

  async function saveNotifConfig() {
    setNotifSaving(true); setNotifMsg('')
    try {
      await updateStoreConfig({ notification_config: notifForm })
      setNotifMsg('Notification settings saved')
      setTimeout(() => setNotifMsg(''), 3000)
    } catch (e) { setNotifMsg(e.message) } finally { setNotifSaving(false) }
  }

  async function handleTestNotification() {
    if (!testRecipient.trim()) return
    setTestBusy(true); setTestResult(null)
    try {
      const res = await testNotification({ channel: testChannel, recipient: testRecipient.trim() })
      setTestResult(res.data)
      getNotificationLog({ limit: 20 }).then(r => setNotifLog(r.data || [])).catch(() => {})
    } catch (e) { setTestResult({ ok: false, error: e.message }) } finally { setTestBusy(false) }
  }

  async function loadSuppliers() {
    try { const res = await getSuppliers(); setSuppliers(res.data) }
    catch (e) { console.error(e) }
  }

  async function saveStore() {
    setStoreSaving(true); setStoreMsg('')
    try {
      await updateStoreConfig({
        ...storeForm,
        // Convert percent back to decimal for backend
        default_tax_rate: parseFloat(storeForm.default_tax_rate) / 100,
        default_low_stock_threshold: parseInt(storeForm.default_low_stock_threshold) || 5,
        returns_approval_threshold: parseFloat(storeForm.returns_approval_threshold) || 5000,
      })
      setCurrency(storeForm.currency)
      setStoreMsg('Store settings saved')
      setTimeout(() => setStoreMsg(''), 3000)
    } catch (e) { setStoreMsg(e.message) } finally { setStoreSaving(false) }
  }

  async function saveSheetsConfig() {
    setSheetsSaving(true); setSheetsMsg('')
    try {
      await updateStoreConfig({ sheets_config: sheetsForm })
      setSheetsMsg('Google Sheets settings saved')
      setTimeout(() => setSheetsMsg(''), 3000)
    } catch (e) { setSheetsMsg(e.message) } finally { setSheetsSaving(false) }
  }

  async function savePrinterConfig() {
    setPrinterSaving(true); setPrinterMsg('')
    try {
      await updateStoreConfig({ printer_config: printerForm })
      setPrinterMsg('Printer settings saved')
      setTimeout(() => setPrinterMsg(''), 3000)
    } catch (e) { setPrinterMsg(e.message) } finally { setPrinterSaving(false) }
  }

  async function handleTestPrinter() {
    // Save first, then test
    try { await updateStoreConfig({ printer_config: printerForm }) } catch (_) {}
    setPrinterTestBusy(true); setPrinterTestResult(null)
    try {
      const res = await testPrinter()
      setPrinterTestResult(res.data)
    } catch (e) {
      setPrinterTestResult({ ok: false, error: e.response?.data?.error || e.message })
    } finally { setPrinterTestBusy(false) }
  }

  async function handlePushNow() {
    setSheetsPushBusy(true); setSheetsPushResult(null)
    // Save latest form values first
    try { await updateStoreConfig({ sheets_config: sheetsForm }) } catch (_) {}
    try {
      const res = await pushSheetsNow()
      setSheetsPushResult(res.data)
      getSheetsStatus().then(r => setSheetsStatus(r.data)).catch(() => {})
    } catch (e) { setSheetsPushResult({ ok: false, error: e.message }) } finally { setSheetsPushBusy(false) }
  }

  async function saveEtimsConfig() {
    setEtimsSaving(true); setEtimsMsg('')
    try {
      await updateStoreConfig({ etims_config: etimsForm })
      setEtimsMsg('eTIMS settings saved')
      setTimeout(() => setEtimsMsg(''), 3000)
    } catch (e) { setEtimsMsg(e.message) } finally { setEtimsSaving(false) }
  }

  async function handleTestEtims() {
    setEtimsTestBusy(true); setEtimsTestResult(null)
    // Save first so backend uses latest values
    try { await updateStoreConfig({ etims_config: etimsForm }) } catch (_) {}
    try {
      const res = await testEtimsConnection()
      setEtimsTestResult(res.data)
    } catch (e) { setEtimsTestResult({ ok: false, message: e.message }) } finally { setEtimsTestBusy(false) }
  }

  async function handleRetryAllEtims() {
    setEtimsRetryBusy(true)
    try {
      const res = await retryPendingEtims()
      setEtimsMsg(`Retry complete: ${res.data.submitted} submitted, ${res.data.failed} failed`)
      const pend = await listPendingEtims()
      setEtimsPending(pend.data || [])
    } catch (e) { setEtimsMsg(e.message) } finally { setEtimsRetryBusy(false) }
  }

  async function handleRetryOne(invoiceId) {
    try {
      await submitEtims(invoiceId)
      const pend = await listPendingEtims()
      setEtimsPending(pend.data || [])
    } catch (e) { console.error(e) }
  }

  function openAdd() {
    setForm(EMPTY_STAFF); setError(''); setCardCode(null)
    setModal({ mode: 'add' })
  }

  function openEdit(s) {
    setForm({
      name: s.name,
      personal_pin: '',
      role: s.role,
      is_active: s.is_active,
      supplier_id: s.supplier_id || '',
    })
    setError(''); setCardCode(null)
    setModal({ mode: 'edit', id: s.id, staffObj: s })
  }

  async function handleSave() {
    if (!form.name) { setError('Name is required'); return }
    setSaving(true); setError('')
    const payload = {
      name: form.name,
      role: form.role,
      is_active: form.is_active,
      supplier_id: form.role === 'supplier' && form.supplier_id ? parseInt(form.supplier_id) : null,
    }
    if (form.personal_pin) payload.personal_pin = form.personal_pin
    try {
      if (modal.mode === 'add') { await createStaff(payload) }
      else { await updateStaff(modal.id, payload) }
      setModal(null); loadStaff()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  async function handleGenerateCard() {
    setCardBusy(true); setError('')
    try {
      const res = await generateAuthCard(modal.id)
      setCardCode(res.data.auth_card_code)
      loadStaff()
    } catch (e) { setError(e.message) } finally { setCardBusy(false) }
  }

  async function handleRevokeCard() {
    if (!confirm('Revoke this auth card? It will stop working immediately.')) return
    setCardBusy(true); setError('')
    try {
      await revokeAuthCard(modal.id)
      setCardCode(null)
      loadStaff()
      // Refresh staffObj
      setModal(m => ({ ...m, staffObj: { ...m.staffObj, has_auth_card: false } }))
    } catch (e) { setError(e.message) } finally { setCardBusy(false) }
  }

  const canManageCard = isManager && modal?.mode === 'edit' &&
    (form.role === 'manager' || form.role === 'admin')

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Settings</span>
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>

        {/* ── Staff Management ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Staff</div>
          {isManager && (
            <button className="btn btn-primary" onClick={openAdd}>+ Add Staff</button>
          )}
        </div>

        <div className="card" style={{ padding: 0, marginBottom: 24 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th><th>Role</th><th>Status</th><th>Auth Card</th>
                {isManager && <th></th>}
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr><td colSpan={5} className="empty-state">No staff members</td></tr>
              ) : staff.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td><span className={`badge ${ROLE_BADGE[s.role] || 'badge-blue'}`}>{s.role}</span></td>
                  <td>
                    <span className={s.is_active ? 'badge badge-green' : 'badge badge-red'}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    {(s.role === 'manager' || s.role === 'admin') ? (
                      <span className={`badge ${s.has_auth_card ? 'badge-green' : 'badge-red'}`}>
                        {s.has_auth_card ? 'Card issued' : 'No card'}
                      </span>
                    ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                  </td>
                  {isManager && (
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>Edit</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Store Configuration ── */}
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, marginTop: 8 }}>Store Configuration</div>
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Store Name</label>
              <input className="input" value={storeForm.name} onChange={e => setStoreForm({ ...storeForm, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Phone</label>
              <input className="input" value={storeForm.phone} onChange={e => setStoreForm({ ...storeForm, phone: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Email</label>
              <input className="input" type="email" value={storeForm.email} onChange={e => setStoreForm({ ...storeForm, email: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Tax / VAT Number</label>
              <input className="input" value={storeForm.tax_number} onChange={e => setStoreForm({ ...storeForm, tax_number: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="label">Address</label>
            <input className="input" value={storeForm.address} onChange={e => setStoreForm({ ...storeForm, address: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Currency</label>
              <select className="input" value={storeForm.currency} onChange={e => setStoreForm({ ...storeForm, currency: e.target.value })}>
                <option value="KES">KES – Kenyan Shilling</option>
                <option value="USD">USD – US Dollar</option>
                <option value="EUR">EUR – Euro</option>
                <option value="GBP">GBP – British Pound</option>
                <option value="ZAR">ZAR – South African Rand</option>
                <option value="TZS">TZS – Tanzanian Shilling</option>
                <option value="UGX">UGX – Ugandan Shilling</option>
              </select>
            </div>
            <div className="form-group">
              <label className="label">Timezone</label>
              <select className="input" value={storeForm.timezone} onChange={e => setStoreForm({ ...storeForm, timezone: e.target.value })}>
                <option value="Africa/Nairobi">Africa/Nairobi</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">US Eastern</option>
                <option value="America/Chicago">US Central</option>
                <option value="America/Los_Angeles">US Pacific</option>
                <option value="Europe/London">Europe/London</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Receipt Header</label>
              <input className="input" placeholder="e.g. Thank you for visiting!" value={storeForm.receipt_header} onChange={e => setStoreForm({ ...storeForm, receipt_header: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Receipt Footer</label>
              <input className="input" placeholder="e.g. No refunds after 7 days" value={storeForm.receipt_footer} onChange={e => setStoreForm({ ...storeForm, receipt_footer: e.target.value })} />
            </div>
          </div>
          {/* Business rules */}
          <div style={{ fontWeight: 600, fontSize: 13, margin: '16px 0 10px', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            Business Rules
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">Returns Approval Threshold (KES)</label>
              <input className="input" type="number" min={0} step={500}
                value={storeForm.returns_approval_threshold}
                onChange={e => setStoreForm({ ...storeForm, returns_approval_threshold: e.target.value })} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Refunds above this amount require manager approval</div>
            </div>
            <div className="form-group">
              <label className="label">Default VAT Rate (%)</label>
              <input className="input" type="number" min={0} max={100} step={1}
                value={storeForm.default_tax_rate}
                onChange={e => setStoreForm({ ...storeForm, default_tax_rate: e.target.value })} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Applied to new products by default (Kenya standard: 16%)</div>
            </div>
            <div className="form-group">
              <label className="label">Default Low Stock Threshold (units)</label>
              <input className="input" type="number" min={1} step={1}
                value={storeForm.default_low_stock_threshold}
                onChange={e => setStoreForm({ ...storeForm, default_low_stock_threshold: e.target.value })} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Alert level for new products</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 4 }}>
            {storeMsg && <span style={{ fontSize: 13, color: storeMsg.includes('saved') ? 'var(--success)' : 'var(--danger)' }}>{storeMsg}</span>}
            <button className="btn btn-primary" onClick={saveStore} disabled={storeSaving}>
              {storeSaving ? 'Saving...' : 'Save Store Settings'}
            </button>
          </div>
        </div>

        {/* ── Hardware ── */}
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>Hardware</div>
        <div className="card" style={{ marginBottom: 24 }}>
          {/* Printer config — admin only */}
          {user?.role === 'admin' ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Receipt Printer (ESC/POS)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, alignItems: 'start' }}>
                <div className="form-group">
                  <label className="label">Connection Type</label>
                  <select className="input" value={printerForm.type}
                    onChange={e => setPrinterForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="none">None (dev / no printer)</option>
                    <option value="network">Network (TCP/IP)</option>
                    <option value="usb">USB</option>
                    <option value="serial">Serial Port</option>
                  </select>
                </div>
                {printerForm.type === 'network' && (<>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12 }}>
                    <div className="form-group">
                      <label className="label">Printer IP Address</label>
                      <input className="input" placeholder="192.168.1.100" value={printerForm.host}
                        onChange={e => setPrinterForm(f => ({ ...f, host: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="label">Port</label>
                      <input className="input" type="number" placeholder="9100" value={printerForm.port}
                        onChange={e => setPrinterForm(f => ({ ...f, port: e.target.value }))} />
                    </div>
                  </div>
                </>)}
                {printerForm.type === 'usb' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                      <label className="label">USB Vendor ID (hex)</label>
                      <input className="input" placeholder="0x04b8" value={printerForm.usb_vendor}
                        onChange={e => setPrinterForm(f => ({ ...f, usb_vendor: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="label">USB Product ID (hex)</label>
                      <input className="input" placeholder="0x0202" value={printerForm.usb_product}
                        onChange={e => setPrinterForm(f => ({ ...f, usb_product: e.target.value }))} />
                    </div>
                  </div>
                )}
                {printerForm.type === 'serial' && (
                  <div className="form-group">
                    <label className="label">Serial Port</label>
                    <input className="input" placeholder="/dev/ttyUSB0 or COM3" value={printerForm.serial_port}
                      onChange={e => setPrinterForm(f => ({ ...f, serial_port: e.target.value }))} />
                  </div>
                )}
                {printerForm.type === 'none' && (
                  <div style={{ paddingTop: 28, fontSize: 12, color: 'var(--text-muted)' }}>
                    No printer connected. Sales will complete normally and receipts can be reprinted when a printer is configured.
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                <button className="btn btn-primary" onClick={savePrinterConfig} disabled={printerSaving}>
                  {printerSaving ? 'Saving...' : 'Save Printer Config'}
                </button>
                {printerForm.type !== 'none' && (
                  <button className="btn btn-secondary" onClick={handleTestPrinter} disabled={printerTestBusy}>
                    {printerTestBusy ? 'Printing...' : 'Print Test Page'}
                  </button>
                )}
                {printerMsg && <span style={{ fontSize: 13, color: printerMsg.includes('saved') ? 'var(--success)' : 'var(--danger)' }}>{printerMsg}</span>}
                {printerTestResult && (
                  <span style={{ fontSize: 13, color: printerTestResult.ok ? 'var(--success)' : 'var(--danger)' }}>
                    {printerTestResult.ok ? (printerTestResult.message || 'Test OK') : (printerTestResult.error || 'Failed')}
                  </span>
                )}
              </div>
              <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />
            </div>
          ) : (
            <HardwareRow label="Receipt Printer" desc="ESC/POS over Network / USB / Serial (admin configures)" />
          )}
          <HardwareRow label="Barcode Scanner" desc="HID — acts as keyboard input, always ready" />
          <HardwareRow label="Cash Drawer" desc="Triggered via printer RJ-11 port (ESC/POS kick command)" />
          <HardwareRow label="Card Terminal" desc="Stripe Terminal SDK — requires STRIPE_SECRET_KEY" />
        </div>

        {/* ── Notifications (admin only) ── */}
        {user?.role === 'admin' && (
          <>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>Notifications</div>

            {/* SMS — Africa's Talking */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
                SMS — Africa's Talking
                <a href="https://africastalking.com" target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 8, fontWeight: 400 }}>
                  Get API key
                </a>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="label">AT Username</label>
                  <input className="input" placeholder="sandbox or your account username"
                    value={notifForm.at_username}
                    onChange={e => setNotifForm({ ...notifForm, at_username: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="label">AT API Key</label>
                  <input className="input" type="password" placeholder="••••••••"
                    value={notifForm.at_api_key}
                    onChange={e => setNotifForm({ ...notifForm, at_api_key: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="label">Sender ID (optional)</label>
                  <input className="input" placeholder="e.g. HARDWARE"
                    value={notifForm.at_sender}
                    onChange={e => setNotifForm({ ...notifForm, at_sender: e.target.value })} />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    Must be registered with Africa's Talking
                  </div>
                </div>
              </div>
            </div>

            {/* Email — SMTP */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Email — SMTP</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="label">SMTP Host</label>
                  <input className="input" placeholder="smtp.gmail.com"
                    value={notifForm.smtp_host}
                    onChange={e => setNotifForm({ ...notifForm, smtp_host: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="label">Port</label>
                  <select className="input" value={notifForm.smtp_port}
                    onChange={e => setNotifForm({ ...notifForm, smtp_port: e.target.value })}>
                    <option value="587">587 (TLS/STARTTLS)</option>
                    <option value="465">465 (SSL)</option>
                    <option value="25">25 (plain)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">From Address</label>
                  <input className="input" placeholder="pos@mystore.co.ke"
                    value={notifForm.smtp_from}
                    onChange={e => setNotifForm({ ...notifForm, smtp_from: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="label">Username / Email</label>
                  <input className="input"
                    value={notifForm.smtp_user}
                    onChange={e => setNotifForm({ ...notifForm, smtp_user: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="label">Password / App Password</label>
                  <input className="input" type="password" placeholder="••••••••"
                    value={notifForm.smtp_pass}
                    onChange={e => setNotifForm({ ...notifForm, smtp_pass: e.target.value })} />
                </div>
              </div>
            </div>

            {/* Per-event toggles */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Event Triggers</div>
              {[
                { key: 'reorder_alert',   label: 'Product below reorder point',   channels: ['sms', 'email'] },
                { key: 'daily_summary',   label: 'Daily sales summary (end of day)', channels: ['sms', 'email'] },
                { key: 'shift_overdue',   label: 'Shift not closed by 10pm',       channels: ['sms'] },
                { key: 'unfiled_reports', label: 'Unfiled shift reports (> 2 days)', channels: ['email'] },
                { key: 'return_pending',  label: 'Return pending approval (> 1hr)', channels: ['sms', 'email'] },
                { key: 'account_over_limit', label: 'Account over credit limit',   channels: ['sms', 'email'] },
                { key: 'sync_failure',    label: 'Cloud sync failure',             channels: ['email'] },
              ].map(ev => {
                const evData = notifForm.events?.[ev.key] || { enabled: false, channel: ev.channels[0], recipient: '' }
                function upd(patch) {
                  setNotifForm(f => ({ ...f, events: { ...f.events, [ev.key]: { ...evData, ...patch } } }))
                }
                return (
                  <div key={ev.key} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 100px 1fr', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <input type="checkbox" checked={!!evData.enabled} onChange={e => upd({ enabled: e.target.checked })} />
                    <span style={{ fontSize: 13, color: evData.enabled ? 'var(--text)' : 'var(--text-muted)' }}>{ev.label}</span>
                    <select className="input" style={{ padding: '4px 8px', fontSize: 12 }}
                      value={evData.channel} onChange={e => upd({ channel: e.target.value })}
                      disabled={!evData.enabled}>
                      {ev.channels.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                    </select>
                    <input className="input" style={{ padding: '4px 8px', fontSize: 12 }}
                      placeholder={evData.channel === 'sms' ? '+254712345678' : 'manager@store.co.ke'}
                      value={evData.recipient} onChange={e => upd({ recipient: e.target.value })}
                      disabled={!evData.enabled} />
                  </div>
                )
              })}
            </div>

            {/* Test + save */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Test Delivery</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="label">Channel</label>
                  <select className="input" value={testChannel} onChange={e => setTestChannel(e.target.value)} style={{ width: 100 }}>
                    <option value="sms">SMS</option>
                    <option value="email">Email</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 200 }}>
                  <label className="label">{testChannel === 'sms' ? 'Phone (+254…)' : 'Email address'}</label>
                  <input className="input" value={testRecipient}
                    onChange={e => setTestRecipient(e.target.value)}
                    placeholder={testChannel === 'sms' ? '+254712345678' : 'you@example.com'} />
                </div>
                <button className="btn btn-ghost" onClick={handleTestNotification}
                  disabled={testBusy || !testRecipient.trim()}>
                  {testBusy ? 'Sending…' : `Send Test ${testChannel.toUpperCase()}`}
                </button>
              </div>
              {testResult && (
                <div style={{ marginTop: 8, fontSize: 13, color: testResult.ok ? 'var(--success)' : 'var(--danger)', fontWeight: 500 }}>
                  {testResult.ok ? `Sent — ${testResult.detail}` : `Failed — ${testResult.error}`}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              {notifMsg && <span style={{ fontSize: 13, color: notifMsg.includes('saved') ? 'var(--success)' : 'var(--danger)' }}>{notifMsg}</span>}
              <button className="btn btn-primary" onClick={saveNotifConfig} disabled={notifSaving}>
                {notifSaving ? 'Saving…' : 'Save Notification Settings'}
              </button>
            </div>

            {/* Notification log */}
            {notifLog.length > 0 && (
              <>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Recent Notifications</div>
                <div className="card" style={{ padding: 0, marginBottom: 24 }}>
                  <table className="table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr><th>Time</th><th>Event</th><th>Channel</th><th>Recipient</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {notifLog.map(n => (
                        <tr key={n.id}>
                          <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(n.created_at).toLocaleString()}</td>
                          <td>{n.event_type}</td>
                          <td><span className="badge badge-blue" style={{ fontSize: 10 }}>{n.channel}</span></td>
                          <td style={{ color: 'var(--text-muted)' }}>{n.recipient}</td>
                          <td>
                            <span className={`badge ${n.status === 'sent' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>
                              {n.status}
                            </span>
                            {n.error && <span style={{ fontSize: 10, color: 'var(--danger)', marginLeft: 4 }}>{n.error}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ── Google Sheets Export ── */}
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, marginTop: 8 }}>Google Sheets Export</div>
            <div className="card" style={{ marginBottom: 24 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
                Nightly one-way push to Google Sheets
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
                  Runs automatically at 23:45 every night
                </span>
              </div>

              {/* Enable */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 6, border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!sheetsForm.enabled}
                    onChange={e => setSheetsForm({ ...sheetsForm, enabled: e.target.checked })} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Enable nightly Google Sheets export</span>
                </label>
              </div>

              {/* Spreadsheet */}
              <div className="form-group">
                <label className="label">Spreadsheet URL or ID</label>
                <input className="input" placeholder="https://docs.google.com/spreadsheets/d/… or just the ID"
                  value={sheetsForm.spreadsheet_id}
                  onChange={e => setSheetsForm({ ...sheetsForm, spreadsheet_id: e.target.value })} />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  Share the spreadsheet with the service account email (Editor access)
                </div>
              </div>

              {/* Service account JSON */}
              <div className="form-group">
                <label className="label">Service Account Key (JSON)</label>
                <textarea className="input" rows={5}
                  placeholder={'Paste the full contents of your service account JSON key file here…\n{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}'}
                  value={sheetsForm.service_account_json}
                  onChange={e => setSheetsForm({ ...sheetsForm, service_account_json: e.target.value })}
                  style={{ fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }} />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  Create a service account in Google Cloud Console → APIs &amp; Services → Credentials → Service Accounts → Keys
                </div>
              </div>

              {/* Tab toggles */}
              <div style={{ fontWeight: 600, fontSize: 13, margin: '12px 0 8px' }}>Tabs to export</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
                {[
                  { key: 'daily_sales',   label: 'Daily Sales' },
                  { key: 'stock_levels',  label: 'Stock Levels' },
                  { key: 'shift_reports', label: 'Shift Reports' },
                  { key: 'top_products',  label: 'Top Products' },
                  { key: 'accounts',      label: 'Accounts' },
                ].map(({ key, label }) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', padding: '8px 10px', background: 'var(--surface2)', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <input type="checkbox"
                      checked={!!sheetsForm.tabs?.[key]}
                      onChange={e => setSheetsForm(f => ({ ...f, tabs: { ...f.tabs, [key]: e.target.checked } }))} />
                    {label}
                  </label>
                ))}
              </div>

              {/* Last push status */}
              {sheetsStatus?.last_push_at && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 6 }}>
                  Last push: {new Date(sheetsStatus.last_push_at).toLocaleString('en-KE')}
                  {sheetsStatus.last_push_result && (
                    <span style={{ marginLeft: 8, color: sheetsStatus.last_push_result.ok ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                      {sheetsStatus.last_push_result.ok
                        ? `✓ OK — ${(sheetsStatus.last_push_result.pushed || []).join(', ')}`
                        : `✗ ${sheetsStatus.last_push_result.error}`}
                    </span>
                  )}
                </div>
              )}

              {/* Push result */}
              {sheetsPushResult && (
                <div style={{ marginBottom: 12, padding: '8px 12px', background: sheetsPushResult.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${sheetsPushResult.ok ? 'var(--success)' : 'var(--danger)'}`, borderRadius: 6, fontSize: 13 }}>
                  {sheetsPushResult.ok
                    ? `Pushed: ${(sheetsPushResult.pushed || []).join(', ')}`
                    : `Error: ${sheetsPushResult.error}`}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                <button className="btn btn-ghost" onClick={handlePushNow} disabled={sheetsPushBusy}>
                  {sheetsPushBusy ? 'Pushing…' : 'Push Now'}
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {sheetsMsg && <span style={{ fontSize: 13, color: sheetsMsg.includes('saved') ? 'var(--success)' : 'var(--danger)' }}>{sheetsMsg}</span>}
                  <button className="btn btn-primary" onClick={saveSheetsConfig} disabled={sheetsSaving}>
                    {sheetsSaving ? 'Saving…' : 'Save Sheets Settings'}
                  </button>
                </div>
              </div>
            </div>

            {/* ── eTIMS / KRA Integration ── */}
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, marginTop: 8 }}>KRA eTIMS Integration</div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
                Electronic Tax Invoice Management System
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
                  Mandatory for VAT-registered businesses in Kenya
                </span>
              </div>

              {/* Enable + mode */}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'center', marginBottom: 16, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 6, border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!etimsForm.enabled}
                    onChange={e => setEtimsForm({ ...etimsForm, enabled: e.target.checked })} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Enable eTIMS submission</span>
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input type="radio" name="etims_mode" value="sandbox"
                      checked={etimsForm.mode === 'sandbox'}
                      onChange={() => setEtimsForm({ ...etimsForm, mode: 'sandbox' })} />
                    Sandbox (testing)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', marginLeft: 12 }}>
                    <input type="radio" name="etims_mode" value="production"
                      checked={etimsForm.mode === 'production'}
                      onChange={() => setEtimsForm({ ...etimsForm, mode: 'production' })} />
                    Production
                  </label>
                </div>
              </div>

              {/* Credentials */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="label">KRA TIN</label>
                  <input className="input" placeholder="P0512345678X"
                    value={etimsForm.tin}
                    onChange={e => setEtimsForm({ ...etimsForm, tin: e.target.value })} />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Your KRA Tax Identification Number</div>
                </div>
                <div className="form-group">
                  <label className="label">Branch ID (bhfId)</label>
                  <input className="input" placeholder="00"
                    value={etimsForm.bhf_id}
                    onChange={e => setEtimsForm({ ...etimsForm, bhf_id: e.target.value })} />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Main branch = 00</div>
                </div>
                <div className="form-group">
                  <label className="label">Device Serial (VSCU/OSCU)</label>
                  <input className="input" placeholder="SN1234567890"
                    value={etimsForm.device_serial}
                    onChange={e => setEtimsForm({ ...etimsForm, device_serial: e.target.value })} />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>From your KRA-issued device</div>
                </div>
              </div>

              {/* Test connection */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <button className="btn btn-ghost" onClick={handleTestEtims} disabled={etimsTestBusy}>
                  {etimsTestBusy ? 'Testing…' : 'Test Connection'}
                </button>
                {etimsTestResult && (
                  <span style={{ fontSize: 13, fontWeight: 500, color: etimsTestResult.ok ? 'var(--success)' : 'var(--danger)' }}>
                    {etimsTestResult.ok ? 'Connected — ' : 'Failed — '}{etimsTestResult.message}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                {etimsMsg && <span style={{ fontSize: 13, color: etimsMsg.includes('saved') || etimsMsg.includes('complete') ? 'var(--success)' : 'var(--danger)' }}>{etimsMsg}</span>}
                <button className="btn btn-primary" onClick={saveEtimsConfig} disabled={etimsSaving}>
                  {etimsSaving ? 'Saving…' : 'Save eTIMS Settings'}
                </button>
              </div>
            </div>

            {/* Pending / failed eTIMS submissions */}
            {etimsPending.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    Pending / Failed eTIMS Submissions ({etimsPending.length})
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={handleRetryAllEtims} disabled={etimsRetryBusy}>
                    {etimsRetryBusy ? 'Retrying…' : 'Retry All'}
                  </button>
                </div>
                <div className="card" style={{ padding: 0, marginBottom: 24 }}>
                  <table className="table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr><th>Invoice</th><th>Date</th><th>Total</th><th>Status</th><th>Error</th><th></th></tr>
                    </thead>
                    <tbody>
                      {etimsPending.map(inv => (
                        <tr key={inv.id}>
                          <td style={{ fontWeight: 500 }}>{inv.invoice_number}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-KE') : '—'}</td>
                          <td>KES {Number(inv.total).toLocaleString()}</td>
                          <td>
                            <span className={`badge ${inv.etims_status === 'pending' ? 'badge-yellow' : 'badge-red'}`} style={{ fontSize: 10 }}>
                              {inv.etims_status}
                            </span>
                          </td>
                          <td style={{ color: 'var(--danger)', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {inv.etims_error || '—'}
                          </td>
                          <td>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleRetryOne(inv.id)}>Retry</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

      </div>

      {/* ── Staff modal ── */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ width: 480 }}>
            <div className="modal-title">{modal.mode === 'add' ? 'Add Staff' : 'Edit Staff'}</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="label">Name *</label>
                <input className="input" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="label">Personal PIN</label>
                <input className="input" type="password" maxLength={8}
                  placeholder={modal.mode === 'edit' ? 'Leave blank to keep current' : '4-digit PIN'}
                  value={form.personal_pin}
                  onChange={e => setForm({ ...form, personal_pin: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="label">Role</label>
                <select className="input" value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value, supplier_id: '' })}>
                  {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
                {form.role && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    {ROLE_LABELS[form.role]}
                  </div>
                )}
              </div>

              {form.role === 'supplier' && (
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="label">Linked Supplier</label>
                  <select className="input" value={form.supplier_id}
                    onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                    <option value="">— select supplier —</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="label">Status</label>
                <select className="input" value={form.is_active ? 'active' : 'inactive'}
                  onChange={e => setForm({ ...form, is_active: e.target.value === 'active' })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            {/* Auth card section — manager/admin only */}
            {canManageCard && (
              <div style={{ marginTop: 16, padding: 14, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Authorization Card</div>

                {cardCode ? (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                      Card code generated. Copy this code, print it as a barcode or QR, and laminate.
                    </div>
                    <div style={{
                      fontFamily: 'monospace', fontSize: 13, padding: '8px 12px',
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 6, wordBreak: 'break-all', marginBottom: 8,
                    }}>
                      {cardCode}
                    </div>
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => { navigator.clipboard.writeText(cardCode) }}>
                      Copy Code
                    </button>
                  </div>
                ) : modal.staffObj?.has_auth_card ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: 'var(--success)' }}>Card issued and active</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-sm" onClick={handleGenerateCard} disabled={cardBusy}>
                        Regenerate
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={handleRevokeCard} disabled={cardBusy}>
                        Revoke
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No card issued</span>
                    <button className="btn btn-primary btn-sm" onClick={handleGenerateCard} disabled={cardBusy}>
                      {cardBusy ? 'Generating...' : 'Generate Card'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {error && <p className="error-msg" style={{ marginTop: 12 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const ROLE_BADGE = {
  admin:      'badge-red',
  manager:    'badge-blue',
  cashier:    'badge-green',
  inventory:  'badge-green',
  receiving:  'badge-green',
  purchasing: 'badge-yellow',
  supplier:   'badge-blue',
}

function HardwareRow({ label, desc }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</div>
      </div>
      <span className="badge badge-blue" style={{ alignSelf: 'center' }}>Configured via .env</span>
    </div>
  )
}
