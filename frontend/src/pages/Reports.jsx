import { useState, useEffect } from 'react'
import { getSalesReport, getTopProducts, getPaymentBreakdown } from '../api'

function todayStr() { return new Date().toISOString().split('T')[0] }
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

export default function Reports() {
  const [dateFrom, setDateFrom] = useState(daysAgo(30))
  const [dateTo, setDateTo] = useState(todayStr())
  const [summary, setSummary] = useState(null)
  const [topProducts, setTopProducts] = useState([])
  const [paymentBreakdown, setPaymentBreakdown] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [s, tp, pb] = await Promise.all([
        getSalesReport({ date_from: dateFrom, date_to: dateTo }),
        getTopProducts({ date_from: dateFrom, date_to: dateTo }),
        getPaymentBreakdown({ date_from: dateFrom, date_to: dateTo }),
      ])
      setSummary(s.data)
      setTopProducts(tp.data)
      setPaymentBreakdown(pb.data)
    } catch (e) {
      console.error('Reports error', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Reports</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ color: 'var(--text-muted)' }}>to</span>
          <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 140 }} />
          <button className="btn btn-primary" onClick={loadAll} disabled={loading}>
            {loading ? 'Loading...' : 'Run'}
          </button>
        </div>
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>
        {/* Summary cards */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            <StatCard label="Total Revenue" value={`$${summary.total_revenue.toFixed(2)}`} />
            <StatCard label="Transactions" value={summary.total_transactions} />
            <StatCard label="Avg Sale" value={summary.total_transactions ? `$${(summary.total_revenue / summary.total_transactions).toFixed(2)}` : '—'} />
            {paymentBreakdown.map(p => (
              <StatCard key={p.method} label={p.method.charAt(0).toUpperCase() + p.method.slice(1)} value={`$${p.total.toFixed(2)}`} sub={`${p.count} sales`} />
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Daily breakdown */}
          {summary && summary.rows.length > 0 && (
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Daily Breakdown</div>
              <table className="table">
                <thead>
                  <tr><th>Date</th><th>Transactions</th><th>Revenue</th><th>Tax</th></tr>
                </thead>
                <tbody>
                  {summary.rows.map(r => (
                    <tr key={r.date}>
                      <td>{r.date}</td>
                      <td>{r.transactions}</td>
                      <td>${r.revenue.toFixed(2)}</td>
                      <td>${r.tax.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Top products */}
          {topProducts.length > 0 && (
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Top Products</div>
              <table className="table">
                <thead>
                  <tr><th>#</th><th>Product</th><th>Qty Sold</th><th>Revenue</th></tr>
                </thead>
                <tbody>
                  {topProducts.slice(0, 15).map((p, i) => (
                    <tr key={p.product_id || i}>
                      <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                      <td>{p.product_name}</td>
                      <td>{p.total_qty}</td>
                      <td>${p.total_revenue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && summary && summary.rows.length === 0 && topProducts.length === 0 && (
          <div className="empty-state">No sales data for the selected period</div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }) {
  return (
    <div className="card">
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
