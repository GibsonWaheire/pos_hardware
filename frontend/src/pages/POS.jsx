import { useState, useEffect, useCallback } from 'react'
import { getProducts, getDailyTotals, getProductByBarcode, getProductByPlu, lookupCustomer, readScale, getCurrentShift, openShift, getCategories, getAccountByCustomer, getLoyaltyConfig, getSales, getStoreConfig, printReceipt } from '../api'
import { useAuth } from '../context/AuthContext'
import { printSaleReceipt } from '../utils/print'
import Cart from '../components/Cart'
import BarcodeInput from '../components/BarcodeInput'
import PaymentModal from '../components/PaymentModal'
import ManagerAuthModal from '../components/ManagerAuthModal'

export default function POS() {
  const { user } = useAuth()

  // ── Shift gate (cashier only) ─────────────────────────────────────────────
  // Use sessionStorage so gate never re-appears after navigating away and back
  const SHIFT_KEY = user ? `pos_hw_shift_${user.id}` : null

  const [shiftStatus, setShiftStatus]   = useState('checking') // 'checking' | 'open' | 'none'
  const [gateStep, setGateStep]         = useState('auth')     // 'auth' | 'scanning' | 'float'
  const [gateAuth, setGateAuth]         = useState(null)       // authorizer result
  const [gateFloat, setGateFloat]       = useState('')
  const [gateBusy, setGateBusy]         = useState(false)
  const [gateError, setGateError]       = useState('')

  useEffect(() => {
    if (!user) return
    if (user.role !== 'cashier') { setShiftStatus('open'); return }
    // Fast path: shift already confirmed open this browser session
    if (SHIFT_KEY && sessionStorage.getItem(SHIFT_KEY)) { setShiftStatus('open'); return }
    checkShift()
  }, [user])

  async function checkShift() {
    try {
      const res = await getCurrentShift()
      if (res.data.shift) {
        if (SHIFT_KEY) sessionStorage.setItem(SHIFT_KEY, '1')
        setShiftStatus('open')
      } else {
        setShiftStatus('none')
      }
    } catch {
      // If API errors (e.g. session expired), show gate but don't block forever
      setShiftStatus('none')
    }
  }

  function onManagerAuthorized(authResult) {
    setGateAuth(authResult)
    setGateError('')
  }

  async function handleOpenShift() {
    if (gateFloat === '') { setGateError('Enter opening float amount (0 if no float)'); return }
    setGateBusy(true); setGateError('')
    try {
      await openShift({
        cashier_id:    user.id,
        cashier_name:  user.name,
        opening_float: parseFloat(gateFloat) || 0,
      })
    } catch (e) {
      // If a shift is already open, treat it as success — don't trap the user
      if (!e.message?.toLowerCase().includes('already')) {
        setGateError(e.message)
        setGateBusy(false)
        return
      }
    }
    if (SHIFT_KEY) sessionStorage.setItem(SHIFT_KEY, '1')
    setShiftStatus('open')
    setGateBusy(false)
  }

  // ── Main state ────────────────────────────────────────────────────────────
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

  // Category filter + pagination
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState(null)

  // Sales history panel
  const [historyOpen, setHistoryOpen] = useState(false)
  const [salesHistory, setSalesHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyReprintMsg, setHistoryReprintMsg] = useState('')

  // Loyalty config (cents_per_point from backend)
  const [loyaltyConfig, setLoyaltyConfig] = useState({ cents_per_point: 1 })

  // Customer / loyalty
  const [customer, setCustomer] = useState(null)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerLookupMsg, setCustomerLookupMsg] = useState('')
  const [redeemPoints, setRedeemPoints] = useState('')
  const [ageVerified, setAgeVerified] = useState(false)
  const [customerAccount, setCustomerAccount] = useState(null)

  const PAGE_SIZE = 24

  // Load products, categories and totals once shift gate is cleared
  useEffect(() => {
    if (shiftStatus !== 'open') return
    loadCategories()
    loadProducts()
    loadDailyTotals()
    getLoyaltyConfig().then(r => { if (r.data) setLoyaltyConfig(r.data) }).catch(() => {})
  }, [shiftStatus])

  // Re-filter when search or category changes
  useEffect(() => {
    if (shiftStatus !== 'open') return
    loadProducts()
  }, [searchQuery, selectedCategory]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh product catalog every 2 minutes (silent — no spinner)
  useEffect(() => {
    if (shiftStatus !== 'open') return
    const id = setInterval(() => loadProducts(false), 120_000)
    return () => clearInterval(id)
  }, [shiftStatus, searchQuery, selectedCategory]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch linked account whenever a customer is selected / cleared
  useEffect(() => {
    if (!customer?.id) { setCustomerAccount(null); return }
    getAccountByCustomer(customer.id)
      .then(r => setCustomerAccount(r.data))
      .catch(() => setCustomerAccount(null))
  }, [customer?.id])

  async function loadCategories() {
    try { const res = await getCategories(); setCategories(res.data) } catch {}
  }

  async function loadProducts(showSpinner = true, append = false) {
    // Don't fetch if nothing to filter on — prompt is shown instead
    if (!searchQuery.trim() && !selectedCategory && !append) {
      setProducts([]); setHasMore(false); setLoading(false); return
    }
    if (showSpinner && !append) setLoading(true)
    if (append) setLoadingMore(true)
    const params = { active: 'true', limit: PAGE_SIZE, offset: append ? products.length : 0 }
    if (searchQuery.trim()) params.q = searchQuery.trim()
    if (selectedCategory) params.category_id = selectedCategory
    try {
      const res = await getProducts(params)
      const data = res.data
      if (append) setProducts(prev => [...prev, ...data])
      else setProducts(data)
      setHasMore(data.length === PAGE_SIZE)
      setLastRefreshed(new Date())
    }
    catch (e) { console.error(e) }
    finally { setLoading(false); setLoadingMore(false) }
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
    setCartItems(prev => prev.filter(i => (i._key || i.product_id) !== id))
  }, [])

  // Manager auth gate for cart removal
  const [removeAuthTarget, setRemoveAuthTarget] = useState(null) // { id, name, total }

  const requestRemoveItem = useCallback((id) => {
    const item = cartItems.find(i => (i._key || i.product_id) === id)
    setRemoveAuthTarget({ id, name: item?.product_name || 'item', total: item?.line_total || 0 })
  }, [cartItems])

  const clearCart = useCallback(() => {
    setCartItems([])
    setCustomer(null)
    setCustomerAccount(null)
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

  // ── Sales history ─────────────────────────────────────────────────────────

  async function openHistory() {
    setHistoryOpen(true)
    setHistoryLoading(true)
    setHistoryReprintMsg('')
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await getSales({ cashier_id: user.id, date_from: today, limit: 50 })
      setSalesHistory(res.data || [])
    } catch (e) { console.error(e) }
    finally { setHistoryLoading(false) }
  }

  async function handleHistoryEscReprint(sale) {
    setHistoryReprintMsg('Printing...')
    try { await printReceipt(sale.id); setHistoryReprintMsg('Sent to printer') }
    catch { setHistoryReprintMsg('Printer unavailable') }
    setTimeout(() => setHistoryReprintMsg(''), 3000)
  }

  async function handleHistoryBrowserReprint(sale) {
    let store = {}
    try { const r = await getStoreConfig(); store = r.data || {} } catch {}
    printSaleReceipt(sale, store)
  }

  // ── Cart totals ───────────────────────────────────────────────────────────

  const cartSubtotal = cartItems.reduce((s, i) => s + i.unit_price * i.qty, 0)
  const cartDiscount = cartItems.reduce((s, i) => s + i.discount * i.qty, 0)
  const cartTax = cartItems.reduce((s, i) => s + (i.unit_price - i.discount) * i.qty * i.tax_rate, 0)
  const tierDiscount = customer?.tier_discount_percent ? (cartSubtotal - cartDiscount) * (customer.tier_discount_percent / 100) : 0
  const kesPerPoint = (loyaltyConfig.cents_per_point || 1) / 100
  const pointsRedeemAmt = redeemPoints ? Math.min(parseFloat(redeemPoints) * kesPerPoint, cartSubtotal - cartDiscount) : 0
  const cartTotal = Math.max(0, cartSubtotal - cartDiscount + cartTax - tierDiscount - pointsRedeemAmt)

  function handleSaleComplete() { setPaymentOpen(null); clearCart(); loadDailyTotals() }

  const hasAgeRestricted = cartItems.some(i => products.find(p => p.id === i.product_id)?.age_restricted)
  const checkoutDisabled = cartItems.length === 0 || (hasAgeRestricted && !ageVerified)

  // ── Shift gate ─────────────────────────────────────────────────────────────
  if (shiftStatus === 'checking') {
    return <div style={gateWrap}><div style={{ color: 'var(--text-muted)' }}>Checking shift…</div></div>
  }

  if (shiftStatus === 'none') {
    return (
      <div style={gateWrap}>
        <div style={gateCard}>
          <div style={{ fontSize: 48, textAlign: 'center' }}>🔒</div>
          <h2 style={{ margin: '8px 0 4px', textAlign: 'center' }}>No Shift Open</h2>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 13, margin: '0 0 24px' }}>
            A manager must authorize before you can process sales.
          </p>

          {gateStep === 'auth' && (
            <button style={gateBtn} onClick={() => setGateStep('scanning')}>
              Authorize with Manager Card / PIN
            </button>
          )}

          {gateStep === 'float' && (
            <div>
              <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--success,#22c55e)' }}>
                Authorized by <strong>{gateAuth?.authorizer?.name}</strong>
              </div>
              <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Opening Float (KES)</label>
              <input
                type="number"
                min="0"
                value={gateFloat}
                onChange={e => setGateFloat(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleOpenShift()}
                placeholder="0"
                style={{ ...gateInput, marginBottom: 12 }}
                autoFocus
              />
              {gateError && <div style={gateErr}>{gateError}</div>}
              <button style={gateBtn} onClick={handleOpenShift} disabled={gateBusy}>
                {gateBusy ? 'Opening…' : 'Open Shift'}
              </button>
              <button style={gateLinkBtn} onClick={() => { setGateStep('auth'); setGateAuth(null); setGateError('') }}>
                Re-authorize
              </button>
            </div>
          )}
        </div>

        {gateStep === 'scanning' && (
          <ManagerAuthModal
            title="Open Shift"
            description="Manager authorization required to open this cashier's shift"
            onAuthorize={result => { onManagerAuthorized(result); setGateStep('float') }}
            onCancel={() => setGateStep('auth')}
          />
        )}
      </div>
    )
  }

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
            {lastRefreshed && (
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                Updated {Math.round((Date.now() - lastRefreshed) / 60000) || '<1'} min ago
              </span>
            )}
            <button
              className={`btn btn-sm ${priceCheckMode ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setPriceCheckMode(m => !m); setPriceCheckResult(null) }}
            >
              {priceCheckMode ? '✓ Price Check ON' : '🔍 Price Check'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={openHistory}>
              History
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

        {/* Category filter tabs */}
        {categories.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
            {categories.map(cat => (
              <button
                key={cat.id}
                className={`btn btn-sm ${selectedCategory === String(cat.id) ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSelectedCategory(s => s === String(cat.id) ? '' : String(cat.id))}
                style={{ borderRadius: 20, fontSize: 12 }}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Product grid */}
        {!searchQuery.trim() && !selectedCategory ? (
          <div className="empty-state" style={{ paddingTop: 60 }}>
            Select a category above or search for a product
          </div>
        ) : loading ? (
          <div className="empty-state">Loading products...</div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            {selectedCategory ? 'No products in this category' : 'No products match your search'}
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div className="product-grid">
              {products.map(product => {
                const unit = product.is_weight_based
                  ? product.weight_unit || 'kg'
                  : product.weight_unit || 'pc'
                return (
                  <div key={product.id} className="product-tile" onClick={() => addToCart(product)}
                    style={{ borderColor: product.age_restricted ? 'var(--warning)' : undefined }}
                    title={[product.barcode, product.plu_code && `PLU: ${product.plu_code}`].filter(Boolean).join(' · ')}>
                    <div className="tile-name">{product.name}</div>
                    {product.age_restricted && <div style={{ fontSize: 10, color: 'var(--warning)', marginBottom: 2 }}>⚠ {product.age_restriction_type?.toUpperCase()} {product.min_age}+</div>}
                    <div className="tile-price">
                      KES {product.price.toFixed(2)}
                      <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 2 }}>/{unit}</span>
                    </div>
                    <div className="tile-stock">
                      {product.plu_code && <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>PLU:{product.plu_code}</span>}
                      {product.stock_qty === 0
                        ? <span style={{ color: 'var(--danger)' }}>Out of stock</span>
                        : product.stock_qty <= product.low_stock_threshold
                        ? <span style={{ color: 'var(--warning)' }}>Low ({product.stock_qty} {unit})</span>
                        : <span>{product.stock_qty} {unit}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
            {hasMore && (
              <div style={{ textAlign: 'center', padding: '12px 0', flexShrink: 0 }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => loadProducts(true, true)}
                  disabled={loadingMore}
                  style={{ minWidth: 160 }}
                >
                  {loadingMore ? 'Loading...' : `Load more products`}
                </button>
              </div>
            )}
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
            <div>
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
              {customerAccount != null && (
                <div style={{ marginTop: 6, padding: '5px 8px', borderRadius: 6, background: 'var(--surface2)', fontSize: 11, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Account:</span>
                  <span style={{ fontWeight: 700, color: customerAccount.balance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    KES {Number(customerAccount.balance).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                  </span>
                  {customerAccount.credit_limit > 0 && (
                    <span style={{ color: 'var(--text-muted)' }}>
                      · Available: KES {Number(customerAccount.balance + customerAccount.credit_limit).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                  {customerAccount.balance < 0 && (
                    <span className="badge badge-red" style={{ fontSize: 9 }}>OWES</span>
                  )}
                </div>
              )}
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
                placeholder={`Redeem points (${customer.loyalty_points.toLocaleString()} avail)`}
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

        <Cart items={cartItems} onUpdateQty={updateQty} onRemove={removeItem} onRemoveRequest={requestRemoveItem} />

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

      {/* ── Manager auth: remove item ─── */}
      {removeAuthTarget && (
        <ManagerAuthModal
          title="Remove Item from Cart"
          description={`${removeAuthTarget.name} — KES ${removeAuthTarget.total.toFixed(2)}`}
          onAuthorize={() => { removeItem(removeAuthTarget.id); setRemoveAuthTarget(null) }}
          onCancel={() => setRemoveAuthTarget(null)}
        />
      )}

      {/* ── Sales History modal ─── */}
      {historyOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setHistoryOpen(false)}>
          <div className="modal" style={{ width: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="modal-title" style={{ marginBottom: 0 }}>Today's Sales</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setHistoryOpen(false)}>✕</button>
            </div>
            {historyReprintMsg && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{historyReprintMsg}</div>
            )}
            {historyLoading ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Loading...</div>
            ) : salesHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No sales recorded today</div>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th><th>Receipt</th><th>Customer</th>
                      <th>Total</th><th>Method</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesHistory.map(s => (
                      <tr key={s.id} style={{ opacity: s.status === 'voided' ? 0.5 : 1 }}>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {new Date(s.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.receipt_number}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{s.customer_name || '—'}</td>
                        <td style={{ fontWeight: 600 }}>
                          KES {Number(s.total).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                          {s.status === 'voided' && <span className="badge badge-red" style={{ marginLeft: 6, fontSize: 9 }}>VOID</span>}
                        </td>
                        <td style={{ fontSize: 12, textTransform: 'capitalize', color: 'var(--text-muted)' }}>
                          {(s.payment_method || '').replace(/_/g, ' ')}
                        </td>
                        <td style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleHistoryEscReprint(s)}
                            disabled={s.status === 'voided'} title="ESC/POS printer">
                            ESC
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleHistoryBrowserReprint(s)}
                            disabled={s.status === 'voided'} title="Browser print">
                            Print
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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

// ── Shift gate styles ──────────────────────────────────────────────────────────

const gateWrap = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  height: '100%', background: 'var(--bg)',
}
const gateCard = {
  background: 'var(--surface)', borderRadius: 16, padding: '40px 36px',
  width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
}
const gateInput = {
  width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 16,
  border: '2px solid var(--border)', background: 'var(--surface2)',
  color: 'var(--text)', boxSizing: 'border-box', outline: 'none',
}
const gateBtn = {
  width: '100%', padding: '12px', borderRadius: 8, border: 'none',
  background: 'var(--primary,#4f6ef7)', color: '#fff', fontSize: 15,
  fontWeight: 700, cursor: 'pointer', marginBottom: 8,
}
const gateErr = {
  padding: '8px 12px', borderRadius: 6, background: '#ef444420',
  color: '#ef4444', fontSize: 13, marginBottom: 10,
}
const gateLinkBtn = {
  display: 'block', width: '100%', padding: '8px', background: 'none',
  border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13,
}
