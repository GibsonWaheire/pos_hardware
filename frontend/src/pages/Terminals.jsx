import { useState, useEffect } from 'react'
import { getTerminals, registerTerminal, updateTerminal, getVoidLogs, getVoidStats, recordNoSale } from '../api'
import { useCurrency } from '../context/CurrencyContext'

export default function Terminals() {
  const { fmt } = useCurrency()
  const [terminals, setTerminals] = useState([])
  const [voidStats, setVoidStats] = useState(null)
  const [voidLogs, setVoidLogs] = useState([])
  const [tab, setTab] = useState('terminals')
  const [regForm, setRegForm] = useState({ terminal_id: '', name: '', location: '' })
  const [noSaleModal, setNoSaleModal] = useState(false)
  const [noSaleForm, setNoSaleForm] = useState({ manager_pin: '', reason: '', cashier_name: '', terminal_id: '', open_drawer: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    try {
      const today = new Date().toISOString().split('T')[0]
      const [t, vs, vl] = await Promise.all([
        getTerminals(),
        getVoidStats({ date_from: today, date_to: today }),
        getVoidLogs({ limit: 50 }),
      ])
      setTerminals(t.data)
      setVoidStats(vs.data)
      setVoidLogs(vl.data)
    } catch (e) { console.error(e) }
  }

  async function handleRegister() {
    if (!regForm.terminal_id) { setError('Terminal ID is required'); return }
    setSaving(true); setError(''); setMsg('')
    try {
      await registerTerminal(regForm)
      setRegForm({ terminal_id: '', name: '', location: '' })
      setMsg('Terminal registered successfully')
      loadAll()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  async function handleNoSale() {
    setSaving(true); setError('')
    try {
      await recordNoSale(noSaleForm)
      setNoSaleModal(false)
      setNoSaleForm({ manager_pin: '', reason: '', cashier_name: '', terminal_id: '', open_drawer: false })
      loadAll()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  async function toggleTerminal(terminal) {
    try { await updateTerminal(terminal.id, { is_active: !terminal.is_active }); loadAll() }
    catch (e) { alert(e.message) }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Terminals & Void Log</span>
        <button className="btn btn-ghost" onClick={() => { setNoSaleForm({ manager_pin: '', reason: '', cashier_name: '', terminal_id: '', open_drawer: false }); setError(''); setNoSaleModal(true) }}>
          No-Sale / Drawer Open
        </button>
      </div>

      {/* Today's void stats */}
      {voidStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '0 24px 16px' }}>
          <StatCard label="Voids Today" value={voidStats.total_voids} color={voidStats.total_voids > 0 ? 'var(--warning)' : undefined} />
          <StatCard label="Voided Amount" value={fmt(voidStats.voided_amount)} color={voidStats.voided_amount > 0 ? 'var(--danger)' : undefined} />
          <StatCard label="No-Sales Today" value={voidStats.total_no_sales} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, padding: '0 24px', borderBottom: '1px solid var(--border)' }}>
        {[['terminals', 'Terminals'], ['voids', 'Void Log']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
            color: tab === key ? 'var(--accent)' : 'var(--text-muted)',
            borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
            fontWeight: tab === key ? 600 : 400, fontSize: 14,
          }}>{label}</button>
        ))}
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'terminals' ? (
          <>
            {/* Register new terminal */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Register Terminal</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                <div>
                  <label className="label">Terminal ID *</label>
                  <input className="input" placeholder="e.g. LANE-1" value={regForm.terminal_id}
                    onChange={e => setRegForm({ ...regForm, terminal_id: e.target.value })} />
                </div>
                <div>
                  <label className="label">Display Name</label>
                  <input className="input" placeholder="e.g. Register 1" value={regForm.name}
                    onChange={e => setRegForm({ ...regForm, name: e.target.value })} />
                </div>
                <div>
                  <label className="label">Location</label>
                  <input className="input" placeholder="e.g. Front checkout" value={regForm.location}
                    onChange={e => setRegForm({ ...regForm, location: e.target.value })} />
                </div>
                <button className="btn btn-primary" onClick={handleRegister} disabled={saving}>Register</button>
              </div>
              {error && <p className="error-msg" style={{ marginTop: 8 }}>{error}</p>}
              {msg && <p className="success-msg" style={{ marginTop: 8 }}>{msg}</p>}
            </div>

            <div className="card" style={{ padding: 0 }}>
              <table className="table">
                <thead>
                  <tr><th>Terminal ID</th><th>Name</th><th>Location</th><th>IP</th><th>Last Seen</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {terminals.length === 0 ? (
                    <tr><td colSpan={7} className="empty-state">No terminals registered yet</td></tr>
                  ) : terminals.map(t => (
                    <tr key={t.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{t.terminal_id}</td>
                      <td>{t.name}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{t.location || '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{t.ip_address || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {t.last_seen ? new Date(t.last_seen).toLocaleString() : 'Never'}
                      </td>
                      <td>
                        <span className={`badge ${t.online ? 'badge-green' : t.is_active ? 'badge-yellow' : 'badge-red'}`}>
                          {t.online ? 'Online' : t.is_active ? 'Offline' : 'Disabled'}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleTerminal(t)}>
                          {t.is_active ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr><th>Date/Time</th><th>Type</th><th>Receipt</th><th>Amount</th><th>Terminal</th><th>Cashier</th><th>Manager</th><th>Reason</th></tr>
              </thead>
              <tbody>
                {voidLogs.length === 0 ? (
                  <tr><td colSpan={8} className="empty-state">No void activity</td></tr>
                ) : voidLogs.map(v => (
                  <tr key={v.id}>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(v.created_at).toLocaleString()}
                    </td>
                    <td>
                      <span className={`badge ${v.type === 'void_sale' ? 'badge-red' : 'badge-yellow'}`}>
                        {v.type === 'void_sale' ? 'VOID' : 'NO-SALE'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{v.receipt_number || '—'}</td>
                    <td style={{ color: v.amount ? 'var(--danger)' : 'var(--text-muted)' }}>
                      {v.amount ? `-$${v.amount.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{v.terminal_id || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{v.cashier_name || '—'}</td>
                    <td style={{ fontWeight: 500 }}>{v.manager_name}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{v.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* No-sale modal */}
      {noSaleModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setNoSaleModal(false)}>
          <div className="modal" style={{ width: 420 }}>
            <div className="modal-title">No-Sale / Drawer Open</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
              Requires manager PIN. This action is logged.
            </p>
            <div className="form-group">
              <label className="label">Manager PIN *</label>
              <input className="input" type="password" maxLength={6}
                value={noSaleForm.manager_pin} onChange={e => setNoSaleForm({ ...noSaleForm, manager_pin: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="label">Cashier Name</label>
                <input className="input" value={noSaleForm.cashier_name}
                  onChange={e => setNoSaleForm({ ...noSaleForm, cashier_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Terminal ID</label>
                <input className="input" value={noSaleForm.terminal_id}
                  onChange={e => setNoSaleForm({ ...noSaleForm, terminal_id: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="label">Reason</label>
              <input className="input" placeholder="e.g. Cash count, give change..."
                value={noSaleForm.reason} onChange={e => setNoSaleForm({ ...noSaleForm, reason: e.target.value })} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={noSaleForm.open_drawer}
                onChange={e => setNoSaleForm({ ...noSaleForm, open_drawer: e.target.checked })} />
              Open cash drawer
            </label>
            {error && <p className="error-msg">{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setNoSaleModal(false)}>Cancel</button>
              <button className="btn btn-warning" onClick={handleNoSale} disabled={saving}
                style={{ background: 'var(--warning)', color: '#000' }}>
                {saving ? 'Processing...' : 'Authorize'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div className="card">
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
    </div>
  )
}
