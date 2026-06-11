import { useState, useEffect } from 'react'
import {
  getServices, createService, updateService, deleteService,
  getServiceCategories, createServiceCategory,
} from '../api'

const DURATIONS = [15, 30, 45, 60, 75, 90, 120]

const BLANK = { name: '', description: '', price: '', duration_minutes: 30, category_id: '', is_active: true }

export default function Services() {
  const [services, setServices] = useState([])
  const [categories, setCategories] = useState([])
  const [modal, setModal] = useState(null)   // null | 'add' | 'edit'
  const [form, setForm] = useState(BLANK)
  const [catModal, setCatModal] = useState(false)
  const [catForm, setCatForm] = useState({ name: '', color: '#4f6ef7' })
  const [filterCat, setFilterCat] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [s, c] = await Promise.all([getServices(), getServiceCategories()])
      setServices(s.data)
      setCategories(c.data)
    } catch (e) { console.error(e) }
  }

  function openAdd() {
    setForm(BLANK)
    setError('')
    setModal('add')
  }

  function openEdit(s) {
    setForm({
      name: s.name, description: s.description || '',
      price: s.price, duration_minutes: s.duration_minutes,
      category_id: s.category_id || '',
      is_active: s.is_active, _id: s.id,
    })
    setError('')
    setModal('edit')
  }

  async function save() {
    if (!form.name || form.price === '') { setError('Name and price are required'); return }
    setSaving(true); setError('')
    const data = {
      name: form.name,
      description: form.description,
      price: parseFloat(form.price),
      duration_minutes: parseInt(form.duration_minutes),
      category_id: form.category_id || null,
      is_active: form.is_active,
    }
    try {
      if (modal === 'edit') await updateService(form._id, data)
      else await createService(data)
      setModal(null)
      load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  async function toggleActive(s) {
    try { await updateService(s.id, { is_active: !s.is_active }); load() }
    catch (e) { alert(e.message) }
  }

  async function saveCategory() {
    if (!catForm.name) return
    setSaving(true)
    try {
      await createServiceCategory(catForm)
      setCatModal(false)
      setCatForm({ name: '', color: '#4f6ef7' })
      load()
    } catch (e) { alert(e.message) } finally { setSaving(false) }
  }

  const visible = filterCat
    ? services.filter(s => String(s.category_id) === filterCat)
    : services

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Services</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => { setCatForm({ name: '', color: '#4f6ef7' }); setCatModal(true) }}>
            + Category
          </button>
          <button className="btn btn-primary" onClick={openAdd}>+ Add Service</button>
        </div>
      </div>

      {/* Category filter pills */}
      <div style={{ display: 'flex', gap: 8, padding: '0 24px 16px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setFilterCat('')}
          style={{
            padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)',
            background: filterCat === '' ? 'var(--accent)' : 'var(--surface)',
            color: filterCat === '' ? '#fff' : 'var(--text)', cursor: 'pointer', fontSize: 13,
          }}>
          All
        </button>
        {categories.map(c => (
          <button key={c.id}
            onClick={() => setFilterCat(String(c.id))}
            style={{
              padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)',
              background: filterCat === String(c.id) ? c.color : 'var(--surface)',
              color: filterCat === String(c.id) ? '#fff' : 'var(--text)', cursor: 'pointer', fontSize: 13,
            }}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Service</th><th>Category</th><th>Duration</th>
                <th>Price</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={7} className="empty-state">No services found</td></tr>
              ) : visible.map(s => (
                <tr key={s.id} style={{ opacity: s.is_active ? 1 : 0.5 }}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    {s.description && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.description}</div>}
                  </td>
                  <td>
                    {s.category_name ? (
                      <span style={{
                        background: s.category_color + '33', color: s.category_color,
                        padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                      }}>{s.category_name}</span>
                    ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{s.duration_minutes} min</td>
                  <td style={{ fontWeight: 600 }}>${s.price.toFixed(2)}</td>
                  <td>
                    <span className={`badge ${s.is_active ? 'badge-green' : 'badge-red'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(s)}>
                      {s.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ width: 480 }}>
            <div className="modal-title">{modal === 'add' ? 'Add Service' : 'Edit Service'}</div>
            <div className="form-group">
              <label className="label">Service Name *</label>
              <input className="input" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Description</label>
              <input className="input" placeholder="Optional description"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="label">Price ($) *</label>
                <input className="input" type="number" min="0" step="0.01"
                  value={form.price}
                  onChange={e => setForm({ ...form, price: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Duration</label>
                <select className="input" value={form.duration_minutes}
                  onChange={e => setForm({ ...form, duration_minutes: parseInt(e.target.value) })}>
                  {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="label">Category</label>
              <select className="input" value={form.category_id}
                onChange={e => setForm({ ...form, category_id: e.target.value })}>
                <option value="">No category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={form.is_active}
                onChange={e => setForm({ ...form, is_active: e.target.checked })} />
              Active (available for booking)
            </label>
            {error && <p className="error-msg">{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {catModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setCatModal(false)}>
          <div className="modal" style={{ width: 360 }}>
            <div className="modal-title">Add Service Category</div>
            <div className="form-group">
              <label className="label">Category Name *</label>
              <input className="input" value={catForm.name}
                onChange={e => setCatForm({ ...catForm, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Color</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={catForm.color}
                  onChange={e => setCatForm({ ...catForm, color: e.target.value })}
                  style={{ width: 40, height: 36, border: 'none', background: 'none', cursor: 'pointer' }} />
                <input className="input" value={catForm.color}
                  onChange={e => setCatForm({ ...catForm, color: e.target.value })} style={{ flex: 1 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setCatModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveCategory} disabled={saving}>
                {saving ? 'Saving...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
