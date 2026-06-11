import { useState, useEffect } from 'react'
import { getStaff, createStaff, updateStaff } from '../api'

const EMPTY_STAFF = { name: '', pin: '', role: 'cashier' }

export default function Settings() {
  const [staff, setStaff] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_STAFF)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadStaff() }, [])

  async function loadStaff() {
    try {
      const res = await getStaff()
      setStaff(res.data)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleSave() {
    if (!form.name) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      if (modal.mode === 'add') {
        await createStaff(form)
      } else {
        await updateStaff(modal.id, form)
      }
      setModal(null)
      loadStaff()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Settings</span>
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>
        {/* Staff Management */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Staff / Cashiers</div>
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY_STAFF); setError(''); setModal({ mode: 'add' }) }}>
            + Add Staff
          </button>
        </div>

        <div className="card" style={{ padding: 0, marginBottom: 24 }}>
          <table className="table">
            <thead>
              <tr><th>Name</th><th>PIN</th><th>Role</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr><td colSpan={5} className="empty-state">No staff members</td></tr>
              ) : staff.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td style={{ fontFamily: 'monospace', letterSpacing: 4 }}>••••</td>
                  <td>
                    <span className={`badge ${s.role === 'admin' ? 'badge-blue' : 'badge-green'}`}>{s.role}</span>
                  </td>
                  <td>
                    <span className={s.is_active ? 'badge badge-green' : 'badge badge-red'}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      setForm({ name: s.name, pin: '', role: s.role })
                      setError('')
                      setModal({ mode: 'edit', id: s.id })
                    }}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Hardware Status */}
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>Hardware</div>
        <div className="card" style={{ marginBottom: 24 }}>
          <HardwareRow label="Receipt Printer" desc="ESC/POS over Network / USB / Serial" />
          <HardwareRow label="Barcode Scanner" desc="HID — acts as keyboard input, always ready" />
          <HardwareRow label="Cash Drawer" desc="Triggered via printer or direct serial" />
          <HardwareRow label="Card Terminal" desc="Stripe Terminal SDK — requires STRIPE_SECRET_KEY" />
        </div>

        {/* Phase notes */}
        <div className="card" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Phase 1 — Core Engine</div>
          <ul style={{ paddingLeft: 18, lineHeight: 2 }}>
            <li>Product catalog with barcodes</li>
            <li>Barcode scan to cart</li>
            <li>Cash / Card / Split checkout</li>
            <li>Stripe Terminal SDK integration</li>
            <li>ESC/POS thermal receipt printing</li>
            <li>Cash drawer trigger</li>
            <li>Offline queue for sales when no internet</li>
          </ul>
          <div style={{ marginTop: 12, fontSize: 12 }}>
            Next: Phase 2 — Inventory &amp; Operations (suppliers, purchase orders, returns, reconciliation)
          </div>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-title">{modal.mode === 'add' ? 'Add Staff' : 'Edit Staff'}</div>
            <div className="form-group">
              <label className="label">Name *</label>
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">PIN (4 digits)</label>
              <input className="input" type="password" maxLength={6} placeholder="Leave blank to keep current"
                value={form.pin} onChange={e => setForm({ ...form, pin: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Role</label>
              <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="cashier">Cashier</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {error && <p className="error-msg">{error}</p>}
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
