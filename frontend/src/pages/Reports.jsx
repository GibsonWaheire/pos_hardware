import { useState, useEffect } from 'react'
import {
  getSalesReport, getTopProducts, getPaymentBreakdown,
  getReportByCashier, getReportByCategory, getInventoryReport,
  getExportCsvUrl,
} from '../api'

function todayStr() { return new Date().toISOString().split('T')[0] }
function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}
function fmt(n) { return `$${Number(n || 0).toFixed(2)}` }

function InlineBar({ value, max, color = 'var(--accent)' }) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 60, textAlign: 'right' }}>{fmt(value)}</span>
    </div>
  )
}

export default function Reports() {
  const [tab, setTab] = useState('sales')
  const [dateFrom, setDateFrom] = useState(daysAgo(30))
  const [dateTo, setDateTo] = useState(todayStr())
  const [loading, setLoading] = useState(false)

  // Data for each tab
  const [salesData, setSalesData] = useState(null)
  const [topProducts, setTopProducts] = useState([])
  const [paymentData, setPaymentData] = useState([])
  const [cashierData, setCashierData] = useState([])
  const [categoryData, setCategoryData] = useState([])
  const [inventoryData, setInventoryData] = useState(null)

  useEffect(() => { load() }, [tab])

  async function load() {
    setLoading(true)
    const params = { date_from: dateFrom, date_to: dateTo }
    try {
      if (tab === 'sales') {
        const [s, tp, pb] = await Promise.all([
          getSalesReport(params), getTopProducts(params), getPaymentBreakdown(params),
        ])
        setSalesData(s.data); setTopProducts(tp.data); setPaymentData(pb.data)
      } else if (tab === 'cashier') {
        const r = await getReportByCashier(params); setCashierData(r.data)
      } else if (tab === 'category') {
        const r = await getReportByCategory(params); setCategoryData(r.data)
      } else if (tab === 'inventory') {
        const r = await getInventoryReport(); setInventoryData(r.data)
      }
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  function downloadCsv(type) {
    const url = getExportCsvUrl({ type, date_from: dateFrom, date_to: dateTo })
    window.open(url, '_blank')
  }

  const TABS = [
    { key: 'sales', label: 'Sales' },
    { key: 'cashier', label: 'By Cashier' },
    { key: 'category', label: 'By Category' },
    { key: 'inventory', label: 'Inventory' },
  ]

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Reports</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {tab !== 'inventory' && (
            <>
              <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 140 }} />
              <span style={{ color: 'var(--text-muted)' }}>to</span>
              <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 140 }} />
              <button className="btn btn-primary" onClick={load} disabled={loading}>
                {loading ? 'Loading...' : 'Run'}
              </button>
              <button className="btn btn-ghost" onClick={() => downloadCsv(tab === 'cashier' ? 'cashier' : tab === 'sales' ? 'sales' : 'items')}>
                Export CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '0 24px', borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
            color: tab === t.key ? 'var(--accent)' : 'var(--text-muted)',
            borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            fontWeight: tab === t.key ? 600 : 400, fontSize: 14,
          }}>{t.label}</button>
        ))}
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>

        {/* ── Sales tab ── */}
        {tab === 'sales' && salesData && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
              <StatCard label="Revenue" value={fmt(salesData.total_revenue)} />
              <StatCard label="Transactions" value={salesData.total_transactions} />
              <StatCard label="Avg Sale" value={salesData.total_transactions ? fmt(salesData.total_revenue / salesData.total_transactions) : '—'} />
              {paymentData.map(p => (
                <StatCard key={p.method} label={p.method} value={fmt(p.total)} sub={`${p.count} sales`} />
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Daily breakdown */}
              <div className="card" style={{ padding: 0 }}>
                <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 14 }}>Daily Breakdown</div>
                {salesData.rows.length === 0 ? (
                  <div className="empty-state">No data</div>
                ) : (
                  <table className="table">
                    <thead><tr><th>Date</th><th>Sales</th><th>Revenue</th><th>Tax</th></tr></thead>
                    <tbody>
                      {salesData.rows.map(r => (
                        <tr key={r.date}>
                          <td>{r.date}</td>
                          <td>{r.transactions}</td>
                          <td style={{ fontWeight: 600 }}>{fmt(r.revenue)}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{fmt(r.tax)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Top products */}
              <div className="card" style={{ padding: 0 }}>
                <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 14 }}>Top Products / Services</div>
                {topProducts.length === 0 ? (
                  <div className="empty-state">No data</div>
                ) : (
                  <table className="table">
                    <thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Revenue</th></tr></thead>
                    <tbody>
                      {topProducts.slice(0, 15).map((p, i) => (
                        <tr key={i}>
                          <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                          <td>{p.product_name}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{p.total_qty}</td>
                          <td style={{ fontWeight: 600 }}>{fmt(p.total_revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Cashier tab ── */}
        {tab === 'cashier' && (
          <>
            {cashierData.length === 0 && !loading && (
              <div className="empty-state">No data for this period</div>
            )}
            {cashierData.length > 0 && (
              <>
                {/* Visual bars */}
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Revenue by Cashier</div>
                  {(() => {
                    const max = Math.max(...cashierData.map(c => c.revenue))
                    return cashierData.map((c, i) => (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                          <span style={{ fontWeight: 500 }}>{c.cashier_name}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{c.transactions} sales · avg {fmt(c.avg_sale)}</span>
                        </div>
                        <InlineBar value={c.revenue} max={max} />
                      </div>
                    ))
                  })()}
                </div>
                <div className="card" style={{ padding: 0 }}>
                  <table className="table">
                    <thead><tr><th>Cashier</th><th>Transactions</th><th>Revenue</th><th>Tax</th><th>Avg Sale</th></tr></thead>
                    <tbody>
                      {cashierData.map((c, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{c.cashier_name}</td>
                          <td>{c.transactions}</td>
                          <td style={{ fontWeight: 600 }}>{fmt(c.revenue)}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{fmt(c.tax)}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{fmt(c.avg_sale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Category tab ── */}
        {tab === 'category' && (
          <>
            {categoryData.length === 0 && !loading && (
              <div className="empty-state">No data for this period</div>
            )}
            {categoryData.length > 0 && (
              <>
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Revenue by Category</div>
                  {(() => {
                    const max = Math.max(...categoryData.map(c => c.revenue))
                    return categoryData.map((c, i) => (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                          <span style={{ fontWeight: 500 }}>{c.category_name}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{c.total_qty} units</span>
                        </div>
                        <InlineBar value={c.revenue} max={max} color="var(--success)" />
                      </div>
                    ))
                  })()}
                </div>
                <div className="card" style={{ padding: 0 }}>
                  <table className="table">
                    <thead><tr><th>Category</th><th>Line Items</th><th>Units Sold</th><th>Revenue</th></tr></thead>
                    <tbody>
                      {categoryData.map((c, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{c.category_name}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{c.line_items}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{c.total_qty}</td>
                          <td style={{ fontWeight: 600 }}>{fmt(c.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Inventory tab ── */}
        {tab === 'inventory' && inventoryData && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
              <StatCard label="Total Products" value={inventoryData.summary.total_products} />
              <StatCard label="Stock Value" value={fmt(inventoryData.summary.total_stock_value)} color="var(--accent)" />
              <StatCard label="Out of Stock" value={inventoryData.summary.out_of_stock_count} color={inventoryData.summary.out_of_stock_count > 0 ? 'var(--danger)' : undefined} />
              <StatCard label="Low Stock" value={inventoryData.summary.low_stock_count} color={inventoryData.summary.low_stock_count > 0 ? 'var(--warning)' : undefined} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="card" style={{ padding: 0 }}>
                <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 14, color: 'var(--danger)' }}>Out of Stock ({inventoryData.out_of_stock.length})</div>
                {inventoryData.out_of_stock.length === 0 ? (
                  <div className="empty-state" style={{ color: 'var(--success)' }}>All products in stock</div>
                ) : (
                  <table className="table">
                    <thead><tr><th>Product</th><th>Price</th></tr></thead>
                    <tbody>
                      {inventoryData.out_of_stock.map(p => (
                        <tr key={p.id}><td>{p.name}</td><td>{fmt(p.price)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="card" style={{ padding: 0 }}>
                <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 14, color: 'var(--warning)' }}>Low Stock ({inventoryData.low_stock.length})</div>
                {inventoryData.low_stock.length === 0 ? (
                  <div className="empty-state" style={{ color: 'var(--success)' }}>No low-stock alerts</div>
                ) : (
                  <table className="table">
                    <thead><tr><th>Product</th><th>Stock</th><th>Min</th><th>Price</th></tr></thead>
                    <tbody>
                      {inventoryData.low_stock.map(p => (
                        <tr key={p.id}>
                          <td>{p.name}</td>
                          <td style={{ color: 'var(--warning)', fontWeight: 600 }}>{p.stock_qty}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{p.threshold}</td>
                          <td>{fmt(p.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="card" style={{ padding: 0, gridColumn: 'span 2' }}>
                <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 14 }}>Top 10 by Stock Value</div>
                <table className="table">
                  <thead><tr><th>#</th><th>Product</th><th>Qty</th><th>Unit Price</th><th>Stock Value</th></tr></thead>
                  <tbody>
                    {inventoryData.top_by_value.map((p, i) => (
                      <tr key={p.id}>
                        <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                        <td style={{ fontWeight: 500 }}>{p.name}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{p.stock_qty}</td>
                        <td>{fmt(p.price)}</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmt(p.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {loading && <div className="empty-state">Loading...</div>}

      </div>
    </div>
  )
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="card">
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
