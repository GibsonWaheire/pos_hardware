import { useState, useRef } from 'react'
import { useCurrency } from '../context/CurrencyContext'

// Editable qty cell — only rendered for the current (unlocked) item
function QtyCell({ item, itemId, onUpdateQty }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState('')
  const [shaking, setShaking] = useState(false)

  function startEdit() { setVal(String(item.qty)); setEditing(true) }

  function commitEdit() {
    const n = parseInt(val, 10)
    if (!isNaN(n) && n >= 1 && n !== item.qty) {
      onUpdateQty(itemId, n - item.qty)
    } else if (!isNaN(n) && n < 1) {
      // Block zero/negative — shake and reset
      setShaking(true)
      setVal('1')
      setTimeout(() => setShaking(false), 400)
      return
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        className={`qty-edit-input${shaking ? ' qty-shake' : ''}`}
        type="number"
        min="1"
        value={val}
        autoFocus
        onChange={e => setVal(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false) }}
      />
    )
  }

  return (
    <span className="qty-display" onClick={startEdit} title="Tap to edit quantity">
      {item.qty}
    </span>
  )
}

/**
 * Cart — bill item list.
 *
 * Lock rules:
 *   Current item (last added):  qty editable inline, +/- free, trash → manager override
 *   Locked items (all others):  qty read-only, +/- → manager override, trash → manager override
 *
 * Props:
 *   items             — cart item array
 *   currentItemId     — _key or product_id of the most recently added item
 *   onUpdateQty       — (id, delta) → free qty change (current item only)
 *   onQtyChangeRequest — (id, delta) → gated qty change (locked items or explicit)
 *   onRemoveRequest   — (id) → ALWAYS called for removal (no free trash)
 *   onDiscountRequest — (id) → per-item discount gate
 */
export default function Cart({
  items, currentItemId,
  onUpdateQty, onQtyChangeRequest, onRemoveRequest, onDiscountRequest,
}) {
  const { fmt } = useCurrency()

  if (items.length === 0) {
    return (
      <div className="cart-items">
        <div className="empty-state" style={{ padding: '32px 16px' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🛒</div>
          <div style={{ fontSize: 13 }}>Scan or tap a product to add it</div>
        </div>
      </div>
    )
  }

  return (
    <div className="cart-items">
      {items.map(item => {
        const itemId    = item._key || item.product_id
        const isLocked  = currentItemId != null && itemId !== currentItemId
        const isCurrent = currentItemId != null && itemId === currentItemId

        return (
          <div
            key={itemId}
            className={[
              'cart-item',
              isLocked  ? 'cart-item-locked'  : '',
              isCurrent ? 'cart-item-current' : '',
            ].filter(Boolean).join(' ')}
          >
            {/* Product image */}
            {item.image_url
              ? <img className="cart-item-img" src={item.image_url} alt={item.product_name} />
              : <div className="cart-item-img-placeholder" />
            }

            {/* Name + sub-info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="cart-item-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isLocked  && <span className="lock-icon" title="Locked — manager auth required">🔒</span>}
                {isCurrent && <span className="current-dot" title="Current item (editing)" />}
                {item.product_name}
              </div>
              <div className="cart-item-sub">
                {fmt(item.unit_price)} ea
                {item.discount > 0 && <span style={{ color: 'var(--warning)' }}> · −{fmt(item.discount)} off</span>}
                {item.tax_rate > 0 && (
                  <span style={{ color: 'var(--text-muted)' }}>
                    {' · '}VAT {(item.tax_rate * 100).toFixed(0)}%
                    {': '}+{fmt((item.unit_price - item.discount) * item.tax_rate)}
                  </span>
                )}
              </div>
            </div>

            {/* Qty controls */}
            <div className="cart-qty">
              <button
                className="qty-btn"
                onClick={() => {
                  if (item.qty <= 1) return
                  if (isLocked) onQtyChangeRequest?.(itemId, -1)
                  else onUpdateQty(itemId, -1)
                }}
                disabled={item.qty <= 1}
                style={{ opacity: item.qty <= 1 ? 0.3 : 1 }}
              >−</button>

              {isLocked
                ? <span className="qty-display qty-locked" title="Locked — use +/- or manager auth">{item.qty}</span>
                : <QtyCell item={item} itemId={itemId} onUpdateQty={(id, delta) => {
                    if (item.qty + delta < 1) return
                    onUpdateQty(id, delta)
                  }} />
              }

              <button
                className="qty-btn"
                onClick={() => {
                  if (isLocked) onQtyChangeRequest?.(itemId, +1)
                  else onUpdateQty(itemId, +1)
                }}
              >+</button>
            </div>

            {/* Line total */}
            <div className="cart-item-total">{fmt(item.line_total)}</div>

            {/* Per-item discount (manager gate) */}
            {onDiscountRequest && (
              <button
                onClick={() => onDiscountRequest(itemId)}
                style={{
                  background: item.discount > 0 ? 'var(--warning)' : 'none',
                  border: '1px solid var(--border)', borderRadius: 4,
                  color: item.discount > 0 ? '#000' : 'var(--text-muted)',
                  cursor: 'pointer', fontSize: 11, padding: '3px 6px', flexShrink: 0,
                }}
                title={item.discount > 0 ? `Discount: −${fmt(item.discount)}` : 'Discount (manager auth)'}
              >%</button>
            )}

            {/* Trash — ALWAYS requires manager override, no free removal */}
            <button
              onClick={() => onRemoveRequest?.(itemId)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 18, padding: '0 2px', flexShrink: 0,
                color: isCurrent ? 'var(--warning,#f59e0b)' : 'var(--text-muted)',
                opacity: 0.75,
              }}
              title="Remove (manager auth required)"
            >×</button>
          </div>
        )
      })}
    </div>
  )
}
