import { useState, useEffect } from 'react'
import {
  getInventoryOverview, getStockLevels, adjustStock, getStockAdjustments,
  getStockMovements, getDamageReports, createDamageReport,
  approveDamageReport, rejectDamageReport, getGRNs, confirmGRN, signOffGRN,
  getStoreConfig,
} from '../api'
import { useCurrency } from '../context/CurrencyContext'
import { useAuth } from '../context/AuthContext'
import { printGRN, printDamageReport, printCountSheet, printMovementReport } from '../utils/print'

export default function Inventory() {
  const { fmt } = useCurrency()
  const { user } = useAuth()
  const role = user?.role || ''
  const isManager = role === 'manager' || role === 'admin'
  const isPurchasing = role === 'purchasing'

  const [overview, setOverview] = useState(null)
  const [products, setProducts] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [movements, setMovements] = useState([])
  const [damageReports, setDamageReports] = useState([])
  const [grns, setGrns] = useState([])
  const [tab, setTab] = useState('stock')
  const [loading, setLoading] = useState(true)
  const [stockSearch, setStockSearch] = useState('')

  // Movement filters
  const [mvTypeFilter, setMvTypeFilter] = useState('')
  const [mvDateFrom, setMvDateFrom] = useState('')
  const [mvDateTo, setMvDateTo] = useState('')

  // Adjust modal
  const [adjustModal, setAdjustModal] = useState(null)
  const [adjForm, setAdjForm] = useState({ qty_change: '', reason: 'manual' })
  const [adjError, setAdjError] = useState('')
  const [adjSaving, setAdjSaving] = useState(false)

  // Damage modal
  const [damageModal, setDamageModal] = useState(null)  // null | product
  const [dmgForm, setDmgForm] = useState({ qty: '', reason: '', details: '', estimated_value: '' })
  const [dmgError, setDmgError] = useState('')
  const [dmgSaving, setDmgSaving] = useState(false)

  // Review damage modal
  const [reviewModal, setReviewModal] = useState(null)  // null | damage report
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewing, setReviewing] = useState(false)

  // GRN signoff modal
  const [grnsModal, setGrnsModal] = useState(null)
  const [grnsNotes, setGrnsNotes] = useState('')
  const [grnActing, setGrnActing] = useState(false)

  const [store, setStore] = useState({})

  useEffect(() => { loadAll() }, [])
  useEffect(() => { getStoreConfig().then(r => setStore(r.data)).catch(() => {}) }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const calls = [getInventoryOverview(), getStockLevels()]
      if (!isPurchasing) {
        calls.push(
          getStockAdjustments({ limit: 100 }),
          getStockMovements({ limit: 200 }),
          getDamageReports(),
          getGRNs({ limit: 100 }),
        )
      }
      const results = await Promise.all(calls)
      setOverview(results[0].data)
      const sorted = [...results[1].data].sort((a, b) => {
        const aOut = a.stock_qty === 0, bOut = b.stock_qty === 0
        if (aOut !== bOut) return aOut ? 1 : -1
        if (a.updated_at && b.updated_at) return new Date(b.updated_at) - new Date(a.updated_at)
        return 0
      })
      setProducts(sorted)
      if (!isPurchasing) {
        setAdjustments(results[2].data)
        setMovements(results[3].data)
        setDamageReports(results[4].data)
        setGrns(results[5].data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function loadMovements() {
    try {
      const params = { limit: 200 }
      if (mvTypeFilter) params.type = mvTypeFilter
      if (mvDateFrom) params.date_from = mvDateFrom
      if (mvDateTo) params.date_to = mvDateTo
      const r = await getStockMovements(params)
      setMovements(r.data)
    } catch (e) { console.error(e) }
  }

  async function handleAdjust() {
    if (!adjForm.qty_change || adjForm.qty_change === '0') { setAdjError('Enter a qty change (+ or -)'); return }
    setAdjSaving(true); setAdjError('')
    try {
      await adjustStock({ product_id: adjustModal.id, qty_change: parseInt(adjForm.qty_change), reason: adjForm.reason })
      setAdjustModal(null); loadAll()
    } catch (e) { setAdjError(e.message) } finally { setAdjSaving(false) }
  }

  async function handleRaiseDamage() {
    if (!dmgForm.qty || dmgForm.qty === '0') { setDmgError('Enter quantity'); return }
    if (!dmgForm.reason.trim()) { setDmgError('Enter a reason'); return }
    setDmgSaving(true); setDmgError('')
    try {
      await createDamageReport({
        product_id: damageModal.id,
        qty: parseInt(dmgForm.qty),
        reason: dmgForm.reason,
        details: dmgForm.details,
        estimated_value: dmgForm.estimated_value ? parseFloat(dmgForm.estimated_value) : undefined,
      })
      setDamageModal(null)
      getDamageReports().then(r => setDamageReports(r.data))
    } catch (e) { setDmgError(e.message) } finally { setDmgSaving(false) }
  }

  async function handleReview(action) {
    setReviewing(true)
    try {
      const fn = action === 'approve' ? approveDamageReport : rejectDamageReport
      await fn(reviewModal.id, { notes: reviewNotes })
      setReviewModal(null); setReviewNotes('')
      const [dr, mv] = await Promise.all([getDamageReports(), getStockMovements({ limit: 200 })])
      setDamageReports(dr.data); setMovements(mv.data)
      // Reload stock levels too since stock may have changed
      getStockLevels().then(r => setProducts(r.data))
      getInventoryOverview().then(r => setOverview(r.data))
    } catch (e) { alert(e.message) } finally { setReviewing(false) }
  }

  async function handleGrnAction(action) {
    setGrnActing(true)
    try {
      const fn = action === 'confirm' ? confirmGRN : signOffGRN
      await fn(grnsModal.id, { notes: grnsNotes })
      setGrnsModal(null); setGrnsNotes('')
      getGRNs({ limit: 100 }).then(r => setGrns(r.data))
    } catch (e) { alert(e.message) } finally { setGrnActing(false) }
  }

  const alerts = overview ? [...(overview.out_of_stock_products || []), ...(overview.low_stock_products || [])] : []

  const TABS = [
    ['stock', 'All Stock'],
    ['alerts', `Alerts (${alerts.length})`],
    ...(!isPurchasing ? [
      ['movements', 'Movement Log'],
      ['damage', `Damage Reports (${damageReports.filter(r => r.status === 'raised').length})`],
      ['grns', 'GRNs'],
    ] : []),
  ]

  const filteredProducts = products.filter(p => {
    if (!stockSearch.trim()) return true
    const q = stockSearch.toLowerCase()
    return p.name.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q)
  })

  const dmgStatusColor = { raised: 'badge-yellow', pending_approval: 'badge-blue', approved: 'badge-green', rejected: 'badge-red' }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Inventory</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {tab === 'stock' && !isPurchasing && (
            <button className="btn btn-ghost" onClick={() => printCountSheet(filteredProducts, store)}>
              Print Count Sheet
            </button>
          )}
          {tab === 'movements' && (
            <button className="btn btn-ghost" onClick={() => printMovementReport(movements, store, { date_from: mvDateFrom, date_to: mvDateTo })}>
              Print Report
            </button>
          )}
          <button className="btn btn-ghost" onClick={loadAll}>Refresh</button>
        </div>
      </div>

      {/* Stats */}
      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isManager ? 4 : 3}, 1fr)`, gap: 12, padding: '16px 24px 0' }}>
          <StatCard label="Total Products" value={overview.total_products} />
          {isManager && <StatCard label="Stock Value" value={fmt(overview.total_stock_value)} />}
          <StatCard label="Low Stock" value={overview.low_stock_count} color="var(--warning)" />
          <StatCard label="Out of Stock" value={overview.out_of_stock_count} color="var(--danger)" />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, padding: '16px 24px 0', borderBottom: '1px solid var(--border)' }}>
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
            color: tab === key ? 'var(--accent)' : 'var(--text-muted)',
            borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
            fontWeight: tab === key ? 600 : 400, fontSize: 14,
          }}>{label}</button>
        ))}
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div className="empty-state">Loading inventory...</div>

        ) : tab === 'stock' ? (
          <div>
            <input className="input" placeholder="Search product name or barcode..."
              value={stockSearch} onChange={e => setStockSearch(e.target.value)} style={{ marginBottom: 12 }} />
            <div className="card" style={{ padding: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th><th>Barcode</th><th>Category</th>
                    {!isPurchasing && <th>Price</th>}
                    <th>Stock</th><th>Status</th>
                    {!isPurchasing && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 500 }}>{p.name}</td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 12 }}>{p.barcode || '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{p.category_name || '—'}</td>
                      {!isPurchasing && <td>{fmt(p.price)}</td>}
                      <td style={{ fontWeight: 600 }}>{p.stock_qty}</td>
                      <td>
                        {p.stock_qty === 0
                          ? <span className="badge badge-red">Out of stock</span>
                          : p.stock_qty <= p.low_stock_threshold
                          ? <span className="badge badge-yellow">Low stock</span>
                          : <span className="badge badge-green">OK</span>}
                      </td>
                      {!isPurchasing && (
                        <td style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => {
                            setAdjustModal(p); setAdjForm({ qty_change: '', reason: 'manual' }); setAdjError('')
                          }}>Adjust</button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => {
                            setDamageModal(p)
                            setDmgForm({ qty: '', reason: '', details: '', estimated_value: '' })
                            setDmgError('')
                          }}>Damage</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        ) : tab === 'alerts' ? (
          alerts.length === 0 ? (
            <div className="empty-state" style={{ color: 'var(--success)' }}>All products are well-stocked</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {alerts.map(p => (
                <div key={p.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: p.stock_qty === 0 ? 'var(--danger)' : 'var(--warning)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.barcode} · {p.category_name || 'Uncategorized'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: 18, color: p.stock_qty === 0 ? 'var(--danger)' : 'var(--warning)' }}>{p.stock_qty} in stock</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Reorder at: {p.low_stock_threshold}</div>
                    </div>
                    {!isPurchasing && (
                      <button className="btn btn-ghost btn-sm" onClick={() => {
                        setAdjustModal(p); setAdjForm({ qty_change: '', reason: 'correction' }); setAdjError('')
                      }}>Adjust</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )

        ) : tab === 'movements' ? (
          <div>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <select className="input" value={mvTypeFilter} onChange={e => setMvTypeFilter(e.target.value)} style={{ width: 180 }}>
                <option value="">All Types</option>
                <option value="sale">Sale</option>
                <option value="po_receipt">PO Receipt</option>
                <option value="manual_add">Manual Add</option>
                <option value="manual_remove">Manual Remove</option>
                <option value="damage">Damage</option>
                <option value="write_off">Write-off</option>
                <option value="theft">Theft</option>
                <option value="count_correction">Count Correction</option>
                <option value="return">Return</option>
              </select>
              <input className="input" type="date" value={mvDateFrom} onChange={e => setMvDateFrom(e.target.value)} style={{ width: 150 }} placeholder="From" />
              <input className="input" type="date" value={mvDateTo} onChange={e => setMvDateTo(e.target.value)} style={{ width: 150 }} placeholder="To" />
              <button className="btn btn-primary" onClick={loadMovements}>Filter</button>
            </div>
            <div className="card" style={{ padding: 0 }}>
              <table className="table">
                <thead>
                  <tr><th>Date</th><th>Product</th><th>Type</th><th>Before</th><th>Change</th><th>After</th><th>Reference</th><th>By</th></tr>
                </thead>
                <tbody>
                  {movements.length === 0 ? (
                    <tr><td colSpan={8} className="empty-state">No movements recorded yet</td></tr>
                  ) : movements.map(m => (
                    <tr key={m.id}>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(m.created_at).toLocaleString()}</td>
                      <td style={{ fontWeight: 500 }}>{m.product_name}</td>
                      <td><span className="badge badge-blue" style={{ fontSize: 10 }}>{m.movement_type}</span></td>
                      <td>{m.qty_before}</td>
                      <td style={{ fontWeight: 600, color: m.qty_change >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {m.qty_change >= 0 ? '+' : ''}{m.qty_change}
                      </td>
                      <td>{m.qty_after}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{m.reference_id || '—'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{m.user_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        ) : tab === 'damage' ? (
          <div>
            <div className="card" style={{ padding: 0 }}>
              <table className="table">
                <thead>
                  <tr><th>Report #</th><th>Product</th><th>Qty</th><th>Reason</th><th>Est. Value</th><th>Raised By</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {damageReports.length === 0 ? (
                    <tr><td colSpan={8} className="empty-state">No damage reports</td></tr>
                  ) : damageReports.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.report_number}</td>
                      <td style={{ fontWeight: 500 }}>{r.product_name}</td>
                      <td style={{ fontWeight: 600 }}>{r.qty}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{r.reason}</td>
                      {isManager && <td>{fmt(r.estimated_value)}</td>}
                      {!isManager && <td>—</td>}
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.raised_by_name}</td>
                      <td><span className={`badge ${dmgStatusColor[r.status] || 'badge-blue'}`}>{r.status}</span></td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => printDamageReport(r, store)}>Print</button>
                        {isManager && (r.status === 'raised' || r.status === 'pending_approval') && (
                          <button className="btn btn-ghost btn-sm" onClick={() => { setReviewModal(r); setReviewNotes('') }}>Review</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        ) : tab === 'grns' ? (
          <div>
            <div className="card" style={{ padding: 0 }}>
              <table className="table">
                <thead>
                  <tr><th>GRN #</th><th>PO #</th><th>Supplier</th><th>Received By</th><th>Date</th><th>Items</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {grns.length === 0 ? (
                    <tr><td colSpan={8} className="empty-state">No GRNs yet — auto-generated when PO items are received</td></tr>
                  ) : grns.map(g => (
                    <tr key={g.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{g.grn_number}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{g.po_number}</td>
                      <td>{g.supplier_name || '—'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{g.received_by_name}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{g.received_at ? new Date(g.received_at).toLocaleDateString() : '—'}</td>
                      <td>{(g.items || []).length}</td>
                      <td>
                        <span className={`badge ${g.status === 'signed_off' ? 'badge-green' : g.status === 'confirmed' ? 'badge-blue' : 'badge-yellow'}`}>
                          {g.status}
                        </span>
                      </td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => printGRN(g, store)}>Print</button>
                        {g.status === 'draft' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => { setGrnsModal({ ...g, action: 'confirm' }); setGrnsNotes('') }}>Confirm</button>
                        )}
                        {isManager && g.status !== 'signed_off' && (
                          <button className="btn btn-primary btn-sm" onClick={() => { setGrnsModal({ ...g, action: 'sign_off' }); setGrnsNotes('') }}>Sign Off</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Adjust stock modal ─── */}
      {adjustModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAdjustModal(null)}>
          <div className="modal" style={{ width: 380 }}>
            <div className="modal-title">Adjust Stock</div>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontWeight: 600 }}>{adjustModal.name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Current stock: {adjustModal.stock_qty}</div>
            </div>
            <div className="form-group">
              <label className="label">Qty Change (use - to remove)</label>
              <input className="input" type="number" placeholder="e.g. +10 or -3"
                value={adjForm.qty_change} onChange={e => setAdjForm({ ...adjForm, qty_change: e.target.value })} />
              {adjForm.qty_change && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  New qty: {Math.max(0, adjustModal.stock_qty + parseInt(adjForm.qty_change || 0))}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="label">Reason</label>
              <select className="input" value={adjForm.reason} onChange={e => setAdjForm({ ...adjForm, reason: e.target.value })}>
                <option value="manual">Manual correction</option>
                <option value="correction">Count correction</option>
                <option value="theft">Theft / shrinkage</option>
                <option value="sample">Sample / promo</option>
                <option value="other">Other</option>
              </select>
            </div>
            {adjError && <p className="error-msg">{adjError}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setAdjustModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdjust} disabled={adjSaving}>
                {adjSaving ? 'Saving...' : 'Apply Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Raise damage report modal ─── */}
      {damageModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDamageModal(null)}>
          <div className="modal" style={{ width: 420 }}>
            <div className="modal-title">Raise Damage Report</div>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontWeight: 600 }}>{damageModal.name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Current stock: {damageModal.stock_qty}</div>
            </div>
            <div className="form-group">
              <label className="label">Qty Damaged / Written Off *</label>
              <input className="input" type="number" min="1" value={dmgForm.qty}
                onChange={e => setDmgForm({ ...dmgForm, qty: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Reason *</label>
              <input className="input" placeholder="e.g. Water damage, broken in transit..."
                value={dmgForm.reason} onChange={e => setDmgForm({ ...dmgForm, reason: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Details (optional)</label>
              <textarea className="input" rows={2} value={dmgForm.details}
                onChange={e => setDmgForm({ ...dmgForm, details: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Estimated Value (auto-calculated if blank)</label>
              <input className="input" type="number" step="0.01" value={dmgForm.estimated_value}
                onChange={e => setDmgForm({ ...dmgForm, estimated_value: e.target.value })}
                placeholder={dmgForm.qty ? `≈ ${fmt(damageModal.price * (parseInt(dmgForm.qty) || 0))}` : ''} />
            </div>
            {dmgError && <p className="error-msg">{dmgError}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setDamageModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleRaiseDamage} disabled={dmgSaving}>
                {dmgSaving ? 'Raising...' : 'Raise Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Review damage report modal (manager) ─── */}
      {reviewModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setReviewModal(null)}>
          <div className="modal" style={{ width: 420 }}>
            <div className="modal-title">Review Damage Report</div>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>{reviewModal.product_name} — {reviewModal.qty} units</div>
              <div style={{ color: 'var(--text-muted)' }}>Est. value: {fmt(reviewModal.estimated_value)}</div>
              <div style={{ marginTop: 6 }}><strong>Reason:</strong> {reviewModal.reason}</div>
              {reviewModal.details && <div style={{ marginTop: 4 }}>{reviewModal.details}</div>}
              <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>Raised by: {reviewModal.raised_by_name}</div>
            </div>
            <div className="form-group">
              <label className="label">Review Notes</label>
              <textarea className="input" rows={2} value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setReviewModal(null)}>Cancel</button>
              <button className="btn btn-ghost" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                onClick={() => handleReview('reject')} disabled={reviewing}>Reject</button>
              <button className="btn btn-primary" onClick={() => handleReview('approve')} disabled={reviewing}>
                {reviewing ? 'Saving...' : 'Approve & Write Off'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── GRN action modal ─── */}
      {grnsModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setGrnsModal(null)}>
          <div className="modal" style={{ width: 380 }}>
            <div className="modal-title">{grnsModal.action === 'sign_off' ? 'Sign Off GRN' : 'Confirm GRN'}</div>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>{grnsModal.grn_number}</div>
              <div style={{ color: 'var(--text-muted)' }}>PO: {grnsModal.po_number} · Supplier: {grnsModal.supplier_name}</div>
            </div>
            <div className="form-group">
              <label className="label">Notes (optional)</label>
              <textarea className="input" rows={2} value={grnsNotes} onChange={e => setGrnsNotes(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setGrnsModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleGrnAction(grnsModal.action === 'sign_off' ? 'sign_off' : 'confirm')} disabled={grnActing}>
                {grnActing ? 'Saving...' : grnsModal.action === 'sign_off' ? 'Sign Off' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div className="card">
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
    </div>
  )
}
