import { useState, useEffect, useRef, useCallback } from 'react'
import { getProducts, getDailyTotals, getProductByBarcode, getProductByPlu, lookupCustomer, readScale, getServices, getStaff } from '../api'
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

  // Phase 3 — Price check mode
  const [priceCheckMode, setPriceCheckMode] = useState(false)
  const [priceCheckResult, setPriceCheckResult] = useState(null)

  // Phase 3 — Age verification
  const [ageVerifyModal, setAgeVerifyModal] = useState(null)  // null | { product, onConfirm }
  const [pendingAgeItem, setPendingAgeItem] = useState(null)

  // Phase 3 — Weight input
  const [weightModal, setWeightModal] = useState(null)  // null | { product }
  const [weightInput, setWeightInput] = useState('')
  const [scaleBusy, setScaleBusy] = useState(false)

  // Phase 3 — Customer / loyalty
  const [customer, setCustomer] = useState(null)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerLookupMsg, setCustomerLookupMsg] = useState('')
  const [redeemPoints, setRedeemPoints] = useState('')
  const [ageVerified, setAgeVerified] = useState(false)

  // Phase 4 — Salon mode
  const [posMode, setPosMode] = useState('retail')   // 'retail' | 'salon'
  const [services, setServices] = useState([])
  const [allStaff, setAllStaff] = useState([])
  const [svcPick, setSvcPick] = useState({ service_id: '', staff_id: '' })

  useEffect(() => {
    loadProducts()
    loadDailyTotals()
    loadSalonData()
  }, [])

  useEffect(() => { loadProducts(searchQuery) }, [searchQuery])

  async function loadProducts(q = '') {
    setLoading(true)
    try { const res = await getProducts({ q, active: 'true' }); setProducts(res.data) }
    catch (e) { console.error(e) } finally { setLoading(false) }
  }

  async function loadSalonData() {
    try {
      const [s, st] = await Promise.all([getServices({ active_only: 1 }), getStaff()])
      setServices(s.data)
      setAllStaff(st.data.filter(s => s.is_active))
    } catch (e) { console.error(e) }
  }

  function addServiceToCart() {
    if (!svcPick.service_id) return
    const svc = services.find(s => s.id === parseInt(svcPick.service_id))
    if (!svc) return
    const staff = allStaff.find(s => s.id === parseInt(svcPick.staff_id))
    const cartKey = `svc-${svc.id}-${svcPick.staff_id || 0}-${Date.now()}`
    setCartItems(prev => [...prev, {
      product_id: null,
      product_name: svc.name + (staff ? ` (${staff.name})` : ''),
      unit_price: svc.price,
      qty: 1,
      weight: null,
      discount: 0,
      tax_rate: 0,
      line_total: svc.price,
      item_type: 'service',
      service_id: svc.id,
      staff_id: svcPick.staff_id ? parseInt(svcPick.staff_id) : null,
      staff_name: staff?.name || '',
      _key: cartKey,
    }])
  }

  async function loadDailyTotals() {
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await getDailyTotals(today)
      setDailyTotals(res.data)
    } catch (e) { console.error(e) }
  }

  // ── Price check mode ──────────────────────────────────────────────────────

  async function handlePriceCheck(product) {
    if (!priceCheckMode) return null
    setPriceCheckResult(product)
    return true  // signal: don't add to cart
  }

  // ── Weight-based item ─────────────────────────────────────────────────────

  function openWeightModal(product) {
    setWeightInput('')
    setWeightModal(product)
  }

  async function readScaleWeight() {
    setScaleBusy(true)
    try {
      const res = await readScale()
      setWeightInput(String(res.data.value))
    } catch (e) {
      alert('Scale not connected or not responding.')
    } finally { setScaleBusy(false) }
  }

  function confirmWeight() {
    const weight = parseFloat(weightInput)
    if (!weight || weight <= 0) { alert('Enter a valid weight'); return }
    const product = weightModal
    const linePrice = parseFloat((product.price * weight).toFixed(2))
    addItemToCart({
      ...product,
      product_name_display: `${product.name} (${weight}${product.weight_unit})`,
      effective_price: linePrice,
      weight,
    })
    setWeightModal(null)
  }

  // ── Age verification ──────────────────────────────────────────────────────

  function requestAgeVerify(product, onConfirm) {
    setAgeVerifyModal({ product, onConfirm })
  }

  // ── Add to cart ───────────────────────────────────────────────────────────

  const addToCart = useCallback(async (product) => {
    // Price check mode: show info, don't add
    if (priceCheckMode) {
      setPriceCheckResult(product)
      return
    }

    // Weight-based: open weight entry modal first
    if (product.is_weight_based) {
      openWeightModal(product)
      return
    }

    // Age-restricted: require verification
    if (product.age_restricted && !ageVerified) {
      requestAgeVerify(product, () => {
        setAgeVerified(true)
        setAgeVerifyModal(null)
        addItemToCart(product)
      })
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
      // Weight-based items are always new lines (each scan = specific weight)
      if (weight !== null) {
        return [...prev, {
          product_id: productId,
          product_name: displayName,
          unit_price: unitPrice,
          qty: 1,
          weight,
          discount: 0,
          tax_rate: product.tax_rate || 0,
          line_total: unitPrice * (1 + (product.tax_rate || 0)),
        }]
      }
      const existing = prev.find(i => i.product_id === productId)
      if (existing) {
        return prev.map(i => i.product_id === productId
          ? { ...i, qty: i.qty + 1, line_total: (i.qty + 1) * (i.unit_price - i.discount) * (1 + i.tax_rate) }
          : i)
      }
      return [...prev, {
        product_id: productId,
        product_name: displayName,
        unit_price: unitPrice,
        qty: 1,
        weight: null,
        discount: 0,
        tax_rate: product.tax_rate || 0,
        line_total: unitPrice * (1 + (product.tax_rate || 0)),
      }]
    })
  }

  const updateQty = useCallback((id, delta) => {
    setCartItems(prev => prev
      .map(i => {
        if ((i._key || i.product_id) !== id) return i
        const newQty = i.qty + delta
        if (newQty <= 0) return null
        return { ...i, qty: newQty, line_total: newQty * (i.unit_price - i.discount) * (1 + i.tax_rate) }
      })
      .filter(Boolean))
  }, [])

  const removeItem = useCallback((id) => {
    setCartItems(prev => prev.filter(i => (i._key || i.product_id) !== id))
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
      if (res.data.found) {
        setCustomer(res.data.customer)
        setCustomerLookupMsg('')
        setCustomerQuery('')
      } else {
        setCustomerLookupMsg('Customer not found')
        setCustomer(null)
      }
    } catch (e) { setCustomerLookupMsg(e.message) }
  }

  // ── Cart totals ───────────────────────────────────────────────────────────

  const cartSubtotal = cartItems.reduce((s, i) => s + i.unit_price * i.qty, 0)
  const cartDiscount = cartItems.reduce((s, i) => s + i.discount * i.qty, 0)
  const cartTax = cartItems.reduce((s, i) => s + (i.unit_price - i.discount) * i.qty * i.tax_rate, 0)

  // Loyalty tier discount
  const tierDiscount = customer?.tier_discount_percent
    ? (cartSubtotal - cartDiscount) * (customer.tier_discount_percent / 100)
    : 0

  // Loyalty point redemption discount
  const pointsRedeemAmt = redeemPoints
    ? Math.min(parseFloat(redeemPoints) * 0.01, cartSubtotal - cartDiscount)
    : 0

  const cartTotal = Math.max(0, cartSubtotal - cartDiscount + cartTax - tierDiscount - pointsRedeemAmt)

  function handleSaleComplete(sale) {
    setPaymentOpen(null)
    clearCart()
    loadDailyTotals()
  }

  const hasAgeRestricted = cartItems.some(i => {
    const p = products.find(p => p.id === i.product_id)
    return p?.age_restricted
  })

  return (
    <div className="pos-layout">
      {/* ── Left panel ─── */}
      <div className="pos-left">
        {/* Status / mode bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, padding: 2 }}>
              {['retail', 'salon'].map(m => (
                <button key={m} onClick={() => setPosMode(m)} style={{
                  padding: '4px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
                  fontWeight: 600, textTransform: 'uppercase',
                  background: posMode === m ? 'var(--accent)' : 'none',
                  color: posMode === m ? '#fff' : 'var(--text-muted)',
                }}>{m === 'retail' ? 'Retail' : 'Salon'}</button>
              ))}
            </div>
            {priceCheckMode && <span style={{ color: 'var(--warning)', fontWeight: 700, fontSize: 13 }}>PRICE CHECK</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {dailyTotals && (
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                Today: {dailyTotals.transaction_count} · ${dailyTotals.total_revenue.toFixed(2)}
              </span>
            )}
            {posMode === 'retail' && (
              <button
                className={`btn btn-sm ${priceCheckMode ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setPriceCheckMode(m => !m); setPriceCheckResult(null) }}
              >
                {priceCheckMode ? '✓ Price Check ON' : '🔍 Price Check'}
              </button>
            )}
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
                  {priceCheckResult.age_restricted && <span style={{ color: 'var(--danger)', marginLeft: 8 }}>⚠ Age {priceCheckResult.min_age}+</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>${priceCheckResult.price.toFixed(2)}</div>
                {priceCheckResult.is_weight_based && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>per {priceCheckResult.weight_unit}</div>}
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Stock: {priceCheckResult.stock_qty}</div>
              </div>
            </div>
          </div>
        )}

        {posMode === 'salon' ? (
          <>
            {/* Salon service picker */}
            <div className="card" style={{ flexShrink: 0 }}>
              <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Add Service</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'flex-end' }}>
                <div>
                  <label className="label">Service</label>
                  <select className="input" value={svcPick.service_id}
                    onChange={e => setSvcPick({ ...svcPick, service_id: e.target.value })}>
                    <option value="">Select service...</option>
                    {services.map(s => (
                      <option key={s.id} value={s.id}>{s.name} — ${s.price.toFixed(2)} ({s.duration_minutes}min)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Staff</label>
                  <select className="input" value={svcPick.staff_id}
                    onChange={e => setSvcPick({ ...svcPick, staff_id: e.target.value })}>
                    <option value="">Unassigned</option>
                    {allStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <button className="btn btn-primary" onClick={addServiceToCart} disabled={!svcPick.service_id}>
                  Add
                </button>
              </div>
            </div>

            {/* Service tiles (quick pick) */}
            <div className="product-grid" style={{ overflowY: 'auto', flex: 1 }}>
              {services.map(svc => (
                <div key={svc.id} className="product-tile"
                  style={{ borderColor: svcPick.service_id === String(svc.id) ? 'var(--accent)' : undefined }}
                  onClick={() => setSvcPick(p => ({ ...p, service_id: String(svc.id) }))}>
                  <div className="tile-name">{svc.name}</div>
                  {svc.category_name && (
                    <div style={{ fontSize: 11, color: svc.category_color || 'var(--text-muted)', marginBottom: 4 }}>
                      {svc.category_name}
                    </div>
                  )}
                  <div className="tile-price">${svc.price.toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{svc.duration_minutes} min</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Barcode + PLU scanner input */}
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
                      ${product.price.toFixed(2)}{product.is_weight_based && `/${product.weight_unit}`}
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
          </>
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

        {/* Customer loyalty panel */}
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
                  −${pointsRedeemAmt.toFixed(2)}
                </span>
              )}
            </div>
          )}
        </div>

        <Cart items={cartItems} onUpdateQty={updateQty} onRemove={removeItem} />

        <div className="cart-totals">
          <div className="totals-row"><span>Subtotal</span><span>${cartSubtotal.toFixed(2)}</span></div>
          {cartDiscount > 0 && <div className="totals-row"><span>Item Discounts</span><span>−${cartDiscount.toFixed(2)}</span></div>}
          {tierDiscount > 0 && (
            <div className="totals-row" style={{ color: 'var(--success)' }}>
              <span>{customer.tier_name} Discount</span><span>−${tierDiscount.toFixed(2)}</span>
            </div>
          )}
          {pointsRedeemAmt > 0 && (
            <div className="totals-row" style={{ color: 'var(--success)' }}>
              <span>Points Redemption</span><span>−${pointsRedeemAmt.toFixed(2)}</span>
            </div>
          )}
          {cartTax > 0 && <div className="totals-row"><span>Tax</span><span>${cartTax.toFixed(2)}</span></div>}
          <div className="totals-row grand"><span>Total</span><span>${cartTotal.toFixed(2)}</span></div>
        </div>

        {/* Age verification notice */}
        {hasAgeRestricted && !ageVerified && (
          <div style={{ padding: '8px 16px', background: '#451a0344', borderTop: '1px solid var(--warning)', flexShrink: 0 }}>
            <div style={{ color: 'var(--warning)', fontSize: 13, fontWeight: 600 }}>
              ⚠ Age-restricted item in cart
            </div>
            <button className="btn btn-sm" style={{ background: 'var(--warning)', color: '#000', marginTop: 6 }}
              onClick={() => setAgeVerified(true)}>
              Confirm Age Verified
            </button>
          </div>
        )}
        {hasAgeRestricted && ageVerified && (
          <div style={{ padding: '6px 16px', background: '#14532d22', borderTop: '1px solid var(--success)', fontSize: 12, color: 'var(--success)', flexShrink: 0 }}>
            ✓ Age verified
          </div>
        )}

        <div className="checkout-btns">
          <button className="btn btn-ghost btn-lg" disabled={cartItems.length === 0 || (hasAgeRestricted && !ageVerified)}
            onClick={() => setPaymentOpen('cash')}>💵 Cash</button>
          <button className="btn btn-primary btn-lg" disabled={cartItems.length === 0 || (hasAgeRestricted && !ageVerified)}
            onClick={() => setPaymentOpen('card')}>💳 Card</button>
          <button className="btn btn-ghost btn-lg" style={{ gridColumn: 'span 2' }}
            disabled={cartItems.length === 0 || (hasAgeRestricted && !ageVerified)}
            onClick={() => setPaymentOpen('split')}>✂️ Split Payment</button>
        </div>
      </div>

      {/* ── Weight entry modal ─── */}
      {weightModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 380 }}>
            <div className="modal-title">Enter Weight — {weightModal.name}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
              Price: ${weightModal.price.toFixed(2)} / {weightModal.weight_unit}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input className="input" type="number" min={0} step="0.001"
                placeholder={`Weight in ${weightModal.weight_unit}`}
                value={weightInput} onChange={e => setWeightInput(e.target.value)}
                style={{ fontSize: 20, textAlign: 'center' }}
                autoFocus />
              <span style={{ alignSelf: 'center', fontWeight: 600 }}>{weightModal.weight_unit}</span>
            </div>
            {weightInput && (
              <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 22, marginBottom: 12, color: 'var(--accent)' }}>
                Total: ${(weightModal.price * parseFloat(weightInput || 0)).toFixed(2)}
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
              {ageVerifyModal.product.age_restriction_type && (
                <div style={{ marginTop: 8 }}>
                  <span className="badge badge-yellow">{ageVerifyModal.product.age_restriction_type.toUpperCase()}</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-danger btn-lg" style={{ flex: 1 }} onClick={() => setAgeVerifyModal(null)}>
                Deny — Too Young
              </button>
              <button className="btn btn-success btn-lg" style={{ flex: 1 }} onClick={ageVerifyModal.onConfirm}>
                ✓ Age Verified
              </button>
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
          salonMode={posMode === 'salon'}
          staff={allStaff}
          onClose={() => setPaymentOpen(null)}
          onComplete={handleSaleComplete}
        />
      )}
    </div>
  )
}
