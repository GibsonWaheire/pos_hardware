import { useState, useEffect } from 'react'
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../api'

const EMPTY = { name: '', contact_name: '', phone: '', email: '', address: '', notes: '' }

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const res = await getSuppliers({ active: 'false' })  // show all including inactive
      setSuppliers(res.data)
    } catch (e) { console.error(e) }
  }

  function openAdd() { setForm(EMPTY); setError(''); setModal({ mode: 'add' }) }
  function openEdit(s) {
    setForm({ name: s.name, contact_name: s.contact_name || '', phone: s.phone || '',
      email: s.email || '', address: s.address || '', notes: s.notes || '' })
    setError('')
    setModal({ mode: 'edit', id: s.id })
  }

  async function handleSave() {
    if (!form.name) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      if (modal.mode === 'add') await createSupplier(form)
      else await updateSupplier(modal.id, form)
      setModal(null); load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  async function handleDeactivate(s) {
    if (!confirm(`Deactivate "${s.name}"?`)) return
    try { await deleteSupplier(s.id); load() } catch (e) { alert(e.message) }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Suppliers</span>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Supplier</button>
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>
        {suppliers.length === 0 ? (
          <div className="empty-state">No suppliers yet. Add your first supplier to create purchase orders.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {suppliers.map(s => (
              <div key={s.id} className="card" style={{ opacity: s.is_active ? 1 : 0.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{s.name}</div>
                  <span className={s.is_active ? 'badge badge-green' : 'badge badge-red'}>
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.8 }}>
                  {s.contact_name && <div>Contact: {s.contact_name}</div>}
                  {s.phone && <div>Phone: {s.phone}</div>}
                  {s.email && <div>Email: {s.email}</div>}
                  {s.address && <div>Address: {s.address}</div>}
                  {s.notes && <div style={{ marginTop: 4, fontStyle: 'italic' }}>{s.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>Edit</button>
                  {s.is_active && (
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(s)}>Deactivate</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-title">{modal.mode === 'add' ? 'Add Supplier' : 'Edit Supplier'}</div>

            <div className="form-group">
              <label className="label">Company Name *</label>
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="label">Contact Person</label>
                <input className="input" value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Phone</label>
                <input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="label">Email</label>
              <input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Address</label>
              <input className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Notes</label>
              <textarea className="input" rows={2} value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                style={{ resize: 'vertical' }} />
            </div>

            {error && <p className="error-msg">{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
