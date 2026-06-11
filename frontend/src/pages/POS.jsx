import { useState, useEffect, useCallback } from 'react'
import { getProducts, getDailyTotals, getProductByBarcode, getProductByPlu, lookupCustomer, readScale } from '../api'
import Cart from '../components/Cart'
import BarcodeInput from '../components/BarcodeInput'
import PaymentModal from '../components/PaymentModal'

export default function POS() {
  const [products, setProducts] = useState([])
  const [cartItems, setCartItems] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [paymentOpen, setPaymentOpen] = useState(null)
  const [dailyTotals, setDailyTotals] = useState(null)
  const [loading, setLoading] = useState(true)

  // Price check mode
  const [priceCheckMode, setPriceCheckMode] = useState(false)
  const [priceCheckResult, setPriceCheckResult] = useState(null)

  // Age verification
  const [ageVerifyModal, setAgeVerifyModal] = useState(null)

  // Weight input
  const [weightModal, setWeightModal] = useState(null)
  const [weightInput, setWeightInput] = useState('')
  const [scaleBusy, setScaleBusy] = useState(false)

  // Customer / loyalty
  const [customer, setCustomer] = useState(null)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerLookupMsg, setCustomerLookupMsg] = useState('')
  const [redeemPoints, setRedeemPoints] = useState('')
  const [ageVerified, setAgeVerified] = useState(false)

  useEffect(() => {
    loadProducts()
    loadDailyTotals()
  }, [])

  useEffect(() => { loadProducts(searchQuery) }, [searchQuery])

  async function loadProducts(q = '') {
    setLoading(true)
    try { const res = await getProducts({ q, active: 'true' }); setProducts(res.data) }
    catch (e) { console.error(e) } finally { setLoading(false) }
  }

  async function loadDailyTotals() {
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await getDailyTotals(today)
      setDailyTotals(res.data)
    } catch (e) { console.error(e) }
  }

  // ── Weight-based item ─────────────────────────────────────────────────────

  function openWeightModal(product) { setWeightInput(''); setWeightModal(product) }

  async function readScaleWeight() {
    setScaleBusy(true)
    try { const res = await readScale(); setWeightInput(String(res.data.value)) }
    catch (e) { alert('Scale not connected or not responding.') }
    finally { setScaleBusy(false) }
  }

  function confirmWeight() {
    const weight = parseFloat(weightInput)
    if (!weight || weight <= 0) { alert('Enter a valid weight'); return }
    const product = weightModal
    const linePrice = parseFloat((product.price * weight).toFixed(2))
    addItemToCart({ ...product, product_name_display: `${product.name} (${weight}${product.weight_unit})`, effective_price: linePrice, weight })
    setWeightModal(null)
  }

  // ── Age verification ──────────────────────────────────────────────────────

  function requestAgeVerify(product, onConfirm) { setAgeVerifyModal({ product, onConfirm }) }

  // ── Add to cart ───────────────────────────────────────────────────────────

  const addToCart = useCallback(async (product) => {
    if (priceCheckMode) { setPriceCheckResult(product); return }
    if (product.is_weight_based) { openWeightModal(product); return }
    if (product.age_restricted && !ageVerified) {
      requestAgeVerify(product, () => { setAgeVerified(true); setAgeVerifyModal(null); addItemToCart(product) })
      return
    }
    addItemToCart(product)
  }, [priceCheckMode, ageVerified])

  function addItemToCart(product) {
    const productId = product.id
    const unitPrice = product.effective_price ?? product.price
    const weight = product.weight ?? null
    const displayName = product.product_name_display ?? product.name

    setCartItems(prev => {
      if (weight !== null) {
        return [...prev, { product_id: productId, product_name: displayName, unit_price: unitPrice, qty: 1, weight, discount: 0, tax_rate: product.tax_rate || 0, line_total: unitPrice * (1 + (product.tax_rate || 0)) }]
      }
      const existing = prev.find(i => i.product_id === productId)
      if (existing) {
        return prev.map(i => i.product_id === productId
          ? { ...i, qty: i.qty + 1, line_total: (i.qty + 1) * (i.unit_price - i.discount) * (1 + i.tax_rate) }
          : i)
      }
      return [...prev, { product_id: productId, product_name: displayName, unit_price: unitPrice, qty: 1, weight: null, discount: 0, tax_rate: product.tax_rate || 0, line_total: unitPrice * (1 + (product.tax_rate || 0)) }]
    })
  }

  const updateQty = useCallback((id, delta) => {
    setCartItems(prev => prev
      .map(i => {
        if (i.product_id !== id) return i
        const newQty = i.qty + delta
        if (newQty <= 0) return null
        return { ...i, qty: newQty, line_total: newQty * (i.unit_price - i.discount) * (1 + i.tax_rate) }
      })
      .filter(Boolean))
  }, [])

  const removeItem = useCallback((id) => {
    setCartItems(prev => prev.filter(i => i.product_id !== id))
  }, [])

  const clearCart = useCallback(() => {
    setCartItems([])
    setCustomer(null)
    setRedeemPoints('')
    setAgeVerified(false)
  }, [])

  // ── Customer lookup ───────────────────────────────────────────────────────

  async function handleCustomerLookup() {
    if (!customerQuery.trim()) return
    setCustomerLookupMsg('Looking up...')
    try {
      const res = await lookupCustomer(customerQuery.trim())
      if (res.data.found) { setCustomer(res.data.customer); setCustomerLookupMsg(''); setCustomerQuery('') }
      else { setCustomerLookupMsg('Customer not found'); setCustomer(null) }
    } catch (e) { setCustomerLookupMsg(e.message) }
  }

  // ── Cart totals ───────────────────────────────────────────────────────────

  const cartSubtotal = cartItems.reduce((s, i) => s + i.unit_price * i.qty, 0)
  const cartDiscount = cartItems.reduce((s, i) => s + i.discount * i.qty, 0)
  const cartTax = cartItems.reduce((s, i) => s + (i.unit_price - i.discount) * i.qty * i.tax_rate, 0)
  const tierDiscount = customer?.tier_discount_percent ? (cartSubtotal - cartDiscount) * (customer.tier_discount_percent / 100) : 0
  const pointsRedeemAmt = redeemPoints ? Math.min(parseFloat(redeemPoints) * 0.01, cartSubtotal - cartDiscount) : 0
  const cartTotal = Math.max(0, cartSubtotal - cartDiscount + cartTax - tierDiscount - pointsRedeemAmt)

  function handleSaleComplete() { setPaymentOpen(null); clearCart(); loadDailyTotals() }

  const hasAgeRestricted = cartItems.some(i => products.find(p => p.id === i.product_id)?.age_restricted)
  const checkoutDisabled = cartItems.length === 0 || (hasAgeRestricted && !ageVerified)

  return (
    <div className="pos-layout">
      {/* ── Left panel ─── */}
      <div className="pos-left">
        {/* Status bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {priceCheckMode && <span style={{ color: 'var(--warning)', fontWeight: 700, fontSize: 13 }}>PRICE CHECK</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {dailyTotals && (
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                Today: {dailyTotals.transaction_count} sales · KES {dailyTotals.total_revenue.toFixed(2)}
              </span>
            )}
            <button
              className={`btn btn-sm ${priceCheckMode ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setPriceCheckMode(m => !m); setPriceCheckResult(null) }}
            >
              {priceCheckMode ? '✓ Price Check ON' : '🔍 Price Check'}
            </button>
          </div>
        </div>

        {/* Price check result */}
        {priceCheckMode && priceCheckResult && (
          <div className="card" style={{ borderColor: 'var(--warning)', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{priceCheckResult.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {priceCheckResult.barcode && `Barcode: ${priceCheckResult.barcode}`}
                  {priceCheckResult.plu_code && ` · PLU: ${priceCheckResult.plu_code}`}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>KES {priceCheckResult.price.toFixed(2)}</div>
                {priceCheckResult.is_weight_based && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>per {priceCheckResult.weight_unit}</div>}
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Stock: {priceCheckResult.stock_qty}</div>
              </div>
            </div>
          </div>
        )}

        {/* Barcode + PLU scanner */}
        <BarcodeInput onScan={addToCart} priceCheckMode={priceCheckMode} />

        {/* Search */}
        <input className="input" placeholder="Search products..." value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)} style={{ flexShrink: 0 }} />

        {/* Product grid */}
        {loading ? (
          <div className="empty-state">Loading products...</div>
        ) : products.length === 0 ? (
          <div className="empty-state">No products found</div>
        ) : (
          <div className="product-grid">
            {products.map(product => (
              <div key={product.id} className="product-tile" onClick={() => addToCart(product)}
                style={{ borderColor: product.age_restricted ? 'var(--warning)' : undefined }}
                title={[product.barcode, product.plu_code && `PLU: ${product.plu_code}`].filter(Boolean).join(' · ')}>
                <div className="tile-name">{product.name}</div>
                {product.age_restricted && <div style={{ fontSize: 10, color: 'var(--warning)', marginBottom: 2 }}>⚠ {product.age_restriction_type?.toUpperCase()} {product.min_age}+</div>}
                <div className="tile-price">
                  KES {product.price.toFixed(2)}{product.is_weight_based && `/${product.weight_unit}`}
                </div>
                <div className="tile-stock">
                  {product.plu_code && <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>PLU:{product.plu_code}</span>}
                  {product.stock_qty === 0
                    ? <span style={{ color: 'var(--danger)' }}>Out of stock</span>
                    : product.stock_qty <= product.low_stock_threshold
                    ? <span style={{ color: 'var(--warning)' }}>Low ({product.stock_qty})</span>
                    : <span>{product.stock_qty}</span>}
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
            <button className="btn btn-ghost btn-sm" style={{ float: 'right' }} onClick={clearCart}>Clear</button>
          )}
        </div>

        {/* Customer / loyalty panel */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {customer ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{customer.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {customer.tier_name && <span style={{ color: customer.tier_color, marginRight: 6 }}>{customer.tier_name}</span>}
                  {customer.loyalty_points.toLocaleString()} pts
                  {customer.tier_discount_percent > 0 && <span style={{ color: 'var(--success)', marginLeft: 6 }}>−{customer.tier_discount_percent}%</span>}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setCustomer(null); setRedeemPoints('') }}>✕</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="input" placeholder="Phone / member ID..."
                value={customerQuery}
                onChange={e => setCustomerQuery(e.target.value)}
                onKeyUp={e => e.key === 'Enter' && handleCustomerLookup()}
                style={{ fontSize: 12 }} />
              <button className="btn btn-ghost btn-sm" onClick={handleCustomerLookup}>Find</button>
            </div>
          )}
          {customerLookupMsg && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{customerLookupMsg}</div>}

          {/* Point redemption */}
          {customer && customer.loyalty_points > 0 && cartItems.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
              <input className="input" type="number" min={0} max={customer.loyalty_points}
                placeholder="Redeem points..."
                value={redeemPoints}
                onChange={e => setRedeemPoints(e.target.value)}
                style={{ fontSize: 12 }} />
              {redeemPoints > 0 && (
                <span style={{ fontSize: 12, color: 'var(--success)', whiteSpace: 'nowrap' }}>
                  −KES {pointsRedeemAmt.toFixed(2)}
                </span>
              )}
            </div>
          )}
        </div>

        <Cart items={cartItems} onUpdateQty={updateQty} onRemove={removeItem} />

        <div className="cart-totals">
          <div className="totals-row"><span>Subtotal</span><span>KES {cartSubtotal.toFixed(2)}</span></div>
          {cartDiscount > 0 && <div className="totals-row"><span>Discounts</span><span>−KES {cartDiscount.toFixed(2)}</span></div>}
          {tierDiscount > 0 && (
            <div className="totals-row" style={{ color: 'var(--success)' }}>
              <span>{customer.tier_name} Discount</span><span>−KES {tierDiscount.toFixed(2)}</span>
            </div>
          )}
          {pointsRedeemAmt > 0 && (
            <div className="totals-row" style={{ color: 'var(--success)' }}>
              <span>Points Redemption</span><span>−KES {pointsRedeemAmt.toFixed(2)}</span>
            </div>
          )}
          {cartTax > 0 && <div className="totals-row"><span>VAT</span><span>KES {cartTax.toFixed(2)}</span></div>}
          <div className="totals-row grand"><span>Total</span><span>KES {cartTotal.toFixed(2)}</span></div>
        </div>

        {/* Age verification */}
        {hasAgeRestricted && !ageVerified && (
          <div style={{ padding: '8px 16px', background: '#451a0344', borderTop: '1px solid var(--warning)', flexShrink: 0 }}>
            <div style={{ color: 'var(--warning)', fontSize: 13, fontWeight: 600 }}>⚠ Age-restricted item in cart</div>
            <button className="btn btn-sm" style={{ background: 'var(--warning)', color: '#000', marginTop: 6 }}
              onClick={() => setAgeVerified(true)}>Confirm Age Verified</button>
          </div>
        )}
        {hasAgeRestricted && ageVerified && (
          <div style={{ padding: '6px 16px', background: '#14532d22', borderTop: '1px solid var(--success)', fontSize: 12, color: 'var(--success)', flexShrink: 0 }}>
            ✓ Age verified
          </div>
        )}

        <div className="checkout-btns">
          <button className="btn btn-ghost btn-lg" disabled={checkoutDisabled}
            onClick={() => setPaymentOpen('cash')}>💵 Cash</button>
          <button className="btn btn-primary btn-lg" disabled={checkoutDisabled}
            onClick={() => setPaymentOpen('card')}>💳 Card</button>
          <button className="btn btn-ghost btn-lg" disabled={checkoutDisabled}
            onClick={() => setPaymentOpen('mpesa')}
            style={{ background: '#4caf50', color: '#fff', border: 'none' }}>📱 M-Pesa</button>
          <button className="btn btn-ghost btn-lg" disabled={checkoutDisabled}
            onClick={() => setPaymentOpen('account')}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', opacity: 0.9 }}>🏦 Account</button>
          <button className="btn btn-ghost btn-lg" style={{ gridColumn: 'span 2' }} disabled={checkoutDisabled}
            onClick={() => setPaymentOpen('split')}>✂️ Split Payment</button>
        </div>
      </div>

      {/* ── Weight entry modal ─── */}
      {weightModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 380 }}>
            <div className="modal-title">Enter Weight — {weightModal.name}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
              Price: KES {weightModal.price.toFixed(2)} / {weightModal.weight_unit}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input className="input" type="number" min={0} step="0.001"
                placeholder={`Weight in ${weightModal.weight_unit}`}
                value={weightInput} onChange={e => setWeightInput(e.target.value)}
                style={{ fontSize: 20, textAlign: 'center' }} autoFocus />
              <span style={{ alignSelf: 'center', fontWeight: 600 }}>{weightModal.weight_unit}</span>
            </div>
            {weightInput && (
              <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 22, marginBottom: 12, color: 'var(--accent)' }}>
                Total: KES {(weightModal.price * parseFloat(weightInput || 0)).toFixed(2)}
              </div>
            )}
            <button className="btn btn-ghost" style={{ width: '100%', marginBottom: 8 }}
              onClick={readScaleWeight} disabled={scaleBusy}>
              {scaleBusy ? 'Reading...' : '⚖️ Read from Scale'}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={() => setWeightModal(null)}>Cancel</button>
              <button className="btn btn-success btn-lg" style={{ flex: 2 }} onClick={confirmWeight}>Add to Cart</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Age verification modal ─── */}
      {ageVerifyModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 380, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
            <div className="modal-title" style={{ justifyContent: 'center' }}>Age Verification Required</div>
            <div style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
              <strong>{ageVerifyModal.product.name}</strong> requires age verification.
              <br />Customer must be <strong>{ageVerifyModal.product.min_age}+</strong> years old.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-danger btn-lg" style={{ flex: 1 }} onClick={() => setAgeVerifyModal(null)}>Deny — Too Young</button>
              <button className="btn btn-success btn-lg" style={{ flex: 1 }} onClick={ageVerifyModal.onConfirm}>✓ Age Verified</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment modal ─── */}
      {paymentOpen && (
        <PaymentModal
          method={paymentOpen}
          items={cartItems}
          subtotal={cartSubtotal}
          discountTotal={cartDiscount + tierDiscount + pointsRedeemAmt}
          taxAmount={cartTax}
          total={cartTotal}
          customer={customer}
          loyaltyPointsToRedeem={redeemPoints ? parseInt(redeemPoints) : 0}
          ageVerified={ageVerified}
          onClose={() => setPaymentOpen(null)}
          onComplete={handleSaleComplete}
        />
      )}
    </div>
  )
}
