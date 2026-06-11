import { useState, useEffect } from 'react'
import {
  getAppointments, createAppointment, updateAppointment,
  updateAppointmentStatus, deleteAppointment,
  getServices, getStaff, getCustomers,
} from '../api'

const STATUS_COLORS = {
  scheduled: '#6b7280',
  confirmed: '#3b82f6',
  checked_in: '#f59e0b',
  in_progress: '#8b5cf6',
  completed: '#10b981',
  cancelled: '#ef4444',
  no_show: '#f97316',
}

const STATUS_FLOW = {
  scheduled: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
}

function getWeekDays(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
  const monday = new Date(d.setDate(diff))
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday)
    day.setDate(monday.getDate() + i)
    return day
  })
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8) // 8am–8pm
const HOUR_HEIGHT = 60 // px per hour

const BLANK_FORM = {
  client_name: '', client_phone: '', client_id: '',
  staff_id: '', start_time: '', notes: '',
  services: [],
}

export default function Appointments() {
  const [weekStart, setWeekStart] = useState(new Date())
  const [appointments, setAppointments] = useState([])
  const [services, setServices] = useState([])
  const [staff, setStaff] = useState([])
  const [modal, setModal] = useState(null)   // null | 'add' | 'detail'
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(BLANK_FORM)
  const [pickedServices, setPickedServices] = useState([])  // [{service, staff_id}]
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState('week')   // week | list

  const weekDays = getWeekDays(weekStart)
  const dateFrom = weekDays[0].toISOString().split('T')[0]
  const dateTo = weekDays[6].toISOString().split('T')[0]

  useEffect(() => { loadRef() }, [])
  useEffect(() => { loadAppts() }, [dateFrom])

  async function loadRef() {
    const [s, st] = await Promise.all([getServices({ active_only: 1 }), getStaff()])
    setServices(s.data)
    setStaff(st.data)
  }

  async function loadAppts() {
    try {
      const r = await getAppointments({ date_from: dateFrom, date_to: dateTo })
      setAppointments(r.data)
    } catch (e) { console.error(e) }
  }

  function prevWeek() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }
  function nextWeek() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }
  function goToday() { setWeekStart(new Date()) }

  function openAdd(day, hour) {
    const dt = new Date(day)
    dt.setHours(hour, 0, 0, 0)
    setForm({ ...BLANK_FORM, start_time: dt.toISOString().slice(0, 16) })
    setPickedServices([])
    setError('')
    setModal('add')
  }

  function openDetail(appt) {
    setSelected(appt)
    setModal('detail')
  }

  function addServiceRow() {
    if (services.length === 0) return
    setPickedServices([...pickedServices, { service_id: services[0].id, staff_id: form.staff_id }])
  }

  function removeServiceRow(i) {
    setPickedServices(pickedServices.filter((_, idx) => idx !== i))
  }

  async function save() {
    if (!form.client_name) { setError('Client name is required'); return }
    if (!form.start_time) { setError('Start time is required'); return }
    if (pickedServices.length === 0) { setError('Add at least one service'); return }

    setSaving(true); setError('')
    const svcs = pickedServices.map(ps => {
      const svc = services.find(s => s.id === parseInt(ps.service_id))
      return {
        service_id: svc?.id,
        service_name: svc?.name,
        staff_id: ps.staff_id ? parseInt(ps.staff_id) : (form.staff_id ? parseInt(form.staff_id) : null),
        price: svc?.price ?? 0,
        duration_minutes: svc?.duration_minutes ?? 30,
      }
    })

    try {
      await createAppointment({
        client_name: form.client_name,
        client_phone: form.client_phone,
        staff_id: form.staff_id ? parseInt(form.staff_id) : null,
        start_time: new Date(form.start_time).toISOString(),
        notes: form.notes,
        services: svcs,
      })
      setModal(null)
      loadAppts()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  async function changeStatus(appt, status) {
    try {
      await updateAppointmentStatus(appt.id, status)
      loadAppts()
      if (selected?.id === appt.id) {
        setSelected({ ...selected, status })
      }
    } catch (e) { alert(e.message) }
  }

  // Position appointment block in calendar
  function apptStyle(appt, dayIndex) {
    const start = new Date(appt.start_time)
    const end = new Date(appt.end_time)
    const startH = start.getHours() + start.getMinutes() / 60
    const endH = end.getHours() + end.getMinutes() / 60
    const top = (startH - 8) * HOUR_HEIGHT
    const height = Math.max((endH - startH) * HOUR_HEIGHT, 24)
    return {
      position: 'absolute',
      top, left: 2, right: 2, height,
      background: STATUS_COLORS[appt.status] + 'cc',
      borderLeft: `3px solid ${STATUS_COLORS[appt.status]}`,
      borderRadius: 4, padding: '2px 4px', overflow: 'hidden',
      cursor: 'pointer', fontSize: 11, color: '#fff', lineHeight: 1.3,
      zIndex: 1,
    }
  }

  const todayStr = new Date().toISOString().split('T')[0]

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Appointments</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, padding: 2 }}>
            {['week', 'list'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
                background: view === v ? 'var(--accent)' : 'none',
                color: view === v ? '#fff' : 'var(--text-muted)',
              }}>{v === 'week' ? 'Week' : 'List'}</button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={prevWeek}>&lt;</button>
          <button className="btn btn-ghost btn-sm" onClick={goToday}>Today</button>
          <button className="btn btn-ghost btn-sm" onClick={nextWeek}>&gt;</button>
          <button className="btn btn-primary" onClick={() => openAdd(new Date(), new Date().getHours())}>
            + Appointment
          </button>
        </div>
      </div>

      {view === 'week' ? (
        <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 24px' }}>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '50px repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
            <div />
            {weekDays.map((day, i) => {
              const dayStr = day.toISOString().split('T')[0]
              const isToday = dayStr === todayStr
              return (
                <div key={i} style={{
                  padding: '8px 4px', textAlign: 'center', fontSize: 13,
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? 'var(--accent)' : 'var(--text)',
                  borderLeft: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {day.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div>{day.getDate()}</div>
                </div>
              )
            })}
          </div>

          {/* Time grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '50px repeat(7, 1fr)' }}>
            {/* Hour labels */}
            <div>
              {HOURS.map(h => (
                <div key={h} style={{ height: HOUR_HEIGHT, fontSize: 11, color: 'var(--text-muted)', paddingTop: 4, textAlign: 'right', paddingRight: 6 }}>
                  {h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`}
                </div>
              ))}
            </div>
            {/* Day columns */}
            {weekDays.map((day, di) => {
              const dayStr = day.toISOString().split('T')[0]
              const dayAppts = appointments.filter(a => a.start_time?.startsWith(dayStr))
              return (
                <div key={di} style={{
                  position: 'relative', borderLeft: '1px solid var(--border)',
                  height: HOURS.length * HOUR_HEIGHT,
                }}>
                  {HOURS.map(h => (
                    <div key={h} style={{
                      position: 'absolute', top: (h - 8) * HOUR_HEIGHT, left: 0, right: 0,
                      height: HOUR_HEIGHT, borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                    }} onClick={() => openAdd(day, h)} />
                  ))}
                  {dayAppts.map(a => (
                    <div key={a.id} style={apptStyle(a, di)} onClick={e => { e.stopPropagation(); openDetail(a) }}>
                      <div style={{ fontWeight: 600 }}>{a.client_name}</div>
                      <div style={{ opacity: 0.85 }}>{a.services?.[0]?.service_name}</div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>
          <div className="card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr><th>Date/Time</th><th>Client</th><th>Services</th><th>Staff</th><th>Duration</th><th>Total</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {appointments.length === 0 ? (
                  <tr><td colSpan={8} className="empty-state">No appointments this week</td></tr>
                ) : appointments.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      {new Date(a.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}<br />
                      <span style={{ color: 'var(--text-muted)' }}>{new Date(a.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{a.client_name}</div>
                      {a.client_phone && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.client_phone}</div>}
                    </td>
                    <td style={{ fontSize: 12 }}>{a.services?.map(s => s.service_name).join(', ') || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{a.staff_name || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {a.services ? a.services.reduce((s, x) => s + x.duration_minutes, 0) : 0} min
                    </td>
                    <td style={{ fontWeight: 600 }}>${(a.total_price || 0).toFixed(2)}</td>
                    <td>
                      <span style={{
                        background: STATUS_COLORS[a.status] + '33', color: STATUS_COLORS[a.status],
                        padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                      }}>{a.status.replace('_', ' ')}</span>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => openDetail(a)}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create modal */}
      {modal === 'add' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ width: 520, maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-title">New Appointment</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="label">Client Name *</label>
                <input className="input" value={form.client_name}
                  onChange={e => setForm({ ...form, client_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Phone</label>
                <input className="input" value={form.client_phone}
                  onChange={e => setForm({ ...form, client_phone: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="label">Start Time *</label>
                <input className="input" type="datetime-local" value={form.start_time}
                  onChange={e => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Primary Staff</label>
                <select className="input" value={form.staff_id}
                  onChange={e => setForm({ ...form, staff_id: e.target.value })}>
                  <option value="">Unassigned</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label className="label" style={{ margin: 0 }}>Services *</label>
                <button className="btn btn-ghost btn-sm" onClick={addServiceRow}>+ Add</button>
              </div>
              {pickedServices.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>No services added yet</div>
              )}
              {pickedServices.map((ps, i) => {
                const svc = services.find(s => s.id === parseInt(ps.service_id))
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <select className="input" value={ps.service_id}
                      onChange={e => setPickedServices(pickedServices.map((x, xi) => xi === i ? { ...x, service_id: e.target.value } : x))}>
                      {services.map(s => <option key={s.id} value={s.id}>{s.name} (${s.price})</option>)}
                    </select>
                    <select className="input" value={ps.staff_id}
                      onChange={e => setPickedServices(pickedServices.map((x, xi) => xi === i ? { ...x, staff_id: e.target.value } : x))}>
                      <option value="">Primary staff</option>
                      {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button className="btn btn-ghost btn-sm" onClick={() => removeServiceRow(i)} style={{ color: 'var(--danger)' }}>×</button>
                  </div>
                )
              })}
              {pickedServices.length > 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'right' }}>
                  Total: ${pickedServices.reduce((sum, ps) => {
                    const svc = services.find(s => s.id === parseInt(ps.service_id))
                    return sum + (svc?.price || 0)
                  }, 0).toFixed(2)} •{' '}
                  {pickedServices.reduce((sum, ps) => {
                    const svc = services.find(s => s.id === parseInt(ps.service_id))
                    return sum + (svc?.duration_minutes || 0)
                  }, 0)} min
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="label">Notes</label>
              <input className="input" placeholder="Allergies, preferences, special requests..."
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Booking...' : 'Book Appointment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {modal === 'detail' && selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ width: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div className="modal-title" style={{ marginBottom: 2 }}>{selected.client_name}</div>
                {selected.client_phone && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{selected.client_phone}</div>}
              </div>
              <span style={{
                background: STATUS_COLORS[selected.status] + '33', color: STATUS_COLORS[selected.status],
                padding: '4px 12px', borderRadius: 12, fontSize: 13, fontWeight: 600,
              }}>{selected.status.replace('_', ' ')}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, fontSize: 13 }}>
              <div>
                <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Start</div>
                <div>{new Date(selected.start_time).toLocaleString()}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>End</div>
                <div>{new Date(selected.end_time).toLocaleString()}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Staff</div>
                <div>{selected.staff_name || 'Unassigned'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Total</div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>${(selected.total_price || 0).toFixed(2)}</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Services</div>
              {selected.services?.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{s.service_name}</span>
                    {s.staff_name && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>• {s.staff_name}</span>}
                  </div>
                  <div>${s.price.toFixed(2)}</div>
                </div>
              ))}
            </div>

            {selected.notes && (
              <div style={{ marginBottom: 16, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 6, fontSize: 13, color: 'var(--text-muted)' }}>
                {selected.notes}
              </div>
            )}

            {/* Status transitions */}
            {STATUS_FLOW[selected.status]?.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {STATUS_FLOW[selected.status].map(s => (
                  <button key={s} onClick={() => changeStatus(selected, s)}
                    style={{
                      padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: STATUS_COLORS[s] + '22', color: STATUS_COLORS[s],
                      fontWeight: 600, fontSize: 13,
                    }}>
                    → {s.replace('_', ' ')}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
