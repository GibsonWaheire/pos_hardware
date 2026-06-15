import { useState, useEffect, useRef } from 'react'
import { getDashboard, getManagerDashboard, getProductsBelowReorder } from '../api'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'

function fmtAgo(iso) {
  if (!iso) return 'Never'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function shiftDuration(openedAt) {
  if (!openedAt) return ''
  const mins = Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60), m = mins % 60
  return `${h}h ${m}m`
}

const METHOD_COLORS = {
  cash: '#16a34a', mpesa: '#059669', card: '#2563eb',
  account: '#d97706', split: '#7c3aed',
}
const METHOD_LABEL = { cash: 'Cash', mpesa: 'M-Pesa', card: 'Card', account: 'Account', split: 'Split' }

function TenderBar({ method, total, count, pct }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
        <span style={{ fontWeight: 500 }}>{METHOD_LABEL[method] || method}</span>
        <span style={{ color: 'var(--text-muted)' }}>{total} <span style={{ fontSize: 11 }}>({count})</span></span>
      </div>
      <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: METHOD_COLORS[method] || 'var(--accent)', borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

function MiniBar({ data, valueKey, labelKey, color = 'var(--accent)', height = 90 }) {
  if (!data?.length) return null
  const max = Math.max(...data.map(d => d[valueKey]), 0.01)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height, padding: '2px 0' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
          <div
            title={`${d[labelKey]}: ${d[valueKey]}`}
            style={{
              width: '100%', background: color, borderRadius: '2px 2px 0 0',
              height: `${Math.max((d[valueKey] / max) * 100, d[valueKey] > 0 ? 3 : 0)}%`,
              minHeight: d[valueKey] > 0 ? 2 : 0, transition: 'height 0.4s ease',
            }}
          />
        </div>
      ))}
    </div>
  )
}

function Kpi({ label, value, sub, color, icon, onClick, badge }) {
  return (
    <div className="card" onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', position: 'relative', padding: '14px 16px' }}>
      {badge != null && badge > 0 && (
        <div style={{
          position: 'absolute', top: 10, right: 10, background: 'var(--danger)',
          color: '#fff', borderRadius: 12, fontSize: 10, padding: '1px 7px', fontWeight: 700,
        }}>{badge}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text)', lineHeight: 1 }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
        </div>
        {icon && <span style={{ fontSize: 20, opacity: 0.4, marginLeft: 8 }}>{icon}</span>}
      </div>
    </div>
  )
}

function ShiftCard({ shift, shiftStats, nav }) {
  const { fmt } = useCurrency()
  const isOpen = shift?.status === 'open'
  const isPending = shift?.status === 'pending_close'

  if (!shift) {
    return (
      <div className="card" style={{ border: '2px solid var(--danger)', padding: '16px 20px' }}>
        <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>No Shift Open</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          No cashier shift is currently active. Sales cannot be processed.
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => nav('/shifts')}>Open Shift →</button>
      </div>
    )
  }

  const statusColor = isPending ? 'var(--warning)' : 'var(--success)'
  const statusLabel = isPending ? 'PENDING CLOSE' : 'OPEN'

  return (
    <div className="card" style={{ border: `2px solid ${statusColor}`, padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              background: statusColor, color: '#fff',
              fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
              padding: '2px 8px', borderRadius: 10,
            }}>{statusLabel}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{shiftDuration(shift.opened_at)}</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{shift.cashier_name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Float: {fmt(shift.opening_float)} · opened {fmtAgo(shift.opened_at)}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => nav('/shifts')}>Shifts →</button>
      </div>

      {shiftStats && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
          background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', marginTop: 4,
        }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Sales</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: statusColor }}>{shiftStats.transactions}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Revenue</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: statusColor }}>{fmt(shiftStats.revenue)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function AlertStrip({ mgr, reorderCount, nav }) {
  const items = []
  const pa = mgr?.pending_approvals || {}
  const al = mgr?.alerts || {}

  if ((pa.total || 0) > 0) items.push({ label: `${pa.total} pending approval${pa.total !== 1 ? 's' : ''}`, color: '#dc2626', onClick: () => nav('/reports') })
  if (al.unfiled_shift_reports > 0) items.push({ label: `${al.unfiled_shift_reports} unfiled shift report${al.unfiled_shift_reports !== 1 ? 's' : ''}`, color: '#d97706', onClick: () => nav('/reports') })
  if (al.unprinted_shift_reports > 0) items.push({ label: `${al.unprinted_shift_reports} unprinted report${al.unprinted_shift_reports !== 1 ? 's' : ''}`, color: '#d97706', onClick: () => nav('/reports') })
  if (al.over_limit_accounts > 0) items.push({ label: `${al.over_limit_accounts} over-limit account${al.over_limit_accounts !== 1 ? 's' : ''}`, color: '#dc2626', onClick: () => nav('/accounts') })
  if (reorderCount > 0) items.push({ label: `${reorderCount} product${reorderCount !== 1 ? 's' : ''} need reordering`, color: '#d97706', onClick: () => nav('/inventory') })

  if (items.length === 0) return null

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16,
      background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '10px 14px',
    }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginRight: 4 }}>Attention:</span>
      {items.map((it, i) => (
        <span key={i} onClick={it.onClick} style={{
          fontSize: 12, color: it.color, fontWeight: 600, cursor: 'pointer',
          textDecoration: 'underline', textDecorationStyle: 'dotted',
        }}>{it.label}</span>
      ))}
    </div>
  )
}

function ReorderWidget({ items, nav }) {
  const [open, setOpen] = useState(false)
  if (!items?.length) return null
  const groups = {}
  items.forEach(p => {
    const k = p.supplier_id || '__none__'
    if (!groups[k]) groups[k] = { supplier_id: p.supplier_id, supplier_name: p.supplier_name || 'No Supplier', items: [] }
    groups[k].items.push(p)
  })
  function createDraftPO(g) {
    nav('/purchase-orders', { state: { draft: {
      supplier_id: g.supplier_id, supplier_name: g.supplier_name,
      items: g.items.map(p => ({ product_id: String(p.id), product_name: p.name, qty_ordered: p.reorder_qty > 0 ? p.reorder_qty : 1, unit_cost: 0 })),
    }}})
  }
  return (
    <div className="card" style={{ marginBottom: 14, border: '1px solid var(--danger)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: open ? 12 : 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: 10, fontSize: 11, padding: '1px 7px', fontWeight: 700 }}>{items.length}</span>
          Products need reordering
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(o => !o)}>{open ? 'Hide' : 'Show'}</button>
      </div>
      {open && Object.values(groups).map(g => (
        <div key={g.supplier_id || '__none__'} style={{ marginBottom: 10, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', background: 'var(--surface2)' }}>
            <span style={{ fontWeight: 600, fontSize: 12 }}>{g.supplier_name}</span>
            <button className="btn btn-primary btn-sm" onClick={() => createDraftPO(g)}>Draft PO</button>
          </div>
          <table className="table" style={{ fontSize: 12, margin: 0 }}>
            <thead><tr><th>Product</th><th>Stock</th><th>Reorder at</th><th>Suggest</th></tr></thead>
            <tbody>
              {g.items.map(p => (
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

function PendingSection({ mgr, nav }) {
  const pa = mgr?.pending_approvals || {}
  if (!pa.total) return (
    <div style={{ fontSize: 13, color: 'var(--success)', fontWeight: 500 }}>No pending approvals</div>
  )

  function ApprovalGroup({ title, items, color, renderRow }) {
    const [open, setOpen] = useState(true)
    if (!items?.length) return null
    return (
      <div style={{ marginBottom: 10 }}>
        <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: open ? 6 : 0 }}>
          <span style={{ background: color, color: '#fff', borderRadius: 10, fontSize: 11, padding: '1px 8px', fontWeight: 700 }}>{items.length}</span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{open ? '▲' : '▶'}</span>
        </div>
        {open && <table className="table" style={{ fontSize: 12 }}><tbody>{items.map(renderRow)}</tbody></table>}
      </div>
    )
  }

  return (
    <>
      <ApprovalGroup title="Returns" items={pa.returns} color="var(--danger)"
        renderRow={r => <tr key={r.id}><td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.ref}</td><td>{r.amount != null ? `KES ${Number(r.amount).toLocaleString('en-KE')}` : '—'}</td><td style={{ color: 'var(--text-muted)' }}>{r.by}</td><td><button className="btn btn-ghost btn-sm" onClick={() => nav('/returns')}>Review</button></td></tr>}
      />
      <ApprovalGroup title="Purchase Orders" items={pa.purchase_orders} color="var(--warning)"
        renderRow={p => <tr key={p.id}><td style={{ fontFamily: 'monospace', fontSize: 11 }}>{p.ref}</td><td>{p.supplier}</td><td style={{ color: 'var(--text-muted)' }}>{fmtAgo(p.when)}</td><td><button className="btn btn-ghost btn-sm" onClick={() => nav('/purchase-orders')}>Review</button></td></tr>}
      />
      <ApprovalGroup title="GRNs" items={pa.grns} color="var(--accent)"
        renderRow={g => <tr key={g.id}><td style={{ fontFamily: 'monospace', fontSize: 11 }}>{g.ref}</td><td>{g.supplier}</td><td style={{ color: 'var(--text-muted)' }}>{fmtAgo(g.when)}</td><td><button className="btn btn-ghost btn-sm" onClick={() => nav('/inventory')}>Review</button></td></tr>}
      />
      <ApprovalGroup title="Damage Reports" items={pa.damage_reports} color="var(--text-muted)"
        renderRow={d => <tr key={d.id}><td style={{ fontFamily: 'monospace', fontSize: 11 }}>{d.ref}</td><td>{d.product} ×{d.qty}</td><td style={{ color: 'var(--text-muted)' }}>{d.by}</td><td><button className="btn btn-ghost btn-sm" onClick={() => nav('/inventory')}>Review</button></td></tr>}
      />
    </>
  )
}

export default function Dashboard() {
  const [data, setData]         = useState(null)
  const [mgr, setMgr]           = useState(null)
  const [reorderItems, setReorderItems] = useState([])
  const [loading, setLoading]   = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [tick, setTick]         = useState(0)
  const nav   = useNavigate()
  const { user } = useAuth()
  const { fmt } = useCurrency()
  const isManager = user && ['manager', 'admin'].includes(user.role)
  const timerRef = useRef(null)

  useEffect(() => {
    load()
    // Auto-refresh every 60s
    timerRef.current = setInterval(() => load(), 60000)
    // Tick every 30s to update "X ago" labels
    const tick = setInterval(() => setTick(t => t + 1), 30000)
    return () => { clearInterval(timerRef.current); clearInterval(tick) }
  }, []) // eslint-disable-line

  async function load() {
    setLoading(true)
    try {
      const calls = [getDashboard()]
      if (isManager) calls.push(getManagerDashboard(), getProductsBelowReorder())
      const [r, mr, rr] = await Promise.all(calls)
      setData(r.data)
      if (mr) setMgr(mr.data)
      if (rr) setReorderItems(rr.data || [])
      setLastRefresh(new Date())
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  const todayLabel = new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  if (loading && !data) return <div className="empty-state" style={{ paddingTop: 80 }}>Loading dashboard…</div>
  if (!data) return <div className="empty-state">No data</div>

  const { today, week, month, hourly, daily_trend, top_items, payment_split, inventory, purchase_orders, accounts } = data
  const payTotal = payment_split.reduce((s, p) => s + p.total, 0)
  const hourlySlice = hourly.slice(7, 20)
  const trendLabeled = daily_trend.map((d, i) => ({
    ...d,
    label: i % 2 === 0 ? new Date(d.date + 'T12:00:00').toLocaleDateString('en-KE', { month: 'numeric', day: 'numeric' }) : '',
  }))

  const totalPending = mgr?.pending_approvals?.total || 0
  const hasAlerts = (mgr?.alerts?.unfiled_shift_reports > 0) || (mgr?.alerts?.over_limit_accounts > 0) || reorderItems.length > 0

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <span className="page-title">Dashboard</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 12 }}>{todayLabel}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastRefresh && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Updated {fmtAgo(lastRefresh)}</span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>

        {/* ── Alert strip ── */}
        {isManager && mgr && (totalPending > 0 || hasAlerts) && (
          <AlertStrip mgr={mgr} reorderCount={reorderItems.length} nav={nav} />
        )}

        {/* ── ROW 1: Today hero + Shift status ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 14, marginBottom: 16 }}>

          {/* Today hero */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Today's Revenue</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 42, fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>{fmt(today.revenue)}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{today.transactions}</span> sales
                {today.transactions > 0 && <span> · avg <strong>{fmt(today.revenue / today.transactions)}</strong></span>}
                {today.new_customers > 0 && <span> · <strong>{today.new_customers}</strong> new customers</span>}
              </div>
            </div>

            {/* Tender breakdown */}
            {payment_split.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(payment_split.length, 3)}, 1fr)`, gap: 10 }}>
                {payment_split.map(p => (
                  <div key={p.method} style={{
                    background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px',
                    borderLeft: `3px solid ${METHOD_COLORS[p.method] || 'var(--accent)'}`,
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                      {METHOD_LABEL[p.method] || p.method}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: METHOD_COLORS[p.method] || 'var(--accent)' }}>
                      {fmt(p.total)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.count} sale{p.count !== 1 ? 's' : ''} · {payTotal > 0 ? Math.round(p.total / payTotal * 100) : 0}%</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No sales recorded yet today</div>
            )}
          </div>

          {/* Shift status */}
          {isManager && <ShiftCard shift={mgr?.shift} shiftStats={mgr?.shift_stats} nav={nav} />}

        </div>

        {/* ── ROW 2: KPI strip ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
          <Kpi label="This Week" value={fmt(week.revenue)} sub={`${week.transactions} sales`} icon="📅" />
          <Kpi label="This Month" value={fmt(month.revenue)} sub={`${month.transactions} sales · avg ${fmt(month.avg_sale)}`} icon="📆" />
          <Kpi label="Low Stock" value={inventory.low_stock}
            sub={inventory.out_of_stock > 0 ? `${inventory.out_of_stock} out of stock` : 'All in stock'}
            color={inventory.low_stock > 0 ? 'var(--warning)' : 'var(--success)'}
            badge={inventory.out_of_stock} icon="📦" onClick={() => nav('/inventory')} />
          <Kpi label="Pending Orders" value={purchase_orders.pending}
            sub="draft / awaiting delivery"
            color={purchase_orders.pending > 0 ? 'var(--accent)' : 'var(--text-muted)'}
            icon="📋" onClick={() => nav('/purchase-orders')} />
          <Kpi label="Accounts in Debt" value={accounts.accounts_in_debt}
            sub={accounts.accounts_in_debt > 0 ? `Owed: ${fmt(accounts.total_debt)}` : 'All clear'}
            color={accounts.accounts_in_debt > 0 ? 'var(--danger)' : 'var(--success)'}
            badge={accounts.accounts_in_debt} icon="⚠️" onClick={() => nav('/accounts')} />
        </div>

        {/* ── ROW 3: Charts ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 16 }}>

          {/* 14-day trend */}
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>14-Day Revenue</div>
            <MiniBar data={trendLabeled} valueKey="revenue" labelKey="date" height={100} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
              {trendLabeled.map((d, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-muted)' }}>{d.label}</div>
              ))}
            </div>
          </div>

          {/* Hourly today */}
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>Today by Hour</div>
            <MiniBar data={hourlySlice} valueKey="revenue" labelKey="hour" height={100} color="var(--success)" />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
              {hourlySlice.map((d, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-muted)' }}>
                  {d.hour % 3 === 0 ? (d.hour === 12 ? '12p' : d.hour < 12 ? `${d.hour}a` : `${d.hour - 12}p`) : ''}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── ROW 4: Top products + Payment split ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>

          {/* Top products */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ fontWeight: 600, padding: '14px 16px 10px', fontSize: 13 }}>Top Products — 30 days</div>
            {top_items.length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}>No sales data yet</div>
            ) : (
              <table className="table">
                <thead><tr><th>#</th><th>Product</th><th>Qty</th><th>Revenue</th></tr></thead>
                <tbody>
                  {top_items.map((item, i) => {
                    const maxRev = top_items[0].revenue
                    return (
                      <tr key={i}>
                        <td style={{ color: 'var(--text-muted)', fontWeight: 700, width: 24, fontSize: 12 }}>{i + 1}</td>
                        <td>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{item.name}</div>
                          <div style={{ height: 3, background: 'var(--surface2)', borderRadius: 2, marginTop: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${(item.revenue / maxRev) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{item.qty.toLocaleString()}</td>
                        <td style={{ fontWeight: 600, color: 'var(--accent)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmt(item.revenue)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Payment methods */}
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 13 }}>Payment Methods — Today</div>
            {payment_split.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No sales yet today</div>
            ) : payment_split.map(p => (
              <TenderBar key={p.method} method={p.method}
                total={fmt(p.total)} count={p.count}
                pct={payTotal > 0 ? (p.total / payTotal) * 100 : 0} />
            ))}

            {/* Sync status */}
            {mgr?.last_sync && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                Cloud sync: <span style={{ color: mgr.last_sync.status === 'success' ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                  {fmtAgo(mgr.last_sync.created_at)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Manager section: reorders + pending ── */}
        {isManager && mgr && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <ReorderWidget items={reorderItems} nav={nav} />
            </div>
            <div className="card">
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                Pending Approvals
                {totalPending > 0 && (
                  <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: 10, fontSize: 11, padding: '1px 7px', fontWeight: 700 }}>
                    {totalPending}
                  </span>
                )}
              </div>
              <PendingSection mgr={mgr} nav={nav} />
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
