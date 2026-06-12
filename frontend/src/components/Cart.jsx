import { useCurrency } from '../context/CurrencyContext'

export default function Cart({ items, onUpdateQty, onRemove, onRemoveRequest }) {
  const { fmt } = useCurrency()
  // Use onRemoveRequest if provided (triggers manager auth), else fall back to onRemove
  const handleRemove = onRemoveRequest || onRemove
  if (items.length === 0) {
    return (
      <div className="cart-items">
        <div className="empty-state" style={{ padding: '40px 16px' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🛒</div>
          <div>Scan a barcode or tap a product to start</div>
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
                {item.discount > 0 && <span style={{ color: 'var(--warning)' }}> · -{fmt(item.discount)} disc</span>}
                {item.tax_rate > 0 && <span> · {(item.tax_rate * 100).toFixed(0)}% tax</span>}
                {item.item_type === 'service' && <span style={{ color: 'var(--accent)' }}> · service</span>}
              </div>
            </div>

            <div className="cart-qty">
              <button className="qty-btn" onClick={() => onUpdateQty(itemId, -1)}>−</button>
              <span className="qty-display">{item.qty}</span>
              <button className="qty-btn" onClick={() => onUpdateQty(itemId, +1)}>+</button>
            </div>

            <div className="cart-item-total">{fmt(item.line_total)}</div>

            <button
              onClick={() => handleRemove(itemId)}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: 16, padding: '0 4px',
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
