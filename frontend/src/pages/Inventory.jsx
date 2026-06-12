import { useState, useEffect } from 'react'
import { getInventoryOverview, getStockLevels, adjustStock, getStockAdjustments } from '../api'
import { useCurrency } from '../context/CurrencyContext'

export default function Inventory() {
  const { fmt } = useCurrency()
  const [overview, setOverview] = useState(null)
  const [products, setProducts] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [tab, setTab] = useState('stock')  // stock | alerts | history
  const [adjustModal, setAdjustModal] = useState(null)  // null | product
  const [adjForm, setAdjForm] = useState({ qty_change: '', reason: 'manual' })
  const [adjError, setAdjError] = useState('')
  const [adjSaving, setAdjSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [stockSearch, setStockSearch] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [ov, sl, adj] = await Promise.all([
        getInventoryOverview(),
        getStockLevels(),
        getStockAdjustments({ limit: 100 }),
      ])
      setOverview(ov.data)
      // Sort: in-stock items first (recently updated first), out-of-stock last
      const sorted = [...sl.data].sort((a, b) => {
        const aOut = a.stock_qty === 0
        const bOut = b.stock_qty === 0
        if (aOut !== bOut) return aOut ? 1 : -1
        // Within same group: most recently updated first (if field available)
        if (a.updated_at && b.updated_at) return new Date(b.updated_at) - new Date(a.updated_at)
        return 0
      })
      setProducts(sorted)
      setAdjustments(adj.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function handleAdjust() {
    if (!adjForm.qty_change || adjForm.qty_change === '0') { setAdjError('Enter a qty change (+ or -)'); return }
    setAdjSaving(true)
    setAdjError('')
    try {
      await adjustStock({
        product_id: adjustModal.id,
        qty_change: parseInt(adjForm.qty_change),
        reason: adjForm.reason,
        cashier_name: adjForm.cashier_name,
      })
      setAdjustModal(null)
      loadAll()
    } catch (e) {
      setAdjError(e.message)
    } finally {
      setAdjSaving(false)
    }
  }

  const alerts = overview ? [...(overview.out_of_stock_products || []), ...(overview.low_stock_products || [])] : []

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Inventory</span>
        <button className="btn btn-ghost" onClick={loadAll}>Refresh</button>
      </div>

      {/* Stats */}
      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: '16px 24px 0' }}>
          <StatCard label="Total Products" value={overview.total_products} />
          <StatCard label="Stock Value" value={fmt(overview.total_stock_value)} />
          <StatCard label="Low Stock" value={overview.low_stock_count} color="var(--warning)" />
          <StatCard label="Out of Stock" value={overview.out_of_stock_count} color="var(--danger)" />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, padding: '16px 24px 0', borderBottom: '1px solid var(--border)' }}>
        {[['stock', 'All Stock'], ['alerts', `Alerts (${alerts.length})`], ['history', 'Adjustment History']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
            color: tab === key ? 'var(--accent)' : 'var(--text-muted)',
            borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
            fontWeight: tab === key ? 600 : 400, fontSize: 14,
          }}>
            {label}
          </button>
        ))}
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div className="empty-state">Loading inventory...</div>
        ) : tab === 'stock' ? (
          <div>
            <input
              className="input"
              placeholder="Search product name or barcode..."
              value={stockSearch}
              onChange={e => setStockSearch(e.target.value)}
              style={{ marginBottom: 12 }}
            />
          <div className="card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr><th>Product</th><th>Barcode</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {products.filter(p => {
                  if (!stockSearch.trim()) return true
                  const q = stockSearch.toLowerCase()
                  return p.name.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q)
                }).map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{p.name}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 12 }}>{p.barcode || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{p.category_name || '—'}</td>
                    <td>{fmt(p.price)}</td>
                    <td style={{ fontWeight: 600 }}>{p.stock_qty}</td>
                    <td>
                      {p.stock_qty === 0
                        ? <span className="badge badge-red">Out of stock</span>
                        : p.stock_qty <= p.low_stock_threshold
                        ? <span className="badge badge-yellow">Low stock</span>
                        : <span className="badge badge-green">OK</span>
                      }
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => {
                        setAdjustModal(p)
                        setAdjForm({ qty_change: '', reason: 'manual' })
                        setAdjError('')
                      }}>
                        Adjust
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>

        ) : tab === 'alerts' ? (
          alerts.length === 0 ? (
            <div className="empty-state" style={{ color: 'var(--success)' }}>
              All products are well-stocked
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {alerts.map(p => (
                <div key={p.id} className="card" style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderColor: p.stock_qty === 0 ? 'var(--danger)' : 'var(--warning)',
                }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {p.barcode} · {p.category_name || 'Uncategorized'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: 18, color: p.stock_qty === 0 ? 'var(--danger)' : 'var(--warning)' }}>
                        {p.stock_qty} in stock
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Reorder at: {p.low_stock_threshold}
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      setAdjustModal(p)
                      setAdjForm({ qty_change: '', reason: 'correction' })
                      setAdjError('')
                    }}>
                      Adjust
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )

        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Product</th><th>Before</th><th>Change</th><th>After</th><th>Reason</th><th>Reference</th><th>By</th></tr>
              </thead>
              <tbody>
                {adjustments.length === 0 ? (
                  <tr><td colSpan={8} className="empty-state">No adjustments yet</td></tr>
                ) : adjustments.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(a.created_at).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 500 }}>{a.product_name}</td>
                    <td>{a.qty_before}</td>
                    <td style={{ fontWeight: 600, color: a.qty_change >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {a.qty_change >= 0 ? '+' : ''}{a.qty_change}
                    </td>
                    <td>{a.qty_after}</td>
                    <td><span className="badge badge-blue">{a.reason}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{a.reference_id || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{a.cashier_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Adjust stock modal */}
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
              <input className="input" type="number"
                placeholder="e.g. +10 or -3"
                value={adjForm.qty_change}
                onChange={e => setAdjForm({ ...adjForm, qty_change: e.target.value })} />
              {adjForm.qty_change && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  New qty: {Math.max(0, adjustModal.stock_qty + parseInt(adjForm.qty_change || 0))}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="label">Reason</label>
              <select className="input" value={adjForm.reason}
                onChange={e => setAdjForm({ ...adjForm, reason: e.target.value })}>
                <option value="manual">Manual correction</option>
                <option value="correction">Count correction</option>
                <option value="damage">Damaged / write-off</option>
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
