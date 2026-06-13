import { useState, useEffect, useRef } from 'react'
import { authorizeAction, requestOverrideApproval } from '../api'

/**
 * ManagerAuthModal — sudo-style elevation via card scan or manager PIN.
 *
 * Props:
 *   title           — modal heading (default "Manager Authorization")
 *   description     — sub-heading text
 *   onAuthorize     — called with result on success:
 *                     • no overridePayload: { token, authorizer, auth_method }
 *                     • with overridePayload: { id, manager_name, action } (OverrideApproval record)
 *   onCancel        — called when user dismisses (omit to hide cancel button)
 *   overridePayload — when set, calls POST /overrides/approve instead of /auth/authorize
 *                     must include { action, item_name, original_qty, new_qty? }
 */
export default function ManagerAuthModal({ title = 'Manager Authorization', description, onAuthorize, onCancel, overridePayload }) {
  const [tab, setTab]           = useState('card')
  const [cardInput, setCardInput] = useState('')
  const [pin, setPin]           = useState('')
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)
  const cardRef = useRef(null)

  const PIN_KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  // Re-focus card input whenever the card tab is active
  useEffect(() => {
    if (tab === 'card') setTimeout(() => cardRef.current?.focus(), 50)
  }, [tab])

  function switchTab(t) { setTab(t); setError(''); setPin(''); setCardInput('') }

  // ── Card submission ──────────────────────────────────────────────────────

  async function submitCard(code) {
    const c = code.trim()
    if (!c) return
    setBusy(true); setError('')
    try {
      const fn = overridePayload ? requestOverrideApproval : authorizeAction
      const payload = overridePayload ? { card_code: c, ...overridePayload } : { card_code: c }
      const res = await fn(payload)
      onAuthorize(res.data)
    } catch (e) {
      setError(e.message || 'Authorization failed')
      setCardInput('')
      cardRef.current?.focus()
    } finally { setBusy(false) }
  }

  function onCardKeyDown(e) {
    if (e.key === 'Enter') submitCard(cardInput)
  }

  // ── PIN submission ───────────────────────────────────────────────────────

  async function submitPin(p) {
    setBusy(true); setError('')
    try {
      const fn = overridePayload ? requestOverrideApproval : authorizeAction
      const payload = overridePayload ? { pin: p, ...overridePayload } : { pin: p }
      const res = await fn(payload)
      onAuthorize(res.data)
    } catch (e) {
      setError(e.message || 'Invalid PIN')
      setPin('')
    } finally { setBusy(false) }
  }

  function handlePinKey(k) {
    if (busy) return
    if (k === '⌫') { setPin(p => p.slice(0, -1)); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) setTimeout(() => submitPin(next), 80)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={overlay}>
      <div style={modal}>

        {/* Header */}
        <div style={header}>
          <span style={{ fontSize: 22 }}>🔐</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
            {description && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={tabRow}>
          <button style={tab === 'card' ? tabActive : tabInactive} onClick={() => switchTab('card')}>
            Scan Card
          </button>
          <button style={tab === 'pin' ? tabActive : tabInactive} onClick={() => switchTab('pin')}>
            Enter PIN
          </button>
        </div>

        {/* Card tab */}
        {tab === 'card' && (
          <div style={tabBody}>
            <p style={hint}>Scan or swipe the manager authorization card, then press Enter.</p>
            <input
              ref={cardRef}
              value={cardInput}
              onChange={e => setCardInput(e.target.value)}
              onKeyDown={onCardKeyDown}
              placeholder="Waiting for card scan..."
              style={cardInput_}
              disabled={busy}
              autoComplete="off"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                style={{ ...actionBtn, opacity: !cardInput.trim() || busy ? 0.5 : 1 }}
                onClick={() => submitCard(cardInput)}
                disabled={!cardInput.trim() || busy}
              >
                {busy ? 'Verifying…' : 'Submit'}
              </button>
            </div>
          </div>
        )}

        {/* PIN tab */}
        {tab === 'pin' && (
          <div style={tabBody}>
            <p style={hint}>Enter manager or admin PIN.</p>
            <div style={dotsRow}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{ ...dot, background: i < pin.length ? 'var(--primary,#4f6ef7)' : 'var(--border)' }} />
              ))}
            </div>
            <div style={grid}>
              {PIN_KEYS.map((k, i) => k === '' ? (
                <div key={i} />
              ) : (
                <button key={i} style={keyBtn} onClick={() => handlePinKey(k)} disabled={busy}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && <div style={errBox}>{error}</div>}

        {/* Footer */}
        {onCancel && (
          <div style={footer}>
            <button style={cancelBtn} onClick={onCancel} disabled={busy}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000,
}
const modal = {
  background: 'var(--surface)', borderRadius: 12, width: 340,
  boxShadow: '0 24px 64px rgba(0,0,0,0.45)', overflow: 'hidden',
  display: 'flex', flexDirection: 'column',
}
const header = {
  display: 'flex', alignItems: 'flex-start', gap: 12,
  padding: '20px 20px 16px', borderBottom: '1px solid var(--border)',
}
const tabRow = {
  display: 'flex', borderBottom: '1px solid var(--border)',
}
const tabBase = {
  flex: 1, padding: '10px', background: 'none', border: 'none',
  cursor: 'pointer', fontSize: 13, fontWeight: 600,
}
const tabActive   = { ...tabBase, color: 'var(--primary,#4f6ef7)', borderBottom: '2px solid var(--primary,#4f6ef7)' }
const tabInactive = { ...tabBase, color: 'var(--text-muted)', borderBottom: '2px solid transparent' }
const tabBody = { padding: '16px 20px 4px' }
const hint = { fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }
const cardInput_ = {
  width: '100%', padding: '10px 14px', borderRadius: 8,
  border: '2px solid var(--border)', background: 'var(--surface2)',
  color: 'var(--text)', fontSize: 14, boxSizing: 'border-box', outline: 'none',
}
const dotsRow = { display: 'flex', gap: 12, justifyContent: 'center', margin: '4px 0 16px' }
const dot = { width: 14, height: 14, borderRadius: '50%', transition: 'background 0.1s' }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 8 }
const keyBtn = {
  padding: '14px', fontSize: 18, fontWeight: 600, borderRadius: 8,
  background: 'var(--surface2)', border: '1px solid var(--border)',
  color: 'var(--text)', cursor: 'pointer',
}
const errBox = {
  margin: '8px 20px', padding: '8px 12px', borderRadius: 6,
  background: '#ef444420', color: '#ef4444', fontSize: 13,
}
const footer = {
  padding: '12px 20px 16px', display: 'flex', justifyContent: 'flex-end',
  borderTop: '1px solid var(--border)',
}
const cancelBtn = {
  padding: '7px 16px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13,
}
const actionBtn = {
  padding: '8px 18px', borderRadius: 6, border: 'none',
  background: 'var(--primary,#4f6ef7)', color: '#fff',
  cursor: 'pointer', fontSize: 13, fontWeight: 600,
}
