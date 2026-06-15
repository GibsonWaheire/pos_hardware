import { useState, useEffect } from 'react'
import { BarChart, LineChart, DonutChart, HorizontalBars } from '../components/Charts'
import {
  getSalesReport, getTopProducts, getPaymentBreakdown,
  getReportByCashier, getReportByCategory, getInventoryReport,
  getPurchasingReport, getReturnsReport,
  getExportCsvUrl, getShiftReports, printShiftReport, fileShiftReport,
  getCurrentShift, getShiftReconciliation, closeShift,
} from '../api'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import {
  printSalesReport, printCashierReport, printInventoryReport, printPurchasingReport, printReturnsReport,
  printShiftReportDoc, printShiftReconciliation,
} from '../utils/print'

function todayStr() { return new Date().toISOString().split('T')[0] }
function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}
function fmtDate(iso) { return iso ? new Date(iso).toLocaleString('en-KE') : '—' }
function fmtTime(iso) { return iso ? new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : '—' }

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

  // Shift History tab
  const [shiftReports, setShiftReports] = useState([])
  const [currentShift, setCurrentShift] = useState(null)
  const [fileModal, setFileModal]       = useState(null)
  const [signedNote, setSignedNote]     = useState('')
  const [filing, setFiling]             = useState(false)
  const [srFilter, setSrFilter]         = useState('all')

  // Reconciliation modal state
  const [recoModal, setRecoModal]   = useState(false)
  const [recoData, setRecoData]     = useState(null)
  const [recoLoading, setRecoLoading] = useState(false)
  const [actualCash, setActualCash]   = useState('')
  const [actualMpesa, setActualMpesa] = useState('')
  const [actualCard, setActualCard]   = useState('')
  const [actualOther, setActualOther] = useState('')
  const [recoNotes, setRecoNotes]   = useState('')
  const [closingShift, setClosingShift] = useState(false)
  const [closedReport, setClosedReport] = useState(null)
  const [overridesOpen, setOverridesOpen] = useState(false)
  const [txnsOpen, setTxnsOpen]     = useState(false)

  useEffect(() => { load() }, [tab])
  useEffect(() => {
    if (!TABS.find(t => t.key === tab)) {
      const first = TABS[0]?.key
      if (first) setTab(first)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
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
        await Promise.all([
          getReportByCashier(params).then(r => setCashierData(r.data)),
          loadShiftReports(),
          loadCurrentShift(),
        ])
      } else if (tab === 'category') {
        const r = await getReportByCategory(params); setCategoryData(r.data)
      } else if (tab === 'inventory') {
        const r = await getInventoryReport(); setInventoryData(r.data)
      } else if (tab === 'purchasing') {
        const r = await getPurchasingReport(params); setPurchasingData(r.data)
      } else if (tab === 'returns') {
        const r = await getReturnsReport(params); setReturnsData(r.data)
      }
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  async function loadShiftReports() {
    const params = srFilter !== 'all' ? { status: srFilter.toUpperCase() } : {}
    const r = await getShiftReports(params)
    setShiftReports(r.data)
  }

  async function loadCurrentShift() {
    try {
      const r = await getCurrentShift()
      setCurrentShift(r.data.shift)
    } catch (e) { /* not critical */ }
  }

  function downloadCsv(type) {
    window.open(getExportCsvUrl({ type, date_from: dateFrom, date_to: dateTo }), '_blank')
  }

  async function handlePrint(report) {
    try {
      const r = await printShiftReport(report.id)
      const updated = r.data
      setShiftReports(prev => prev.map(x => x.id === updated.id ? updated : x))
      if (updated.content?.tenders) {
        printShiftReconciliation(updated)
      } else {
        printShiftReportDoc(updated)
      }
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

  // ── Reconciliation flow ────────────────────────────────────────────────────

  async function openReconciliation() {
    if (!currentShift) return
    setRecoLoading(true)
    setRecoModal(true)
    setActualCash(''); setActualMpesa(''); setActualCard(''); setActualOther('')
    setRecoNotes(''); setOverridesOpen(false); setTxnsOpen(false); setClosedReport(null)
    try {
      const r = await getShiftReconciliation(currentShift.id)
      setRecoData(r.data)
    } catch (e) {
      alert('Error loading reconciliation: ' + e.message)
      setRecoModal(false)
    } finally {
      setRecoLoading(false)
    }
  }

  function computeVariance(actual, expected) {
    const a = parseFloat(actual) || 0
    const e = expected || 0
    return Math.round((a - e) * 100) / 100
  }

  function varianceLabel(v) {
    if (v === 0) return { text: 'Balanced', color: 'var(--success)' }
    if (v < 0)   return { text: `SHORT by ${fmt(Math.abs(v))}`, color: 'var(--danger)' }
    return            { text: `OVER by ${fmt(v)}`, color: 'var(--warning)' }
  }

  async function handleCloseShift() {
    if (!currentShift || !recoData) return
    const confirmed = window.confirm('Close shift and submit reconciliation?')
    if (!confirmed) return
    setClosingShift(true)
    try {
      const res = await closeShift(currentShift.id, {
        reconciliation_submitted: true,
        actual_cash:  parseFloat(actualCash)  || 0,
        actual_mpesa: parseFloat(actualMpesa) || 0,
        actual_card:  parseFloat(actualCard)  || 0,
        actual_other: parseFloat(actualOther) || 0,
        notes: recoNotes,
        closed_without_print: false,
      })
      setCurrentShift(null)
      setClosedReport(res.data)
      await loadShiftReports()
    } catch (e) {
      alert('Error closing shift: ' + e.message)
    } finally {
      setClosingShift(false)
    }
  }

  function handlePrintClosed() {
    if (!closedReport) return
    if (closedReport.content?.tenders) {
      printShiftReconciliation(closedReport)
    } else {
      printShiftReportDoc(closedReport)
    }
  }

  function handleDoneAfterClose() {
    setRecoModal(false)
    setRecoData(null)
    setClosedReport(null)
  }

  const canFile    = user && ['manager', 'admin'].includes(user.role)
  const canPrint   = user && ['manager', 'admin', 'inventory', 'purchasing'].includes(user.role)
  const isManager  = user && ['manager', 'admin'].includes(user.role)
  const isInventory = user?.role === 'inventory'

  const ALL_TABS = [
    { key: 'sales',          label: 'Sales',             roles: ['manager', 'admin'] },
    { key: 'cashier',        label: 'Cashier & Shifts',  roles: ['manager', 'admin'] },
    { key: 'category',       label: 'By Category',       roles: ['manager', 'admin'] },
    { key: 'inventory',      label: 'Inventory',         roles: ['inventory', 'manager', 'admin'] },
    { key: 'purchasing',     label: 'Purchasing',        roles: ['purchasing', 'manager', 'admin'] },
    { key: 'returns',        label: 'Returns',           roles: ['manager', 'admin'] },
  ]
  const TABS = ALL_TABS.filter(t => t.roles.includes(user?.role))
  const activeTab = TABS.find(t => t.key === tab) ? tab : (TABS[0]?.key || 'inventory')

  const filteredReports = shiftReports.filter(r => {
    if (srFilter === 'all') return true
    if (srFilter === 'pending') return r.status !== 'FILED'
    if (srFilter === 'filed') return r.status === 'FILED'
    return true
  })

  // Compute Shift History status for display
  function shiftHistoryStatus(r) {
    const c = r.content || {}
    if (r.status === 'FILED') return { label: 'FILED', color: '#15803d', bg: '#dcfce7' }
    if (r.closed_without_print || c.closed_without_print) return { label: 'CLOSED', color: '#92400e', bg: '#fef3c7' }
    if (r.has_discrepancy || (c.tenders || []).some(t => t.variance !== 0)) return { label: 'DISCREPANCY', color: '#dc2626', bg: '#fee2e2' }
    return { label: r.status, color: '#1e40af', bg: '#dbeafe' }
  }

  // Overdue: open shift past midnight
  const isOverdue = currentShift && (() => {
    const opened = new Date(currentShift.opened_at)
    const now = new Date()
    return opened.toDateString() !== now.toDateString() && now > opened
  })()

  return (
    <>
      <div className="no-print" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div className="page-header">
          <span className="page-title">Reports</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {activeTab !== 'inventory' && activeTab !== 'purchasing' && activeTab !== 'returns' && (
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
                Print Cashier Report
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
              {/* KPI tiles */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
                <StatCard label="Revenue" value={fmt(salesData.total_revenue)} color="var(--accent)" />
                <StatCard label="Transactions" value={salesData.total_transactions} />
                <StatCard label="Avg Sale" value={salesData.total_transactions ? fmt(salesData.total_revenue / salesData.total_transactions) : '—'} />
                {paymentData.map(p => (
                  <StatCard key={p.method} label={p.method} value={fmt(p.total)} sub={`${p.count} txns`} />
                ))}
              </div>

              {/* Row 1: Revenue trend (line) + Payment donut */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
                <div className="card">
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Revenue Trend</div>
                  <LineChart
                    data={salesData.rows}
                    valueKey="revenue"
                    labelKey="date"
                    subKey="transactions"
                    subLabel="sales ·"
                    fmt={fmt}
                    height={200}
                    color="var(--accent)"
                  />
                </div>
                <div className="card">
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Payment Methods</div>
                  <DonutChart
                    data={paymentData}
                    labelKey="method"
                    valueKey="total"
                    fmt={fmt}
                    size={160}
                  />
                </div>
              </div>

              {/* Row 2: Daily transactions bar + Top products horizontal bars */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div className="card">
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Transactions per Day</div>
                  <BarChart
                    data={salesData.rows}
                    valueKey="transactions"
                    labelKey="date"
                    color="#22c55e"
                    height={180}
                  />
                </div>
                <div className="card">
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Top Products</div>
                  <HorizontalBars
                    data={topProducts}
                    valueKey="total_revenue"
                    labelKey="product_name"
                    subKey="total_qty"
                    subLabel="units"
                    fmt={fmt}
                    maxItems={10}
                    color="var(--accent)"
                  />
                </div>
              </div>

              {/* Row 3: Daily breakdown table */}
              <div className="card" style={{ padding: 0 }}>
                <div style={{ padding: '12px 16px 8px', fontWeight: 600, fontSize: 13 }}>Daily Breakdown</div>
                {salesData.rows.length === 0 ? (
                  <div className="empty-state">No data</div>
                ) : (
                  <table className="table">
                    <thead><tr><th>Date</th><th>Sales</th><th>Revenue</th><th>Tax</th></tr></thead>
                    <tbody>
                      {salesData.rows.map(r => (
                        <tr key={r.date}>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.date}</td>
                          <td>{r.transactions}</td>
                          <td style={{ fontWeight: 600 }}>{fmt(r.revenue)}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{fmt(r.tax)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* ── Cashier & Shifts tab ── */}
          {activeTab === 'cashier' && (
            <>
              {/* ── Active shift banner ── */}
              {currentShift && (
                <div style={{
                  background: isOverdue ? '#fef2f2' : '#f0fdf4',
                  border: `1px solid ${isOverdue ? 'var(--danger)' : 'var(--success)'}`,
                  borderRadius: 10, marginBottom: 16, padding: '14px 20px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontWeight: 700, color: isOverdue ? 'var(--danger)' : 'var(--success)', marginBottom: 4 }}>
                      {isOverdue ? 'OVERDUE — ' : ''}Shift Open — {currentShift.cashier_name || 'No cashier'}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      Opened: {fmtDate(currentShift.opened_at)} · Float: {fmt(currentShift.opening_float)}
                    </div>
                  </div>
                  <button className="btn btn-danger" onClick={openReconciliation}>
                    Reconcile &amp; Close Shift
                  </button>
                </div>
              )}

              {/* ── Revenue by cashier ── */}
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                Revenue by Cashier — {dateFrom} to {dateTo}
              </div>
              {cashierData.length === 0 && !loading && (
                <div className="empty-state" style={{ marginBottom: 20 }}>No sales data for this period</div>
              )}
              {cashierData.length > 0 && (
                <>
                  <div className="card" style={{ marginBottom: 16 }}>
                    <HorizontalBars
                      data={cashierData}
                      valueKey="revenue"
                      labelKey="cashier_name"
                      subKey="transactions"
                      subLabel="sales"
                      fmt={fmt}
                      color="var(--accent)"
                    />
                  </div>
                  <div className="card" style={{ padding: 0, marginBottom: 24 }}>
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

              {/* ── Shift history ── */}
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                Shift History
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['all', 'All'], ['pending', 'Pending'], ['filed', 'Filed']].map(([key, label]) => (
                    <button key={key} onClick={async () => { setSrFilter(key); await loadShiftReports() }}
                      className={srFilter === key ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>
                      {label}
                    </button>
                  ))}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => Promise.all([loadShiftReports(), loadCurrentShift()])}>Refresh</button>
              </div>
              {!loading && filteredReports.length === 0 && (
                <div className="empty-state">No shift reports found</div>
              )}
              {!loading && filteredReports.length > 0 && (
                <div className="card" style={{ padding: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Report #</th>
                        <th>Cashier</th>
                        <th>Opened</th>
                        <th>Closed</th>
                        <th>Total Sales</th>
                        <th>Cash Var.</th>
                        <th>M-Pesa Var.</th>
                        <th>Overrides</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReports.map(r => {
                        const c = r.content || {}
                        const summary = c.summary || {}
                        const shift   = c.shift   || {}
                        const tenders = c.tenders || []
                        const cashTender  = tenders.find(t => t.tender === 'cash')
                        const mpesaTender = tenders.find(t => t.tender === 'mpesa')
                        const overrides   = c.overrides || c.item_overrides || {}
                        const st = shiftHistoryStatus(r)
                        return (
                          <tr key={r.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>{r.report_number}</td>
                            <td style={{ fontWeight: 500 }}>{shift.cashier_name || '—'}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(r.period_start)}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(r.period_end)}</td>
                            <td style={{ fontWeight: 600 }}>{fmt(summary.total_revenue)}</td>
                            <td>
                              {cashTender ? (
                                <span style={{ fontWeight: 600, color: cashTender.variance === 0 ? 'var(--success)' : cashTender.variance < 0 ? 'var(--danger)' : 'var(--warning)' }}>
                                  {cashTender.variance >= 0 ? '+' : ''}{fmt(cashTender.variance)}
                                </span>
                              ) : '—'}
                            </td>
                            <td>
                              {mpesaTender ? (
                                <span style={{ fontWeight: 600, color: mpesaTender.variance === 0 ? 'var(--success)' : mpesaTender.variance < 0 ? 'var(--danger)' : 'var(--warning)' }}>
                                  {mpesaTender.variance >= 0 ? '+' : ''}{fmt(mpesaTender.variance)}
                                </span>
                              ) : '—'}
                            </td>
                            <td style={{ color: 'var(--text-muted)' }}>{overrides.count ?? '—'}</td>
                            <td>
                              <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>
                                {st.label}
                              </span>
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

          {/* ── Category tab ── */}
          {activeTab === 'category' && (
            <>
              {categoryData.length === 0 && !loading && <div className="empty-state">No data for this period</div>}
              {categoryData.length > 0 && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div className="card">
                      <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 13 }}>Revenue by Category</div>
                      <HorizontalBars
                        data={categoryData}
                        valueKey="revenue"
                        labelKey="category_name"
                        subKey="total_qty"
                        subLabel="units"
                        fmt={fmt}
                        color="#22c55e"
                      />
                    </div>
                    <div className="card">
                      <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 13 }}>Category Share</div>
                      <DonutChart
                        data={categoryData}
                        labelKey="category_name"
                        valueKey="revenue"
                        fmt={fmt}
                        size={160}
                      />
                    </div>
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
                      <tr><th>#</th><th>Product</th><th>Qty</th>{isManager && <th>Unit Price</th>}{isManager && <th>Stock Value</th>}</tr>
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
                        <th>PO Number</th><th>Supplier</th><th>Items</th>
                        {isManager && <th>Total Cost</th>}
                        <th>Status</th><th>Created By</th><th>Date</th><th>Approved By</th>
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

          {/* ── Shift History tab ── */}
          {loading && activeTab !== 'cashier' && <div className="empty-state">Loading...</div>}
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

      {/* ── Reconciliation modal ── */}
      {recoModal && (
        <div className="modal-overlay no-print" style={{ alignItems: 'flex-start', overflowY: 'auto', padding: '32px 0' }}>
          <div className="modal" style={{ width: 600, maxWidth: '95vw', margin: 'auto' }}>
            <div className="modal-title">Reconcile &amp; Close Shift</div>

            {recoLoading && <div className="empty-state">Loading reconciliation data...</div>}

            {!recoLoading && recoData && (() => {
              const exp = recoData.expected
              const ov  = recoData.overrides
              const txns = recoData.transactions

              const varCash  = computeVariance(actualCash,  exp.cash)
              const varMpesa = computeVariance(actualMpesa, exp.mpesa)
              const varCard  = computeVariance(actualCard,  exp.card)
              const varOther = computeVariance(actualOther, exp.other)

              const hasVariance = varCash !== 0 || varMpesa !== 0 || varCard !== 0 || varOther !== 0
              const allFilled   = (exp.cash  === 0 || actualCash  !== '') &&
                                  (exp.mpesa === 0 || actualMpesa !== '') &&
                                  (exp.card  === 0 || actualCard  !== '')

              return (
                <>
                  {/* Shift info */}
                  <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
                    <strong>{recoData.shift.cashier_name}</strong>
                    {' · '}Opened: {fmtDate(recoData.shift.opened_at)}
                    {' · '}Float: {fmt(recoData.shift.opening_float)}
                  </div>

                  {/* Tender reconciliation table */}
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Tender Reconciliation</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--text-muted)', fontWeight: 500 }}>Tender</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Expected</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Actual (counted)</th>
                        <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--text-muted)', fontWeight: 500 }}>Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { key: 'cash',  label: 'Cash', expected: exp.cash,  actual: actualCash,  setActual: setActualCash,  variance: varCash,  note: 'incl. float' },
                        { key: 'mpesa', label: 'M-Pesa', expected: exp.mpesa, actual: actualMpesa, setActual: setActualMpesa, variance: varMpesa },
                        { key: 'card',  label: 'Card', expected: exp.card,  actual: actualCard,  setActual: setActualCard,  variance: varCard  },
                        ...(exp.other > 0 ? [{ key: 'other', label: 'Other', expected: exp.other, actual: actualOther, setActual: setActualOther, variance: varOther }] : []),
                      ].map(row => {
                        const vl = varianceLabel(row.variance)
                        const filled = row.actual !== ''
                        return (
                          <tr key={row.key} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 0', fontWeight: 500, textTransform: 'capitalize' }}>
                              {row.label}
                              {row.note && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{row.note}</span>}
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>
                              {fmt(row.expected)}
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                placeholder="0.00"
                                value={row.actual}
                                onChange={e => row.setActual(e.target.value)}
                                style={{
                                  width: 110, padding: '5px 8px', textAlign: 'right',
                                  border: '1px solid var(--border)', borderRadius: 6,
                                  background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
                                }}
                              />
                            </td>
                            <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 600, color: filled ? vl.color : 'var(--text-muted)' }}>
                              {filled ? vl.text : '—'}
                            </td>
                          </tr>
                        )
                      })}
                      <tr style={{ borderTop: '2px solid var(--border)' }}>
                        <td style={{ padding: '10px 0', fontWeight: 700 }}>Total Expected</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>{fmt(exp.total)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tbody>
                  </table>

                  {/* M-Pesa daraja note */}
                  {exp.mpesa > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, fontStyle: 'italic' }}>
                      M-Pesa totals are verifiable against Daraja / phone statement.
                    </div>
                  )}

                  {/* Overall status banner */}
                  {allFilled && (
                    <div style={{
                      padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontWeight: 600, fontSize: 13,
                      background: hasVariance ? '#fee2e2' : '#dcfce7',
                      color: hasVariance ? '#dc2626' : '#15803d',
                      border: `1px solid ${hasVariance ? '#fca5a5' : '#86efac'}`,
                    }}>
                      {hasVariance ? 'Discrepancies found — review before closing' : 'Ready to close — all tenders balanced'}
                    </div>
                  )}

                  {/* Overrides summary (collapsible) */}
                  {ov.count > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <button
                        onClick={() => setOverridesOpen(o => !o)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: ov.flagged ? 'var(--danger)' : 'var(--text)', padding: 0, display: 'flex', alignItems: 'center', gap: 8 }}
                      >
                        {overridesOpen ? '▼' : '▶'} Override Activity ({ov.count} overrides · {fmt(ov.total_value_impact)} impact)
                        {ov.flagged && <span style={{ fontSize: 11, background: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: 8 }}>FLAGGED {ov.pct_of_sales}% of sales</span>}
                      </button>
                      {overridesOpen && (
                        <div style={{ marginTop: 10 }}>
                          {ov.flagged && (
                            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#dc2626' }}>
                              Override activity is {ov.pct_of_sales}% of today's sales — review recommended
                            </div>
                          )}
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '4px 0', color: 'var(--text-muted)', fontWeight: 500 }}>Time</th>
                                <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Cashier</th>
                                <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Action</th>
                                <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Item</th>
                                <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Old→New</th>
                                <th style={{ textAlign: 'right', padding: '4px 0', color: 'var(--text-muted)', fontWeight: 500 }}>Impact</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ov.details.map((d, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{fmtTime(d.time)}</td>
                                  <td style={{ padding: '5px 8px' }}>{d.cashier_name}</td>
                                  <td style={{ padding: '5px 8px', color: d.action === 'REMOVE_ITEM' ? 'var(--danger)' : 'var(--warning)' }}>{d.action}</td>
                                  <td style={{ padding: '5px 8px' }}>{d.item_name}</td>
                                  <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>{d.original_qty}→{d.new_qty ?? 0}</td>
                                  <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 600, color: (d.value_impact || 0) < 0 ? 'var(--danger)' : 'var(--text)' }}>
                                    {(d.value_impact || 0) >= 0 ? '+' : ''}{fmt(d.value_impact || 0)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Transaction breakdown (collapsible) */}
                  <div style={{ marginBottom: 16 }}>
                    <button
                      onClick={() => setTxnsOpen(o => !o)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: 'var(--text)', padding: 0, display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      {txnsOpen ? '▼' : '▶'} Transaction Breakdown ({txns.total_count} sales)
                    </button>
                    {txnsOpen && (
                      <div style={{ marginTop: 10, maxHeight: 240, overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              <th style={{ textAlign: 'left', padding: '4px 0', color: 'var(--text-muted)', fontWeight: 500 }}>Time</th>
                              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Receipt</th>
                              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Items</th>
                              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Tender</th>
                              <th style={{ textAlign: 'right', padding: '4px 0', color: 'var(--text-muted)', fontWeight: 500 }}>Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {txns.list.map((t, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid var(--border)', opacity: t.status !== 'completed' ? 0.5 : 1 }}>
                                <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{fmtTime(t.time)}</td>
                                <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 11 }}>{t.receipt_number}</td>
                                <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>{t.items_count}</td>
                                <td style={{ padding: '5px 8px', textTransform: 'capitalize' }}>{t.tender}</td>
                                <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 600 }}>{fmt(t.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div style={{ padding: '8px 0', borderTop: '1px solid var(--border)', marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                          {Object.entries(txns.by_tender).map(([t, d]) => (
                            <span key={t} style={{ marginRight: 16 }}>{t}: {d.count} · {fmt(d.total)}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="form-group" style={{ marginBottom: 20 }}>
                    <label className="label">Notes (optional)</label>
                    <textarea className="input" rows={2} value={recoNotes} onChange={e => setRecoNotes(e.target.value)} style={{ resize: 'vertical' }} />
                  </div>

                  {/* Action buttons */}
                  {closedReport ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{
                        background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8,
                        padding: '12px 16px', color: '#15803d', fontWeight: 600, fontSize: 14,
                      }}>
                        Shift closed — Report {closedReport.report_number} generated.
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Print in portrait, A4, no margins
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost" onClick={handleDoneAfterClose}>Done</button>
                        <button className="btn btn-primary" onClick={handlePrintClosed}>
                          Print Report
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost" onClick={() => { setRecoModal(false); setRecoData(null) }}>
                        Cancel
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={handleCloseShift}
                        disabled={!allFilled || closingShift}
                      >
                        {closingShift ? 'Closing...' : 'Close Shift'}
                      </button>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}
    </>
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
