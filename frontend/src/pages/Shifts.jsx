import React, { useState, useEffect } from 'react'
import { getCurrentShift, openShift, getShifts, getStaff, getShiftReconciliation, closeShift } from '../api'
import { useCurrency } from '../context/CurrencyContext'
import { useAuth } from '../context/AuthContext'
import { printShiftReconciliation } from '../utils/print'
import Pagination from '../components/Pagination'

const PAGE_SIZE = 20

function fmtDate(iso) { return iso ? new Date(iso).toLocaleString('en-KE') : '—' }
function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
}
function fmtDur(a, b) {
  if (!a) return '—'
  const mins = Math.floor(((b ? new Date(b) : new Date()) - new Date(a)) / 60000)
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default function Shifts() {
  const { fmt } = useCurrency()
  const { user } = useAuth()

  // List state
  const [currentShift, setCurrentShift] = useState(null)
  const [shifts, setShifts]             = useState([])
  const [staff, setStaff]               = useState([])
  const [loading, setLoading]           = useState(true)

  // Open shift form
  const [openModal, setOpenModal] = useState(false)
  const [openForm, setOpenForm]   = useState({ cashier_id: '', cashier_name: '', opening_float: '' })
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState('')

  // Detail panel
  const [detail, setDetail]           = useState(null)   // { shift, recoData } | null
  const [detailLoading, setDetailLoading] = useState(false)

  // Reconciliation inputs (inside detail panel, for open shifts)
  const [actualCash,  setActualCash]  = useState('')
  const [actualMpesa, setActualMpesa] = useState('')
  const [actualCard,  setActualCard]  = useState('')
  const [actualOther, setActualOther] = useState('')
  const [recoNotes,   setRecoNotes]   = useState('')
  const [closingShift, setClosingShift] = useState(false)
  const [hasPrinted,   setHasPrinted]   = useState(false)
  const [page, setPage] = useState(1)

  // Collapsible sections inside panel
  const [txnsOpen,      setTxnsOpen]      = useState(true)
  const [overridesOpen, setOverridesOpen] = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [cur, all, st] = await Promise.all([getCurrentShift(), getShifts(), getStaff()])
      setCurrentShift(cur.data.shift)
      setShifts(all.data)
      setStaff(st.data)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  async function handleOpenShift() {
    setSaving(true); setFormError('')
    try {
      await openShift({
        cashier_id:    openForm.cashier_id ? parseInt(openForm.cashier_id) : null,
        cashier_name:  openForm.cashier_name,
        opening_float: parseFloat(openForm.opening_float) || 0,
      })
      setOpenModal(false)
      loadAll()
    } catch (e) {
      setFormError(e.response?.data?.error || e.message)
    } finally { setSaving(false) }
  }

  async function viewDetail(shift) {
    setDetail({ shift, recoData: null })
    setDetailLoading(true)
    // Pre-fill cashier's submitted cash count for pending_close shifts
    setActualCash(shift.cashier_cash_count != null ? String(shift.cashier_cash_count) : '')
    setActualMpesa(''); setActualCard(''); setActualOther('')
    setRecoNotes(shift.cashier_close_notes || '')
    setHasPrinted(false)
    setTxnsOpen(true); setOverridesOpen(true)
    try {
      const r = await getShiftReconciliation(shift.id)
      setDetail({ shift, recoData: r.data })
    } catch (e) {
      alert('Error loading shift: ' + (e.response?.data?.error || e.message))
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  function computeVar(actual, expected) {
    return Math.round((parseFloat(actual || 0) - (expected || 0)) * 100) / 100
  }

  function varLabel(v) {
    if (v === 0) return { text: 'Balanced', color: 'var(--success)' }
    if (v < 0)   return { text: `SHORT ${fmt(Math.abs(v))}`, color: 'var(--danger)' }
    return            { text: `OVER ${fmt(v)}`, color: 'var(--warning)' }
  }

  async function handleCloseShift(closedWithoutPrint) {
    if (!detail?.shift || !detail?.recoData) return
    const msg = closedWithoutPrint
      ? 'Close without printing? This will be flagged in the admin report. Continue?'
      : 'Confirm hardcopy printed and filed?'
    if (!window.confirm(msg)) return
    setClosingShift(true)
    try {
      const res = await closeShift(detail.shift.id, {
        reconciliation_submitted: true,
        actual_cash:  parseFloat(actualCash)  || 0,
        actual_mpesa: parseFloat(actualMpesa) || 0,
        actual_card:  parseFloat(actualCard)  || 0,
        actual_other: parseFloat(actualOther) || 0,
        notes: recoNotes,
        closed_without_print: closedWithoutPrint,
      })
      setDetail(null)
      await loadAll()
      alert(`Shift closed. Report ${res.data.report_number} generated.`)
    } catch (e) {
      alert('Error: ' + (e.response?.data?.error || e.message))
    } finally { setClosingShift(false) }
  }

  function handlePrintReport() {
    if (!detail?.recoData) return
    const exp = detail.recoData.expected
    const mkRow = (t, e, actual) => {
      const v = computeVar(actual, e)
      return { tender: t, expected: e, actual: parseFloat(actual) || 0, variance: v, status: v === 0 ? 'BALANCED' : v < 0 ? 'SHORT' : 'OVER' }
    }
    const tenders = [
      ...(exp.cash  ? [mkRow('cash',  exp.cash,  actualCash)]  : []),
      ...(exp.mpesa ? [mkRow('mpesa', exp.mpesa, actualMpesa)] : []),
      ...(exp.card  ? [mkRow('card',  exp.card,  actualCard)]  : []),
      ...(exp.other ? [mkRow('other', exp.other, actualOther)] : []),
    ]
    printShiftReconciliation({
      report_number: 'PREVIEW',
      content: {
        shift: detail.shift,
        reconciled_by: { name: user?.name, role: user?.role },
        tenders,
        overrides: detail.recoData.overrides,
        transactions: detail.recoData.transactions,
        total_expected_revenue: exp.total,
        total_actual_revenue: tenders.reduce((s, t) => s + t.actual, 0),
        total_variance: tenders.reduce((s, t) => s + t.variance, 0),
      },
    })
    setHasPrinted(true)
  }

  function printDetailReport() {
    if (!detail?.recoData) return
    const sh = detail.shift
    const rd = detail.recoData
    const exp = rd.expected
    const mkRow = (t, e, actual, variance) => ({
      tender: t, expected: e, actual: actual || 0, variance: variance || 0,
      status: (variance || 0) === 0 ? 'BALANCED' : (variance || 0) < 0 ? 'SHORT' : 'OVER',
    })
    const tenders = [
      ...(exp.cash  ? [mkRow('cash',  exp.cash,  sh.actual_cash,  sh.variance_cash)]  : []),
      ...(exp.mpesa ? [mkRow('mpesa', exp.mpesa, sh.actual_mpesa, sh.variance_mpesa)] : []),
      ...(exp.card  ? [mkRow('card',  exp.card,  sh.actual_card,  sh.variance_card)]  : []),
      ...(exp.other ? [mkRow('other', exp.other, sh.actual_other, sh.variance_other)] : []),
    ]
    printShiftReconciliation({
      report_number: `SHIFT-${sh.id}`,
      content: {
        shift: sh,
        reconciled_by: { name: sh.reconciled_by_name || user?.name, role: sh.status === 'closed' ? 'manager' : user?.role },
        tenders,
        overrides: rd.overrides,
        transactions: rd.transactions,
        total_expected_revenue: exp.total,
        total_actual_revenue: sh.status === 'closed'
          ? ((sh.actual_cash || 0) + (sh.actual_mpesa || 0) + (sh.actual_card || 0) + (sh.actual_other || 0))
          : exp.total,
        total_variance: sh.status === 'closed'
          ? ((sh.variance_cash || 0) + (sh.variance_mpesa || 0) + (sh.variance_card || 0) + (sh.variance_other || 0))
          : 0,
      },
    })
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ── Page header ── */}
      <div className="page-header">
        <span className="page-title">Shifts</span>
        {!currentShift && user?.role !== 'admin' && (
          <button className="btn btn-success" onClick={() => {
            setOpenForm({ cashier_id: '', cashier_name: '', opening_float: '' })
            setFormError('')
            setOpenModal(true)
          }}>
            Open Shift
          </button>
        )}
      </div>

      {/* ── Active / pending-close shift banner ── */}
      {currentShift && currentShift.status === 'pending_close' && (
        <div style={{
          background: '#7c3aed18', border: '1px solid #7c3aed', borderRadius: 10,
          margin: '0 24px', padding: '14px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 700, color: '#7c3aed', fontSize: 15, marginBottom: 2 }}>
              Awaiting Manager Close — {currentShift.cashier_name || 'Unassigned'}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Cashier ended at {fmtDate(currentShift.cashier_ended_at)}
              {currentShift.cashier_cash_count != null && ` · Cashier cash count: ${fmt(currentShift.cashier_cash_count)}`}
              {currentShift.cashier_close_notes && ` · Note: ${currentShift.cashier_close_notes}`}
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => viewDetail(currentShift)}>
            Review & Close
          </button>
        </div>
      )}
      {currentShift && currentShift.status === 'open' && (
        <div style={{
          background: '#14532d22', border: '1px solid var(--success)', borderRadius: 10,
          margin: '0 24px', padding: '14px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--success)', fontSize: 15, marginBottom: 2 }}>
              Shift in Progress — {currentShift.cashier_name || 'Unassigned'}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Opened: {fmtDate(currentShift.opened_at)}
              {' · '}Running: {fmtDur(currentShift.opened_at, null)}
              {' · '}Float: {fmt(currentShift.opening_float)}
            </div>
          </div>
          <button className="btn btn-danger" onClick={() => viewDetail(currentShift)}>
            View / Close Shift
          </button>
        </div>
      )}

      {/* ── Shift list ── */}
      <div className="page-body" style={{ flex: 1, overflow: 'auto', paddingTop: 16 }}>
        {loading ? (
          <div className="empty-state">Loading shifts…</div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Cashier</th>
                  <th>Opened</th>
                  <th>Closed</th>
                  <th>Duration</th>
                  <th>Float</th>
                  <th>Cash Var.</th>
                  <th>M-Pesa Var.</th>
                  <th>Reconciled By</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shifts.length === 0 ? (
                  <tr><td colSpan={10} className="empty-state">No shifts yet</td></tr>
                ) : shifts.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE).map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 500 }}>{s.cashier_name || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(s.opened_at)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.closed_at ? fmtDate(s.closed_at) : '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{fmtDur(s.opened_at, s.closed_at)}</td>
                    <td>{fmt(s.opening_float)}</td>
                    <td>
                      {s.variance_cash != null
                        ? <VarCell v={s.variance_cash} fmt={fmt} />
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td>
                      {s.variance_mpesa != null
                        ? <VarCell v={s.variance_mpesa} fmt={fmt} />
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.reconciled_by_name || '—'}</td>
                    <td>
                      <span className={
                        s.status === 'open' ? 'badge badge-green' :
                        s.status === 'pending_close' ? 'badge badge-yellow' :
                        'badge badge-blue'
                      }>
                        {s.status === 'pending_close' ? 'Pending Close' : s.status}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => viewDetail(s)}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination total={shifts.length} page={page} pageSize={PAGE_SIZE} onChange={setPage} />
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          DETAIL PANEL (right-side drawer)
          ══════════════════════════════════════════════════════════════════════════ */}
      {detail && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999 }}
            onClick={() => !closingShift && setDetail(null)}
          />

          {/* Panel */}
          <div style={{
            position: 'fixed', top: 0, right: 0,
            width: 740, maxWidth: '97vw', height: '100vh',
            background: 'var(--bg)', borderLeft: '1px solid var(--border)',
            zIndex: 1000, display: 'flex', flexDirection: 'column',
            boxShadow: '-6px 0 40px rgba(0,0,0,0.3)',
          }}>

            {/* Panel header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
              background: 'var(--surface)',
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {detail.shift.cashier_name || 'Unassigned Cashier'}
                  {' '}
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                    background: detail.shift.status === 'open' ? '#dcfce7' : '#dbeafe',
                    color: detail.shift.status === 'open' ? '#15803d' : '#1e40af',
                  }}>
                    {detail.shift.status?.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {fmtDate(detail.shift.opened_at)}
                  {detail.shift.closed_at && ` → ${fmtDate(detail.shift.closed_at)}`}
                  {' · '}{fmtDur(detail.shift.opened_at, detail.shift.closed_at)}
                  {' · '}Float: {fmt(detail.shift.opening_float)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {detail.recoData && (
                  <button className="btn btn-ghost btn-sm" onClick={printDetailReport}>
                    Print Report
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setDetail(null)}
                  disabled={closingShift}
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Panel body */}
            {detailLoading ? (
              <div className="empty-state" style={{ flex: 1 }}>Loading shift data…</div>
            ) : detail.recoData ? (
              <PanelBody
                shift={detail.shift}
                rd={detail.recoData}
                fmt={fmt}
                user={user}
                // reconciliation inputs
                actualCash={actualCash} setActualCash={setActualCash}
                actualMpesa={actualMpesa} setActualMpesa={setActualMpesa}
                actualCard={actualCard} setActualCard={setActualCard}
                actualOther={actualOther} setActualOther={setActualOther}
                recoNotes={recoNotes} setRecoNotes={setRecoNotes}
                closingShift={closingShift}
                hasPrinted={hasPrinted}
                txnsOpen={txnsOpen} setTxnsOpen={setTxnsOpen}
                overridesOpen={overridesOpen} setOverridesOpen={setOverridesOpen}
                computeVar={computeVar}
                varLabel={varLabel}
                onClose={handleCloseShift}
                onPrint={handlePrintReport}
              />
            ) : null}
          </div>
        </>
      )}

      {/* ── Open shift modal ── */}
      {openModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setOpenModal(false)}>
          <div className="modal" style={{ width: 400 }}>
            <div className="modal-title">Open Shift</div>
            <div className="form-group">
              <label className="label">Cashier</label>
              <select className="input" value={openForm.cashier_id}
                onChange={e => {
                  const id = e.target.value
                  const m  = staff.find(s => s.id === parseInt(id))
                  setOpenForm({ ...openForm, cashier_id: id, cashier_name: m?.name || '' })
                }}>
                <option value="">-- Select cashier --</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Opening Float (KES)</label>
              <input className="input" type="number" min={0} step="0.01"
                placeholder="Cash placed in drawer"
                value={openForm.opening_float}
                onChange={e => setOpenForm({ ...openForm, opening_float: e.target.value })} />
            </div>
            {formError && <p className="error-msg">{formError}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setOpenModal(false)}>Cancel</button>
              <button className="btn btn-success" onClick={handleOpenShift} disabled={saving}>
                {saving ? 'Opening…' : 'Open Shift'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Panel body (extracted for clarity) ───────────────────────────────────────

function PanelBody({
  shift, rd, fmt, user,
  actualCash, setActualCash,
  actualMpesa, setActualMpesa,
  actualCard, setActualCard,
  actualOther, setActualOther,
  recoNotes, setRecoNotes,
  closingShift,
  txnsOpen, setTxnsOpen,
  overridesOpen, setOverridesOpen,
  computeVar, varLabel,
  hasPrinted, onClose, onPrint,
}) {
  const exp  = rd.expected
  const ov   = rd.overrides
  const txns = rd.transactions
  const isOpen   = shift.status === 'open'
  const canClose = shift.status === 'open' || shift.status === 'pending_close'

  // Revenue from tender breakdown
  const totalRevenue = Object.values(txns.by_tender || {}).reduce((s, t) => s + (t.total || 0), 0)

  // Live variance computations (for open-shift reconciliation form)
  const varCash  = computeVar(actualCash,  exp.cash)
  const varMpesa = computeVar(actualMpesa, exp.mpesa)
  const varCard  = computeVar(actualCard,  exp.card)
  const varOther = computeVar(actualOther, exp.other)
  const allFilled = (exp.cash  === 0 || actualCash  !== '') &&
                    (exp.mpesa === 0 || actualMpesa !== '') &&
                    (exp.card  === 0 || actualCard  !== '')
  const hasVar = varCash !== 0 || varMpesa !== 0 || varCard !== 0 || varOther !== 0

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>

      {/* ── Summary tiles ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 22 }}>
        <Tile label="Total Revenue"   value={fmt(totalRevenue)} color="#15803d" bg="#dcfce7" />
        <Tile label="Transactions"    value={txns.total_count}  color="#1e40af" bg="#dbeafe" />
        <Tile label="Opening Float"   value={fmt(shift.opening_float)} color="var(--text)" bg="var(--surface2)" />
        <Tile label="Expected Cash"   value={fmt(exp.cash)}    color="var(--text)" bg="var(--surface2)" />
        <Tile label="Expected M-Pesa" value={fmt(exp.mpesa)}   color="var(--text)" bg="var(--surface2)" />
        {ov.count > 0
          ? <Tile label="Overrides" value={`${ov.count} (${fmt(ov.total_value_impact)} impact)`} color={ov.flagged ? '#dc2626' : '#92400e'} bg={ov.flagged ? '#fee2e2' : '#fef3c7'} />
          : <Tile label="Overrides" value="None" color="var(--text-muted)" bg="var(--surface2)" />
        }
      </div>

      {/* Cashier submission banner (pending_close only) */}
      {shift.status === 'pending_close' && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e',
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Cashier ended shift — awaiting manager close</div>
          {shift.cashier_cash_count != null && (
            <div style={{ fontSize: 12 }}>
              Cashier reported cash: <strong>KES {Number(shift.cashier_cash_count).toLocaleString()}</strong>
              {shift.cashier_close_notes && ` · "${shift.cashier_close_notes}"`}
            </div>
          )}
        </div>
      )}

      {/* Tender breakdown (for closed shifts — show actual vs expected) */}
      {shift.status === 'closed' && shift.actual_cash != null && (
        <div style={{ marginBottom: 22 }}>
          <SectionTitle>Reconciliation Result</SectionTitle>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={th}>Tender</th>
                <th style={{ ...th, textAlign: 'right' }}>Expected</th>
                <th style={{ ...th, textAlign: 'right' }}>Counted</th>
                <th style={{ ...th, textAlign: 'right' }}>Variance</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Cash',   exp: exp.cash,  actual: shift.actual_cash,  variance: shift.variance_cash  },
                { label: 'M-Pesa', exp: exp.mpesa, actual: shift.actual_mpesa, variance: shift.variance_mpesa },
                { label: 'Card',   exp: exp.card,  actual: shift.actual_card,  variance: shift.variance_card  },
                ...(exp.other > 0 ? [{ label: 'Other', exp: exp.other, actual: shift.actual_other, variance: shift.variance_other }] : []),
              ].filter(r => r.exp > 0 || r.actual).map(r => {
                const vl = varLabel(r.variance || 0)
                return (
                  <tr key={r.label} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}>{r.label}</td>
                    <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>{fmt(r.exp)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{r.actual != null ? fmt(r.actual) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: vl.color }}>{vl.text}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {shift.reconciled_by_name && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              Reconciled by {shift.reconciled_by_name} · {fmtDate(shift.reconciled_at)}
              {shift.notes && ` · "${shift.notes}"`}
            </div>
          )}
        </div>
      )}

      {/* ── Transactions table ── */}
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setTxnsOpen(o => !o)} style={collapseBtn}>
          {txnsOpen ? '▼' : '▶'} Transactions ({txns.total_count} sales · {fmt(totalRevenue)})
        </button>

        {/* Tender summary pills */}
        {txns.by_tender && Object.keys(txns.by_tender).length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6, marginBottom: 6 }}>
            {Object.entries(txns.by_tender).map(([t, d]) => (
              <span key={t} style={{ fontSize: 12, background: 'var(--surface2)', borderRadius: 8, padding: '3px 10px', color: 'var(--text-muted)' }}>
                {t}: {d.count} · {fmt(d.total)}
              </span>
            ))}
          </div>
        )}

        {txnsOpen && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={th}>Time</th>
                <th style={th}>Receipt</th>
                <th style={th}>Cashier</th>
                <th style={th}>Tender</th>
                <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {(txns.list || []).map((t, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)', opacity: t.status !== 'completed' ? 0.55 : 1 }}>
                  <td style={td}>{fmtTime(t.time)}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{t.receipt_number}</td>
                  <td style={{ ...td, color: 'var(--text-muted)' }}>{t.cashier_name || '—'}</td>
                  <td style={{ ...td, textTransform: 'capitalize' }}>{t.tender}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(t.amount)}</td>
                  <td style={td}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
                      background: t.status === 'completed' ? '#dcfce7' : '#fee2e2',
                      color: t.status === 'completed' ? '#15803d' : '#dc2626',
                    }}>
                      {t.status?.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Override activity ── */}
      {ov.count > 0 && (
        <div style={{ marginBottom: 20 }}>
          <button onClick={() => setOverridesOpen(o => !o)} style={{ ...collapseBtn, color: ov.flagged ? 'var(--danger)' : 'var(--text)' }}>
            {overridesOpen ? '▼' : '▶'} Override Activity ({ov.count} · {fmt(ov.total_value_impact)} impact)
            {ov.flagged && (
              <span style={{ marginLeft: 8, fontSize: 11, background: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: 8 }}>
                FLAGGED {ov.pct_of_sales}% of sales
              </span>
            )}
          </button>
          {overridesOpen && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={th}>Time</th>
                  <th style={th}>Cashier</th>
                  <th style={th}>Approved By</th>
                  <th style={th}>Action</th>
                  <th style={th}>Item</th>
                  <th style={th}>Old→New</th>
                  <th style={{ ...th, textAlign: 'right' }}>Impact</th>
                </tr>
              </thead>
              <tbody>
                {(ov.details || []).map((d, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}>{fmtTime(d.time)}</td>
                    <td style={td}>{d.cashier_name}</td>
                    <td style={{ ...td, color: 'var(--text-muted)' }}>{d.manager_name}</td>
                    <td style={{ ...td, color: d.action === 'REMOVE_ITEM' ? 'var(--danger)' : 'var(--warning)', fontWeight: 600, fontSize: 11 }}>
                      {d.action}
                    </td>
                    <td style={td}>{d.item_name}</td>
                    <td style={{ ...td, color: 'var(--text-muted)' }}>{d.original_qty}→{d.new_qty ?? 0}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: (d.value_impact || 0) < 0 ? 'var(--danger)' : 'var(--text)' }}>
                      {(d.value_impact || 0) >= 0 ? '+' : ''}{fmt(d.value_impact || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ══ RECONCILE & CLOSE SECTION (open + pending_close shifts) ══ */}
      {canClose && (
        <div style={{ borderTop: '2px solid var(--border)', paddingTop: 20, marginTop: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: 'var(--danger)' }}>
            Reconcile &amp; Close Shift
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={th}>Tender</th>
                <th style={{ ...th, textAlign: 'right' }}>Expected</th>
                <th style={{ ...th, textAlign: 'right' }}>Counted</th>
                <th style={{ ...th, textAlign: 'right' }}>Variance</th>
              </tr>
            </thead>
            <tbody>
              {[
                { key: 'cash',  label: 'Cash',   exp: exp.cash,  actual: actualCash,  set: setActualCash,  v: varCash,  note: 'incl. float' },
                { key: 'mpesa', label: 'M-Pesa', exp: exp.mpesa, actual: actualMpesa, set: setActualMpesa, v: varMpesa },
                { key: 'card',  label: 'Card',   exp: exp.card,  actual: actualCard,  set: setActualCard,  v: varCard  },
                ...(exp.other > 0 ? [{ key: 'other', label: 'Other', exp: exp.other, actual: actualOther, set: setActualOther, v: varOther }] : []),
              ].map(row => {
                const vl = varLabel(row.v)
                const filled = row.actual !== ''
                return (
                  <tr key={row.key} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...td, fontWeight: 500 }}>
                      {row.label}
                      {row.note && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{row.note}</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>{fmt(row.exp)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <input
                        type="number" min={0} step="0.01" placeholder="0.00"
                        value={row.actual} onChange={e => row.set(e.target.value)}
                        style={{ width: 110, padding: '5px 8px', textAlign: 'right', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                      />
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: filled ? vl.color : 'var(--text-muted)' }}>
                      {filled ? vl.text : '—'}
                    </td>
                  </tr>
                )
              })}
              <tr style={{ borderTop: '2px solid var(--border)' }}>
                <td style={{ ...td, fontWeight: 700 }}>Total Expected</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmt(exp.total)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>

          {/* Status banner */}
          {allFilled && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontWeight: 600, fontSize: 13,
              background: hasVar ? '#fee2e2' : '#dcfce7',
              color: hasVar ? '#dc2626' : '#15803d',
              border: `1px solid ${hasVar ? '#fca5a5' : '#86efac'}`,
            }}>
              {hasVar ? 'Discrepancies found — review before closing' : 'All tenders balanced — ready to close'}
            </div>
          )}

          {exp.mpesa > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, fontStyle: 'italic' }}>
              M-Pesa totals are verifiable against Daraja / phone statement.
            </div>
          )}

          {/* Notes */}
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="label">Notes (optional)</label>
            <textarea className="input" rows={2} value={recoNotes}
              onChange={e => setRecoNotes(e.target.value)} style={{ resize: 'vertical' }} />
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
            Print in portrait, A4, no margins
          </div>

          {/* Actions — print and close are independent */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>
            {hasPrinted && (
              <span style={{ fontSize: 12, color: 'var(--success)', marginRight: 4 }}>✓ Report printed</span>
            )}
            <button
              className="btn btn-ghost"
              onClick={onPrint}
              disabled={!allFilled}
            >
              Print Report
            </button>
            <button
              className="btn btn-primary"
              onClick={() => onClose(!hasPrinted)}
              disabled={!allFilled || closingShift}
              style={hasPrinted ? {} : { background: 'var(--warning)', borderColor: 'var(--warning)' }}
            >
              {closingShift ? 'Closing…' : hasPrinted ? 'Close Shift' : 'Close Without Printing'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Tile({ label, value, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function VarCell({ v, fmt }) {
  const color = v === 0 ? 'var(--success)' : v > 0 ? 'var(--warning)' : 'var(--danger)'
  return (
    <span style={{ fontWeight: 600, color }}>
      {v >= 0 ? '+' : ''}{fmt(v)}
    </span>
  )
}

function SectionTitle({ children }) {
  return <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: 'var(--text)' }}>{children}</div>
}

const collapseBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontWeight: 600, fontSize: 13, color: 'var(--text)',
  padding: 0, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2,
}
const th = { textAlign: 'left', padding: '6px 8px 6px 0', color: 'var(--text-muted)', fontWeight: 500, fontSize: 12 }
const td = { padding: '7px 8px 7px 0', verticalAlign: 'middle', fontSize: 13 }
