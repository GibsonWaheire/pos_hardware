import { useState, useEffect } from 'react'
import { getDashboard } from '../api'

function fmt(n) { return n == null ? '—' : `$${Number(n).toFixed(2)}` }

// Inline CSS bar chart — no library
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

function HourLabel({ hour }) {
  if (hour % 3 !== 0) return null
  return <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{hour === 12 ? '12p' : hour < 12 ? `${hour}a` : `${hour - 12}p`}</span>
}

function KpiCard({ label, value, sub, color, icon }) {
  return (
    <div className="card">
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

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const r = await getDashboard()
      setData(r.data)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  if (loading) return <div className="empty-state" style={{ paddingTop: 80 }}>Loading dashboard...</div>
  if (!data) return <div className="empty-state">No data</div>

  const { today, week, month, hourly, daily_trend, top_items, payment_split } = data

  // Hourly chart — only show hours 8am–9pm for readability
  const hourlySlice = hourly.slice(8, 22)

  // Payment split total
  const payTotal = payment_split.reduce((s, p) => s + p.total, 0)

  // Daily trend — label every other day short
  const trendLabeled = daily_trend.map((d, i) => ({
    ...d,
    label: i % 2 === 0 ? new Date(d.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '',
  }))

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Dashboard</span>
        <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <KpiCard
            label="Today's Revenue"
            value={fmt(today.revenue)}
            sub={`${today.transactions} transactions`}
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
            label="Today's Tips"
            value={fmt(today.tips)}
            sub={`${today.open_appointments} appts open · ${today.new_customers} new clients`}
            icon="⭐"
          />
        </div>

        {/* Charts row */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20 }}>

          {/* 14-day revenue trend */}
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>14-Day Revenue Trend</div>
            <BarChart data={trendLabeled} valueKey="revenue" labelKey="date" height={130} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              {trendLabeled.map((d, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-muted)' }}>{d.label}</div>
              ))}
            </div>
          </div>

          {/* Payment split */}
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Payment Methods Today</div>
            {payment_split.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No sales yet today</div>
            ) : (
              payment_split.map((p, i) => {
                const pct = payTotal > 0 ? (p.total / payTotal) * 100 : 0
                const colors = ['var(--accent)', 'var(--success)', 'var(--warning)', '#a78bfa']
                return (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{p.method}</span>
                      <span>{fmt(p.total)} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({p.count} sales)</span></span>
                    </div>
                    <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: colors[i % colors.length], borderRadius: 3, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Bottom row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Hourly today */}
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Today — Hourly Sales</div>
            <BarChart data={hourlySlice} valueKey="revenue" labelKey="hour" height={100} color="var(--success)" />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              {hourlySlice.map((d, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                  <HourLabel hour={d.hour} />
                </div>
              ))}
            </div>
          </div>

          {/* Top items */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ fontWeight: 600, padding: '14px 16px 10px', fontSize: 14 }}>Top Items (30 days)</div>
            {top_items.length === 0 ? (
              <div className="empty-state">No sales data</div>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>#</th><th>Item</th><th>Qty</th><th>Revenue</th></tr>
                </thead>
                <tbody>
                  {top_items.map((item, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ fontWeight: 500 }}>{item.name}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{item.qty}</td>
                      <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{fmt(item.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
