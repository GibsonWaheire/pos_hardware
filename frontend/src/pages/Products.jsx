import { useState, useEffect, useRef } from 'react'
import {
  getProducts, createProduct, updateProduct, deleteProduct,
  getCategories, createCategory, getStoreConfig, getSuppliers,
  uploadProductImage, deleteProductImage, importProductsCSV,
} from '../api'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import { printBarcodeLabel } from '../utils/print'
import Pagination from '../components/Pagination'

const PAGE_SIZE = 25

const EMPTY_FORM = {
  name: '', barcode: '', price: '', tax_rate: '0',
  tax_class: 'standard', stock_qty: '0',
  low_stock_threshold: '5', category_id: '',
  reorder_point: '0', reorder_qty: '0',
  supplier_id: '', supplier_name: '',
}

export default function Products() {
  const { user } = useAuth()
  const { fmt } = useCurrency()
  const readOnly = user?.role === 'purchasing'
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState(null)  // null | { mode: 'add'|'edit', data: {} }
  const [form, setForm] = useState(EMPTY_FORM)
  const [storeDefaults, setStoreDefaults] = useState({ default_tax_rate: 0.16, default_low_stock_threshold: 5 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [imgUploading, setImgUploading] = useState(false)
  const [editProduct, setEditProduct] = useState(null) // product being edited (for image)
  const fileInputRef = useRef(null)
  const csvInputRef = useRef(null)

  // CSV import state
  const [importModal, setImportModal] = useState(false)
  const [importPreview, setImportPreview] = useState(null)  // { rows, errors }
  const [importCommitting, setImportCommitting] = useState(false)
  const [importResult, setImportResult] = useState(null)  // { created, updated }

  useEffect(() => {
    loadProducts()
    loadCategories()
    getSuppliers().then(r => setSuppliers(r.data || [])).catch(() => {})
    getStoreConfig().then(r => { if (r.data) setStoreDefaults(r.data) }).catch(() => {})
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
    setForm({
      ...EMPTY_FORM,
      tax_rate: String(Math.round((storeDefaults.default_tax_rate || 0.16) * 100)),
      low_stock_threshold: String(storeDefaults.default_low_stock_threshold || 5),
    })
    setEditProduct(null)
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
      reorder_point: String(product.reorder_point || 0),
      reorder_qty: String(product.reorder_qty || 0),
      supplier_id: product.supplier_id ? String(product.supplier_id) : '',
      supplier_name: product.supplier_name || '',
    })
    setEditProduct(product)
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
        reorder_point: parseInt(form.reorder_point || 0),
        reorder_qty: parseInt(form.reorder_qty || 0),
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

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !modal?.id) return
    const fd = new FormData()
    fd.append('file', file)
    setImgUploading(true)
    try {
      const res = await uploadProductImage(modal.id, fd)
      setEditProduct(prev => ({ ...prev, image_url: res.data.image_url }))
      loadProducts(search)
    } catch (err) {
      alert(err.response?.data?.error || 'Upload failed')
    } finally {
      setImgUploading(false)
      e.target.value = ''
    }
  }

  function handleExportCSV() {
    window.location.href = '/api/products/export-csv'
  }

  function openImportModal() {
    setImportPreview(null)
    setImportResult(null)
    setImportModal(true)
  }

  async function handleCSVPreview(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('preview', '1')
    try {
      const res = await importProductsCSV(fd)
      setImportPreview(res.data)
      setImportResult(null)
    } catch (err) {
      alert(err.message || 'Failed to parse CSV')
    } finally {
      e.target.value = ''
    }
  }

  async function handleCSVCommit() {
    if (!importPreview) return
    if (!confirm(`Import ${importPreview.rows.length} products? This will create new or update existing by barcode/PLU.`)) return
    setImportCommitting(true)
    try {
      // Re-upload with preview=0 — need the file again; workaround: store as blob
      const res = await importProductsCSV(importPreview._fd)
      setImportResult({ created: res.data.created, updated: res.data.updated })
      setImportPreview(null)
      loadProducts(search)
    } catch (err) {
      alert(err.message || 'Import failed')
    } finally {
      setImportCommitting(false)
    }
  }

  // Store file for commit step
  async function handleCSVFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('preview', '1')
    try {
      const res = await importProductsCSV(fd)
      // Also keep a commit-ready FormData
      const fd2 = new FormData()
      fd2.append('file', file)
      fd2.append('preview', '0')
      res.data._fd = fd2
      setImportPreview(res.data)
      setImportResult(null)
    } catch (err) {
      alert(err.message || 'Failed to parse CSV')
    } finally {
      e.target.value = ''
    }
  }

  async function handleCSVFinalCommit() {
    if (!importPreview?._fd) return
    if (!confirm(`Import ${importPreview.rows.length} products?`)) return
    setImportCommitting(true)
    try {
      const res = await importProductsCSV(importPreview._fd)
      setImportResult({ created: res.data.created, updated: res.data.updated })
      setImportPreview(null)
      loadProducts(search)
    } catch (err) {
      alert(err.message || 'Import failed')
    } finally {
      setImportCommitting(false)
    }
  }

  async function handleImageDelete() {
    if (!modal?.id) return
    if (!confirm('Remove product image?')) return
    try {
      await deleteProductImage(modal.id)
      setEditProduct(prev => ({ ...prev, image_url: null }))
      loadProducts(search)
    } catch (err) {
      alert('Could not remove image')
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Products</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {(user?.role === 'manager' || user?.role === 'admin') && (
            <button className="btn btn-ghost" onClick={handleExportCSV}>Export CSV</button>
          )}
          {user?.role === 'admin' && (
            <button className="btn btn-ghost" onClick={openImportModal}>Import CSV</button>
          )}
          {!readOnly && <button className="btn btn-primary" onClick={openAdd}>+ Add Product</button>}
        </div>
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
                <th style={{ width: 48 }}></th>
                <th>Name</th>
                <th>Barcode</th>
                {!readOnly && <th>Price</th>}
                <th>Stock</th>
                <th>Reorder</th>
                <th>Category</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr><td colSpan={8} className="empty-state">No products yet</td></tr>
              ) : products.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE).map(p => (
                <tr key={p.id}>
                  <td>
                    {p.image_url
                      ? <img src={p.image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                      : <div style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📦</div>
                    }
                  </td>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 12 }}>{p.barcode || '—'}</td>
                  {!readOnly && <td>{fmt(p.price)}</td>}
                  <td>
                    {p.stock_qty <= p.low_stock_threshold && p.stock_qty > 0
                      ? <span className="badge badge-yellow">{p.stock_qty} low</span>
                      : p.stock_qty === 0
                      ? <span className="badge badge-red">0</span>
                      : <span>{p.stock_qty}</span>
                    }
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {p.reorder_point > 0
                      ? <span style={{ color: p.stock_qty <= p.reorder_point ? 'var(--danger,#ef4444)' : 'var(--text-muted)' }}>
                          ≤{p.reorder_point} → {p.reorder_qty}
                        </span>
                      : '—'
                    }
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{p.category_name || '—'}</td>
                  <td>
                    <span className={p.is_active ? 'badge badge-green' : 'badge badge-red'}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {(p.barcode || p.name) && (
                      <button className="btn btn-ghost btn-sm" style={{ marginRight: 4 }}
                        onClick={() => printBarcodeLabel(p, 'label')}>Label</button>
                    )}
                    {!readOnly && (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)} style={{ marginRight: 4 }}>Edit</button>
                        {p.is_active && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(p)}>Disable</button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination total={products.length} page={page} pageSize={PAGE_SIZE} onChange={setPage} />
        </div>
      </div>

      {/* ── CSV Import modal ─── */}
      {importModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setImportModal(false)}>
          <div className="modal" style={{ width: 680, maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-title">Import Products from CSV</div>

            {importResult ? (
              <div>
                <div style={{ padding: '20px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--success)', marginBottom: 8 }}>
                    Import complete
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                    {importResult.created} products created &nbsp;·&nbsp; {importResult.updated} updated
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary" onClick={() => setImportModal(false)}>Done</button>
                </div>
              </div>
            ) : !importPreview ? (
              <div>
                <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 16, marginBottom: 16, fontSize: 13 }}>
                  <strong>Instructions:</strong>
                  <ol style={{ margin: '8px 0 0 16px', lineHeight: 1.8 }}>
                    <li>Download the template CSV below</li>
                    <li>Fill in your products (one per row)</li>
                    <li>Upload the filled CSV — you will see a preview before committing</li>
                    <li>Products are matched by <strong>barcode</strong> or <strong>PLU code</strong> — matching rows update existing; non-matching rows create new products</li>
                  </ol>
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                  <a
                    href="/api/products/import-template"
                    className="btn btn-ghost"
                    download="products_template.csv"
                  >
                    Download Template
                  </a>
                  <button className="btn btn-primary" onClick={() => csvInputRef.current?.click()}>
                    Choose CSV File
                  </button>
                  <input ref={csvInputRef} type="file" accept=".csv,text/csv"
                    style={{ display: 'none' }} onChange={handleCSVFile} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost" onClick={() => setImportModal(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{importPreview.rows.length} rows parsed</span>
                  {importPreview.errors.length > 0 && (
                    <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: 10, fontSize: 11, padding: '1px 8px', fontWeight: 700 }}>
                      {importPreview.errors.length} errors
                    </span>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}
                    onClick={() => { setImportPreview(null); csvInputRef.current?.click() }}>
                    Choose different file
                  </button>
                </div>

                {importPreview.errors.length > 0 && (
                  <div style={{ background: 'var(--danger-muted, #fee)', border: '1px solid var(--danger)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, color: 'var(--danger)', marginBottom: 6, fontSize: 13 }}>Errors (rows with errors will be skipped)</div>
                    {importPreview.errors.map((e, i) => (
                      <div key={i} style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 2 }}>
                        Row {e.row} — {e.field}: {e.message}
                      </div>
                    ))}
                  </div>
                )}

                <div className="card" style={{ padding: 0, marginBottom: 16, maxHeight: 320, overflowY: 'auto' }}>
                  <table className="table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr><th>Action</th><th>Name</th><th>Barcode</th><th>Price</th><th>Stock</th><th>Category</th></tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.map((r, i) => (
                        <tr key={i}>
                          <td>
                            <span className={`badge ${r.action === 'updated' ? 'badge-blue' : 'badge-green'}`} style={{ fontSize: 10 }}>
                              {r.action === 'updated' ? 'update' : 'create'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 500 }}>{r.name}</td>
                          <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.barcode || '—'}</td>
                          <td>KES {Number(r.price).toLocaleString()}</td>
                          <td>{r.stock_qty}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{r.category || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost" onClick={() => setImportModal(false)}>Cancel</button>
                  <button className="btn btn-primary" disabled={importCommitting || importPreview.rows.length === 0}
                    onClick={handleCSVFinalCommit}>
                    {importCommitting ? 'Importing...' : `Import ${importPreview.rows.length} Products`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add / Edit modal ─── */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ maxHeight: '90vh', overflowY: 'auto', width: 520 }}>
            <div className="modal-title">{modal.mode === 'add' ? 'Add Product' : 'Edit Product'}</div>

            {/* Image section (edit mode only) */}
            {modal.mode === 'edit' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '12px', background: 'var(--surface2)', borderRadius: 8 }}>
                {editProduct?.image_url
                  ? <img src={editProduct.image_url} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', flexShrink: 0 }} />
                  : <div style={{ width: 72, height: 72, borderRadius: 8, background: 'var(--bg)', border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>📦</div>
                }
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                    {editProduct?.image_url ? 'Product image' : 'No image — JPG, PNG, WebP up to 2 MB'}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" disabled={imgUploading}
                      onClick={() => fileInputRef.current?.click()}>
                      {imgUploading ? 'Uploading…' : editProduct?.image_url ? 'Replace' : 'Upload'}
                    </button>
                    {editProduct?.image_url && (
                      <button className="btn btn-danger btn-sm" onClick={handleImageDelete}>Remove</button>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }} onChange={handleImageUpload} />
                </div>
              </div>
            )}

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
                <label className="label">Tax Rate (0.16 = 16%)</label>
                <input className="input" type="number" min="0" max="1" step="0.01"
                  value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Stock Qty</label>
                <input className="input" type="number" min="0"
                  value={form.stock_qty} onChange={e => setForm({ ...form, stock_qty: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Low Stock Alert ≤</label>
                <input className="input" type="number" min="0"
                  value={form.low_stock_threshold} onChange={e => setForm({ ...form, low_stock_threshold: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Reorder When Below</label>
                <input className="input" type="number" min="0" placeholder="0 = disabled"
                  value={form.reorder_point} onChange={e => setForm({ ...form, reorder_point: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Suggested Reorder Qty</label>
                <input className="input" type="number" min="0" placeholder="0"
                  value={form.reorder_qty} onChange={e => setForm({ ...form, reorder_qty: e.target.value })} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="label">Primary Supplier</label>
                <select className="input" value={form.supplier_id} onChange={e => {
                  const sup = suppliers.find(s => String(s.id) === e.target.value)
                  setForm({ ...form, supplier_id: e.target.value, supplier_name: sup ? sup.name : '' })
                }}>
                  <option value="">— None —</option>
                  {suppliers.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
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
              <button className="btn btn-ghost" onClick={() => { setModal(null); setEditProduct(null) }}>Cancel</button>
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
