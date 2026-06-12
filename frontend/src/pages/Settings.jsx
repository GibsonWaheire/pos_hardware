import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import {
  getStaff, createStaff, updateStaff,
  getStoreConfig, updateStoreConfig,
  getSuppliers,
  generateAuthCard, revokeAuthCard,
} from '../api'

const ROLES = ['cashier', 'inventory', 'purchasing', 'manager', 'admin', 'supplier']

const EMPTY_STAFF = {
  name: '', personal_pin: '', role: 'cashier',
  is_active: true, supplier_id: '',
}

const EMPTY_STORE = {
  name: '', address: '', phone: '', email: '',
  currency: 'KES', timezone: 'Africa/Nairobi',
  tax_number: '', receipt_header: '', receipt_footer: '',
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

  useEffect(() => { loadStaff(); loadStore(); loadSuppliers() }, [])

  async function loadStaff() {
    try { const res = await getStaff(); setStaff(res.data) }
    catch (e) { console.error(e) }
  }

  async function loadStore() {
    try { const res = await getStoreConfig(); setStoreForm({ ...EMPTY_STORE, ...res.data }) }
    catch (e) { console.error(e) }
  }

  async function loadSuppliers() {
    try { const res = await getSuppliers(); setSuppliers(res.data) }
    catch (e) { console.error(e) }
  }

  async function saveStore() {
    setStoreSaving(true); setStoreMsg('')
    try {
      await updateStoreConfig(storeForm)
      setCurrency(storeForm.currency)
      setStoreMsg('Store settings saved')
      setTimeout(() => setStoreMsg(''), 3000)
    } catch (e) { setStoreMsg(e.message) } finally { setStoreSaving(false) }
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 4 }}>
            {storeMsg && <span style={{ fontSize: 13, color: storeMsg.includes('saved') ? 'var(--success)' : 'var(--danger)' }}>{storeMsg}</span>}
            <button className="btn btn-primary" onClick={saveStore} disabled={storeSaving}>
              {storeSaving ? 'Saving...' : 'Save Store Settings'}
            </button>
          </div>
        </div>

        {/* ── Hardware Status ── */}
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>Hardware</div>
        <div className="card" style={{ marginBottom: 24 }}>
          <HardwareRow label="Receipt Printer" desc="ESC/POS over Network / USB / Serial" />
          <HardwareRow label="Barcode Scanner" desc="HID — acts as keyboard input, always ready" />
          <HardwareRow label="Cash Drawer" desc="Triggered via printer or direct serial" />
          <HardwareRow label="Card Terminal" desc="Stripe Terminal SDK — requires STRIPE_SECRET_KEY" />
        </div>

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
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
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
