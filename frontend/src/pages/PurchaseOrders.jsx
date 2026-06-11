import { useState, useEffect } from 'react'
import { getPurchaseOrders, createPurchaseOrder, markPOOrdered, receivePO, cancelPO, getSuppliers, getProducts } from '../api'

const STATUS_BADGE = {
  draft: 'badge-blue',
  ordered: 'badge-yellow',
  partial: 'badge-yellow',
  received: 'badge-green',
  cancelled: 'badge-red',
}

export default function PurchaseOrders() {
  const [pos, setPOs] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [modal, setModal] = useState(null)  // null | 'create' | { mode: 'receive', po }
  const [createForm, setCreateForm] = useState({ supplier_id: '', notes: '', items: [] })
  const [receiveData, setReceiveData] = useState({})  // { po_item_id: qty }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [p, s, pr] = await Promise.all([getPurchaseOrders(), getSuppliers(), getProducts()])
      setPOs(p.data)
      setSuppliers(s.data)
      setProducts(pr.data)
    } catch (e) { console.error(e) }
  }

  // ── Create PO ────────────────────────────────────────────────────────────

  function addLineItem() {
    setCreateForm(f => ({ ...f, items: [...f.items, { product_id: '', product_name: '', qty_ordered: 1, unit_cost: 0 }] }))
  }

  function updateLineItem(idx, field, value) {
    setCreateForm(f => {
      const items = [...f.items]
      items[idx] = { ...items[idx], [field]: value }
      // Auto-fill product name when product_id changes
      if (field === 'product_id' && value) {
        const p = products.find(p => p.id === parseInt(value))
        if (p) items[idx].product_name = p.name
      }
      return { ...f, items }
    })
  }

  function removeLineItem(idx) {
    setCreateForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  }

  async function handleCreate() {
    if (!createForm.items.length) { setError('Add at least one item'); return }
    setSaving(true); setError('')
    try {
      await createPurchaseOrder({
        supplier_id: createForm.supplier_id ? parseInt(createForm.supplier_id) : null,
        notes: createForm.notes,
        items: createForm.items.map(i => ({
          product_id: i.product_id ? parseInt(i.product_id) : null,
          product_name: i.product_name,
          qty_ordered: parseInt(i.qty_ordered),
          unit_cost: parseFloat(i.unit_cost),
        })),
      })
      setModal(null)
      setCreateForm({ supplier_id: '', notes: '', items: [] })
      load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  // ── Receive items ────────────────────────────────────────────────────────

  function openReceive(po) {
    const init = {}
    po.items.forEach(item => { init[item.id] = item.qty_ordered - item.qty_received })
    setReceiveData(init)
    setError('')
    setModal({ mode: 'receive', po })
  }

  async function handleReceive() {
    setSaving(true); setError('')
    try {
      const items = Object.entries(receiveData)
        .filter(([, qty]) => parseInt(qty) > 0)
        .map(([id, qty]) => ({ po_item_id: parseInt(id), qty_received: parseInt(qty) }))
      if (!items.length) { setError('Enter at least one qty'); setSaving(false); return }
      await receivePO(modal.po.id, { items })
      setModal(null)
      load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  async function handleMarkOrdered(po) {
    try { await markPOOrdered(po.id); load() } catch (e) { alert(e.message) }
  }

  async function handleCancel(po) {
    if (!confirm(`Cancel PO ${po.po_number}?`)) return
    try { await cancelPO(po.id); load() } catch (e) { alert(e.message) }
  }

  const createTotal = createForm.items.reduce((s, i) => s + (parseFloat(i.qty_ordered) || 0) * (parseFloat(i.unit_cost) || 0), 0)

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Purchase Orders</span>
        <button className="btn btn-primary" onClick={() => { setCreateForm({ supplier_id: '', notes: '', items: [] }); setError(''); setModal('create') }}>
          + New PO
        </button>
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr><th>PO Number</th><th>Supplier</th><th>Status</th><th>Items</th><th>Total Cost</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {pos.length === 0 ? (
                <tr><td colSpan={7} className="empty-state">No purchase orders yet</td></tr>
              ) : pos.map(po => (
                <tr key={po.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{po.po_number}</td>
                  <td>{po.supplier_name || '—'}</td>
                  <td><span className={`badge ${STATUS_BADGE[po.status] || 'badge-blue'}`}>{po.status}</span></td>
                  <td style={{ color: 'var(--text-muted)' }}>{po.items.length} line{po.items.length !== 1 ? 's' : ''}</td>
                  <td>${po.total_cost.toFixed(2)}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(po.created_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {po.status === 'draft' && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleMarkOrdered(po)}>Mark Ordered</button>
                      )}
                      {['ordered', 'partial', 'draft'].includes(po.status) && (
                        <button className="btn btn-success btn-sm" onClick={() => openReceive(po)}>Receive</button>
                      )}
                      {['draft', 'ordered'].includes(po.status) && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleCancel(po)}>Cancel</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create PO modal */}
      {modal === 'create' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ width: 640 }}>
            <div className="modal-title">New Purchase Order</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="label">Supplier</label>
                <select className="input" value={createForm.supplier_id}
                  onChange={e => setCreateForm({ ...createForm, supplier_id: e.target.value })}>
                  <option value="">-- Select supplier --</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Notes</label>
                <input className="input" value={createForm.notes}
                  onChange={e => setCreateForm({ ...createForm, notes: e.target.value })} />
              </div>
            </div>

            {/* Line items */}
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Items</div>
            {createForm.items.length === 0 && (
              <div className="empty-state" style={{ padding: '16px 0' }}>No items — click "Add Item"</div>
            )}
            {createForm.items.map((item, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 30px', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                <div>
                  {idx === 0 && <label className="label">Product</label>}
                  <select className="input" value={item.product_id}
                    onChange={e => updateLineItem(idx, 'product_id', e.target.value)}>
                    <option value="">-- Select product --</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  {idx === 0 && <label className="label">Qty</label>}
                  <input className="input" type="number" min={1} value={item.qty_ordered}
                    onChange={e => updateLineItem(idx, 'qty_ordered', e.target.value)} />
                </div>
                <div>
                  {idx === 0 && <label className="label">Unit Cost</label>}
                  <input className="input" type="number" min={0} step="0.01" value={item.unit_cost}
                    onChange={e => updateLineItem(idx, 'unit_cost', e.target.value)} />
                </div>
                <button className="btn btn-danger btn-sm" style={{ marginBottom: 0 }}
                  onClick={() => removeLineItem(idx)}>×</button>
              </div>
            ))}

            <button className="btn btn-ghost btn-sm" onClick={addLineItem} style={{ marginBottom: 16 }}>
              + Add Item
            </button>

            {createForm.items.length > 0 && (
              <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
                Total: ${createTotal.toFixed(2)}
              </div>
            )}

            {error && <p className="error-msg">{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating...' : 'Create PO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receive items modal */}
      {modal?.mode === 'receive' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ width: 560 }}>
            <div className="modal-title">Receive Items — {modal.po.po_number}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
              Supplier: {modal.po.supplier_name || '—'}
            </div>

            {modal.po.items.map(item => {
              const remaining = item.qty_ordered - item.qty_received
              return (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px', gap: 12, marginBottom: 12, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{item.product_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Ordered: {item.qty_ordered} · Received: {item.qty_received} · Remaining: {remaining}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                    ${item.unit_cost.toFixed(2)}/ea
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                    Rem: {remaining}
                  </div>
                  <input className="input" type="number" min={0} max={remaining}
                    value={receiveData[item.id] ?? remaining}
                    onChange={e => setReceiveData(d => ({ ...d, [item.id]: e.target.value }))}
                    disabled={remaining === 0}
                    style={{ opacity: remaining === 0 ? 0.4 : 1 }}
                  />
                </div>
              )
            })}

            {error && <p className="error-msg">{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-success" onClick={handleReceive} disabled={saving}>
                {saving ? 'Receiving...' : 'Confirm Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
