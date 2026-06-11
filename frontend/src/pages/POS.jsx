import { useState, useEffect, useRef, useCallback } from 'react'
import { getProducts, getDailyTotals } from '../api'
import Cart from '../components/Cart'
import BarcodeInput from '../components/BarcodeInput'
import ProductSearch from '../components/ProductSearch'
import PaymentModal from '../components/PaymentModal'

export default function POS() {
  const [products, setProducts] = useState([])
  const [cartItems, setCartItems] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [paymentOpen, setPaymentOpen] = useState(null)  // null | 'cash' | 'card' | 'split'
  const [dailyTotals, setDailyTotals] = useState(null)
  const [loading, setLoading] = useState(true)

  // Load products on mount and refresh daily totals
  useEffect(() => {
    loadProducts()
    loadDailyTotals()
  }, [])

  // Re-filter when search changes
  useEffect(() => {
    loadProducts(searchQuery)
  }, [searchQuery])

  async function loadProducts(q = '') {
    setLoading(true)
    try {
      const res = await getProducts({ q, active: 'true' })
      setProducts(res.data)
    } catch (e) {
      console.error('Failed to load products', e)
    } finally {
      setLoading(false)
    }
  }

  async function loadDailyTotals() {
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await getDailyTotals(today)
      setDailyTotals(res.data)
    } catch (e) {
      console.error('Failed to load daily totals', e)
    }
  }

  // Add product to cart (from barcode scan or product tile click)
  const addToCart = useCallback((product) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.product_id === product.id)
      if (existing) {
        return prev.map(i =>
          i.product_id === product.id
            ? { ...i, qty: i.qty + 1, line_total: (i.qty + 1) * (i.unit_price - i.discount) * (1 + i.tax_rate) }
            : i
        )
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        unit_price: product.price,
        qty: 1,
        discount: 0,
        tax_rate: product.tax_rate || 0,
        line_total: product.price * (1 + (product.tax_rate || 0)),
      }]
    })
  }, [])

  const updateQty = useCallback((product_id, delta) => {
    setCartItems(prev =>
      prev
        .map(i => {
          if (i.product_id !== product_id) return i
          const newQty = i.qty + delta
          if (newQty <= 0) return null
          return {
            ...i,
            qty: newQty,
            line_total: newQty * (i.unit_price - i.discount) * (1 + i.tax_rate),
          }
        })
        .filter(Boolean)
    )
  }, [])

  const removeItem = useCallback((product_id) => {
    setCartItems(prev => prev.filter(i => i.product_id !== product_id))
  }, [])

  const clearCart = useCallback(() => setCartItems([]), [])

  const cartSubtotal = cartItems.reduce((s, i) => s + i.unit_price * i.qty, 0)
  const cartDiscount = cartItems.reduce((s, i) => s + i.discount * i.qty, 0)
  const cartTax = cartItems.reduce((s, i) => s + (i.unit_price - i.discount) * i.qty * i.tax_rate, 0)
  const cartTotal = cartSubtotal - cartDiscount + cartTax

  function handleSaleComplete(sale) {
    setPaymentOpen(null)
    clearCart()
    loadDailyTotals()
  }

  return (
    <div className="pos-layout">
      {/* ── Left panel ─── */}
      <div className="pos-left">
        {/* Status bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Checkout</span>
          {dailyTotals && (
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              Today: {dailyTotals.transaction_count} sales · ${dailyTotals.total_revenue.toFixed(2)}
            </span>
          )}
        </div>

        {/* Barcode scanner input */}
        <BarcodeInput onScan={addToCart} />

        {/* Search */}
        <input
          className="input"
          placeholder="Search products by name or barcode..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ flexShrink: 0 }}
        />

        {/* Product grid */}
        {loading ? (
          <div className="empty-state">Loading products...</div>
        ) : products.length === 0 ? (
          <div className="empty-state">No products found</div>
        ) : (
          <div className="product-grid">
            {products.map(product => (
              <div
                key={product.id}
                className="product-tile"
                onClick={() => addToCart(product)}
                title={product.barcode || ''}
              >
                <div className="tile-name">{product.name}</div>
                <div className="tile-price">${product.price.toFixed(2)}</div>
                <div className="tile-stock">
                  {product.stock_qty <= product.low_stock_threshold && product.stock_qty > 0
                    ? <span style={{ color: 'var(--warning)' }}>Low stock ({product.stock_qty})</span>
                    : product.stock_qty === 0
                    ? <span style={{ color: 'var(--danger)' }}>Out of stock</span>
                    : <span>In stock: {product.stock_qty}</span>
                  }
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Right panel: Cart ─── */}
      <div className="pos-right">
        <div className="cart-header">
          Cart
          {cartItems.length > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ float: 'right' }}
              onClick={clearCart}
            >
              Clear
            </button>
          )}
        </div>

        <Cart
          items={cartItems}
          onUpdateQty={updateQty}
          onRemove={removeItem}
        />

        <div className="cart-totals">
          <div className="totals-row"><span>Subtotal</span><span>${cartSubtotal.toFixed(2)}</span></div>
          {cartDiscount > 0 && <div className="totals-row"><span>Discount</span><span>-${cartDiscount.toFixed(2)}</span></div>}
          {cartTax > 0 && <div className="totals-row"><span>Tax</span><span>${cartTax.toFixed(2)}</span></div>}
          <div className="totals-row grand"><span>Total</span><span>${cartTotal.toFixed(2)}</span></div>
        </div>

        <div className="checkout-btns">
          <button
            className="btn btn-ghost btn-lg"
            disabled={cartItems.length === 0}
            onClick={() => setPaymentOpen('cash')}
          >
            💵 Cash
          </button>
          <button
            className="btn btn-primary btn-lg"
            disabled={cartItems.length === 0}
            onClick={() => setPaymentOpen('card')}
          >
            💳 Card
          </button>
          <button
            className="btn btn-ghost btn-lg"
            style={{ gridColumn: 'span 2' }}
            disabled={cartItems.length === 0}
            onClick={() => setPaymentOpen('split')}
          >
            ✂️ Split Payment
          </button>
        </div>
      </div>

      {/* ── Payment modal ─── */}
      {paymentOpen && (
        <PaymentModal
          method={paymentOpen}
          items={cartItems}
          subtotal={cartSubtotal}
          discountTotal={cartDiscount}
          taxAmount={cartTax}
          total={cartTotal}
          onClose={() => setPaymentOpen(null)}
          onComplete={handleSaleComplete}
        />
      )}
    </div>
  )
}
