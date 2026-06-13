import { useState, useEffect, useRef } from 'react'
import { useCurrency } from '../context/CurrencyContext'

const TIPS = [
  'Manager card required to remove any item from the bill',
  'All transactions are logged and audited in real time',
  'Scan barcode or type to search — Enter to add',
  'Items with no price cannot be added to the bill',
  'Void All requires manager authorization',
]

// Hardware silhouettes — larger, more varied positions for the bill column
const SHAPES = [
  { id: 'bolt',   path: 'M13 2L4.5 13.5H11L9 22l10-12.5H13Z',                                                                                                              dur: 18, x: 6,  y: 4,  r: 12,  size: 110 },
  { id: 'wrench', path: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z', dur: 24, x: 70, y: 8,  r: -25, size: 130 },
  { id: 'pipe',   path: 'M4 10h16v4H4zM6 8v8M18 8v8',                                                                                                                      dur: 31, x: 55, y: 68, r: 45,  size: 100 },
  { id: 'gear',   path: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 0v2m0-8V7m5 5h2M7 12H5m8.66 3.54 1.41 1.41M6.34 6.34l1.41 1.41M17.66 6.34l-1.41 1.41M7.76 17.66 6.34 16.24', dur: 22, x: 80, y: 52, r: 0,   size: 120 },
  { id: 'hammer', path: 'M15 5l4 4-9 9-4-4 9-9zM2 22l4-4',                                                                                                                 dur: 28, x: 22, y: 62, r: 0,   size: 96  },
  { id: 'tin',    path: 'M5 4h14a1 1 0 0 1 1 1v3H4V5a1 1 0 0 1 1-1zM4 8h16v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z',                                                         dur: 19, x: 40, y: 20, r: 8,   size: 90  },
  { id: 'nail',   path: 'M12 3v14M9 14l3 5 3-5',                                                                                                                            dur: 26, x: 88, y: 30, r: 20,  size: 80  },
  { id: 'ruler',  path: 'M3 7h18v2H3zM7 7v2M11 7v2M15 7v2M19 7v2',                                                                                                         dur: 33, x: 3,  y: 38, r: -10, size: 108 },
]

export default function IdleCheckout({ visible, storeConfig = {}, dailyTotals }) {
  const { fmt } = useCurrency()

  // Fix: initialise directly from `visible` so it shows on first mount
  const [showing, setShowing]   = useState(visible)
  const [fadeIn,  setFadeIn]    = useState(visible)
  const [slideIdx, setSlideIdx] = useState(0)
  const [clock, setClock]       = useState(new Date())
  const [tipIdx, setTipIdx]     = useState(0)
  const prevVisible             = useRef(visible)

  useEffect(() => {
    if (!prevVisible.current && visible) {
      // Was hidden → now visible: smooth fade-in
      setShowing(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setFadeIn(true)))
    } else if (prevVisible.current && !visible) {
      // Was visible → now hidden: instant disappear
      setFadeIn(false)
      setShowing(false)
    }
    prevVisible.current = visible
  }, [visible])

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Slide rotation — 5 s per slide
  useEffect(() => {
    if (!visible) return
    const t = setInterval(() => {
      setSlideIdx(prev => {
        const next = (prev + 1) % 4
        if (next === 2) setTipIdx(ti => (ti + 1) % TIPS.length)
        return next
      })
    }, 5000)
    return () => clearInterval(t)
  }, [visible])

  if (!showing) return null

  const slides = [
    /* 0 — Welcome + live clock */
    <div key="welcome" className="idle-slide-content">
      <div className="idle-welcome">{storeConfig.name || 'Welcome'}</div>
      <div className="idle-clock">
        {clock.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div className="idle-date">
        {clock.toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
      <div className="idle-hint">Ready to serve — scan a barcode or search on the right</div>
    </div>,

    /* 1 — Today's stats */
    <div key="stats" className="idle-slide-content">
      <div className="idle-slide-label">Today's Sales</div>
      {dailyTotals ? (
        <>
          <div className="idle-stat-big">{fmt(dailyTotals.total_revenue)}</div>
          <div className="idle-stat-sub">
            {dailyTotals.transaction_count} transaction{dailyTotals.transaction_count !== 1 ? 's' : ''}
          </div>
        </>
      ) : (
        <div className="idle-stat-sub" style={{ marginTop: 24 }}>Shift not yet started</div>
      )}
    </div>,

    /* 2 — Tip */
    <div key="tip" className="idle-slide-content">
      <div className="idle-tip-icon">ℹ</div>
      <div className="idle-tip-text">{TIPS[tipIdx]}</div>
    </div>,

    /* 3 — Store branding */
    <div key="brand" className="idle-slide-content">
      {storeConfig.logo_url && (
        <img className="idle-logo" src={storeConfig.logo_url} alt={storeConfig.name} />
      )}
      <div className="idle-welcome">{storeConfig.name || 'POS Hardware'}</div>
      {storeConfig.tagline && <div className="idle-tagline">{storeConfig.tagline}</div>}
      <div className="idle-powered">Powered by POS Hardware System</div>
    </div>,
  ]

  return (
    <div className={`idle-checkout${fadeIn ? ' idle-fade-in' : ''}`} aria-hidden="true">
      {/* Layer 1 — floating hardware silhouettes */}
      <div className="idle-parallax">
        {SHAPES.map(s => (
          <svg
            key={s.id}
            className="idle-shape"
            viewBox="0 0 24 24"
            width={s.size}
            height={s.size}
            style={{
              left: `${s.x}%`,
              top:  `${s.y}%`,
              animationDuration: `${s.dur}s`,
              transform: `rotate(${s.r}deg)`,
            }}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={s.path} />
          </svg>
        ))}
      </div>

      {/* Layer 2 — carousel */}
      <div className="idle-carousel">
        {slides.map((slide, i) => (
          <div key={i} className={`idle-slide${i === slideIdx ? ' idle-slide-active' : ''}`}>
            {slide}
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      <div className="idle-dots">
        {slides.map((_, i) => (
          <div key={i} className={`idle-dot${i === slideIdx ? ' idle-dot-active' : ''}`} />
        ))}
      </div>
    </div>
  )
}
