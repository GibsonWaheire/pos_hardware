import React, { useState, useEffect } from 'react'
import { getAllStaff, createStaff, updateStaff, unlockStaff, getStaffActivity } from '../api'
import Pagination from '../components/Pagination'

const ROLES = ['cashier', 'inventory', 'purchasing', 'receiving', 'supplier', 'manager', 'admin']

const ROLE_COLOURS = {
  cashier:    { bg: '#dbeafe', color: '#1e40af' },
  inventory:  { bg: '#dcfce7', color: '#15803d' },
  purchasing: { bg: '#fef3c7', color: '#92400e' },
  receiving:  { bg: '#ccfbf1', color: '#0f766e' },
  supplier:   { bg: '#e0f2fe', color: '#075985' },
  manager:    { bg: '#f3e8ff', color: '#7e22ce' },
  admin:      { bg: '#fee2e2', color: '#dc2626' },
}

const PAGE_SIZE = 20

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const BLANK_FORM = { name: '', role: 'cashier', pin: '', personal_pin: '', department_pin: '' }

export default function StaffManagement() {
  const [staff, setStaff]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [page, setPage]             = useState(1)
  const [modal, setModal]           = useState(null)  // null | 'create' | 'edit'
  const [editing, setEditing]       = useState(null)  // staff object being edited
  const [form, setForm]             = useState(BLANK_FORM)
  const [saving, setSaving]         = useState(false)
  const [err, setErr]               = useState('')
  const [activityPanel, setActivityPanel] = useState(null)  // { staff, logs }
  const [activityLoading, setActivityLoading] = useState(false)
  const [unlocking, setUnlocking]   = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const r = await getAllStaff()
      setStaff(r.data || [])
    } catch {
      setStaff([])
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setForm(BLANK_FORM)
    setEditing(null)
    setErr('')
    setModal('create')
  }

  function openEdit(s) {
    setForm({ name: s.name, role: s.role, pin: '', personal_pin: '', department_pin: '' })
    setEditing(s)
    setErr('')
    setModal('edit')
  }

  async function handleSave() {
    if (!form.name.trim()) { setErr('Name is required'); return }
    setSaving(true)
    setErr('')
    try {
      const payload = {
        name: form.name.trim(),
        role: form.role,
        ...(form.pin           ? { pin:            form.pin }           : {}),
        ...(form.personal_pin  ? { personal_pin:   form.personal_pin }  : {}),
        ...(form.department_pin? { department_pin: form.department_pin }: {}),
      }
      if (modal === 'create') {
        await createStaff(payload)
      } else {
        await updateStaff(editing.id, payload)
      }
      setModal(null)
      await load()
    } catch (e) {
      setErr(e?.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(s) {
    try {
      await updateStaff(s.id, { is_active: !s.is_active })
      await load()
    } catch {
      alert('Failed to update status')
    }
  }

  async function handleUnlock(s) {
    setUnlocking(s.id)
    try {
      await unlockStaff(s.id)
      await load()
    } catch {
      alert('Failed to unlock account')
    } finally {
      setUnlocking(null)
    }
  }

  async function openActivity(s) {
    setActivityPanel({ staff: s, logs: [] })
    setActivityLoading(true)
    try {
      const r = await getStaffActivity(s.id)
      setActivityPanel({ staff: s, logs: r.data || [] })
    } catch {
      setActivityPanel({ staff: s, logs: [] })
    } finally {
      setActivityLoading(false)
    }
  }

  const visible = staff.filter(s => showInactive ? true : s.is_active)
  const paged   = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function isLocked(s) {
    if (!s.locked_until) return false
    return new Date(s.locked_until) > new Date()
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="page-header">
        <span className="page-title">Staff Management</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showInactive} onChange={e => { setShowInactive(e.target.checked); setPage(1) }} />
            Show inactive
          </label>
          <button className="btn btn-primary" onClick={openCreate}>+ Add Staff</button>
        </div>
      </div>

      {/* Summary row */}
      <div style={{ display: 'flex', gap: 10, padding: '8px 24px', flexShrink: 0, flexWrap: 'wrap' }}>
        {ROLES.map(r => {
          const count = staff.filter(s => s.role === r && s.is_active).length
          if (!count) return null
          const cs = ROLE_COLOURS[r] || {}
          return (
            <div key={r} style={{ ...cs, borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 600 }}>
              {r}: {count}
            </div>
          )
        })}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
          {staff.filter(s => s.is_active).length} active · {staff.filter(s => !s.is_active).length} inactive
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 24px' }}>
        {loading ? (
          <div className="empty-state" style={{ marginTop: 40 }}>Loading staff…</div>
        ) : visible.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 40 }}>No staff found</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={thS}>Name</th>
                <th style={thS}>Role</th>
                <th style={thS}>Status</th>
                <th style={thS}>PIN</th>
                <th style={thS}>Auth Card</th>
                <th style={thS}>Dept PIN</th>
                <th style={thS}>Joined</th>
                <th style={{ ...thS, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(s => {
                const locked = isLocked(s)
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', opacity: s.is_active ? 1 : 0.5 }}>
                    <td style={{ ...tdS, fontWeight: 600 }}>
                      {s.name}
                      {locked && (
                        <span style={{ marginLeft: 6, fontSize: 10, background: '#fee2e2', color: '#dc2626', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                          LOCKED
                        </span>
                      )}
                    </td>
                    <td style={tdS}>
                      <span style={{ ...(ROLE_COLOURS[s.role] || {}), padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                        {s.role}
                      </span>
                    </td>
                    <td style={tdS}>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: locked ? '#dc2626' : s.is_active ? '#15803d' : 'var(--text-muted)',
                      }}>
                        {locked ? 'Locked' : s.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={tdS}>
                      {s.has_personal_pin
                        ? <span style={{ color: '#15803d', fontSize: 12 }}>Set</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                      }
                    </td>
                    <td style={tdS}>
                      {s.has_auth_card
                        ? <span style={{ color: '#15803d', fontSize: 12 }}>Yes</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                      }
                    </td>
                    <td style={tdS}>
                      {s.has_dept_pin
                        ? <span style={{ color: '#15803d', fontSize: 12 }}>Set</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                      }
                    </td>
                    <td style={{ ...tdS, color: 'var(--text-muted)', fontSize: 12 }}>{fmtDate(s.created_at)}</td>
                    <td style={{ ...tdS, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openActivity(s)}>Activity</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>Edit</button>
                        {locked && (
                          <button className="btn btn-sm" style={{ background: '#fef3c7', color: '#92400e', border: 'none' }}
                            onClick={() => handleUnlock(s)} disabled={unlocking === s.id}>
                            {unlocking === s.id ? '…' : 'Unlock'}
                          </button>
                        )}
                        <button
                          className="btn btn-sm"
                          style={{ background: s.is_active ? '#fee2e2' : '#dcfce7', color: s.is_active ? '#dc2626' : '#15803d', border: 'none' }}
                          onClick={() => handleToggleActive(s)}
                        >
                          {s.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <Pagination total={visible.length} page={page} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>

      {/* Create / Edit modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 440 }}>
            <div className="modal-title">{modal === 'create' ? 'Add Staff Member' : `Edit — ${editing?.name}`}</div>

            <label className="label">Full Name</label>
            <input className="input" value={form.name} autoFocus
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={{ marginBottom: 12 }} />

            <label className="label">Role</label>
            <select className="input" value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              style={{ marginBottom: 12 }}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label className="label">
                  Personal PIN {modal === 'edit' && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(leave blank to keep)</span>}
                </label>
                <input className="input" type="password" placeholder="4–6 digits"
                  value={form.personal_pin}
                  onChange={e => setForm(f => ({ ...f, personal_pin: e.target.value }))} />
              </div>
              <div>
                <label className="label">
                  Dept / Login PIN {modal === 'edit' && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(blank = keep)</span>}
                </label>
                <input className="input" type="password" placeholder="Shared dept PIN"
                  value={form.department_pin}
                  onChange={e => setForm(f => ({ ...f, department_pin: e.target.value }))} />
              </div>
            </div>

            <label className="label">Legacy PIN (POS login PIN) {modal === 'edit' && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(blank = keep)</span>}</label>
            <input className="input" type="password" placeholder="4–6 digits"
              value={form.pin}
              onChange={e => setForm(f => ({ ...f, pin: e.target.value }))}
              style={{ marginBottom: 16 }} />

            {err && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{err}</div>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary btn-lg" style={{ flex: 2 }} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : modal === 'create' ? 'Create Staff' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activity panel */}
      {activityPanel && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-title">Activity — {activityPanel.staff.name}</div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {activityLoading ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
              ) : activityPanel.logs.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No activity on record</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={thS}>When</th>
                      <th style={thS}>Action</th>
                      <th style={thS}>Entity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityPanel.logs.map(l => (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...tdS, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDateTime(l.created_at)}</td>
                        <td style={{ ...tdS, fontWeight: 500 }}>
                          <span style={{ background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>
                            {l.action}
                          </span>
                        </td>
                        <td style={{ ...tdS, color: 'var(--text-muted)' }}>
                          {l.entity_type}{l.entity_name ? ` · ${l.entity_name}` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div style={{ padding: '12px 0 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={() => setActivityPanel(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const thS = { textAlign: 'left', padding: '8px 6px', color: 'var(--text-muted)', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }
const tdS = { padding: '8px 6px', verticalAlign: 'middle' }
