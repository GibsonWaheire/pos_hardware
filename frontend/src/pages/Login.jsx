import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'

const DEPT_LABELS = {
  cashier:    { label: 'Cashier',           color: '#4f6ef7' },
  inventory:  { label: 'Inventory',         color: '#22c55e' },
  purchasing: { label: 'Purchasing',        color: '#f59e0b' },
  manager:    { label: 'Manager',           color: '#a855f7' },
  admin:      { label: 'Administration',    color: '#ef4444' },
}

const DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

export default function Login() {
  const { login } = useAuth()

  // Step 1 state
  const [step, setStep]         = useState(1)
  const [deptPin, setDeptPin]   = useState('')
  const [deptRole, setDeptRole] = useState(null)   // role returned after step 1

  // Step 2 state
  const [staffList, setStaffList] = useState([])
  const [staffId, setStaffId]     = useState('')
  const [persPin, setPersPin]     = useState('')

  // Shared
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  // ── Step 1: verify department PIN ──────────────────────────────────────────

  async function submitDept(pin) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/department', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department_pin: pin }),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Invalid department PIN'); setDeptPin(''); return }

      setDeptRole(data.role)

      // Load staff in this department for the name selector
      const sr = await fetch(`/api/auth/staff-in-role?role=${data.role}`, { credentials: 'include' })
      const sl = await sr.json()
      setStaffList(sl)
      setStep(2)
    } catch {
      // Offline fallback: try known defaults
      const defaults = { '0000':'admin','1111':'manager','2222':'cashier','3333':'inventory','4444':'purchasing' }
      const role = defaults[pin]
      if (role) { setDeptRole(role); setStep(2) }
      else { setError('Invalid department PIN') }
      setDeptPin('')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: verify personal PIN ────────────────────────────────────────────

  async function submitPersonal(pin) {
    setLoading(true)
    setError('')
    try {
      await login(pin, staffId || undefined, deptRole)
    } catch (e) {
      setError(e.message || 'Invalid PIN')
      setPersPin('')
    } finally {
      setLoading(false)
    }
  }

  // ── PIN pad press handler ─────────────────────────────────────────────────

  function press(d, current, setCurrent, onComplete) {
    if (d === '⌫') { setCurrent(p => p.slice(0, -1)); setError(''); return }
    if (d === '') return
    if (current.length >= 4) return
    const next = current + d
    setCurrent(next)
    if (next.length === 4) onComplete(next)
  }

  const pressDept = (d) => press(d, deptPin, setDeptPin, submitDept)
  const pressPers = (d) => press(d, persPin, setPersPin, submitPersonal)

  // Keyboard support
  const onKey = useCallback((e) => {
    if (e.key >= '0' && e.key <= '9') {
      if (step === 1) pressDept(e.key)
      else            pressPers(e.key)
    } else if (e.key === 'Backspace') {
      if (step === 1) pressDept('⌫')
      else            pressPers('⌫')
    }
  }, [step, deptPin, persPin])

  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  const dept = DEPT_LABELS[deptRole] || {}
  const currentPin = step === 1 ? deptPin : persPin

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.logo}>POS</div>
        <div style={s.storeName}>Hardware Store</div>

        {/* Step indicator */}
        <div style={s.steps}>
          <div style={{ ...s.stepDot, background: '#4f6ef7' }} />
          <div style={s.stepLine} />
          <div style={{ ...s.stepDot, background: step === 2 ? (dept.color || '#4f6ef7') : 'var(--border)' }} />
        </div>

        {step === 1 ? (
          <>
            <div style={s.title}>Department Access</div>
            <div style={s.hint}>Enter your department PIN</div>
          </>
        ) : (
          <>
            <div style={{ ...s.deptBadge, background: dept.color + '22', border: `1px solid ${dept.color}44`, color: dept.color }}>
              {dept.label} Department
            </div>
            <div style={s.title}>Personal PIN</div>

            {staffList.length > 1 && (
              <select
                style={s.select}
                value={staffId}
                onChange={e => { setStaffId(e.target.value); setPersPin(''); setError('') }}
              >
                <option value="">— Select your name —</option>
                {staffList.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
          </>
        )}

        {/* PIN dots */}
        <div style={s.dots}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              ...s.dot,
              background: i < currentPin.length
                ? (step === 2 ? (dept.color || '#4f6ef7') : '#4f6ef7')
                : 'var(--border)'
            }} />
          ))}
        </div>

        {error && <div style={s.error}>{error}</div>}

        {/* PIN pad */}
        <div style={s.pad}>
          {DIGITS.map((d, i) => (
            <button
              key={i}
              style={{ ...s.key, ...(d === '⌫' ? s.keyDel : {}), ...(d === '' ? s.keyEmpty : {}) }}
              onClick={() => step === 1 ? pressDept(d) : pressPers(d)}
              disabled={loading || d === ''}
            >
              {loading && d === '0' ? '…' : d}
            </button>
          ))}
        </div>

        {step === 2 && (
          <button onClick={() => { setStep(1); setDeptPin(''); setPersPin(''); setDeptRole(null); setError('') }} style={s.back}>
            ← Back
          </button>
        )}
      </div>
    </div>
  )
}

const s = {
  wrap:      { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' },
  card:      { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:'36px 32px', display:'flex', flexDirection:'column', alignItems:'center', gap:16, width:320 },
  logo:      { fontSize:32, fontWeight:800, color:'var(--accent)', letterSpacing:4 },
  storeName: { fontSize:12, color:'var(--text-muted)', marginTop:-12 },
  steps:     { display:'flex', alignItems:'center', gap:6 },
  stepDot:   { width:10, height:10, borderRadius:'50%', transition:'background .2s' },
  stepLine:  { width:28, height:2, background:'var(--border)' },
  title:     { fontSize:15, fontWeight:600, color:'var(--text)' },
  hint:      { fontSize:12, color:'var(--text-muted)', marginTop:-8 },
  deptBadge: { fontSize:12, fontWeight:600, padding:'4px 12px', borderRadius:20 },
  select:    { width:'100%', padding:'8px 12px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', fontSize:13 },
  dots:      { display:'flex', gap:12 },
  dot:       { width:14, height:14, borderRadius:'50%', transition:'background .15s' },
  error:     { color:'var(--danger)', fontSize:13, textAlign:'center' },
  pad:       { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10, width:'100%' },
  key:       { padding:'16px 0', fontSize:20, fontWeight:600, borderRadius:10, background:'var(--surface2)', border:'1px solid var(--border)', color:'var(--text)', cursor:'pointer', transition:'background .1s' },
  keyDel:    { fontSize:16, color:'var(--text-muted)' },
  keyEmpty:  { background:'transparent', border:'none', cursor:'default' },
  back:      { background:'none', border:'none', color:'var(--text-muted)', fontSize:13, cursor:'pointer', marginTop:-8 },
}
