import { useState, useEffect } from 'react'
import {
  getProducts, createProduct, updateProduct, deleteProduct,
  getCategories, createCategory,
} from '../api'

const EMPTY_FORM = {
  name: '', barcode: '', price: '', tax_rate: '0',
  tax_class: 'standard', stock_qty: '0',
  low_stock_threshold: '5', category_id: '',
}

export default function Products() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)  // null | { mode: 'add'|'edit', data: {} }
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadProducts()
    loadCategories()
  }, [])

  async function loadProducts(q = '') {
    try {
      const res = await getProducts({ q })
      setProducts(res.data)
    } catch (e) {
      console.error(e)
    }
  }

  async function loadCategories() {
    try {
      const res = await getCategories()
      setCategories(res.data)
    } catch (e) {
      console.error(e)
    }
  }

  function openAdd() {
    setForm(EMPTY_FORM)
    setError('')
    setModal({ mode: 'add' })
  }

  function openEdit(product) {
    setForm({
      name: product.name,
      barcode: product.barcode || '',
      price: String(product.price),
      tax_rate: String(product.tax_rate),
      tax_class: product.tax_class,
      stock_qty: String(product.stock_qty),
      low_stock_threshold: String(product.low_stock_threshold),
      category_id: product.category_id ? String(product.category_id) : '',
    })
    setError('')
    setModal({ mode: 'edit', id: product.id })
  }

  async function handleSave() {
    if (!form.name || !form.price) { setError('Name and price are required'); return }
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        price: parseFloat(form.price),
        tax_rate: parseFloat(form.tax_rate),
        stock_qty: parseInt(form.stock_qty),
        low_stock_threshold: parseInt(form.low_stock_threshold),
        category_id: form.category_id ? parseInt(form.category_id) : null,
      }
      if (modal.mode === 'add') {
        await createProduct(payload)
      } else {
        await updateProduct(modal.id, payload)
      }
      setModal(null)
      loadProducts(search)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(product) {
    if (!confirm(`Deactivate "${product.name}"?`)) return
    try {
      await deleteProduct(product.id)
      loadProducts(search)
    } catch (e) {
      alert(e.message)
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Products</span>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Product</button>
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>
        <input
          className="input"
          placeholder="Search by name or barcode..."
          value={search}
          onChange={e => { setSearch(e.target.value); loadProducts(e.target.value) }}
          style={{ marginBottom: 16 }}
        />

        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Barcode</th>
                <th>Price</th>
                <th>Tax</th>
                <th>Stock</th>
                <th>Category</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr><td colSpan={8} className="empty-state">No products yet</td></tr>
              ) : products.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{p.barcode || '—'}</td>
                  <td>${p.price.toFixed(2)}</td>
                  <td>{p.tax_class} ({(p.tax_rate * 100).toFixed(0)}%)</td>
                  <td>
                    {p.stock_qty <= p.low_stock_threshold && p.stock_qty > 0
                      ? <span className="badge badge-yellow">{p.stock_qty} low</span>
                      : p.stock_qty === 0
                      ? <span className="badge badge-red">0</span>
                      : <span>{p.stock_qty}</span>
                    }
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{p.category_name || '—'}</td>
                  <td>
                    <span className={p.is_active ? 'badge badge-green' : 'badge badge-red'}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)} style={{ marginRight: 6 }}>Edit</button>
                    {p.is_active && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(p)}>Disable</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add / Edit modal ─── */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-title">{modal.mode === 'add' ? 'Add Product' : 'Edit Product'}</div>

            <div className="form-group">
              <label className="label">Name *</label>
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Barcode (EAN/UPC)</label>
              <input className="input" value={form.barcode} placeholder="Scan or type barcode"
                onChange={e => setForm({ ...form, barcode: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="label">Price *</label>
                <input className="input" type="number" min="0" step="0.01"
                  value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Tax Rate (e.g. 0.16 = 16%)</label>
                <input className="input" type="number" min="0" max="1" step="0.01"
                  value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Stock Qty</label>
                <input className="input" type="number" min="0"
                  value={form.stock_qty} onChange={e => setForm({ ...form, stock_qty: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Low Stock Alert</label>
                <input className="input" type="number" min="0"
                  value={form.low_stock_threshold} onChange={e => setForm({ ...form, low_stock_threshold: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="label">Tax Class</label>
                <select className="input" value={form.tax_class}
                  onChange={e => setForm({ ...form, tax_class: e.target.value })}>
                  <option value="standard">Standard</option>
                  <option value="reduced">Reduced</option>
                  <option value="exempt">Exempt</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Category</label>
                <select className="input" value={form.category_id}
                  onChange={e => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">-- None --</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
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
