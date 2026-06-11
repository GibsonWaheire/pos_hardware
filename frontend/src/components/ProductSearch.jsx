/**
 * ProductSearch — quick product lookup dropdown for manual add.
 * Used as an alternative to clicking product tiles.
 */

import { useState, useRef, useEffect } from 'react'
import { getProducts } from '../api'

export default function ProductSearch({ onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await getProducts({ q: query, active: 'true' })
        setResults(res.data.slice(0, 8))
        setOpen(true)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }, 200)
  }, [query])

  function handleSelect(product) {
    onSelect(product)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="input"
        placeholder="Quick search product..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, overflow: 'hidden', marginTop: 4,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {results.map(p => (
            <div
              key={p.id}
              onClick={() => handleSelect(p)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <div>
                <div style={{ fontWeight: 500 }}>{p.name}</div>
                {p.barcode && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.barcode}</div>}
              </div>
              <div style={{ fontWeight: 700, color: 'var(--accent)' }}>${p.price.toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
