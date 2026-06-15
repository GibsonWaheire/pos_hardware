import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getPurchaseOrders, getGRNs, getDamageReports } from '../api'

const STATUS_ORDER = ['ordered', 'confirmed', 'dispatched']  // POs ready to receive

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function poStatusBadge(status) {
  const MAP = {
    draft:      { bg: '#f3f4f6', color: '#6b7280' },
    ordered:    { bg: '#dbeafe', color: '#1e40af' },
    confirmed:  { bg: '#fef3c7', color: '#92400e' },
    dispatched: { bg: '#ccfbf1', color: '#0f766e' },
    received:   { bg: '#dcfce7', color: '#15803d' },
    cancelled:  { bg: '#fee2e2', color: '#dc2626' },
  }
  const s = MAP[status] || {}
  return (
    <span style={{ ...s, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
      {(status || '').toUpperCase()}
    </span>
  )
}

function grnStatusBadge(status) {
  const MAP = {
    pending:    { bg: '#fef3c7', color: '#92400e' },
    confirmed:  { bg: '#dbeafe', color: '#1e40af' },
    signed_off: { bg: '#dcfce7', color: '#15803d' },
  }
  const s = MAP[status] || { bg: 'var(--surface2)', color: 'var(--text-muted)' }
  return (
    <span style={{ ...s, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
      {(status || '').replace(/_/g, ' ').toUpperCase()}
    </span>
  )
}

export default function ReceiverDashboard() {
  const { user }   = useAuth()
  const navigate   = useNavigate()

  const [pendingPOs, setPendingPOs]     = useState([])
  const [recentGRNs, setRecentGRNs]     = useState([])
  const [pendingDamage, setPendingDamage] = useState([])
  const [loading, setLoading]           = useState(true)

  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [posRes, grnsRes, damageRes] = await Promise.all([
        getPurchaseOrders({ status: 'ordered,confirmed,dispatched', limit: 50 }).catch(() => ({ data: [] })),
        getGRNs({ limit: 10 }).catch(() => ({ data: [] })),
        getDamageReports({ status: 'pending', limit: 20 }).catch(() => ({ data: [] })),
      ])
      setPendingPOs(posRes.data || [])
      setRecentGRNs(grnsRes.data || [])
      setPendingDamage(damageRes.data || [])
    } finally {
      setLoading(false)
    }
  }

  const todayGRNs = recentGRNs.filter(g => {
    if (!g.created_at) return false
    return g.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10)
  })

  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>

      {/* Welcome card */}
      <div style={{
        background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
        borderRadius: 14, padding: '20px 28px', marginBottom: 24, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 500 }}>{greeting}</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2 }}>{user?.name}</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
            {now.toLocaleDateString('en-KE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            {' · '}
            {now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        <button
          className="btn"
          style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)', fontWeight: 600 }}
          onClick={() => navigate('/purchase-orders')}
        >
          Go to Receiving
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'POs Awaiting Receive', value: loading ? '…' : pendingPOs.length, color: '#1e40af', bg: '#dbeafe' },
          { label: 'GRNs Today',           value: loading ? '…' : todayGRNs.length,  color: '#15803d', bg: '#dcfce7' },
          { label: 'Total GRNs (recent)',   value: loading ? '…' : recentGRNs.length, color: '#0f766e', bg: '#ccfbf1' },
          { label: 'Pending Damage Reports', value: loading ? '…' : pendingDamage.length, color: '#dc2626', bg: '#fee2e2' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: s.color, opacity: 0.8 }}>{s.label}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: s.color, lineHeight: 1.2, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Pending POs */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>POs Ready to Receive</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/purchase-orders')}>View All</button>
          </div>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
          ) : pendingPOs.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No pending POs</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={thS}>PO #</th>
                  <th style={thS}>Supplier</th>
                  <th style={thS}>Status</th>
                  <th style={thS}>Date</th>
                  <th style={{ ...thS, textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingPOs.slice(0, 8).map(po => (
                  <tr key={po.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...tdS, fontFamily: 'monospace', fontWeight: 600 }}>{po.po_number}</td>
                    <td style={{ ...tdS, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {po.supplier_name || '—'}
                    </td>
                    <td style={tdS}>{poStatusBadge(po.status)}</td>
                    <td style={{ ...tdS, color: 'var(--text-muted)' }}>{fmtDate(po.created_at || po.order_date)}</td>
                    <td style={{ ...tdS, textAlign: 'center' }}>
                      <button className="btn btn-primary btn-sm"
                        style={{ fontSize: 11, padding: '3px 10px' }}
                        onClick={() => navigate('/purchase-orders')}>
                        Receive
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent GRNs */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Recent GRNs</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/inventory')}>View All</button>
          </div>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
          ) : recentGRNs.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No GRNs yet</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={thS}>GRN #</th>
                  <th style={thS}>Supplier</th>
                  <th style={thS}>Status</th>
                  <th style={thS}>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentGRNs.map(g => (
                  <tr key={g.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...tdS, fontFamily: 'monospace', fontWeight: 600 }}>{g.grn_number}</td>
                    <td style={{ ...tdS, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.supplier_name || '—'}
                    </td>
                    <td style={tdS}>{grnStatusBadge(g.status)}</td>
                    <td style={{ ...tdS, color: 'var(--text-muted)' }}>{fmtDate(g.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pending Damage Reports */}
        {pendingDamage.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '2px solid #fca5a5', borderRadius: 12, overflow: 'hidden', gridColumn: '1 / -1' }}>
            <div style={{ padding: '12px 16px', background: '#fee2e2', borderBottom: '1px solid #fca5a5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#dc2626' }}>Pending Damage Reports</span>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/inventory')}>View in Inventory</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={thS}>Product</th>
                  <th style={thS}>Qty</th>
                  <th style={thS}>Reason</th>
                  <th style={thS}>Raised</th>
                </tr>
              </thead>
              <tbody>
                {pendingDamage.map(d => (
                  <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...tdS, fontWeight: 500 }}>{d.product_name}</td>
                    <td style={tdS}>{d.qty}</td>
                    <td style={{ ...tdS, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.reason || '—'}
                    </td>
                    <td style={{ ...tdS, color: 'var(--text-muted)' }}>{fmtDate(d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Quick actions */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, gridColumn: pendingDamage.length > 0 ? undefined : '1 / -1' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Quick Actions</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => navigate('/purchase-orders')}>
              Receive Goods
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/inventory')}>
              View Stock
            </button>
            <button className="btn btn-ghost" onClick={load}>
              Refresh
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const thS = { textAlign: 'left', padding: '7px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }
const tdS = { padding: '7px 10px', verticalAlign: 'middle' }
