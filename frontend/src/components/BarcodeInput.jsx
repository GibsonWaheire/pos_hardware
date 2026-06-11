/**
 * BarcodeInput — dedicated field for HID barcode scanners.
 *
 * HID scanners act as keyboard input: they type characters rapidly and send
 * Enter at the end. This component:
 *  - Stays focused (auto-refocuses after each scan)
 *  - Detects scanner speed: chars arriving < 50ms apart = scanner input
 *  - On Enter: looks up the barcode via API and adds product to cart
 *  - Falls back to manual input if the user types slowly
 */

import { useRef, useState, useEffect } from 'react'
import { getProductByBarcode } from '../api'

export default function BarcodeInput({ onScan }) {
  const [value, setValue] = useState('')
  const [status, setStatus] = useState('')  // '' | 'scanning' | 'found' | 'not-found' | 'error'
  const inputRef = useRef(null)
  const lastKeyTime = useRef(0)
  const scannerMode = useRef(false)

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleKeyDown(e) {
    const now = Date.now()
    const gap = now - lastKeyTime.current
    lastKeyTime.current = now

    // If chars arrive very fast (<50ms between keys), it's a scanner
    if (gap < 50) {
      scannerMode.current = true
    } else if (gap > 200) {
      scannerMode.current = false
    }
  }

  async function handleKeyUp(e) {
    if (e.key !== 'Enter') return
    const barcode = value.trim()
    if (!barcode) return

    setValue('')
    setStatus('scanning')

    try {
      const res = await getProductByBarcode(barcode)
      setStatus('found')
      onScan(res.data)
      setTimeout(() => setStatus(''), 1000)
    } catch (err) {
      if (err.message?.includes('not found') || err.message?.includes('404')) {
        setStatus('not-found')
      } else {
        setStatus('error')
      }
      setTimeout(() => setStatus(''), 2000)
    }

    // Re-focus for next scan
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const statusColors = {
    scanning: 'var(--text-muted)',
    found: 'var(--success)',
    'not-found': 'var(--danger)',
    error: 'var(--warning)',
  }

  const statusText = {
    scanning: '⏳ Looking up...',
    found: '✓ Product added',
    'not-found': '✗ Barcode not found',
    error: '⚠ Lookup error',
  }

  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            fontSize: 16, pointerEvents: 'none',
          }}>
            🔍
          </span>
          <input
            ref={inputRef}
            className="input"
            style={{
              paddingLeft: 36,
              borderColor: status === 'found' ? 'var(--success)'
                : status === 'not-found' ? 'var(--danger)'
                : undefined,
            }}
            placeholder="Scan barcode here (auto-focus)..."
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onBlur={() => setTimeout(() => inputRef.current?.focus(), 200)}
          />
        </div>
        {status && (
          <span style={{ color: statusColors[status], fontSize: 13, whiteSpace: 'nowrap' }}>
            {statusText[status]}
          </span>
        )}
      </div>
    </div>
  )
}
