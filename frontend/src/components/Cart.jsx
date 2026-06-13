import { useState } from 'react'
import { useCurrency } from '../context/CurrencyContext'

function QtyCell({ item, itemId, onUpdateQty }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')

  function startEdit() {
    setVal(String(item.qty))
    setEditing(true)
  }

  function commitEdit() {
    const n = parseInt(val, 10)
    if (!isNaN(n) && n > 0) {
      onUpdateQty(itemId, n - item.qty)  // delta to reach the new qty
    } else if (!isNaN(n) && n <= 0) {
      onUpdateQty(itemId, -item.qty)     // removes item
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        className="qty-edit-input"
        type="number"
        min="0"
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

export default function Cart({ items, onUpdateQty, onRemove, onRemoveRequest, onDiscountRequest }) {
  const { fmt } = useCurrency()
  const handleRemove = onRemoveRequest || onRemove

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
        const itemId = item._key || item.product_id
        return (
          <div key={itemId} className="cart-item">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="cart-item-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.product_name}
              </div>
              <div className="cart-item-sub">
                {fmt(item.unit_price)} ea
                {item.discount > 0 && <span style={{ color: 'var(--warning)' }}> · -{fmt(item.discount)} off</span>}
                {item.tax_rate > 0 && <span> · {(item.tax_rate * 100).toFixed(0)}% VAT</span>}
              </div>
            </div>

            <div className="cart-qty">
              <button className="qty-btn" onClick={() => onUpdateQty(itemId, -1)}>−</button>
              <QtyCell item={item} itemId={itemId} onUpdateQty={onUpdateQty} />
              <button className="qty-btn" onClick={() => onUpdateQty(itemId, +1)}>+</button>
            </div>

            <div className="cart-item-total">{fmt(item.line_total)}</div>

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
              >
                %
              </button>
            )}

            <button
              onClick={() => handleRemove(itemId)}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: 18, padding: '0 2px', flexShrink: 0,
              }}
              title="Remove"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
