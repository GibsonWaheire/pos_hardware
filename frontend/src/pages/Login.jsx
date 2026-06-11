import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getStaff } from '../api'

const DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

export default function Login() {
  const { login } = useAuth()
  const [pin, setPin]         = useState('')
  const [staff, setStaff]     = useState([])
  const [staffId, setStaffId] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getStaff().then(r => setStaff(r.data || [])).catch(() => {})
  }, [])

  function press(d) {
    if (d === '⌫') { setPin(p => p.slice(0, -1)); setError(''); return }
    if (d === '')  return
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    if (next.length === 4) submit(next)
  }

  async function submit(p = pin) {
    if (p.length < 4) return
    setLoading(true)
    setError('')
    try {
      await login(p, staffId || undefined)
    } catch (e) {
      setError(e.message || 'Invalid PIN')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  // Keyboard support
  useEffect(() => {
    function onKey(e) {
      if (e.key >= '0' && e.key <= '9') press(e.key)
      else if (e.key === 'Backspace') press('⌫')
      else if (e.key === 'Enter') submit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pin, staffId])

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.logo}>POS</div>
        <div style={styles.subtitle}>Hardware Store</div>

        {staff.length > 1 && (
          <select
            style={styles.select}
            value={staffId}
            onChange={e => { setStaffId(e.target.value); setPin(''); setError('') }}
          >
            <option value="">— Select staff —</option>
            {staff.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
            ))}
          </select>
        )}

        <div style={styles.dots}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ ...styles.dot, background: i < pin.length ? 'var(--accent)' : 'var(--border)' }} />
          ))}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.pad}>
          {DIGITS.map((d, i) => (
            <button
              key={i}
              style={{ ...styles.key, ...(d === '⌫' ? styles.keyDel : {}), ...(d === '' ? styles.keyEmpty : {}) }}
              onClick={() => press(d)}
              disabled={loading || d === ''}
            >
              {loading && d === '0' ? '...' : d}
            </button>
          ))}
        </div>

        <div style={styles.hint}>Enter your 4-digit PIN</div>
      </div>
    </div>
  )
}

const styles = {
  wrap: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg)',
  },
  card: {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
    padding: '40px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 20, width: 320,
  },
  logo: {
    fontSize: 32, fontWeight: 800, color: 'var(--accent)', letterSpacing: 4,
  },
  subtitle: {
    fontSize: 13, color: 'var(--text-muted)', marginTop: -12,
  },
  select: {
    width: '100%', padding: '8px 12px', background: 'var(--surface2)',
    border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)',
    fontSize: 13,
  },
  dots: {
    display: 'flex', gap: 12, margin: '8px 0',
  },
  dot: {
    width: 14, height: 14, borderRadius: '50%', transition: 'background .15s',
  },
  error: {
    color: 'var(--danger)', fontSize: 13, textAlign: 'center',
  },
  pad: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, width: '100%',
  },
  key: {
    padding: '16px 0', fontSize: 20, fontWeight: 600, borderRadius: 10,
    background: 'var(--surface2)', border: '1px solid var(--border)',
    color: 'var(--text)', cursor: 'pointer', transition: 'background .1s',
  },
  keyDel: {
    fontSize: 16, color: 'var(--text-muted)',
  },
  keyEmpty: {
    background: 'transparent', border: 'none', cursor: 'default',
  },
  hint: {
    fontSize: 12, color: 'var(--text-muted)',
  },
}
