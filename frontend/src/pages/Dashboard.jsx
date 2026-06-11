import { useState, useEffect } from 'react'
import { getDashboard } from '../api'
import { useNavigate } from 'react-router-dom'

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
  const [loading, setLoading] = useState(true)
  const nav = useNavigate()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const r = await getDashboard()
      setData(r.data)
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

      </div>
    </div>
  )
}
