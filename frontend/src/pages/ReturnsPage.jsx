import { useState, useEffect } from 'react'
import { getReturns, createReturn, getSales, approveReturn, rejectReturn, getInvoices, getStoreConfig, getCreditNote } from '../api'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import { printCreditNote } from '../utils/print'

const EMPTY_FORM = {
  original_receipt: '', original_sale_id: null, reason: '',
  refund_method: 'cash', notes: '', items: [],
}

export default function ReturnsPage() {
  const { user } = useAuth()
  const { fmt } = useCurrency()
  const isManager = user && ['manager', 'admin'].includes(user.role)

  const [returns, setReturns] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const [filterStatus, setFilterStatus] = useState('all')  // all | pending_approval | completed | rejected
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [receiptLookup, setReceiptLookup] = useState('')
  const [lookupSale, setLookupSale] = useState(null)
  const [lookupError, setLookupError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [approvalModal, setApprovalModal] = useState(null)  // { ret, action: 'approve'|'reject' }
  const [approvalNote, setApprovalNote] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [pendingAlert, setPendingAlert] = useState(null) // result from createReturn if needs_approval

  useEffect(() => { load() }, [filterStatus])

  async function load() {
    try {
      const params = filterStatus !== 'all' ? { status: filterStatus } : {}
      const r = await getReturns(params)
      const all = r.data
      setReturns(all)
      setPendingCount(all.filter(x => x.status === 'pending_approval').length)
    } catch (e) { console.error(e) }
  }

  async function handleReceiptLookup() {
    setLookupError(''); setLookupSale(null)
    const q = receiptLookup.trim()
    if (!q) return
    try {
      let sale = null
      if (q.toUpperCase().startsWith('INV-')) {
        // Lookup by invoice number
        const invRes = await getInvoices({ limit: 500 })
        const inv = invRes.data.find(i => i.invoice_number.toUpperCase() === q.toUpperCase())
        if (!inv) { setLookupError('Invoice not found'); return }
        const salesRes = await getSales({ limit: 500 })
        sale = salesRes.data.find(s => s.id === inv.sale_id)
      } else {
        const res = await getSales({ limit: 500 })
        sale = res.data.find(s => s.receipt_number === q)
      }
      if (!sale) { setLookupError('Sale not found'); return }
      if (sale.status === 'refunded') { setLookupError('This sale has already been refunded'); return }
      if (sale.status === 'voided') { setLookupError('This sale was voided and cannot be returned'); return }
      setLookupSale(sale)
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
      const res = await createReturn({
        original_sale_id: form.original_sale_id,
        original_receipt: form.original_receipt,
        reason: form.reason,
        refund_method: form.refund_method,
        notes: form.notes,
        items: selectedItems.map(i => ({
          product_id: i.product_id,
          product_name: i.product_name,
          qty: parseInt(i.qty),
          unit_price: i.unit_price,
          restock: i.restock,
        })),
      })
      const result = res.data
      setModal(false)
      setForm(EMPTY_FORM)
      setReceiptLookup('')
      setLookupSale(null)
      if (result.needs_approval) {
        setPendingAlert({
          message: `Return ${result.return_number} requires manager approval (above ${fmt(result.approval_threshold)} threshold).`,
          creditNote: result.credit_note || null,
        })
      }
      load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  async function handleApprovalAction() {
    if (!approvalModal) return
    setActionBusy(true)
    try {
      const fn = approvalModal.action === 'approve' ? approveReturn : rejectReturn
      await fn(approvalModal.ret.id, { notes: approvalNote })
      setApprovalModal(null)
      setApprovalNote('')
      load()
    } catch (e) { alert(e.message) } finally { setActionBusy(false) }
  }

  async function handlePrintCreditNote(ret) {
    try {
      let store = {}
      try { const r = await getStoreConfig(); store = r.data || {} } catch {}
      // Find credit note via credit_note_number on return (not stored on return directly —
      // fetch from credit-notes API by return id if available, otherwise show error)
      const cnRes = await getCreditNote ? null : null   // fallback
      // We don't have getCreditNoteByReturn, so we call getCreditNotes with a workaround
      // For now build a minimal CN from the return data for printing
      const cn = {
        credit_note_number: `CN (${ret.return_number})`,
        invoice_number: null,
        return_number: ret.return_number,
        original_receipt: ret.original_receipt,
        customer_name: '',
        reason: ret.reason,
        items: ret.items || [],
        total_credit: ret.total_refund,
        refund_method: ret.refund_method,
        issued_by_name: ret.cashier_name,
        created_at: ret.created_at,
      }
      printCreditNote(cn, store)
    } catch (e) { alert('Print error: ' + e.message) }
  }

  const returnTotal = form.items.filter(i => i.selected)
    .reduce((s, i) => s + (parseFloat(i.qty) || 0) * i.unit_price, 0)

  const STATUS_STYLE = {
    completed:        { background: '#dcfce7', color: '#15803d' },
    pending_approval: { background: '#fef3c7', color: '#92400e' },
    rejected:         { background: '#fee2e2', color: '#dc2626' },
  }

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

        {/* Pending approval alert */}
        {pendingAlert && (
          <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#92400e', fontSize: 13 }}>{pendingAlert.message}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setPendingAlert(null)}>Dismiss</button>
          </div>
        )}

        {/* Pending approvals banner (manager) */}
        {isManager && pendingCount > 0 && filterStatus !== 'pending_approval' && (
          <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ color: '#92400e', fontWeight: 600, fontSize: 13 }}>
              {pendingCount} return{pendingCount > 1 ? 's' : ''} awaiting your approval
            </span>
            <button className="btn btn-primary btn-sm" onClick={() => setFilterStatus('pending_approval')}>
              Review
            </button>
          </div>
        )}

        {/* Status filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            ['all', 'All'],
            ['pending_approval', 'Pending Approval'],
            ['completed', 'Completed'],
            ['rejected', 'Rejected'],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setFilterStatus(key)}
              className={filterStatus === key ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>
              {label}
            </button>
          ))}
        </div>

        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Return #</th>
                <th>Original Receipt</th>
                <th>Reason</th>
                <th>Method</th>
                <th>Refund Total</th>
                <th>Status</th>
                <th>By</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {returns.length === 0 ? (
                <tr><td colSpan={9} className="empty-state">No returns found</td></tr>
              ) : returns.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>{r.return_number}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 12 }}>{r.original_receipt || '—'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.reason || '—'}</td>
                  <td><span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, background: 'var(--surface2)' }}>{r.refund_method}</span></td>
                  <td style={{ fontWeight: 600, color: 'var(--danger)' }}>-{fmt(r.total_refund)}</td>
                  <td>
                    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, ...(STATUS_STYLE[r.status] || {}) }}>
                      {r.status === 'pending_approval' ? 'Pending' : r.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.cashier_name || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleDateString('en-KE')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => handlePrintCreditNote(r)}>CN</button>
                      {isManager && r.status === 'pending_approval' && (
                        <>
                          <button className="btn btn-primary btn-sm"
                            onClick={() => { setApprovalModal({ ret: r, action: 'approve' }); setApprovalNote('') }}>
                            Approve
                          </button>
                          <button className="btn btn-danger btn-sm"
                            onClick={() => { setApprovalModal({ ret: r, action: 'reject' }); setApprovalNote('') }}>
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Return modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ width: 620 }}>
            <div className="modal-title">New Return / Refund</div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Lookup by Receipt or Invoice Number</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" placeholder="e.g. RCP-20240611-0001 or INV-2024-0042"
                  value={receiptLookup}
                  onChange={e => setReceiptLookup(e.target.value)}
                  onKeyUp={e => e.key === 'Enter' && handleReceiptLookup()} />
                <button className="btn btn-ghost" onClick={handleReceiptLookup}>Lookup</button>
              </div>
              {lookupError && <p className="error-msg">{lookupError}</p>}
              {lookupSale && (
                <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4 }}>
                  Found: {lookupSale.receipt_number} · {fmt(lookupSale.total)} · {new Date(lookupSale.created_at).toLocaleDateString()}
                  {lookupSale.customer_name && ` · ${lookupSale.customer_name}`}
                </div>
              )}
            </div>

            {form.items.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Select items to return</div>
                {form.items.map((item, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 70px 70px 80px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <input type="checkbox" checked={item.selected}
                      onChange={e => updateItem(idx, 'selected', e.target.checked)}
                      style={{ width: 16, height: 16 }} />
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{item.product_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt(item.unit_price)}/ea · max {item.max_qty}</div>
                    </div>
                    <input className="input" type="number" min={1} max={item.max_qty}
                      value={item.qty} onChange={e => updateItem(idx, 'qty', e.target.value)}
                      disabled={!item.selected} />
                    <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }}>
                      {item.selected ? fmt(parseFloat(item.qty) * item.unit_price) : ''}
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
                  Refund Total: <span style={{ color: 'var(--danger)' }}>{fmt(returnTotal)}</span>
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
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="label">Notes</label>
                <input className="input" value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>

            {error && <p className="error-msg">{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Processing...' : `Process Refund ${fmt(returnTotal)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve / Reject modal */}
      {approvalModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setApprovalModal(null)}>
          <div className="modal" style={{ width: 440 }}>
            <div className="modal-title">
              {approvalModal.action === 'approve' ? 'Approve Return' : 'Reject Return'}
            </div>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 16px', marginBottom: 16 }}>
              <div style={{ fontWeight: 600 }}>{approvalModal.ret.return_number}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {approvalModal.ret.original_receipt} · {fmt(approvalModal.ret.total_refund)} · {approvalModal.ret.reason}
              </div>
            </div>
            {approvalModal.action === 'reject' && (
              <div style={{ background: '#fee2e2', border: '1px solid #dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#7f1d1d' }}>
                Rejecting will cancel the refund payout. Stock has already been restocked.
              </div>
            )}
            <div className="form-group">
              <label className="label">Note (optional)</label>
              <textarea className="input" rows={2} value={approvalNote}
                onChange={e => setApprovalNote(e.target.value)} style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setApprovalModal(null)}>Cancel</button>
              <button
                className={approvalModal.action === 'approve' ? 'btn btn-primary' : 'btn btn-danger'}
                onClick={handleApprovalAction} disabled={actionBusy}>
                {actionBusy ? 'Saving...' : approvalModal.action === 'approve' ? 'Approve Refund' : 'Reject Refund'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
