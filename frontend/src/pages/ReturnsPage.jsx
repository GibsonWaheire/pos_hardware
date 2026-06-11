import { useState, useEffect } from 'react'
import { getReturns, createReturn, getSales, getSale } from '../api'

const EMPTY_FORM = { original_receipt: '', original_sale_id: null, reason: '', refund_method: 'cash', cashier_name: '', notes: '', items: [] }

export default function ReturnsPage() {
  const [returns, setReturns] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [receiptLookup, setReceiptLookup] = useState('')
  const [lookupSale, setLookupSale] = useState(null)
  const [lookupError, setLookupError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])
  async function load() {
    try { const r = await getReturns(); setReturns(r.data) }
    catch (e) { console.error(e) }
  }

  async function handleReceiptLookup() {
    setLookupError(''); setLookupSale(null)
    if (!receiptLookup.trim()) return
    try {
      // Search sales by receipt number
      const res = await getSales({ limit: 500 })
      const sale = res.data.find(s => s.receipt_number === receiptLookup.trim())
      if (!sale) { setLookupError('Receipt not found'); return }
      if (sale.status === 'refunded') { setLookupError('This sale has already been refunded'); return }
      if (sale.status === 'voided') { setLookupError('This sale was voided and cannot be returned'); return }
      setLookupSale(sale)
      // Pre-fill return items from sale items
      setForm(f => ({
        ...f,
        original_sale_id: sale.id,
        original_receipt: sale.receipt_number,
        items: sale.items.map(i => ({
          product_id: i.product_id,
          product_name: i.product_name,
          unit_price: i.unit_price,
          max_qty: i.qty,
          qty: i.qty,
          restock: true,
          selected: true,
        })),
      }))
    } catch (e) { setLookupError(e.message) }
  }

  function updateItem(idx, field, value) {
    setForm(f => {
      const items = [...f.items]
      items[idx] = { ...items[idx], [field]: value }
      return { ...f, items }
    })
  }

  async function handleSubmit() {
    const selectedItems = form.items.filter(i => i.selected && parseInt(i.qty) > 0)
    if (!selectedItems.length) { setError('Select at least one item to return'); return }
    setSaving(true); setError('')
    try {
      await createReturn({
        original_sale_id: form.original_sale_id,
        original_receipt: form.original_receipt,
        reason: form.reason,
        refund_method: form.refund_method,
        cashier_name: form.cashier_name,
        notes: form.notes,
        items: selectedItems.map(i => ({
          product_id: i.product_id,
          product_name: i.product_name,
          qty: parseInt(i.qty),
          unit_price: i.unit_price,
          restock: i.restock,
        })),
      })
      setModal(false)
      setForm(EMPTY_FORM)
      setReceiptLookup('')
      setLookupSale(null)
      load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const returnTotal = form.items
    .filter(i => i.selected)
    .reduce((s, i) => s + (parseFloat(i.qty) || 0) * i.unit_price, 0)

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Returns & Refunds</span>
        <button className="btn btn-primary" onClick={() => {
          setForm(EMPTY_FORM); setReceiptLookup(''); setLookupSale(null)
          setLookupError(''); setError(''); setModal(true)
        }}>
          + New Return
        </button>
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr><th>Return #</th><th>Original Receipt</th><th>Reason</th><th>Refund Method</th><th>Refund Total</th><th>Cashier</th><th>Date</th></tr>
            </thead>
            <tbody>
              {returns.length === 0 ? (
                <tr><td colSpan={7} className="empty-state">No returns yet</td></tr>
              ) : returns.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.return_number}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.original_receipt || '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{r.reason || '—'}</td>
                  <td><span className="badge badge-blue">{r.refund_method}</span></td>
                  <td style={{ fontWeight: 600, color: 'var(--danger)' }}>-${r.total_refund.toFixed(2)}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{r.cashier_name || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ width: 600 }}>
            <div className="modal-title">New Return / Refund</div>

            {/* Receipt lookup */}
            <div style={{ marginBottom: 16 }}>
              <label className="label">Lookup by Receipt Number (optional)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" placeholder="e.g. RCP-20240611-0001"
                  value={receiptLookup}
                  onChange={e => setReceiptLookup(e.target.value)}
                  onKeyUp={e => e.key === 'Enter' && handleReceiptLookup()} />
                <button className="btn btn-ghost" onClick={handleReceiptLookup}>Lookup</button>
              </div>
              {lookupError && <p className="error-msg">{lookupError}</p>}
              {lookupSale && (
                <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4 }}>
                  Found: {lookupSale.receipt_number} · ${lookupSale.total.toFixed(2)} · {new Date(lookupSale.created_at).toLocaleDateString()}
                </div>
              )}
            </div>

            {/* Items to return */}
            {form.items.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Select items to return</div>
                {form.items.map((item, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 70px 70px 80px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <input type="checkbox" checked={item.selected}
                      onChange={e => updateItem(idx, 'selected', e.target.checked)}
                      style={{ width: 16, height: 16 }} />
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{item.product_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>${item.unit_price.toFixed(2)}/ea · max {item.max_qty}</div>
                    </div>
                    <input className="input" type="number" min={1} max={item.max_qty}
                      value={item.qty}
                      onChange={e => updateItem(idx, 'qty', e.target.value)}
                      disabled={!item.selected} />
                    <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }}>
                      {item.selected ? `$${(parseFloat(item.qty) * item.unit_price).toFixed(2)}` : ''}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                      <input type="checkbox" checked={item.restock}
                        onChange={e => updateItem(idx, 'restock', e.target.checked)}
                        disabled={!item.selected} />
                      Restock
                    </label>
                  </div>
                ))}
                <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 16, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  Refund Total: <span style={{ color: 'var(--danger)' }}>${returnTotal.toFixed(2)}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="label">Reason</label>
                <input className="input" placeholder="e.g. Defective, wrong item..."
                  value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Refund Method</label>
                <select className="input" value={form.refund_method}
                  onChange={e => setForm({ ...form, refund_method: e.target.value })}>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="store_credit">Store Credit</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Processed by</label>
                <input className="input" value={form.cashier_name}
                  onChange={e => setForm({ ...form, cashier_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Notes</label>
                <input className="input" value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>

            {error && <p className="error-msg">{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Processing...' : `Process Refund $${returnTotal.toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
