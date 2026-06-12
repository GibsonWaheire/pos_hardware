import { useState, useEffect, useRef } from 'react'
import {
  getSalesReport, getTopProducts, getPaymentBreakdown,
  getReportByCashier, getReportByCategory, getInventoryReport,
  getPurchasingReport, getReturnsReport,
  getExportCsvUrl, getShiftReports, printShiftReport, fileShiftReport,
} from '../api'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import {
  printSalesReport, printCashierReport, printInventoryReport, printPurchasingReport, printReturnsReport,
} from '../utils/print'

function todayStr() { return new Date().toISOString().split('T')[0] }
function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}
function fmtDate(iso) { return iso ? new Date(iso).toLocaleString('en-KE') : '—' }

function InlineBar({ value, max, color = 'var(--accent)' }) {
  const { fmt } = useCurrency()
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 70, textAlign: 'right' }}>{fmt(value)}</span>
    </div>
  )
}

export default function Reports() {
  const { user } = useAuth()
  const { fmt } = useCurrency()
  const [tab, setTab] = useState('sales')
  const [dateFrom, setDateFrom] = useState(daysAgo(30))
  const [dateTo, setDateTo] = useState(todayStr())
  const [loading, setLoading] = useState(false)

  // Analytics tabs data
  const [salesData, setSalesData]       = useState(null)
  const [topProducts, setTopProducts]   = useState([])
  const [paymentData, setPaymentData]   = useState([])
  const [cashierData, setCashierData]   = useState([])
  const [categoryData, setCategoryData] = useState([])
  const [inventoryData, setInventoryData] = useState(null)
  const [purchasingData, setPurchasingData] = useState(null)
  const [returnsData, setReturnsData] = useState(null)

  // Shift reports tab
  const [shiftReports, setShiftReports] = useState([])
  const [printReport, setPrintReport]   = useState(null)   // report being shown in print view
  const [fileModal, setFileModal]       = useState(null)   // report being filed
  const [signedNote, setSignedNote]     = useState('')
  const [filing, setFiling]             = useState(false)
  const [srFilter, setSrFilter]         = useState('all') // all | pending | filed

  const printRef = useRef(null)

  useEffect(() => { load() }, [tab])
  // Auto-correct tab to first accessible one on mount (TABS accessible via closure at call time)
  useEffect(() => {
    if (!TABS.find(t => t.key === tab)) {
      const first = TABS[0]?.key
      if (first) setTab(first)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    // TABS is accessible via closure since load() is only called after render
    if (!TABS.find(entry => entry.key === tab)) return
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
      } else if (tab === 'purchasing') {
        const r = await getPurchasingReport(params); setPurchasingData(r.data)
      } else if (tab === 'returns') {
        const r = await getReturnsReport(params); setReturnsData(r.data)
      } else if (tab === 'shift-reports') {
        await loadShiftReports()
      }
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  async function loadShiftReports() {
    const params = srFilter !== 'all' ? { status: srFilter.toUpperCase() } : {}
    const r = await getShiftReports(params)
    setShiftReports(r.data)
  }

  function downloadCsv(type) {
    window.open(getExportCsvUrl({ type, date_from: dateFrom, date_to: dateTo }), '_blank')
  }

  async function handlePrint(report) {
    try {
      const r = await printShiftReport(report.id)
      const updated = r.data
      setPrintReport(updated)
      setShiftReports(prev => prev.map(x => x.id === updated.id ? updated : x))
      // Slight delay so the DOM updates before print dialog
      setTimeout(() => window.print(), 150)
    } catch (e) {
      alert('Print error: ' + e.message)
    }
  }

  async function handleFile() {
    if (!fileModal) return
    setFiling(true)
    try {
      const r = await fileShiftReport(fileModal.id, { signed_note: signedNote })
      const updated = r.data
      setShiftReports(prev => prev.map(x => x.id === updated.id ? updated : x))
      setFileModal(null)
      setSignedNote('')
    } catch (e) {
      alert('File error: ' + e.message)
    } finally {
      setFiling(false)
    }
  }

  const canFile  = user && ['manager', 'admin'].includes(user.role)
  const canPrint = user && ['manager', 'admin', 'inventory', 'purchasing'].includes(user.role)
  const isManager = user && ['manager', 'admin'].includes(user.role)
  const isInventory = user?.role === 'inventory'

  const ALL_TABS = [
    { key: 'sales',         label: 'Sales',         roles: ['manager', 'admin'] },
    { key: 'cashier',       label: 'By Cashier',    roles: ['manager', 'admin'] },
    { key: 'category',      label: 'By Category',   roles: ['manager', 'admin'] },
    { key: 'inventory',     label: 'Inventory',     roles: ['inventory', 'manager', 'admin'] },
    { key: 'purchasing',    label: 'Purchasing',    roles: ['purchasing', 'manager', 'admin'] },
    { key: 'returns',       label: 'Returns',       roles: ['manager', 'admin'] },
    { key: 'shift-reports', label: 'Shift Reports', roles: ['manager', 'admin'] },
  ]
  const TABS = ALL_TABS.filter(t => t.roles.includes(user?.role))
  // Auto-select first visible tab if current tab is not accessible
  const activeTab = TABS.find(t => t.key === tab) ? tab : (TABS[0]?.key || 'inventory')

  const filteredReports = shiftReports.filter(r => {
    if (srFilter === 'all') return true
    if (srFilter === 'pending') return r.status !== 'FILED'
    if (srFilter === 'filed') return r.status === 'FILED'
    return true
  })

  return (
    <>
      {/* ── Print view (hidden on screen, shown on print) ── */}
      {printReport && <PrintPage report={printReport} ref={printRef} />}

      <div className="no-print" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div className="page-header">
          <span className="page-title">Reports</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {activeTab !== 'inventory' && activeTab !== 'shift-reports' && activeTab !== 'purchasing' && activeTab !== 'returns' && (
              <>
                <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 140 }} />
                <span style={{ color: 'var(--text-muted)' }}>to</span>
                <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 140 }} />
                <button className="btn btn-primary" onClick={load} disabled={loading}>
                  {loading ? 'Loading...' : 'Run'}
                </button>
                <button className="btn btn-ghost" onClick={() => downloadCsv(activeTab === 'cashier' ? 'cashier' : activeTab === 'sales' ? 'sales' : 'items')}>
                  Export CSV
                </button>
              </>
            )}
            {(activeTab === 'purchasing' || activeTab === 'returns') && (
              <>
                <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 140 }} />
                <span style={{ color: 'var(--text-muted)' }}>to</span>
                <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 140 }} />
                <button className="btn btn-primary" onClick={load} disabled={loading}>
                  {loading ? 'Loading...' : 'Run'}
                </button>
              </>
            )}
            {activeTab === 'sales' && salesData && (
              <button className="btn btn-ghost" onClick={() => printSalesReport(salesData, topProducts, paymentData, dateFrom, dateTo)}>
                Print Report
              </button>
            )}
            {activeTab === 'cashier' && cashierData.length > 0 && (
              <button className="btn btn-ghost" onClick={() => printCashierReport(cashierData, dateFrom, dateTo)}>
                Print Report
              </button>
            )}
            {activeTab === 'inventory' && inventoryData && (
              <button className="btn btn-ghost" onClick={() => printInventoryReport(inventoryData, {}, isManager)}>
                Print Report
              </button>
            )}
            {activeTab === 'purchasing' && purchasingData && (
              <button className="btn btn-ghost" onClick={() => printPurchasingReport(purchasingData, dateFrom, dateTo, {}, isManager)}>
                Print Report
              </button>
            )}
            {activeTab === 'returns' && returnsData && (
              <button className="btn btn-ghost" onClick={() => printReturnsReport(returnsData)}>
                Print Report
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', padding: '0 24px', borderBottom: '1px solid var(--border)' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              color: activeTab === t.key ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: activeTab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              fontWeight: activeTab === t.key ? 600 : 400, fontSize: 14,
            }}>{t.label}</button>
          ))}
        </div>

        <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>

          {/* ── Sales tab ── */}
          {activeTab === 'sales' && salesData && (
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
          {activeTab === 'cashier' && (
            <>
              {cashierData.length === 0 && !loading && <div className="empty-state">No data for this period</div>}
              {cashierData.length > 0 && (
                <>
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
          {activeTab === 'category' && (
            <>
              {categoryData.length === 0 && !loading && <div className="empty-state">No data for this period</div>}
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
          {activeTab === 'inventory' && inventoryData && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                <StatCard label="Total Products" value={inventoryData.summary.total_products} />
                {isManager && <StatCard label="Stock Value" value={fmt(inventoryData.summary.total_stock_value)} color="var(--accent)" />}
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
                      <thead><tr><th>Product</th>{isManager && <th>Price</th>}</tr></thead>
                      <tbody>
                        {inventoryData.out_of_stock.map(p => (
                          <tr key={p.id}><td>{p.name}</td>{isManager && <td>{fmt(p.price)}</td>}</tr>
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
                      <thead><tr><th>Product</th><th>Stock</th><th>Min</th>{isManager && <th>Price</th>}</tr></thead>
                      <tbody>
                        {inventoryData.low_stock.map(p => (
                          <tr key={p.id}>
                            <td>{p.name}</td>
                            <td style={{ color: 'var(--warning)', fontWeight: 600 }}>{p.stock_qty}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{p.threshold}</td>
                            {isManager && <td>{fmt(p.price)}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="card" style={{ padding: 0, gridColumn: 'span 2' }}>
                  <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 14 }}>Top 10 by Stock Value</div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th><th>Product</th><th>Qty</th>
                        {isManager && <th>Unit Price</th>}
                        {isManager && <th>Stock Value</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryData.top_by_value.map((p, i) => (
                        <tr key={p.id}>
                          <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                          <td style={{ fontWeight: 500 }}>{p.name}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{p.stock_qty}</td>
                          {isManager && <td>{fmt(p.price)}</td>}
                          {isManager && <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmt(p.value)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ── Purchasing tab ── */}
          {activeTab === 'purchasing' && purchasingData && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                <StatCard label="Total POs" value={purchasingData.total_pos} />
                {isManager && purchasingData.total_cost != null && (
                  <StatCard label="Total Cost" value={fmt(purchasingData.total_cost)} color="var(--accent)" />
                )}
                <StatCard label="GRNs Received" value={purchasingData.grn_count} />
                <StatCard label="GRNs Signed Off" value={purchasingData.grn_signed_off} color="var(--success)" />
                {Object.entries(purchasingData.by_status || {}).map(([status, count]) => (
                  <StatCard key={status} label={status.charAt(0).toUpperCase() + status.slice(1)} value={count} />
                ))}
              </div>

              {purchasingData.pos?.length === 0 && (
                <div className="empty-state">No purchase orders for this period</div>
              )}

              {purchasingData.pos?.length > 0 && (
                <div className="card" style={{ padding: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>PO Number</th>
                        <th>Supplier</th>
                        <th>Items</th>
                        {isManager && <th>Total Cost</th>}
                        <th>Status</th>
                        <th>Created By</th>
                        <th>Date</th>
                        <th>Approved By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchasingData.pos.map(po => (
                        <tr key={po.id}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>{po.po_number}</td>
                          <td>{po.supplier_name}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{po.items_count}</td>
                          {isManager && <td style={{ fontWeight: 600 }}>{po.total_cost != null ? fmt(po.total_cost) : '—'}</td>}
                          <td>
                            <span style={{
                              padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                              background: po.status === 'received' ? '#dcfce7' : po.status === 'approved' ? '#dbeafe' : po.status === 'cancelled' ? '#fee2e2' : '#fef3c7',
                              color: po.status === 'received' ? '#15803d' : po.status === 'approved' ? '#1e40af' : po.status === 'cancelled' ? '#dc2626' : '#92400e',
                            }}>
                              {po.status}
                            </span>
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{po.created_by_name}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{po.created_at ? new Date(po.created_at).toLocaleDateString('en-KE') : '—'}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{po.approved_by_name || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── Returns tab ── */}
          {activeTab === 'returns' && returnsData && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                <StatCard label="Total Returns" value={returnsData.total_returns} />
                <StatCard label="Total Refunded" value={fmt(returnsData.total_refund)} color="var(--danger)" />
                <StatCard label="Pending Approval" value={(returnsData.by_status || {}).pending_approval || 0}
                  color={(returnsData.by_status || {}).pending_approval > 0 ? 'var(--warning)' : undefined} />
                <StatCard label="Rejected" value={(returnsData.by_status || {}).rejected || 0} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div className="card" style={{ padding: 0 }}>
                  <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 14 }}>By Refund Method</div>
                  {Object.keys(returnsData.by_method || {}).length === 0 ? (
                    <div className="empty-state">No data</div>
                  ) : (
                    <table className="table">
                      <thead><tr><th>Method</th><th>Amount</th></tr></thead>
                      <tbody>
                        {Object.entries(returnsData.by_method).map(([m, v]) => (
                          <tr key={m}><td style={{ textTransform: 'capitalize' }}>{m.replace('_', ' ')}</td><td style={{ fontWeight: 600 }}>{fmt(v)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="card" style={{ padding: 0 }}>
                  <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 14 }}>Top Returned Products</div>
                  {(returnsData.top_products || []).length === 0 ? (
                    <div className="empty-state">No data</div>
                  ) : (
                    <table className="table">
                      <thead><tr><th>Product</th><th>Qty</th><th>Value</th></tr></thead>
                      <tbody>
                        {returnsData.top_products.slice(0, 10).map((p, i) => (
                          <tr key={i}>
                            <td>{p.product_name}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{p.qty}</td>
                            <td style={{ fontWeight: 600 }}>{fmt(p.refund)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="card" style={{ padding: 0 }}>
                <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 14 }}>Return Transactions</div>
                {returnsData.returns.length === 0 ? (
                  <div className="empty-state">No returns in this period</div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr><th>Return #</th><th>Receipt</th><th>Reason</th><th>Method</th><th>Refund</th><th>Status</th><th>Date</th></tr>
                    </thead>
                    <tbody>
                      {returnsData.returns.map(r => (
                        <tr key={r.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.return_number}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.original_receipt}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.reason}</td>
                          <td style={{ fontSize: 12 }}>{r.refund_method}</td>
                          <td style={{ fontWeight: 600, color: 'var(--danger)' }}>{fmt(r.total_refund)}</td>
                          <td>
                            <span style={{
                              padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                              background: r.status === 'completed' ? '#dcfce7' : r.status === 'rejected' ? '#fee2e2' : '#fef3c7',
                              color: r.status === 'completed' ? '#15803d' : r.status === 'rejected' ? '#dc2626' : '#92400e',
                            }}>{r.status}</span>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {r.created_at ? new Date(r.created_at).toLocaleDateString('en-KE') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* ── Shift Reports tab ── */}
          {activeTab === 'shift-reports' && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['all', 'All'], ['pending', 'Pending'], ['filed', 'Filed']].map(([key, label]) => (
                    <button key={key} onClick={async () => { setSrFilter(key); await loadShiftReports() }}
                      className={srFilter === key ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>
                      {label}
                    </button>
                  ))}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={loadShiftReports}>Refresh</button>
              </div>

              {loading && <div className="empty-state">Loading...</div>}

              {!loading && filteredReports.length === 0 && (
                <div className="empty-state">No shift reports found</div>
              )}

              {!loading && filteredReports.length > 0 && (
                <div className="card" style={{ padding: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Report #</th>
                        <th>Shift</th>
                        <th>Period</th>
                        <th>Cashier</th>
                        <th>Revenue</th>
                        <th>Status</th>
                        <th>Filed By</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReports.map(r => {
                        const c = r.content || {}
                        const summary = c.summary || {}
                        const shift   = c.shift   || {}
                        return (
                          <tr key={r.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>{r.report_number}</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>#{r.shift_id}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              <div>{fmtDate(r.period_start)}</div>
                              <div>{fmtDate(r.period_end)}</div>
                            </td>
                            <td style={{ fontWeight: 500 }}>{shift.cashier_name || '—'}</td>
                            <td style={{ fontWeight: 600 }}>{fmt(summary.total_revenue)}</td>
                            <td>
                              <StatusBadge status={r.status} printCount={r.print_count} />
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {r.filed_by_name ? `${r.filed_by_name}` : '—'}
                              {r.filed_at && <div>{fmtDate(r.filed_at)}</div>}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                {canPrint && (
                                  <button className="btn btn-ghost btn-sm" onClick={() => handlePrint(r)}>
                                    {r.print_count > 0 ? `Reprint (${r.print_count})` : 'Print'}
                                  </button>
                                )}
                                {canFile && r.status !== 'FILED' && (
                                  <button className="btn btn-primary btn-sm" onClick={() => { setFileModal(r); setSignedNote('') }}>
                                    File
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {loading && tab !== 'shift-reports' && <div className="empty-state">Loading...</div>}
        </div>
      </div>

      {/* ── File modal ── */}
      {fileModal && (
        <div className="modal-overlay no-print" onClick={e => e.target === e.currentTarget && setFileModal(null)}>
          <div className="modal" style={{ width: 420 }}>
            <div className="modal-title">File Report</div>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontWeight: 600 }}>{fileModal.report_number}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {(fileModal.content?.shift?.cashier_name) || '—'} ·{' '}
                {fmtDate(fileModal.period_start)} — {fmtDate(fileModal.period_end)}
              </div>
            </div>
            {fileModal.print_count === 0 && (
              <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#92400e', fontSize: 13 }}>
                This report has not been printed yet. Print it before filing.
              </div>
            )}
            <div className="form-group">
              <label className="label">Manager Sign-off Note (optional)</label>
              <textarea className="input" rows={3} placeholder="e.g. Reconciled and verified by manager"
                value={signedNote} onChange={e => setSignedNote(e.target.value)}
                style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setFileModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleFile} disabled={filing}>
                {filing ? 'Filing...' : 'Confirm & File'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Print page component ───────────────────────────────────────────────────────

function PrintPage({ report }) {
  const { fmt: kes } = useCurrency()
  const c       = report.content || {}
  const store   = c.store   || {}
  const shift   = c.shift   || {}
  const summary = c.summary || {}
  const overrides = c.overrides || {}
  const isReprint = report.print_count > 1

  return (
    <div className="print-page">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-page, .print-page * { visibility: visible; }
          .print-page {
            position: absolute;
            left: 0; top: 0;
            width: 210mm;
            min-height: 297mm;
            padding: 20mm;
            background: white;
            color: black;
            font-family: 'Times New Roman', serif;
            font-size: 11pt;
            line-height: 1.5;
          }
          @page {
            size: A4;
            margin: 0;
          }
        }
      `}</style>

      {/* Store header */}
      <div style={{ borderBottom: '2px solid black', paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
          {store.name || 'Store'}
        </div>
        {store.address && <div style={{ fontSize: 10, marginTop: 2 }}>{store.address}</div>}
        <div style={{ fontSize: 10, marginTop: 2 }}>
          {[store.phone, store.email].filter(Boolean).join(' | ')}
          {store.tax_number && ` | PIN: ${store.tax_number}`}
        </div>
      </div>

      {/* Report title */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
          Shift Daily Report
        </div>
        <div style={{ fontSize: 10, marginTop: 4, color: '#555' }}>
          {report.report_number} &nbsp;|&nbsp; Generated: {fmtDate(report.created_at)}
        </div>
        {isReprint && (
          <div style={{
            marginTop: 8, padding: '4px 12px', border: '2px solid #dc2626',
            display: 'inline-block', color: '#dc2626', fontWeight: 700, fontSize: 11,
            letterSpacing: 1, textTransform: 'uppercase',
          }}>
            REPRINT — COPY {report.print_count}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {/* Shift details */}
        <PSection title="Shift Details">
          <PRow label="Cashier"     value={shift.cashier_name || '—'} />
          <PRow label="Opened"      value={fmtDate(shift.opened_at)} />
          <PRow label="Closed"      value={fmtDate(shift.closed_at)} />
        </PSection>

        {/* Cash reconciliation */}
        <PSection title="Cash Reconciliation">
          <PRow label="Opening Float"  value={kes(shift.opening_float)} />
          <PRow label="Cash Sales"     value={kes(summary.cash_sales)} />
          <PRow label="Expected Cash"  value={kes(shift.expected_cash)} bold />
          <PRow label="Closing Count"  value={kes(shift.closing_float)} bold />
          <PRow
            label="Variance"
            value={kes(shift.variance)}
            color={shift.variance < 0 ? '#dc2626' : shift.variance > 0 ? '#16a34a' : undefined}
            bold
          />
        </PSection>
      </div>

      {/* Sales summary */}
      <PSection title="Sales Summary" style={{ marginBottom: 12 }}>
        <PRow label="Total Transactions" value={summary.transaction_count ?? 0} />
        <PRow label="Total Revenue"      value={kes(summary.total_revenue)} bold />
        <PRow label="Cash"               value={kes(summary.cash_sales)} />
        <PRow label="Card / EFTPOS"      value={kes(summary.card_sales)} />
        <PRow label="M-Pesa"             value={kes(summary.mpesa_sales)} />
        <PRow label="Split Payment"      value={kes(summary.split_sales)} />
        <PRow label="Total Tax (VAT)"    value={kes(summary.total_tax)} />
        <PRow label="Total Discounts"    value={kes(summary.total_discounts)} />
      </PSection>

      {/* Overrides & exceptions */}
      <PSection title="Overrides & Exceptions" style={{ marginBottom: 16 }}>
        <PRow label="Voided Transactions" value={overrides.void_count ?? 0} />
        <PRow label="Voided Amount"       value={kes(overrides.void_amount)} color={overrides.void_count > 0 ? '#dc2626' : undefined} />
        <PRow label="No-Sale Events"      value={overrides.no_sale_count ?? 0} />
      </PSection>

      {/* Notes */}
      {shift.notes && (
        <div style={{ marginBottom: 16, fontSize: 10, border: '1px solid #ccc', padding: '8px 12px', borderRadius: 4 }}>
          <strong>Shift Notes:</strong> {shift.notes}
        </div>
      )}

      {/* Signatures */}
      <div style={{ borderTop: '1px solid black', paddingTop: 16, marginTop: 8 }}>
        <div style={{ fontWeight: 700, marginBottom: 20, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Signatures
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
          <div>
            <div style={{ borderBottom: '1px solid black', marginBottom: 4, height: 32 }} />
            <div style={{ fontSize: 10 }}>Cashier: {shift.cashier_name || '________________'}</div>
            <div style={{ fontSize: 10, marginTop: 4 }}>Date: ________________________</div>
          </div>
          <div>
            <div style={{ borderBottom: '1px solid black', marginBottom: 4, height: 32 }} />
            <div style={{ fontSize: 10 }}>Manager: ________________________</div>
            <div style={{ fontSize: 10, marginTop: 4 }}>Date: ________________________</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 20, fontSize: 9, color: '#666', textAlign: 'center', borderTop: '1px solid #ccc', paddingTop: 8 }}>
        Generated by POS System &nbsp;|&nbsp; {report.generated_by_name} &nbsp;|&nbsp; {fmtDate(report.created_at)}
        {report.filed_by_name && ` | Filed by ${report.filed_by_name} on ${fmtDate(report.filed_at)}`}
      </div>
    </div>
  )
}

function PSection({ title, children, style }) {
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 4, overflow: 'hidden', marginBottom: 8, ...style }}>
      <div style={{ background: '#f0f0f0', padding: '5px 10px', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {title}
      </div>
      <div style={{ padding: '6px 10px' }}>{children}</div>
    </div>
  )
}

function PRow({ label, value, bold, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px dotted #eee', fontSize: 10 }}>
      <span style={{ color: '#444' }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 400, color: color || '#111' }}>{value}</span>
    </div>
  )
}

function StatusBadge({ status, printCount }) {
  const styles = {
    GENERATED: { background: '#fef3c7', color: '#92400e' },
    PRINTED:   { background: '#dbeafe', color: '#1e40af' },
    FILED:     { background: '#dcfce7', color: '#15803d' },
  }
  const s = styles[status] || {}
  return (
    <span style={{ ...s, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
      {status}
      {printCount > 0 && status !== 'FILED' && ` (x${printCount})`}
    </span>
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
