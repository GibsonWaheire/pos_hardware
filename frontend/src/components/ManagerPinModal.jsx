import { useState } from 'react'
import { verifyPin } from '../api'

/**
 * Inline PIN override modal for manager-only actions.
 *
 * Usage:
 *   <ManagerPinModal
 *     title="Void Sale"
 *     onConfirm={(manager) => doVoid(manager)}
 *     onClose={() => setShowModal(false)}
 *   />
 */
export default function ManagerPinModal({ title = 'Manager Approval', onConfirm, onClose }) {
  const [pin, setPin]     = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy]   = useState(false)

  const DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  async function press(d) {
    if (d === '⌫') { setPin(p => p.slice(0, -1)); setError(''); return }
    if (d === '') return
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    if (next.length === 4) await verify(next)
  }

  async function verify(p) {
    setBusy(true)
    setError('')
    try {
      const res = await verifyPin(p)
      const staff = res.data?.staff || res.data
      const role = staff?.role
      if (!['manager', 'admin'].includes(role)) {
        setError('Manager or admin PIN required')
        setPin('')
        return
      }
      onConfirm(staff)
    } catch {
      setError('Invalid PIN')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={overlay}>
      <div style={card}>
        <div style={header}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{title}</span>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
          Requires manager PIN to continue
        </div>

        <div style={dots}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ ...dot, background: i < pin.length ? 'var(--accent)' : 'var(--border)' }} />
          ))}
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 13, textAlign: 'center' }}>{error}</div>}

        <div style={pad}>
          {DIGITS.map((d, i) => (
            <button
              key={i}
              style={{ ...key, ...(d === '' ? keyEmpty : {}), ...(d === '⌫' ? keyDel : {}) }}
              onClick={() => press(d)}
              disabled={busy || d === ''}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
}
const card = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
  padding: '28px 32px', width: 300, display: 'flex', flexDirection: 'column',
  gap: 16,
}
const header = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
}
const closeBtn = {
  background: 'none', border: 'none', color: 'var(--text-muted)',
  cursor: 'pointer', fontSize: 16,
}
const dots = {
  display: 'flex', gap: 10, justifyContent: 'center',
}
const dot = {
  width: 12, height: 12, borderRadius: '50%', transition: 'background .15s',
}
const pad = {
  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
}
const key = {
  padding: '14px 0', fontSize: 18, fontWeight: 600, borderRadius: 8,
  background: 'var(--surface2)', border: '1px solid var(--border)',
  color: 'var(--text)', cursor: 'pointer',
}
const keyEmpty = { background: 'transparent', border: 'none', cursor: 'default' }
const keyDel   = { fontSize: 14, color: 'var(--text-muted)' }
