import React, { useState, useEffect, useRef } from 'react'
import { getDashboard, getManagerDashboard, completeEOD } from '../api'
import { useCurrency } from '../context/CurrencyContext'
import { useNavigate } from 'react-router-dom'

function age(isoStr) {
  if (!isoStr) return null
  return (Date.now() - new Date(isoStr).getTime()) / 3600000 // hours
}

function fmtTime(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
}

function StatusBadge({ status }) {
  const cfg = {
    ok:   { bg: '#dcfce7', color: '#15803d', label: 'OK' },
    warn: { bg: '#fef3c7', color: '#92400e', label: 'NOTE' },
    fail: { bg: '#fee2e2', color: '#dc2626', label: 'ACTION NEEDED' },
    skip: { bg: 'var(--surface2)', color: 'var(--text-muted)', label: 'N/A' },
  }[status] || { bg: 'var(--surface2)', color: 'var(--text-muted)', label: status }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
      background: cfg.bg, color: cfg.color, letterSpacing: 0.5,
      whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  )
}

function CheckRow({ icon, label, status, detail, action }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 22, width: 30, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        {detail && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{detail}</div>}
      </div>
      <StatusBadge status={status} />
      {action && (
        <button className="btn btn-ghost" onClick={action.fn}
          style={{ fontSize: 12, padding: '4px 10px', whiteSpace: 'nowrap' }}>
          {action.label}
        </button>
      )}
    </div>
  )
}

function ManualCheck({ label, checked, onChange }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
      borderBottom: '1px solid var(--border)', cursor: 'pointer',
    }}>
      <span style={{ fontSize: 22, width: 30, textAlign: 'center', flexShrink: 0 }}>
        {checked ? '✅' : '⬜'}
      </span>
      <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{label}</div>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: 18, height: 18, cursor: 'pointer' }} />
    </label>
  )
}

export default function EODChecklist() {
  const { fmt } = useCurrency()
  const navigate = useNavigate()

  const [dash,    setDash]    = useState(null)
  const [mgr,     setMgr]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)

  // Manual confirmations
  const [floatRemoved,    setFloatRemoved]    = useState(false)
  const [premisesSecured, setPremisesSecured] = useState(false)

  // Completion state
  const [completing, setCompleting] = useState(false)
  const [completed,  setCompleted]  = useState(false)
  const [completedAt, setCompletedAt] = useState(null)

  const timerRef = useRef(null)

  async function load() {
    try {
      const [d, m] = await Promise.all([getDashboard(), getManagerDashboard()])
      setDash(d.data)
      setMgr(m.data)
      setLastRefresh(new Date())
    } catch (e) {
      console.error('EOD load error', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    timerRef.current = setInterval(load, 30000)
    return () => clearInterval(timerRef.current)
  }, [])

  // ── Derived check statuses ─────────────────────────────────────────────────

  const shiftOpen   = mgr?.shift != null
  const unfiledRpts = mgr?.alerts?.unfiled_shift_reports ?? 0
  const pendingAppr = mgr?.pending_approvals?.total ?? 0
  const syncAge     = age(mgr?.last_sync?.created_at)  // hours; null if never synced
  const lowStock    = (dash?.inventory?.low_stock ?? 0) + (dash?.inventory?.out_of_stock ?? 0)

  const checks = {
    shift:     shiftOpen ? 'fail' : 'ok',
    reports:   unfiledRpts > 0 ? 'warn' : 'ok',
    approvals: pendingAppr > 0 ? 'warn' : 'ok',
    sync:      syncAge === null ? 'warn' : syncAge < 2 ? 'ok' : syncAge < 6 ? 'warn' : 'fail',
    stock:     lowStock > 0 ? 'warn' : 'ok',
  }

  // Critical = shift must be closed + all shift reports filed before EOD can be marked complete
  const criticalOk = checks.shift === 'ok' && !completed
  const allManual  = floatRemoved && premisesSecured
  const canComplete = criticalOk && allManual

  async function handleComplete() {
    if (!canComplete) return
    if (!window.confirm('Mark end-of-day complete? This will be logged in the audit trail.')) return
    setCompleting(true)
    try {
      const res = await completeEOD({
        checks_passed:    Object.entries(checks).filter(([, v]) => v === 'ok').map(([k]) => k),
        manual_confirmed: ['float_removed', 'premises_secured'],
        today_sales:      dash?.today?.transactions,
        today_revenue:    dash?.today?.revenue,
      })
      setCompleted(true)
      setCompletedAt(res.data.logged_at)
    } catch (e) {
      alert('Error logging EOD: ' + (e.response?.data?.error || e.message))
    } finally {
      setCompleting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const today = new Date().toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading EOD checklist…
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>End-of-Day Checklist</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          {today}
          {lastRefresh && (
            <span style={{ marginLeft: 14 }}>
              Last refreshed {lastRefresh.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* ── Today summary strip ── */}
      {dash && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24,
        }}>
          {[
            { label: 'Sales', value: dash.today.transactions },
            { label: 'Revenue', value: fmt(dash.today.revenue) },
            { label: 'Avg Sale', value: fmt(dash.today.avg_sale) },
            { label: 'New Customers', value: dash.today.new_customers },
          ].map(t => (
            <div key={t.label} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '12px 14px',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{t.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Auto checks ── */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden', marginBottom: 20,
      }}>
        <div style={{
          padding: '12px 18px', borderBottom: '1px solid var(--border)',
          fontWeight: 700, fontSize: 13, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          System Checks
        </div>

        <CheckRow
          icon={checks.shift === 'ok' ? '🔒' : '⚠️'}
          label="Shift closed"
          status={checks.shift}
          detail={shiftOpen
            ? `Shift opened at ${fmtTime(mgr?.shift?.opened_at)} is still open`
            : 'No open shift'}
          action={shiftOpen ? { label: 'Go to Shifts', fn: () => navigate('/shifts') } : null}
        />

        <CheckRow
          icon={unfiledRpts === 0 ? '📁' : '📂'}
          label="Shift reports filed"
          status={checks.reports}
          detail={unfiledRpts === 0
            ? 'All shift reports filed'
            : `${unfiledRpts} shift report${unfiledRpts > 1 ? 's' : ''} not yet filed`}
          action={unfiledRpts > 0 ? { label: 'Go to Shifts', fn: () => navigate('/shifts') } : null}
        />

        <CheckRow
          icon={pendingAppr === 0 ? '✅' : '📋'}
          label="Pending approvals"
          status={checks.approvals}
          detail={pendingAppr === 0
            ? 'No pending approvals'
            : (() => {
                const parts = []
                const pa = mgr?.pending_approvals
                if (pa?.returns?.length)          parts.push(`${pa.returns.length} return${pa.returns.length > 1 ? 's' : ''}`)
                if (pa?.purchase_orders?.length)  parts.push(`${pa.purchase_orders.length} PO${pa.purchase_orders.length > 1 ? 's' : ''}`)
                if (pa?.damage_reports?.length)   parts.push(`${pa.damage_reports.length} damage report${pa.damage_reports.length > 1 ? 's' : ''}`)
                return parts.join(', ') + ' awaiting approval'
              })()
          }
        />

        <CheckRow
          icon={checks.sync === 'ok' ? '☁️' : '🔌'}
          label="Cloud sync"
          status={checks.sync}
          detail={mgr?.last_sync
            ? `Last synced at ${fmtTime(mgr.last_sync.created_at)} (${Math.round(syncAge * 10) / 10}h ago)`
            : 'Never synced today'}
          action={checks.sync !== 'ok' ? { label: 'Go to Sync', fn: () => navigate('/cloud-sync') } : null}
        />

        <CheckRow
          icon={lowStock === 0 ? '📦' : '⚠️'}
          label="Low / out of stock items"
          status={checks.stock}
          detail={lowStock === 0
            ? 'All products adequately stocked'
            : `${dash?.inventory?.out_of_stock ?? 0} out of stock, ${dash?.inventory?.low_stock ?? 0} low stock — note for tomorrow`}
          action={lowStock > 0 ? { label: 'Go to Inventory', fn: () => navigate('/inventory') } : null}
        />
      </div>

      {/* ── Manual confirmations ── */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden', marginBottom: 24,
      }}>
        <div style={{
          padding: '12px 18px', borderBottom: '1px solid var(--border)',
          fontWeight: 700, fontSize: 13, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          Manual Confirmations
        </div>
        <ManualCheck
          label="Till float removed and secured in safe"
          checked={floatRemoved}
          onChange={setFloatRemoved}
        />
        <ManualCheck
          label="Premises secured / alarm set"
          checked={premisesSecured}
          onChange={setPremisesSecured}
        />
      </div>

      {/* ── Completion ── */}
      {completed ? (
        <div style={{
          padding: '20px 24px', borderRadius: 12, textAlign: 'center',
          background: '#dcfce7', border: '1px solid #86efac',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#15803d' }}>End of Day Complete</div>
          <div style={{ fontSize: 13, color: '#166534', marginTop: 4 }}>
            Logged at {completedAt ? new Date(completedAt).toLocaleTimeString('en-KE') : '—'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!criticalOk && (
            <div style={{
              padding: '12px 16px', borderRadius: 8,
              background: '#fee2e2', border: '1px solid #fca5a5',
              color: '#dc2626', fontSize: 13, fontWeight: 600,
            }}>
              Resolve the open shift before marking EOD complete.
            </div>
          )}
          {criticalOk && !allManual && (
            <div style={{
              padding: '12px 16px', borderRadius: 8,
              background: '#fef3c7', border: '1px solid #fcd34d',
              color: '#92400e', fontSize: 13,
            }}>
              Tick both manual confirmations above to enable EOD completion.
            </div>
          )}
          <button
            className="btn btn-primary"
            onClick={handleComplete}
            disabled={!canComplete || completing}
            style={{ padding: '14px 24px', fontSize: 15, fontWeight: 700 }}
          >
            {completing ? 'Logging…' : 'Mark End of Day Complete'}
          </button>
        </div>
      )}
    </div>
  )
}
