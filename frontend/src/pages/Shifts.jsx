import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentShift, openShift, getShifts, getShiftSummary, getStaff } from '../api'
import { useCurrency } from '../context/CurrencyContext'

export default function Shifts() {
  const { fmt } = useCurrency()
  const navigate = useNavigate()
  const [currentShift, setCurrentShift] = useState(null)
  const [shifts, setShifts] = useState([])
  const [staff, setStaff] = useState([])
  const [modal, setModal] = useState(null)  // null | 'open' | { mode: 'summary', data }
  const [openForm, setOpenForm] = useState({ cashier_id: '', cashier_name: '', opening_float: '' })
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
              Float: {fmt(currentShift.opening_float)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => viewSummary(currentShift)}>Summary</button>
            <button
              className="btn btn-danger"
              onClick={() => navigate('/reports', { state: { tab: 'shift-history', action: 'close' } })}
            >
              Reconcile &amp; Close
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
                <tr>
                  <th>Cashier</th><th>Opened</th><th>Closed</th><th>Duration</th>
                  <th>Float In</th><th>Cash Counted</th><th>Cash Var.</th>
                  <th>M-Pesa Var.</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {shifts.length === 0 ? (
                  <tr><td colSpan={10} className="empty-state">No shifts yet</td></tr>
                ) : shifts.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 500 }}>{s.cashier_name || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatTime(s.opened_at)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatTime(s.closed_at)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{formatDuration(s.opened_at, s.closed_at)}</td>
                    <td>{fmt(s.opening_float)}</td>
                    <td>{s.actual_cash != null ? fmt(s.actual_cash) : '—'}</td>
                    <td>
                      {s.variance_cash != null
                        ? <span style={{ fontWeight: 600, color: s.variance_cash === 0 ? 'var(--success)' : s.variance_cash > 0 ? 'var(--warning)' : 'var(--danger)' }}>
                            {s.variance_cash >= 0 ? '+' : ''}{fmt(s.variance_cash)}
                          </span>
                        : '—'}
                    </td>
                    <td>
                      {s.variance_mpesa != null
                        ? <span style={{ fontWeight: 600, color: s.variance_mpesa === 0 ? 'var(--success)' : s.variance_mpesa > 0 ? 'var(--warning)' : 'var(--danger)' }}>
                            {s.variance_mpesa >= 0 ? '+' : ''}{fmt(s.variance_mpesa)}
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
              <label className="label">Opening Float (KES)</label>
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
                  <SummaryRow label="Total Revenue" value={fmt(total_revenue)} />
                  <SummaryRow label="Cash Sales" value={fmt(cash_sales)} />
                  <SummaryRow label="Card Sales" value={fmt(card_sales)} />
                  {split_sales > 0 && <SummaryRow label="Split Sales" value={fmt(split_sales)} />}
                  {total_tax > 0 && <SummaryRow label="Tax Collected" value={fmt(total_tax)} />}
                  {total_discounts > 0 && <SummaryRow label="Discounts Given" value={`-${fmt(total_discounts)}`} />}
                  {shift.status === 'closed' && (
                    <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
                      <SummaryRow label="Opening Float" value={fmt(shift.opening_float)} />
                      <SummaryRow label="Expected Cash" value={fmt(shift.expected_cash)} />
                      <SummaryRow label="Actual Cash" value={fmt(shift.actual_cash)} />
                      <SummaryRow
                        label="Cash Variance"
                        value={`${(shift.variance_cash || 0) >= 0 ? '+' : ''}${fmt(shift.variance_cash || 0)}`}
                        color={(shift.variance_cash || 0) === 0 ? 'var(--success)' : (shift.variance_cash || 0) > 0 ? 'var(--warning)' : 'var(--danger)'}
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
