import { useState, useEffect, useRef } from 'react'
import { getProducts } from '../api'

// Slide 0 = welcome (1 min), slides 1-N = product (30s each)
export default function IdleScreen({ storeName, onDismiss }) {
  const [now, setNow]           = useState(new Date())
  const [slide, setSlide]       = useState(0)
  const [products, setProducts] = useState([])
  const timerRef                = useRef(null)

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Fetch customer-facing products (prefer those with images)
  useEffect(() => {
    getProducts({ limit: 50 })
      .then(r => {
        const all = r.data || []
        // Prioritise products with images, then by name
        const sorted = [...all].sort((a, b) => {
          if (a.image_url && !b.image_url) return -1
          if (!a.image_url && b.image_url) return 1
          return 0
        })
        setProducts(sorted.slice(0, 12))
      })
      .catch(() => {})
  }, [])

  // Auto-advance: 60s for welcome, 30s for product slides
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const delay = slide === 0 ? 60000 : 30000
    if (products.length > 0) {
      timerRef.current = setTimeout(() => {
        setSlide(s => (s === 0 ? 1 : s >= products.length ? 0 : s + 1))
      }, delay)
    }
    return () => clearTimeout(timerRef.current)
  }, [slide, products.length])

  const timeStr = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false })
  const dateStr = now.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const product = slide > 0 ? products[slide - 1] : null

  return (
    <div className="pos-attract" onClick={onDismiss} tabIndex={0}>
      {slide === 0 ? (
        /* ── Welcome slide ── */
        <div className="pos-attract-welcome">
          <div className="pos-attract-time">{timeStr}</div>
          <div className="pos-attract-date">{dateStr}</div>
          <div className="pos-attract-powered">POS powered by {storeName || 'Hardware Store'}</div>
          <div className="pos-attract-tap">Tap anywhere to start</div>
        </div>
      ) : product ? (
        /* ── Product slide ── */
        <div className="pos-attract-product-slide">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="pos-attract-product-img" />
          ) : (
            <div className="pos-attract-product-icon">🔩</div>
          )}
          {product.discount_percent > 0 && (
            <div className="pos-attract-discount-badge">{product.discount_percent}% OFF</div>
          )}
          <div className="pos-attract-product-name">{product.name}</div>
          <div className="pos-attract-product-price">
            KES {Number(product.selling_price || 0).toLocaleString('en-KE')}
            {product.unit && <span className="pos-attract-product-unit"> / {product.unit}</span>}
          </div>
          <div className="pos-attract-tap">Tap to shop</div>
          <div className="pos-attract-footer">POS powered by {storeName || 'Hardware Store'}</div>
        </div>
      ) : null}

      {/* Slide dots */}
      {products.length > 0 && (
        <div className="pos-attract-dots" onClick={e => e.stopPropagation()}>
          {[0, ...products.map((_, i) => i + 1)].map(i => (
            <div key={i}
              className={`pos-attract-dot${slide === i ? ' active' : ''}`}
              onClick={e => { e.stopPropagation(); setSlide(i) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
