import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import {
  getPurchaseOrders, createPurchaseOrder, markPOOrdered, receivePO, cancelPO,
  getPendingPOs, approvePO, rejectPO, confirmPO, markPODispatched,
  getSuppliers, getProducts, getStoreConfig,
} from '../api'
import { printDoc, A4_CSS, printDeliveryNote, printPOForSupplier } from '../utils/print'

const STATUS_BADGE = {
  draft:            'badge-blue',
  pending_approval: 'badge-orange',
  ordered:          'badge-yellow',
  partial:          'badge-yellow',
  received:         'badge-green',
  cancelled:        'badge-red',
  rejected:         'badge-red',
}

export default function PurchaseOrders() {
  const { user } = useAuth()
  const role = user?.role || ''
  const { currency, fmt } = useCurrency()
  const location = useLocation()

  const [pos, setPOs] = useState([])
  const [pendingPos, setPendingPOs] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [modal, setModal] = useState(null)  // null | 'create' | { mode: 'receive', po } | { mode: 'reject', po } | { mode: 'dispatch', po }
  const [createForm, setCreateForm] = useState({ supplier_id: '', notes: '', items: [] })
  const [receiveData, setReceiveData] = useState({})
  const [rejectNote, setRejectNote] = useState('')
  const [dispatchData, setDispatchData] = useState({})
  const [dispatchForm, setDispatchForm] = useState({ delivery_date: '', driver_name: '', vehicle_ref: '', tracking_ref: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  // Pre-fill from reorder widget navigation
  useEffect(() => {
    const draft = location.state?.draft
    if (!draft) return
    setCreateForm({
      supplier_id: draft.supplier_id ? String(draft.supplier_id) : '',
      notes: `Auto-generated from reorder alerts — ${draft.supplier_name}`,
      items: draft.items,
    })
    setModal('create')
    // Clear state so refresh doesn't re-open the modal
    window.history.replaceState({}, '')
  }, [location.state])

  async function load() {
    try {
      const calls = [getPurchaseOrders(), getSuppliers(), getProducts()]
      if (role === 'manager' || role === 'admin') calls.push(getPendingPOs())
      const results = await Promise.all(calls)
      setPOs(results[0].data)
      setSuppliers(results[1].data)
      setProducts(results[2].data)
      if (results[3]) setPendingPOs(results[3].data)
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
      const res = await createPurchaseOrder({
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
      if (res.data.status === 'pending_approval') {
        alert('PO created and sent for manager approval (exceeds your spending limit).')
      }
      load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  // ── Receive ──────────────────────────────────────────────────────────────

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

  // ── Approve / Reject ─────────────────────────────────────────────────────

  async function handleApprove(po) {
    try { await approvePO(po.id); load() } catch (e) { alert(e.message) }
  }

  async function handleReject() {
    setSaving(true); setError('')
    try {
      await rejectPO(modal.po.id, { notes: rejectNote })
      setModal(null); setRejectNote('')
      load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  // ── Other actions ────────────────────────────────────────────────────────

  async function handleMarkOrdered(po) {
    try { await markPOOrdered(po.id); load() } catch (e) { alert(e.message) }
  }

  async function handleCancel(po) {
    if (!confirm(`Cancel PO ${po.po_number}?`)) return
    try { await cancelPO(po.id); load() } catch (e) { alert(e.message) }
  }

  async function handleConfirm(po) {
    try { await confirmPO(po.id); load() } catch (e) { alert(e.message) }
  }

  function openDispatch(po) {
    const init = {}
    po.items.forEach(item => { init[item.id] = item.qty_ordered })
    setDispatchData(init)
    setDispatchForm({ delivery_date: '', driver_name: '', vehicle_ref: '', tracking_ref: '' })
    setError('')
    setModal({ mode: 'dispatch', po })
  }

  async function handleDispatch() {
    setSaving(true); setError('')
    try {
      const po = modal.po
      const items = Object.entries(dispatchData).map(([id, qty]) => ({
        po_item_id: parseInt(id), qty_dispatched: parseInt(qty) || 0,
      }))
      const res = await markPODispatched(po.id, { ...dispatchForm, items })
      setModal(null)
      load()
      // offer to print delivery note
      if (confirm('Dispatch recorded. Print Delivery Note?')) {
        let store = {}
        try { const r = await getStoreConfig(); store = r.data || {} } catch {}
        printDeliveryNote(res.data, store)
      }
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  // ── Print PO ─────────────────────────────────────────────────────────────

  async function printPO(po) {
    let store = {}
    try { const r = await getStoreConfig(); store = r.data || {} } catch {}
    const storeSub = [store.phone, store.email].filter(Boolean).join(' &nbsp;|&nbsp; ')
    const stampColor = po.status === 'received' ? '#16a34a' : '#dc2626'
    const showStamp = ['received', 'cancelled', 'rejected'].includes(po.status)
    const watermark = ['cancelled', 'rejected'].includes(po.status) ? `<div class="watermark" style="color:#dc2626">${po.status.toUpperCase()}</div>` : ''
    printDoc(po.po_number, `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${po.po_number}</title><style>${A4_CSS}</style></head><body>
      ${watermark}
      <div class="letterhead">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div class="store-name">${store.name || 'Store'}</div>
            <div class="store-sub">${store.address ? store.address + '<br>' : ''}${storeSub}${store.tax_number ? ' &nbsp;|&nbsp; PIN: ' + store.tax_number : ''}</div>
          </div>
          ${showStamp ? `<div class="stamp" style="color:${stampColor}">${po.status.toUpperCase()}</div>` : ''}
        </div>
      </div>
      <div class="doc-title"><h2>Purchase Order</h2><div class="doc-num">${po.po_number}</div></div>
      <div class="info-grid">
        <div class="info-box">
          <div class="label">Order Details</div>
          <div class="value">
            <div>PO Number: <strong>${po.po_number}</strong></div>
            <div>Date: ${new Date(po.created_at).toLocaleDateString('en-KE')}</div>
            <div>Status: <strong style="text-transform:capitalize">${po.status.replace(/_/g, ' ')}</strong></div>
            <div>Prepared by: ${po.created_by_name || '—'}</div>
            ${po.notes ? `<div>Notes: ${po.notes}</div>` : ''}
          </div>
        </div>
        <div class="info-box">
          <div class="label">Supplier</div>
          <div class="value">
            <div style="font-weight:700">${po.supplier_name || 'No supplier specified'}</div>
          </div>
        </div>
      </div>
      <table>
        <thead><tr>
          <th style="width:24pt">#</th>
          <th>Product / Description</th>
          <th class="right" style="width:60pt">Qty Ordered</th>
          <th class="right" style="width:60pt">Qty Received</th>
          <th class="right" style="width:80pt">Unit Cost (${currency})</th>
          <th class="right" style="width:80pt">Line Total (${currency})</th>
        </tr></thead>
        <tbody>
        ${(po.items || []).map((item, i) => `
          <tr>
            <td style="color:#777">${i + 1}</td>
            <td style="font-weight:600">${item.product_name}</td>
            <td class="right">${item.qty_ordered}</td>
            <td class="right" style="color:${(item.qty_received || 0) >= item.qty_ordered ? '#16a34a' : '#777'}">${item.qty_received || 0}</td>
            <td class="right">${fmt(item.unit_cost)}</td>
            <td class="right" style="font-weight:600">${fmt(item.qty_ordered * item.unit_cost)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="totals">
        <div class="row grand"><span>ORDER TOTAL</span><span>${fmt(po.total_cost)}</span></div>
      </div>
      <div class="sig-section">
        <div class="sig-title">Approval &amp; Receipt Confirmation</div>
        <div class="sig-grid" style="grid-template-columns:1fr 1fr 1fr">
          <div class="sig-box">
            <div class="line"></div>
            <div class="name">Prepared by</div>
            <div class="role">${po.created_by_name || '________________'}</div>
            <div class="role">Date: ________________</div>
          </div>
          <div class="sig-box">
            <div class="line"></div>
            <div class="name">Approved by</div>
            <div class="role">Manager / Authorized Signatory</div>
            <div class="role">Date: ________________</div>
          </div>
          <div class="sig-box">
            <div class="line"></div>
            <div class="name">Received by</div>
            <div class="role">Inventory / Store Keeper</div>
            <div class="role">Date: ________________</div>
          </div>
        </div>
      </div>
      <div class="doc-footer">
        ${store.name || ''} &nbsp;|&nbsp; ${storeSub}${store.tax_number ? ' &nbsp;|&nbsp; PIN: ' + store.tax_number : ''}
        <br>Generated by POS System &mdash; ${new Date().toLocaleString('en-KE')}
      </div>
    </body></html>`)
  }

  async function handleSendToSupplier(po) {
    let store = {}
    try { const r = await getStoreConfig(); store = r.data || {} } catch {}
    printPOForSupplier(po, store)
  }

  const createTotal = createForm.items.reduce(
    (s, i) => s + (parseFloat(i.qty_ordered) || 0) * (parseFloat(i.unit_cost) || 0), 0
  )

  const canCreate = role !== 'supplier'

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Purchase Orders</span>
        {canCreate && (
          <button className="btn btn-primary"
            onClick={() => { setCreateForm({ supplier_id: '', notes: '', items: [] }); setError(''); setModal('create') }}>
            + New PO
          </button>
        )}
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>

        {/* ── Pending Approvals section (manager/admin) ── */}
        {(role === 'manager' || role === 'admin') && pendingPos.length > 0 && (
          <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid #f59e0b' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: '#f59e0b' }}>
              Pending Approvals ({pendingPos.length})
            </div>
            <table className="table">
              <thead>
                <tr><th>PO Number</th><th>By</th><th>Supplier</th><th>Total</th><th>Created</th><th></th></tr>
              </thead>
              <tbody>
                {pendingPos.map(po => (
                  <tr key={po.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{po.po_number}</td>
                    <td>{po.created_by_name || po.created_by || '—'}</td>
                    <td>{po.supplier_name || '—'}</td>
                    <td>{fmt(po.total_cost)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(po.created_at).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-success btn-sm" onClick={() => handleApprove(po)}>Approve</button>
                        <button className="btn btn-danger btn-sm"
                          onClick={() => { setRejectNote(''); setError(''); setModal({ mode: 'reject', po }) }}>
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── All POs table ── */}
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Supplier</th>
                <th>Status</th>
                {(role === 'manager' || role === 'admin') && <th>Created By</th>}
                <th>Items</th>
                <th>Total</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pos.length === 0 ? (
                <tr><td colSpan={8} className="empty-state">No purchase orders yet</td></tr>
              ) : pos.map(po => (
                <tr key={po.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{po.po_number}</td>
                  <td>{po.supplier_name || '—'}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[po.status] || 'badge-blue'}`}>
                      {po.status === 'pending_approval' ? 'pending approval' : po.status}
                    </span>
                  </td>
                  {(role === 'manager' || role === 'admin') && (
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{po.created_by_name || po.created_by || '—'}</td>
                  )}
                  <td style={{ color: 'var(--text-muted)' }}>{po.items.length} line{po.items.length !== 1 ? 's' : ''}</td>
                  <td>{fmt(po.total_cost)}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(po.created_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {/* Purchaser / Manager / Admin actions */}
                      {po.status === 'draft' && role !== 'supplier' && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleMarkOrdered(po)}>Mark Ordered</button>
                      )}
                      {['ordered', 'partial', 'draft'].includes(po.status) && role !== 'supplier' && (
                        <button className="btn btn-success btn-sm" onClick={() => openReceive(po)}>Receive</button>
                      )}
                      {['draft', 'ordered', 'pending_approval'].includes(po.status) && role !== 'supplier' && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleCancel(po)}>Cancel</button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => printPO(po)} title="Print PO">Print</button>
                      {/* Send to Supplier — for ordered POs (purchasing/manager/admin) */}
                      {po.status === 'ordered' && role !== 'supplier' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleSendToSupplier(po)} title="Print supplier-facing PO + acknowledgement">Send to Supplier</button>
                      )}

                      {/* Supplier actions */}
                      {role === 'supplier' && po.status === 'ordered' && (
                        <>
                          <button className="btn btn-primary btn-sm" onClick={() => handleConfirm(po)}>Confirm</button>
                          <button className="btn btn-success btn-sm" onClick={() => openDispatch(po)}>Dispatched</button>
                        </>
                      )}
                      {/* Print delivery note if already dispatched */}
                      {po.dispatched_at && (
                        <button className="btn btn-ghost btn-sm" onClick={async () => {
                          let store = {}
                          try { const r = await getStoreConfig(); store = r.data || {} } catch {}
                          printDeliveryNote(po, store)
                        }}>Delivery Note</button>
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
                Total: {fmt(createTotal)}
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
                    {fmt(item.unit_cost)}/ea
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

      {/* Reject PO modal */}
      {modal?.mode === 'reject' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ width: 440 }}>
            <div className="modal-title">Reject PO — {modal.po.po_number}</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
              Total: {fmt(modal.po.total_cost)} · Requested by: {modal.po.created_by_name || modal.po.created_by || '—'}
            </p>
            <div className="form-group">
              <label className="label">Reason (optional)</label>
              <input className="input" value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                placeholder="Why is this PO being rejected?" />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleReject} disabled={saving}>
                {saving ? 'Rejecting...' : 'Reject PO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch modal (supplier) */}
      {modal?.mode === 'dispatch' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ width: 560 }}>
            <div className="modal-title">Mark as Dispatched — {modal.po.po_number}</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
              Buyer: {modal.po.notes?.includes('—') ? '—' : 'Store'} · {modal.po.items.length} line item{modal.po.items.length !== 1 ? 's' : ''}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label className="label">Estimated Delivery Date</label>
                <input className="input" type="date" value={dispatchForm.delivery_date}
                  onChange={e => setDispatchForm(f => ({ ...f, delivery_date: e.target.value }))} />
              </div>
              <div>
                <label className="label">Tracking Reference</label>
                <input className="input" value={dispatchForm.tracking_ref}
                  onChange={e => setDispatchForm(f => ({ ...f, tracking_ref: e.target.value }))}
                  placeholder="e.g. NLC-2026-001" />
              </div>
              <div>
                <label className="label">Driver Name</label>
                <input className="input" value={dispatchForm.driver_name}
                  onChange={e => setDispatchForm(f => ({ ...f, driver_name: e.target.value }))}
                  placeholder="Driver's name" />
              </div>
              <div>
                <label className="label">Vehicle / Reg No.</label>
                <input className="input" value={dispatchForm.vehicle_ref}
                  onChange={e => setDispatchForm(f => ({ ...f, vehicle_ref: e.target.value }))}
                  placeholder="e.g. KBZ 001X" />
              </div>
            </div>

            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Quantities Being Dispatched</div>
            {modal.po.items.map(item => (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 12, marginBottom: 10, alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{item.product_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ordered: {item.qty_ordered}</div>
                </div>
                <div>
                  <label className="label" style={{ fontSize: 11 }}>Dispatching</label>
                  <input className="input" type="number" min={0} max={item.qty_ordered}
                    value={dispatchData[item.id] ?? item.qty_ordered}
                    onChange={e => setDispatchData(d => ({ ...d, [item.id]: e.target.value }))} />
                </div>
              </div>
            ))}

            {error && <p className="error-msg">{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-success" onClick={handleDispatch} disabled={saving}>
                {saving ? 'Saving...' : 'Confirm Dispatch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
