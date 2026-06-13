import { useState, useEffect } from 'react'
import { getDashboard, getManagerDashboard, getProductsBelowReorder } from '../api'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function fmt(n) {
  if (n == null) return '—'
  return `KES ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function BarChart({ data, valueKey, labelKey, color = 'var(--accent)', height = 120 }) {
  if (!data?.length) return null
  const max = Math.max(...data.map(d => d[valueKey]), 0.01)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height, padding: '4px 0' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, height: '100%', justifyContent: 'flex-end' }}>
          <div
            title={`${d[labelKey]}: ${fmt(d[valueKey])}`}
            style={{
              width: '100%', background: color,
              height: `${Math.max((d[valueKey] / max) * 100, d[valueKey] > 0 ? 4 : 0)}%`,
              borderRadius: '3px 3px 0 0', minHeight: d[valueKey] > 0 ? 3 : 0,
              transition: 'height 0.3s ease',
            }}
          />
        </div>
      ))}
    </div>
  )
}

function fmtAgo(iso) {
  if (!iso) return 'Never'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)  return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function ApprovalSection({ title, items, color = 'var(--warning)', renderRow }) {
  const [open, setOpen] = useState(true)
  if (items.length === 0) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: open ? 6 : 0 }}
      >
        <span style={{ background: color, color: '#fff', borderRadius: 10, fontSize: 11, padding: '1px 8px', fontWeight: 700 }}>
          {items.length}
        </span>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{open ? 'hide' : 'show'}</span>
      </div>
      {open && (
        <table className="table" style={{ fontSize: 12 }}>
          <tbody>{items.map(renderRow)}</tbody>
        </table>
      )}
    </div>
  )
}

function ReorderWidget({ items, nav }) {
  const [open, setOpen] = useState(true)
  if (!items || items.length === 0) return (
    <div style={{ fontSize: 13, color: 'var(--success)', fontWeight: 500 }}>No products need reordering</div>
  )

  // Group by supplier
  const groups = {}
  items.forEach(p => {
    const key = p.supplier_id || '__none__'
    if (!groups[key]) groups[key] = { supplier_id: p.supplier_id || null, supplier_name: p.supplier_name || 'No Supplier', items: [] }
    groups[key].items.push(p)
  })

  function createDraftPO(group) {
    nav('/purchase-orders', {
      state: {
        draft: {
          supplier_id: group.supplier_id,
          supplier_name: group.supplier_name,
          items: group.items.map(p => ({
            product_id: String(p.id),
            product_name: p.name,
            qty_ordered: p.reorder_qty > 0 ? p.reorder_qty : 1,
            unit_cost: 0,
          })),
        },
      },
    })
  }

  return (
    <div>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: open ? 10 : 0 }}>
        <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: 10, fontSize: 11, padding: '1px 8px', fontWeight: 700 }}>{items.length}</span>
        <span style={{ fontWeight: 600, fontSize: 13 }}>products need reordering</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{open ? 'hide' : 'show'}</span>
      </div>
      {open && Object.values(groups).map(group => (
        <div key={group.supplier_id || '__none__'} style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface2)' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{group.supplier_name}</span>
            <button className="btn btn-primary btn-sm" onClick={() => createDraftPO(group)}>Create Draft PO</button>
          </div>
          <table className="table" style={{ fontSize: 12, margin: 0 }}>
            <thead>
              <tr><th>Product</th><th>Stock</th><th>Reorder At</th><th>Suggest Qty</th></tr>
            </thead>
            <tbody>
              {group.items.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td style={{ color: p.stock_qty <= 0 ? 'var(--danger)' : 'var(--warning)', fontWeight: 600 }}>{p.stock_qty}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{p.reorder_point}</td>
                  <td style={{ fontWeight: 600 }}>{p.reorder_qty > 0 ? p.reorder_qty : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function ManagerPanel({ mgr, nav, reorderItems }) {
  const pa = mgr.pending_approvals || {}
  const alerts = mgr.alerts || {}
  const shift = mgr.shift
  const sync = mgr.last_sync

  const totalPending = pa.total || 0
  const hasAlerts = alerts.unprinted_shift_reports > 0 || alerts.over_limit_accounts > 0

  return (
    <div style={{ marginTop: 20 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Manager Attention</div>
        {(totalPending > 0 || hasAlerts) && (
          <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: 12, fontSize: 11, padding: '2px 9px', fontWeight: 700 }}>
            {totalPending + (hasAlerts ? 1 : 0)} items
          </span>
        )}
        {totalPending === 0 && !hasAlerts && (
          <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>All clear</span>
        )}
      </div>

      {/* Reorder Alerts */}
      {reorderItems && reorderItems.length > 0 && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'var(--danger)' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
            Reorder Alerts
            <span style={{ marginLeft: 8, background: 'var(--danger)', color: '#fff', borderRadius: 10, fontSize: 11, padding: '1px 7px', fontWeight: 700 }}>
              {reorderItems.length}
            </span>
          </div>
          <ReorderWidget items={reorderItems} nav={nav} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>

        {/* 22A — Pending Approvals */}
        <div className="card" style={{ gridColumn: '1 / 3' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
            Pending Approvals
            {totalPending > 0 && (
              <span style={{ marginLeft: 8, background: 'var(--danger)', color: '#fff', borderRadius: 10, fontSize: 11, padding: '1px 7px', fontWeight: 700 }}>
                {totalPending}
              </span>
            )}
          </div>

          {totalPending === 0 ? (
            <div style={{ color: 'var(--success)', fontSize: 13, fontWeight: 500 }}>No pending approvals</div>
          ) : (
            <>
              <ApprovalSection
                title="Returns awaiting approval"
                items={pa.returns || []}
                color="var(--danger)"
                renderRow={r => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.ref}</td>
                    <td>{fmt(r.amount)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{r.by}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{fmtAgo(r.when)}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => nav('/returns')}>Review</button></td>
                  </tr>
                )}
              />
              <ApprovalSection
                title="Purchase orders awaiting approval"
                items={pa.purchase_orders || []}
                color="var(--warning)"
                renderRow={p => (
                  <tr key={p.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{p.ref}</td>
                    <td>{fmt(p.amount)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{p.supplier}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{p.by}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => nav('/purchase-orders')}>Review</button></td>
                  </tr>
                )}
              />
              <ApprovalSection
                title="GRNs awaiting sign-off"
                items={pa.grns || []}
                color="var(--accent)"
                renderRow={g => (
                  <tr key={g.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{g.ref}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{g.supplier}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>PO: {g.po}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{fmtAgo(g.when)}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => nav('/inventory')}>Review</button></td>
                  </tr>
                )}
              />
              <ApprovalSection
                title="Damage reports to review"
                items={pa.damage_reports || []}
                color="var(--text-muted)"
                renderRow={d => (
                  <tr key={d.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{d.ref}</td>
                    <td>{d.product} × {d.qty}</td>
                    <td>{fmt(d.value)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{d.by}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{fmtAgo(d.when)}</td>
                  </tr>
                )}
              />
            </>
          )}
        </div>

        {/* 22B + 22C — Alerts + Shift status stacked */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* 22C — Current shift */}
          <div className="card" style={{ borderColor: shift ? 'var(--success)' : 'var(--surface2)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Current Shift</div>
            {shift ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{shift.cashier_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Opened {fmtAgo(shift.opened_at)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Float: {fmt(shift.opening_float)}
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No shift currently open</div>
            )}
          </div>

          {/* 22B — Operational Alerts */}
          <div className="card" style={{ borderColor: hasAlerts ? 'var(--warning)' : undefined }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Operational Alerts</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

              {alerts.unprinted_shift_reports > 0 && (
                <AlertRow
                  label="Unprinted shift reports"
                  value={alerts.unprinted_shift_reports}
                  color="var(--warning)"
                  onClick={() => nav('/reports')}
                />
              )}
              {alerts.unfiled_shift_reports > 0 && (
                <AlertRow
                  label="Unfiled shift reports"
                  value={alerts.unfiled_shift_reports}
                  color="var(--warning)"
                  onClick={() => nav('/reports')}
                />
              )}
              {alerts.over_limit_accounts > 0 && (
                <div>
                  <AlertRow
                    label="Accounts over credit limit"
                    value={alerts.over_limit_accounts}
                    color="var(--danger)"
                    onClick={() => nav('/accounts')}
                  />
                  {(alerts.over_limit_details || []).map(a => (
                    <div key={a.id} style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2, paddingLeft: 8 }}>
                      {a.name}: {fmt(-a.balance)} / limit {fmt(a.credit_limit)}
                    </div>
                  ))}
                </div>
              )}
              {!hasAlerts && (
                <div style={{ fontSize: 13, color: 'var(--success)', fontWeight: 500 }}>No operational alerts</div>
              )}

              <div style={{ borderTop: '1px solid var(--surface2)', paddingTop: 8, marginTop: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Last cloud sync:{' '}
                  <span style={{ color: sync?.status === 'success' ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                    {sync ? fmtAgo(sync.created_at) : 'Never'}
                  </span>
                  {sync?.status === 'error' && (
                    <div style={{ color: 'var(--danger)', fontSize: 10, marginTop: 2 }}>{sync.error_message}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

function AlertRow({ label, value, color, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
               cursor: onClick ? 'pointer' : 'default', padding: '4px 0' }}
    >
      <span style={{ fontSize: 13 }}>{label}</span>
      <span style={{ background: color, color: '#fff', borderRadius: 10, fontSize: 11,
                     padding: '1px 8px', fontWeight: 700 }}>{value}</span>
    </div>
  )
}

function KpiCard({ label, value, sub, color, icon, onClick, alert }) {
  return (
    <div className="card" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', position: 'relative' }}>
      {alert && (
        <div style={{
          position: 'absolute', top: 10, right: 10, background: 'var(--danger)',
          color: '#fff', borderRadius: 12, fontSize: 11, padding: '1px 7px', fontWeight: 700,
        }}>{alert}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--text)', lineHeight: 1 }}>{value}</div>
          {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
        </div>
        {icon && <span style={{ fontSize: 24, opacity: 0.5 }}>{icon}</span>}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [mgr, setMgr] = useState(null)
  const [reorderItems, setReorderItems] = useState([])
  const [loading, setLoading] = useState(true)
  const nav = useNavigate()
  const { user } = useAuth()
  const isManager = user && ['manager', 'admin'].includes(user.role)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const calls = [getDashboard()]
      if (isManager) calls.push(getManagerDashboard(), getProductsBelowReorder())
      const [r, mr, rr] = await Promise.all(calls)
      setData(r.data)
      if (mr) setMgr(mr.data)
      if (rr) setReorderItems(rr.data || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  if (loading) return <div className="empty-state" style={{ paddingTop: 80 }}>Loading dashboard...</div>
  if (!data) return <div className="empty-state">No data</div>

  const { today, week, month, hourly, daily_trend, top_items, payment_split, inventory, purchase_orders, accounts } = data

  // Hourly chart — show hours 7am–7pm
  const hourlySlice = hourly.slice(7, 20)

  // Payment split total
  const payTotal = payment_split.reduce((s, p) => s + p.total, 0)

  // Daily trend labels
  const trendLabeled = daily_trend.map((d, i) => ({
    ...d,
    label: i % 2 === 0 ? new Date(d.date + 'T12:00:00').toLocaleDateString('en-KE', { month: 'numeric', day: 'numeric' }) : '',
  }))

  const methodColors = {
    cash: 'var(--success)',
    card: 'var(--accent)',
    mpesa: '#4caf50',
    account: '#f59e0b',
    split: '#a78bfa',
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Dashboard</span>
        <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>

        {/* ── Revenue KPIs ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <KpiCard
            label="Today's Revenue"
            value={fmt(today.revenue)}
            sub={`${today.transactions} transactions · ${today.new_customers} new customers`}
            color="var(--accent)"
            icon="💰"
          />
          <KpiCard
            label="This Week"
            value={fmt(week.revenue)}
            sub={`${week.transactions} sales`}
            icon="📅"
          />
          <KpiCard
            label="This Month"
            value={fmt(month.revenue)}
            sub={`${month.transactions} sales · avg ${fmt(month.avg_sale)}`}
            icon="📆"
          />
          <KpiCard
            label="Account Credit Outstanding"
            value={fmt(accounts.total_credit)}
            sub={`${accounts.count} accounts · ${fmt(accounts.total_debt)} owed`}
            color={accounts.total_debt > 0 ? 'var(--warning)' : 'var(--success)'}
            icon="🏦"
            onClick={() => nav('/accounts')}
          />
        </div>

        {/* ── Operations alerts row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          <KpiCard
            label="Low Stock Items"
            value={inventory.low_stock}
            sub={`${inventory.out_of_stock} out of stock`}
            color={inventory.low_stock > 0 || inventory.out_of_stock > 0 ? 'var(--warning)' : 'var(--success)'}
            icon="📦"
            alert={inventory.out_of_stock > 0 ? inventory.out_of_stock : null}
            onClick={() => nav('/inventory')}
          />
          <KpiCard
            label="Pending Purchase Orders"
            value={purchase_orders.pending}
            sub="draft or awaiting delivery"
            color={purchase_orders.pending > 0 ? 'var(--accent)' : 'var(--text-muted)'}
            icon="📋"
            onClick={() => nav('/purchase-orders')}
          />
          <KpiCard
            label="Accounts in Debt"
            value={accounts.accounts_in_debt}
            sub={accounts.accounts_in_debt > 0 ? `Total owed: ${fmt(accounts.total_debt)}` : 'All accounts clear'}
            color={accounts.accounts_in_debt > 0 ? 'var(--danger)' : 'var(--success)'}
            icon="⚠️"
            onClick={() => nav('/accounts')}
          />
        </div>

        {/* ── Charts row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20 }}>

          {/* 14-day trend */}
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>14-Day Revenue Trend</div>
            <BarChart data={trendLabeled} valueKey="revenue" labelKey="date" height={130} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              {trendLabeled.map((d, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-muted)' }}>{d.label}</div>
              ))}
            </div>
          </div>

          {/* Payment methods today */}
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Payment Methods Today</div>
            {payment_split.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No sales yet today</div>
            ) : (
              payment_split.map((p, i) => {
                const pct = payTotal > 0 ? (p.total / payTotal) * 100 : 0
                const color = methodColors[p.method] || 'var(--accent)'
                return (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{p.method === 'mpesa' ? 'M-Pesa' : p.method}</span>
                      <span>{fmt(p.total)} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({p.count})</span></span>
                    </div>
                    <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── Bottom row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Hourly today */}
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Today — Hourly Sales (7am–7pm)</div>
            <BarChart data={hourlySlice} valueKey="revenue" labelKey="hour" height={100} color="var(--success)" />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              {hourlySlice.map((d, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-muted)' }}>
                  {d.hour % 3 === 0 ? (d.hour === 12 ? '12p' : d.hour < 12 ? `${d.hour}a` : `${d.hour - 12}p`) : ''}
                </div>
              ))}
            </div>
          </div>

          {/* Top items */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ fontWeight: 600, padding: '14px 16px 10px', fontSize: 14 }}>Top Products (30 days)</div>
            {top_items.length === 0 ? (
              <div className="empty-state">No sales data yet</div>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>#</th><th>Product</th><th>Qty</th><th>Revenue</th></tr>
                </thead>
                <tbody>
                  {top_items.map((item, i) => {
                    const maxRev = top_items[0].revenue
                    return (
                      <tr key={i}>
                        <td style={{ color: 'var(--text-muted)', fontWeight: 700, width: 28 }}>{i + 1}</td>
                        <td>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{item.name}</div>
                          <div style={{ height: 3, background: 'var(--surface2)', borderRadius: 2, marginTop: 3, overflow: 'hidden', width: '90%' }}>
                            <div style={{ width: `${(item.revenue / maxRev) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{item.qty.toLocaleString()}</td>
                        <td style={{ fontWeight: 600, color: 'var(--accent)', whiteSpace: 'nowrap', fontSize: 13 }}>{fmt(item.revenue)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Manager-only sections ── */}
        {isManager && mgr && <ManagerPanel mgr={mgr} nav={nav} reorderItems={reorderItems} />}

      </div>
    </div>
  )
}
