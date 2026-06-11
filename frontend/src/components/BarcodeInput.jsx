/**
 * BarcodeInput — handles both barcode scanner (HID) and PLU code entry.
 *
 * Barcode scanner: Types characters very fast (<50ms/char) and sends Enter.
 * PLU entry:       User manually types a short code (e.g. "4011") and presses Enter.
 *
 * Both trigger the same onScan callback with the found product.
 * If priceCheckMode=true, product info is shown without adding to cart.
 */

import { useRef, useState, useEffect } from 'react'
import { getProductByBarcode, getProductByPlu } from '../api'

export default function BarcodeInput({ onScan, priceCheckMode = false }) {
  const [value, setValue] = useState('')
  const [status, setStatus] = useState('')
  const [mode, setMode] = useState('barcode')  // barcode | plu
  const inputRef = useRef(null)
  const lastKeyTime = useRef(0)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleKeyUp(e) {
    if (e.key !== 'Enter') return
    const code = value.trim()
    if (!code) return
    setValue('')
    setStatus('scanning')

    try {
      let res
      if (mode === 'plu') {
        res = await getProductByPlu(code)
      } else {
        // Try barcode first, fall back to PLU
        try {
          res = await getProductByBarcode(code)
        } catch {
          res = await getProductByPlu(code)
        }
      }
      setStatus(priceCheckMode ? 'checked' : 'found')
      onScan(res.data)
      setTimeout(() => setStatus(''), 1200)
    } catch {
      setStatus('not-found')
      setTimeout(() => setStatus(''), 2000)
    }

    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const statusColors = { scanning: 'var(--text-muted)', found: 'var(--success)', checked: 'var(--warning)', 'not-found': 'var(--danger)' }
  const statusText = { scanning: '⏳ Looking up...', found: '✓ Added to cart', checked: '🔍 Price checked', 'not-found': '✗ Not found' }

  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {/* Mode toggle */}
        <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, padding: 2, flexShrink: 0 }}>
          {['barcode', 'plu'].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11,
              fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
              background: mode === m ? 'var(--accent)' : 'none',
              color: mode === m ? '#fff' : 'var(--text-muted)',
            }}>
              {m === 'barcode' ? '📊 Barcode' : '🔢 PLU'}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', flex: 1 }}>
          <input
            ref={inputRef}
            className="input"
            style={{
              borderColor: status === 'found' ? 'var(--success)'
                : status === 'not-found' ? 'var(--danger)'
                : status === 'checked' ? 'var(--warning)'
                : undefined,
            }}
            placeholder={mode === 'plu'
              ? 'Enter PLU code (e.g. 4011)...'
              : 'Scan barcode here (auto-focus)...'}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyUp={handleKeyUp}
            onBlur={() => setTimeout(() => inputRef.current?.focus(), 200)}
          />
        </div>

        {status && (
          <span style={{ color: statusColors[status], fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {statusText[status]}
          </span>
        )}
      </div>
    </div>
  )
}
