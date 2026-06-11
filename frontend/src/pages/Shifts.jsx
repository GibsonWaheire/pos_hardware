import { useState, useEffect } from 'react'
import { getCurrentShift, openShift, closeShift, getShifts, getShiftSummary, getStaff } from '../api'

export default function Shifts() {
  const [currentShift, setCurrentShift] = useState(null)
  const [shifts, setShifts] = useState([])
  const [staff, setStaff] = useState([])
  const [modal, setModal] = useState(null)  // null | 'open' | { mode: 'close', shift } | { mode: 'summary', data }
  const [openForm, setOpenForm] = useState({ cashier_id: '', cashier_name: '', opening_float: '' })
  const [closeForm, setCloseForm] = useState({ closing_float: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

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

  // ── Open shift ────────────────────────────────────────────────────────────

  async function handleOpenShift() {
    setSaving(true); setError('')
    try {
      await openShift({
        cashier_id: openForm.cashier_id ? parseInt(openForm.cashier_id) : null,
        cashier_name: openForm.cashier_name,
        opening_float: parseFloat(openForm.opening_float) || 0,
      })
      setModal(null)
      loadAll()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  // ── Close shift ───────────────────────────────────────────────────────────

  async function handleCloseShift() {
    if (!closeForm.closing_float && closeForm.closing_float !== '0') {
      setError('Enter the actual cash count'); return
    }
    setSaving(true); setError('')
    try {
      await closeShift(modal.shift.id, {
        closing_float: parseFloat(closeForm.closing_float),
        notes: closeForm.notes,
      })
      setModal(null)
      loadAll()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  // ── Shift summary ─────────────────────────────────────────────────────────

  async function viewSummary(shift) {
    try {
      const res = await getShiftSummary(shift.id)
      setModal({ mode: 'summary', data: res.data })
    } catch (e) { alert(e.message) }
  }

  function formatTime(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString()
  }

  function formatDuration(openedAt, closedAt) {
    if (!openedAt) return '—'
    const end = closedAt ? new Date(closedAt) : new Date()
    const mins = Math.floor((end - new Date(openedAt)) / 60000)
    const h = Math.floor(mins / 60), m = mins % 60
    return `${h}h ${m}m`
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Shifts</span>
        {!currentShift && (
          <button className="btn btn-success" onClick={() => {
            setOpenForm({ cashier_id: '', cashier_name: '', opening_float: '' })
            setError('')
            setModal('open')
          }}>
            Open Shift
          </button>
        )}
      </div>

      {/* Current shift banner */}
      {currentShift && (
        <div style={{
          background: '#14532d33', border: '1px solid var(--success)',
          borderRadius: 10, margin: '0 24px', padding: '16px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--success)', marginBottom: 4 }}>
              Shift Open — {currentShift.cashier_name || 'No cashier assigned'}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Opened: {formatTime(currentShift.opened_at)} · Duration: {formatDuration(currentShift.opened_at, null)} ·
              Float: ${currentShift.opening_float.toFixed(2)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => viewSummary(currentShift)}>Summary</button>
            <button className="btn btn-danger" onClick={() => {
              setCloseForm({ closing_float: '', notes: '' })
              setError('')
              setModal({ mode: 'close', shift: currentShift })
            }}>
              Close Shift
            </button>
          </div>
        </div>
      )}

      <div className="page-body" style={{ flex: 1, overflow: 'auto', paddingTop: 16 }}>
        {loading ? (
          <div className="empty-state">Loading shifts...</div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr><th>Cashier</th><th>Opened</th><th>Closed</th><th>Duration</th><th>Float In</th><th>Cash Counted</th><th>Variance</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {shifts.length === 0 ? (
                  <tr><td colSpan={9} className="empty-state">No shifts yet</td></tr>
                ) : shifts.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 500 }}>{s.cashier_name || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatTime(s.opened_at)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatTime(s.closed_at)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{formatDuration(s.opened_at, s.closed_at)}</td>
                    <td>${s.opening_float.toFixed(2)}</td>
                    <td>{s.closing_float != null ? `$${s.closing_float.toFixed(2)}` : '—'}</td>
                    <td>
                      {s.variance != null
                        ? <span style={{ fontWeight: 600, color: s.variance === 0 ? 'var(--success)' : s.variance > 0 ? 'var(--success)' : 'var(--danger)' }}>
                            {s.variance >= 0 ? '+' : ''}${s.variance.toFixed(2)}
                          </span>
                        : '—'}
                    </td>
                    <td>
                      <span className={s.status === 'open' ? 'badge badge-green' : 'badge badge-blue'}>
                        {s.status}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => viewSummary(s)}>Summary</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Open shift modal */}
      {modal === 'open' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ width: 400 }}>
            <div className="modal-title">Open Shift</div>
            <div className="form-group">
              <label className="label">Cashier</label>
              <select className="input" value={openForm.cashier_id}
                onChange={e => {
                  const id = e.target.value
                  const member = staff.find(s => s.id === parseInt(id))
                  setOpenForm({ ...openForm, cashier_id: id, cashier_name: member?.name || '' })
                }}>
                <option value="">-- Select cashier --</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Opening Float ($)</label>
              <input className="input" type="number" min={0} step="0.01"
                placeholder="Cash placed in drawer"
                value={openForm.opening_float}
                onChange={e => setOpenForm({ ...openForm, opening_float: e.target.value })} />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-success" onClick={handleOpenShift} disabled={saving}>
                {saving ? 'Opening...' : 'Open Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close shift modal */}
      {modal?.mode === 'close' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ width: 420 }}>
            <div className="modal-title">Close Shift</div>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{modal.shift.cashier_name || 'No cashier'}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Opened: {formatTime(modal.shift.opened_at)}<br />
                Opening float: ${modal.shift.opening_float.toFixed(2)}<br />
                Duration: {formatDuration(modal.shift.opened_at, null)}
              </div>
            </div>
            <div className="form-group">
              <label className="label">Actual Cash Count (count your drawer)</label>
              <input className="input" type="number" min={0} step="0.01"
                placeholder="0.00"
                value={closeForm.closing_float}
                onChange={e => setCloseForm({ ...closeForm, closing_float: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Notes (optional)</label>
              <textarea className="input" rows={2} value={closeForm.notes}
                onChange={e => setCloseForm({ ...closeForm, notes: e.target.value })}
                style={{ resize: 'vertical' }} />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleCloseShift} disabled={saving}>
                {saving ? 'Closing...' : 'Close Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shift summary modal */}
      {modal?.mode === 'summary' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ width: 440 }}>
            <div className="modal-title">Shift Summary</div>
            {(() => {
              const { shift, transaction_count, total_revenue, cash_sales, card_sales, split_sales, total_tax, total_discounts } = modal.data
              return (
                <>
                  <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                    <div style={{ fontWeight: 600 }}>{shift.cashier_name || 'No cashier'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                      {formatTime(shift.opened_at)} → {formatTime(shift.closed_at)} ({formatDuration(shift.opened_at, shift.closed_at)})
                    </div>
                  </div>

                  <SummaryRow label="Transactions" value={transaction_count} />
                  <SummaryRow label="Total Revenue" value={`$${total_revenue.toFixed(2)}`} />
                  <SummaryRow label="Cash Sales" value={`$${cash_sales.toFixed(2)}`} />
                  <SummaryRow label="Card Sales" value={`$${card_sales.toFixed(2)}`} />
                  {split_sales > 0 && <SummaryRow label="Split Sales" value={`$${split_sales.toFixed(2)}`} />}
                  {total_tax > 0 && <SummaryRow label="Tax Collected" value={`$${total_tax.toFixed(2)}`} />}
                  {total_discounts > 0 && <SummaryRow label="Discounts Given" value={`-$${total_discounts.toFixed(2)}`} />}

                  {shift.status === 'closed' && (
                    <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
                      <SummaryRow label="Opening Float" value={`$${shift.opening_float.toFixed(2)}`} />
                      <SummaryRow label="Expected Cash" value={`$${shift.expected_cash?.toFixed(2)}`} />
                      <SummaryRow label="Actual Count" value={`$${shift.closing_float?.toFixed(2)}`} />
                      <SummaryRow
                        label="Variance"
                        value={`${shift.variance >= 0 ? '+' : ''}$${shift.variance?.toFixed(2)}`}
                        color={shift.variance === 0 ? 'var(--success)' : shift.variance > 0 ? 'var(--success)' : 'var(--danger)'}
                        bold
                      />
                    </div>
                  )}
                </>
              )
            })()}
            <button className="btn btn-ghost" style={{ width: '100%', marginTop: 16 }} onClick={() => setModal(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryRow({ label, value, color, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 500, color: color || 'var(--text)' }}>{value}</span>
    </div>
  )
}
