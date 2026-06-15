import React, { useState, useEffect } from 'react'
import { getReconciliation, getStoreConfig } from '../api'
import { useCurrency } from '../context/CurrencyContext'
import { printReconciliation } from '../utils/print'
import Pagination from '../components/Pagination'

const PAGE_SIZE = 50

function todayStr() { return new Date().toISOString().split('T')[0] }
function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const FILTER_TABS = [
  { key: 'all',      label: 'All Events' },
  { key: 'sale',     label: 'Sales' },
  { key: 'void',     label: 'Voids & No-Sales' },
  { key: 'override', label: 'Overrides' },
  { key: 'stock',    label: 'Stock Changes' },
  { key: 'system',   label: 'System / Auth' },
]

const SYSTEM_CATS = new Set(['login', 'logout', 'pin_change', 'create_staff', 'update_staff', 'delete_staff', 'system'])

function catStyle(cat) {
  switch (cat) {
    case 'sale':     return { background: '#dcfce7', color: '#15803d' }
    case 'void':     return { background: '#fee2e2', color: '#dc2626' }
    case 'override': return { background: '#fef3c7', color: '#92400e' }
    case 'stock':    return { background: '#dbeafe', color: '#1e40af' }
    default:         return { background: 'var(--surface2)', color: 'var(--text-muted)' }
  }
}

function typeLabel(ev) {
  if (ev.type === 'completed') return 'SALE'
  if (ev.type === 'voided')    return 'VOIDED'
  return (ev.type || '').toUpperCase().replace(/_/g, ' ')
}

export default function AuditLog({ embedded = false }) {
  const { fmt } = useCurrency()
  const [dateFrom, setDateFrom] = useState(todayStr())
  const [dateTo, setDateTo]     = useState(todayStr())
  const [tab, setTab]           = useState('all')
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [expanded, setExpanded] = useState({})
  const [store, setStore]       = useState({})
  const [page, setPage]         = useState(1)

  useEffect(() => { load() }, [dateFrom, dateTo])
  useEffect(() => { setPage(1) }, [tab, dateFrom, dateTo])
  useEffect(() => { getStoreConfig().then(r => setStore(r.data || {})).catch(() => {}) }, [])

  async function load() {
    setLoading(true)
    setExpanded({})
    try {
      const r = await getReconciliation({ date_from: dateFrom, date_to: dateTo })
      setData(r.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  function toggleExpand(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function filteredEvents() {
    if (!data?.events) return []
    switch (tab) {
      case 'sale':     return data.events.filter(e => e.category === 'sale')
      case 'void':     return data.events.filter(e => e.category === 'void')
      case 'override': return data.events.filter(e => e.category === 'override')
      case 'stock':    return data.events.filter(e => e.category === 'stock')
      case 'system':   return data.events.filter(e => SYSTEM_CATS.has(e.type) || SYSTEM_CATS.has(e.category))
      default:         return data.events
    }
  }

  const allEvents = filteredEvents()
  const events = allEvents.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)
  const s = data?.summary || {}

  const controls = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="date" className="input" style={{ width: 140 }}
        value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>to</span>
      <input type="date" className="input" style={{ width: 140 }}
        value={dateTo} onChange={e => setDateTo(e.target.value)} />
      <button className="btn btn-ghost" onClick={load} disabled={loading}>
        {loading ? 'Loading…' : 'Refresh'}
      </button>
      {data && (
        <button className="btn btn-primary" onClick={() => printReconciliation(data, store)}>
          Print Report
        </button>
      )}
    </div>
  )

  return (
    <div style={{ height: embedded ? '100%' : '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      {embedded ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 0 12px', flexShrink: 0 }}>
          {controls}
        </div>
      ) : (
        <div className="page-header">
          <span className="page-title">Audit Log</span>
          {controls}
        </div>
      )}

      {/* Summary tiles */}
      {data && (
        <div style={{ display: 'flex', gap: 10, padding: '12px 24px', flexShrink: 0, flexWrap: 'wrap' }}>
          {[
            { label: 'Sales',          value: s.sales_count,      sub: fmt(s.total_revenue),  cs: catStyle('sale') },
            { label: 'Voided',         value: s.voided_count,     sub: fmt(s.void_amount),    cs: catStyle('void') },
            { label: 'Overrides',      value: s.override_count,   sub: null,                   cs: catStyle('override') },
            { label: 'Stock Moves',    value: s.stock_move_count, sub: null,                   cs: catStyle('stock') },
            { label: 'Tax Collected',  value: fmt(s.total_tax),   sub: null,                   cs: { background: 'var(--surface2)', color: 'var(--text)' } },
            { label: 'Discounts',      value: fmt(s.total_discounts), sub: null,               cs: { background: 'var(--surface2)', color: 'var(--warning)' } },
          ].map(t => (
            <div key={t.label} style={{ ...t.cs, borderRadius: 8, padding: '10px 16px', minWidth: 120 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.75 }}>{t.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{t.value}</div>
              {t.sub && <div style={{ fontSize: 11, opacity: 0.75 }}>{t.sub}</div>}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>
            {s.event_count} total events
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 24px 10px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        {FILTER_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
            background: tab === t.key ? 'var(--accent)' : 'transparent',
            color: tab === t.key ? '#fff' : 'var(--text-muted)',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Event table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 24px' }}>
        {loading ? (
          <div className="empty-state" style={{ marginTop: 40 }}>Loading audit data…</div>
        ) : events.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 40 }}>No events for this period</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={thS}>Time</th>
                <th style={thS}>Type</th>
                <th style={thS}>User</th>
                <th style={thS}>Reference</th>
                <th style={thS}>Detail</th>
                <th style={{ ...thS, textAlign: 'right' }}>Amount</th>
                <th style={{ width: 20 }} />
              </tr>
            </thead>
            <tbody>
              {events.map(ev => {
                const isSale = ev.source === 'sale'
                const isOpen = expanded[ev.id]
                const d      = ev.details || {}
                const amount = d.total ?? d.amount ?? null

                return (
                  <React.Fragment key={ev.id}>
                    <tr
                      style={{ borderBottom: '1px solid var(--border)', cursor: isSale ? 'pointer' : 'default', background: isOpen ? 'var(--surface2)' : undefined }}
                      onClick={() => isSale && toggleExpand(ev.id)}
                    >
                      <td style={tdS}>{fmtTime(ev.time)}</td>
                      <td style={tdS}>
                        <span style={{ ...catStyle(ev.category), padding: '2px 7px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>
                          {typeLabel(ev)}
                        </span>
                      </td>
                      <td style={{ ...tdS, fontWeight: 500 }}>{ev.user || '—'}</td>
                      <td style={{ ...tdS, fontFamily: isSale ? 'monospace' : 'inherit', fontSize: isSale ? 12 : 13 }}>
                        {ev.entity || '—'}
                      </td>
                      <td style={{ ...tdS, color: 'var(--text-muted)', fontSize: 12, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {isSale && `${d.items?.length || 0} items · ${d.payment_method}`}
                        {ev.source === 'void'     && (d.reason || (ev.type === 'no_sale' ? 'No-Sale' : 'Void'))}
                        {ev.source === 'override' && `${d.action} — ${d.item_name}`}
                        {ev.source === 'stock'    && `${d.movement_type || ev.type} · ${d.qty_before}→${d.qty_after}`}
                        {ev.source === 'audit'    && (typeof d === 'string' ? d : (d.notes || d.action || JSON.stringify(d))).toString().slice(0, 70)}
                      </td>
                      <td style={{ ...tdS, textAlign: 'right', fontWeight: 600 }}>
                        {amount != null ? fmt(amount) : '—'}
                      </td>
                      <td style={{ ...tdS, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                        {isSale ? (isOpen ? '▲' : '▶') : ''}
                      </td>
                    </tr>

                    {/* Expanded sale items */}
                    {isOpen && isSale && (
                      <tr>
                        <td colSpan={7} style={{ padding: '4px 20px 12px 40px', background: 'var(--surface2)' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={subTh}>Product</th>
                                <th style={{ ...subTh, textAlign: 'right' }}>Qty</th>
                                <th style={{ ...subTh, textAlign: 'right' }}>Unit Price</th>
                                <th style={{ ...subTh, textAlign: 'right' }}>Discount</th>
                                <th style={{ ...subTh, textAlign: 'right' }}>Line Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(d.items || []).map((item, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '4px 0' }}>{item.product_name}</td>
                                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>{item.qty}</td>
                                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmt(item.unit_price)}</td>
                                  <td style={{ padding: '4px 8px', textAlign: 'right', color: item.discount ? 'var(--warning)' : 'var(--text-muted)' }}>
                                    {item.discount > 0 ? `-${fmt(item.discount)}` : '—'}
                                  </td>
                                  <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600 }}>{fmt(item.line_total)}</td>
                                </tr>
                              ))}
                              <tr style={{ borderTop: '2px solid var(--border)' }}>
                                <td colSpan={3} style={{ padding: '5px 8px 5px 0', color: 'var(--text-muted)', fontSize: 11 }}>
                                  {d.payment_method?.toUpperCase()}
                                  {d.mpesa_ref && ` · Ref: ${d.mpesa_ref}`}
                                  {ev.authorizer && ` · Auth: ${ev.authorizer}`}
                                </td>
                                <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600 }}>Total</td>
                                <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 700 }}>{fmt(d.total)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
        <Pagination total={allEvents.length} page={page} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
    </div>
  )
}

const thS = { textAlign: 'left', padding: '8px 6px', color: 'var(--text-muted)', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }
const tdS = { padding: '7px 6px', verticalAlign: 'middle' }
const subTh = { textAlign: 'left', padding: '4px 8px 4px 0', color: 'var(--text-muted)', fontWeight: 500 }
