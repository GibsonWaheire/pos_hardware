import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getProducts, getDailyTotals, getProductByBarcode, getProductByPlu,
  lookupCustomer, readScale, getCurrentShift, openShift, getCategories,
  getAccountByCustomer, getLoyaltyConfig, getSales, getStoreConfig, printReceipt,
} from '../api'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import { useIdleTimeout } from '../hooks/useIdleTimeout'
import { printSaleReceipt } from '../utils/print'
import Cart from '../components/Cart'
import CategorySidebar from '../components/CategorySidebar'
import IdleScreen from '../components/IdleScreen'
import PaymentModal from '../components/PaymentModal'
import ManagerAuthModal from '../components/ManagerAuthModal'

const PAGE_SIZE = 24

export default function POS() {
  const { user } = useAuth()
  const { fmt } = useCurrency()

  // ── Shift gate ────────────────────────────────────────────────────────────
  const SHIFT_KEY = user ? `pos_hw_shift_${user.id}` : null
  const [shiftStatus, setShiftStatus] = useState('checking')
  const [gateStep, setGateStep]       = useState('auth')
  const [gateAuth, setGateAuth]       = useState(null)
  const [gateFloat, setGateFloat]     = useState('')
  const [gateBusy, setGateBusy]       = useState(false)
  const [gateError, setGateError]     = useState('')

  useEffect(() => {
    if (!user) return
    if (user.role !== 'cashier') { setShiftStatus('open'); return }
    if (SHIFT_KEY && sessionStorage.getItem(SHIFT_KEY)) { setShiftStatus('open'); return }
    checkShift()
  }, [user])

  async function checkShift() {
    try {
      const res = await getCurrentShift()
      if (res.data.shift) { if (SHIFT_KEY) sessionStorage.setItem(SHIFT_KEY, '1'); setShiftStatus('open') }
      else setShiftStatus('none')
    } catch { setShiftStatus('none') }
  }

  async function handleOpenShift() {
    if (gateFloat === '') { setGateError('Enter opening float (0 if none)'); return }
    setGateBusy(true); setGateError('')
    try {
      await openShift({ cashier_id: user.id, cashier_name: user.name, opening_float: parseFloat(gateFloat) || 0 })
    } catch (e) {
      if (!e.message?.toLowerCase().includes('already')) {
        setGateError(e.message); setGateBusy(false); return
      }
    }
    if (SHIFT_KEY) sessionStorage.setItem(SHIFT_KEY, '1')
    setShiftStatus('open'); setGateBusy(false)
  }

  // ── Store config ──────────────────────────────────────────────────────────
  const [storeConfig, setStoreConfig] = useState({})
  useEffect(() => {
    if (shiftStatus !== 'open') return
    getStoreConfig().then(r => setStoreConfig(r.data || {})).catch(() => {})
  }, [shiftStatus])

  // ── Idle / attract screen (90s) ───────────────────────────────────────────
  const [attracted, setAttracted] = useState(false)
  useIdleTimeout({
    timeoutMs: 90_000,
    onIdle:    () => setAttracted(true),
    onActive:  () => setAttracted(false),
    enabled:   shiftStatus === 'open',
  })

  // ── Main state ────────────────────────────────────────────────────────────
  const [products, setProducts]             = useState([])
  const [cartItems, setCartItems]           = useState([])
  const [categories, setCategories]         = useState([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [searchQuery, setSearchQuery]       = useState('')
  const [loading, setLoading]               = useState(false)
  const [hasMore, setHasMore]               = useState(false)
  const [loadingMore, setLoadingMore]       = useState(false)
  const [dailyTotals, setDailyTotals]       = useState(null)
  const [paymentOpen, setPaymentOpen]       = useState(null)
  const [lastSale, setLastSale]             = useState(null)  // for reprint button
  const [scanStatus, setScanStatus]         = useState('')    // '', 'scanning', 'found', 'not-found'

  // Search input ref + keyboard shortcut
  const searchRef = useRef(null)
  const lastKeyTimeRef = useRef(0)
  const debounceRef = useRef(null)

  // Customer / loyalty
  const [customer, setCustomer]             = useState(null)
  const [customerQuery, setCustomerQuery]   = useState('')
  const [customerLookupMsg, setCustomerLookupMsg] = useState('')
  const [redeemPoints, setRedeemPoints]     = useState('')
  const [ageVerified, setAgeVerified]       = useState(false)
  const [customerAccount, setCustomerAccount] = useState(null)
  const [loyaltyConfig, setLoyaltyConfig]   = useState({ cents_per_point: 1 })

  // Modals
  const [weightModal, setWeightModal]       = useState(null)
  const [weightInput, setWeightInput]       = useState('')
  const [scaleBusy, setScaleBusy]           = useState(false)
  const [ageVerifyModal, setAgeVerifyModal] = useState(null)
  const [removeAuthTarget, setRemoveAuthTarget] = useState(null)
  const [discountAuthTarget, setDiscountAuthTarget] = useState(null)
  const [discountStep, setDiscountStep]     = useState('auth')
  const [discountInput, setDiscountInput]   = useState('')
  const [priceCheckMode, setPriceCheckMode] = useState(false)
  const [priceCheckResult, setPriceCheckResult] = useState(null)

  // Sales history modal
  const [historyOpen, setHistoryOpen]       = useState(false)
  const [salesHistory, setSalesHistory]     = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyMsg, setHistoryMsg]         = useState('')

  // ── Load on shift open ────────────────────────────────────────────────────
  useEffect(() => {
    if (shiftStatus !== 'open') return
    loadCategories()
    loadProducts(true)
    loadDailyTotals()
    getLoyaltyConfig().then(r => { if (r.data) setLoyaltyConfig(r.data) }).catch(() => {})
  }, [shiftStatus])

  // Re-filter when search or category changes (debounced)
  useEffect(() => {
    if (shiftStatus !== 'open') return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => loadProducts(true), 200)
    return () => clearTimeout(debounceRef.current)
  }, [searchQuery, selectedCategory]) // eslint-disable-line

  // Auto-refresh every 2 minutes
  useEffect(() => {
    if (shiftStatus !== 'open') return
    const id = setInterval(() => loadProducts(false), 120_000)
    return () => clearInterval(id)
  }, [shiftStatus, searchQuery, selectedCategory]) // eslint-disable-line

  // Customer account on customer change
  useEffect(() => {
    if (!customer?.id) { setCustomerAccount(null); return }
    getAccountByCustomer(customer.id).then(r => setCustomerAccount(r.data)).catch(() => setCustomerAccount(null))
  }, [customer?.id])

  // Keyboard shortcut: / or F3 → focus search
  useEffect(() => {
    function onKey(e) {
      if (!searchRef.current) return
      if ((e.key === '/' || e.key === 'F3') && document.activeElement !== searchRef.current) {
        e.preventDefault()
        searchRef.current.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function loadCategories() {
    try { const r = await getCategories(); setCategories(r.data) } catch {}
  }

  async function loadProducts(showSpinner = true, append = false) {
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
    } catch {}
    finally { setLoading(false); setLoadingMore(false) }
  }

  async function loadDailyTotals() {
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await getDailyTotals(today)
      setDailyTotals(res.data)
    } catch {}
  }

  // ── Unified search: Enter → barcode/PLU lookup ────────────────────────────
  async function handleSearchKey(e) {
    if (e.key !== 'Enter') {
      lastKeyTimeRef.current = Date.now()
      return
    }
    const code = searchQuery.trim()
    if (!code) return

    // If the input was empty before scan (hardware scanner), treat as scan
    setScanStatus('scanning')
    try {
      let res
      try { res = await getProductByBarcode(code) } catch { res = await getProductByPlu(code) }
      setScanStatus('found')
      addToCart(res.data)
      setSearchQuery('')
      setTimeout(() => { setScanStatus(''); searchRef.current?.focus() }, 1200)
    } catch {
      setScanStatus('not-found')
      setTimeout(() => setScanStatus(''), 2000)
    }
  }

  // ── Weight modal ──────────────────────────────────────────────────────────
  function openWeightModal(p) { setWeightInput(''); setWeightModal(p) }

  async function readScaleWeight() {
    setScaleBusy(true)
    try { const r = await readScale(); setWeightInput(String(r.data.value)) }
    catch { alert('Scale not connected.') }
    finally { setScaleBusy(false) }
  }

  function confirmWeight() {
    const w = parseFloat(weightInput)
    if (!w || w <= 0) { alert('Enter a valid weight'); return }
    const p = weightModal
    const linePrice = parseFloat((p.price * w).toFixed(2))
    addItemToCart({ ...p, product_name_display: `${p.name} (${w}${p.weight_unit})`, effective_price: linePrice, weight: w })
    setWeightModal(null)
  }

  // ── Add to cart ───────────────────────────────────────────────────────────
  const addToCart = useCallback(async (product) => {
    if (priceCheckMode) { setPriceCheckResult(product); return }
    if (product.is_weight_based) { openWeightModal(product); return }
    if (product.age_restricted && !ageVerified) {
      setAgeVerifyModal({ product, onConfirm: () => { setAgeVerified(true); setAgeVerifyModal(null); addItemToCart(product) } })
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
      const existing = prev.find(i => i.product_id === productId && i.weight == null)
      if (existing) {
        return prev.map(i => i.product_id === productId && i.weight == null
          ? { ...i, qty: i.qty + 1, line_total: (i.qty + 1) * (i.unit_price - i.discount) * (1 + i.tax_rate) }
          : i)
      }
      return [...prev, { product_id: productId, product_name: displayName, unit_price: unitPrice, qty: 1, weight: null, discount: 0, tax_rate: product.tax_rate || 0, line_total: unitPrice * (1 + (product.tax_rate || 0)) }]
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

  const requestRemoveItem = useCallback((id) => {
    const item = cartItems.find(i => (i._key || i.product_id) === id)
    setRemoveAuthTarget({ id, name: item?.product_name || 'item', total: item?.line_total || 0 })
  }, [cartItems])

  const clearCart = useCallback(() => {
    setCartItems([]); setCustomer(null); setCustomerAccount(null); setRedeemPoints(''); setAgeVerified(false)
  }, [])

  // ── Customer lookup ───────────────────────────────────────────────────────
  async function handleCustomerLookup() {
    if (!customerQuery.trim()) return
    setCustomerLookupMsg('Looking up...')
    try {
      const res = await lookupCustomer(customerQuery.trim())
      if (res.data.found) { setCustomer(res.data.customer); setCustomerLookupMsg(''); setCustomerQuery('') }
      else { setCustomerLookupMsg('Not found'); setCustomer(null) }
    } catch (e) { setCustomerLookupMsg(e.message) }
  }

  // ── Per-item discount ─────────────────────────────────────────────────────
  function requestItemDiscount(itemId) { setDiscountAuthTarget(itemId); setDiscountInput(''); setDiscountStep('auth') }

  function applyItemDiscount() {
    const amt = parseFloat(discountInput) || 0
    setCartItems(prev => prev.map(i => {
      if ((i._key || i.product_id) !== discountAuthTarget) return i
      const discount = Math.min(amt, i.unit_price)
      return { ...i, discount, line_total: i.qty * (i.unit_price - discount) * (1 + i.tax_rate) }
    }))
    setDiscountAuthTarget(null); setDiscountInput('')
  }

  // ── Sales history ─────────────────────────────────────────────────────────
  async function openHistory() {
    setHistoryOpen(true); setHistoryLoading(true); setHistoryMsg('')
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await getSales({ cashier_id: user.id, date_from: today, limit: 50 })
      setSalesHistory(res.data || [])
    } catch {}
    finally { setHistoryLoading(false) }
  }

  async function handleHistoryEscReprint(sale) {
    setHistoryMsg('Printing...')
    try { await printReceipt(sale.id); setHistoryMsg('Sent to printer') }
    catch { setHistoryMsg('Printer unavailable') }
    setTimeout(() => setHistoryMsg(''), 3000)
  }

  async function handleHistoryBrowserReprint(sale) {
    let store = {}
    try { const r = await getStoreConfig(); store = r.data || {} } catch {}
    printSaleReceipt(sale, store)
  }

  // ── Cart totals ───────────────────────────────────────────────────────────
  const cartSubtotal = cartItems.reduce((s, i) => s + i.unit_price * i.qty, 0)
  const cartDiscount = cartItems.reduce((s, i) => s + i.discount * i.qty, 0)
  const cartTax      = cartItems.reduce((s, i) => s + (i.unit_price - i.discount) * i.qty * i.tax_rate, 0)
  const tierDiscount = customer?.tier_discount_percent ? (cartSubtotal - cartDiscount) * (customer.tier_discount_percent / 100) : 0
  const kesPerPoint  = (loyaltyConfig.cents_per_point || 1) / 100
  const pointsRedeemAmt = redeemPoints ? Math.min(parseFloat(redeemPoints) * kesPerPoint, cartSubtotal - cartDiscount) : 0
  const cartTotal    = Math.max(0, cartSubtotal - cartDiscount + cartTax - tierDiscount - pointsRedeemAmt)

  const hasAgeRestricted  = cartItems.some(i => products.find(p => p.id === i.product_id)?.age_restricted)
  const checkoutDisabled  = cartItems.length === 0 || (hasAgeRestricted && !ageVerified)

  function handleSaleComplete(completedSale) {
    setLastSale(completedSale)
    setPaymentOpen(null)
    clearCart()
    loadDailyTotals()
  }

  // ── Reprint last sale ─────────────────────────────────────────────────────
  async function reprintLastReceipt() {
    if (!lastSale) return
    printSaleReceipt(lastSale, storeConfig)
  }

  async function reprintLastEsc() {
    if (!lastSale) return
    try { await printReceipt(lastSale.id) } catch { alert('Printer unavailable') }
  }

  // ── Shift gate ────────────────────────────────────────────────────────────
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
            Manager authorization required to open this shift.
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
              <input type="number" min="0" value={gateFloat}
                onChange={e => setGateFloat(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleOpenShift()}
                placeholder="0" style={{ ...gateInput, marginBottom: 12 }} autoFocus />
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
            onAuthorize={result => { setGateAuth(result); setGateError(''); setGateStep('float') }}
            onCancel={() => setGateStep('auth')}
          />
        )}
      </div>
    )
  }

  // ── Main POS layout ───────────────────────────────────────────────────────
  const scanColor = { found: 'var(--success)', 'not-found': 'var(--danger)', scanning: 'var(--text-muted)' }[scanStatus]

  return (
    <div className="pos-layout" style={{ position: 'relative' }}>

      {/* Attract screen overlay */}
      {attracted && (
        <IdleScreen storeName={storeConfig.name} onDismiss={() => setAttracted(false)} />
      )}

      {/* ── 1. Category Sidebar ── */}
      <CategorySidebar
        categories={categories}
        selected={selectedCategory}
        onSelect={cat => { setSelectedCategory(cat); setSearchQuery('') }}
      />

      {/* ── 2. Product Panel ── */}
      <div className="pos-product-panel">

        {/* Search bar */}
        <div className="pos-search-bar">
          {/* Daily totals pill */}
          {dailyTotals && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              Today: <strong>{dailyTotals.transaction_count}</strong> sales · <strong>{fmt(dailyTotals.total_revenue)}</strong>
            </div>
          )}

          <div style={{ flex: 1, position: 'relative' }}>
            <input
              ref={searchRef}
              className="pos-search-input"
              placeholder="Search by name, barcode or PLU…  (press / or F3 to focus)"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKey}
              style={{ borderColor: scanColor || undefined, width: '100%' }}
              autoFocus
            />
            {scanStatus && (
              <span style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                fontSize: 12, color: scanColor, fontWeight: 600,
              }}>
                {{ scanning: '⏳ Scanning…', found: '✓ Added', 'not-found': '✗ Not found' }[scanStatus]}
              </span>
            )}
          </div>

          <button
            className={`btn btn-sm ${priceCheckMode ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setPriceCheckMode(m => !m); setPriceCheckResult(null) }}
            title="Price check mode — tap a product to see price without adding to cart"
            style={{ flexShrink: 0 }}
          >
            {priceCheckMode ? '✓ Price Check' : '🔍 Price'}
          </button>

          <button className="btn btn-ghost btn-sm" onClick={openHistory} style={{ flexShrink: 0 }}>
            History
          </button>
        </div>

        {/* Price check result */}
        {priceCheckMode && priceCheckResult && (
          <div style={{ padding: '8px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div>
              <div style={{ fontWeight: 700 }}>{priceCheckResult.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {priceCheckResult.barcode && `Barcode: ${priceCheckResult.barcode}`}
                {priceCheckResult.plu_code && ` · PLU: ${priceCheckResult.plu_code}`}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent)' }}>{fmt(priceCheckResult.price)}</div>
              {priceCheckResult.is_weight_based && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>per {priceCheckResult.weight_unit}</div>}
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Stock: {priceCheckResult.stock_qty}</div>
            </div>
          </div>
        )}

        {/* Product grid */}
        <div className="pos-product-grid-wrap">
          {loading ? (
            <div className="empty-state">Loading…</div>
          ) : products.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
              <div>No products found</div>
              {searchQuery && <div style={{ fontSize: 12, marginTop: 6, color: 'var(--text-muted)' }}>Try a different search term or scan the barcode</div>}
            </div>
          ) : (
            <>
              <div className="product-grid">
                {products.map(product => {
                  const isOos = product.stock_qty === 0
                  const isLow = !isOos && product.stock_qty <= product.low_stock_threshold
                  const unit  = product.is_weight_based ? (product.weight_unit || 'kg') : (product.weight_unit || 'pc')
                  const icon  = product.category_name ? getCategoryIcon(product.category_name) : '📦'

                  return (
                    <div
                      key={product.id}
                      className="product-tile"
                      onClick={() => addToCart(product)}
                      style={{ borderColor: product.age_restricted ? 'var(--warning)' : undefined }}
                      title={`${product.name}${product.barcode ? ` · ${product.barcode}` : ''}${product.plu_code ? ` · PLU ${product.plu_code}` : ''}`}
                    >
                      {/* Image / icon area */}
                      <div className="tile-img-area">
                        {product.image_url
                          ? <img src={product.image_url} alt={product.name} />
                          : <span>{icon}</span>
                        }
                      </div>

                      {/* Details */}
                      <div className="tile-body">
                        <div className="tile-name">{product.name}</div>
                        <div className="tile-price">
                          {fmt(product.price)}
                          <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 2 }}>/{unit}</span>
                        </div>
                        <div className="tile-stock">
                          {isOos
                            ? <span style={{ color: 'var(--danger)' }}>Out of stock</span>
                            : isLow
                            ? <span style={{ color: 'var(--warning)' }}>Low: {product.stock_qty} {unit}</span>
                            : <span>{product.stock_qty} {unit}</span>
                          }
                        </div>
                      </div>

                      {isOos && <div className="tile-oos-overlay"><span>OUT OF STOCK</span></div>}
                      {isLow && <div className="tile-low-badge" />}
                    </div>
                  )
                })}
              </div>

              {hasMore && (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <button className="btn btn-ghost" onClick={() => loadProducts(true, true)} disabled={loadingMore} style={{ minWidth: 160 }}>
                    {loadingMore ? 'Loading…' : 'Load more products'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── 3. Cart Panel ── */}
      <div className="pos-right">

        {/* Cart header */}
        <div className="cart-header">
          <span>Cart {cartItems.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>({cartItems.length} item{cartItems.length !== 1 ? 's' : ''})</span>}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {cartItems.length > 0 && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={clearCart} title="Void all items (clear cart)">Void All</button>
              </>
            )}
          </div>
        </div>

        {/* Customer panel */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
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
                <div style={{ marginTop: 4, padding: '4px 8px', borderRadius: 6, background: 'var(--surface2)', fontSize: 11, display: 'flex', gap: 8 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Acct:</span>
                  <span style={{ fontWeight: 700, color: customerAccount.balance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {fmt(customerAccount.balance)}
                  </span>
                  {customerAccount.credit_limit > 0 && (
                    <span style={{ color: 'var(--text-muted)' }}>· Avail: {fmt(customerAccount.balance + customerAccount.credit_limit)}</span>
                  )}
                </div>
              )}
              {customer.loyalty_points > 0 && cartItems.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                  <input className="input" type="number" min={0} max={customer.loyalty_points}
                    placeholder={`Redeem pts (${customer.loyalty_points.toLocaleString()} avail)`}
                    value={redeemPoints} onChange={e => setRedeemPoints(e.target.value)}
                    style={{ fontSize: 11, padding: '4px 8px' }} />
                  {redeemPoints > 0 && <span style={{ fontSize: 11, color: 'var(--success)', whiteSpace: 'nowrap' }}>−{fmt(pointsRedeemAmt)}</span>}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="input" placeholder="Phone / member ID…"
                  value={customerQuery} onChange={e => setCustomerQuery(e.target.value)}
                  onKeyUp={e => e.key === 'Enter' && handleCustomerLookup()}
                  style={{ fontSize: 12, padding: '6px 10px' }} />
                <button className="btn btn-ghost btn-sm" onClick={handleCustomerLookup}>Find</button>
              </div>
              {customerLookupMsg && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>{customerLookupMsg}</div>}
            </div>
          )}
        </div>

        {/* Cart items */}
        <Cart
          items={cartItems}
          onUpdateQty={updateQty}
          onRemove={removeItem}
          onRemoveRequest={requestRemoveItem}
          onDiscountRequest={requestItemDiscount}
        />

        {/* Totals */}
        <div className="cart-totals">
          <div className="totals-row"><span>Subtotal</span><span>{fmt(cartSubtotal)}</span></div>
          {cartDiscount > 0 && <div className="totals-row"><span>Discounts</span><span>−{fmt(cartDiscount)}</span></div>}
          {tierDiscount > 0 && <div className="totals-row" style={{ color: 'var(--success)' }}><span>{customer.tier_name}</span><span>−{fmt(tierDiscount)}</span></div>}
          {pointsRedeemAmt > 0 && <div className="totals-row" style={{ color: 'var(--success)' }}><span>Points</span><span>−{fmt(pointsRedeemAmt)}</span></div>}
          {cartTax > 0 && <div className="totals-row"><span>VAT</span><span>{fmt(cartTax)}</span></div>}
          <div className="totals-row grand"><span>Total</span><span>{fmt(cartTotal)}</span></div>
        </div>

        {/* Age verification */}
        {hasAgeRestricted && !ageVerified && (
          <div style={{ padding: '6px 12px', background: '#451a0344', borderTop: '1px solid var(--warning)', flexShrink: 0 }}>
            <div style={{ color: 'var(--warning)', fontSize: 12, fontWeight: 600 }}>⚠ Age-restricted item</div>
            <button className="btn btn-sm" style={{ background: 'var(--warning)', color: '#000', marginTop: 4, width: '100%' }}
              onClick={() => setAgeVerified(true)}>Confirm Age Verified</button>
          </div>
        )}
        {hasAgeRestricted && ageVerified && (
          <div style={{ padding: '4px 12px', background: '#14532d22', borderTop: '1px solid var(--success)', fontSize: 11, color: 'var(--success)', flexShrink: 0 }}>
            ✓ Age verified
          </div>
        )}

        {/* Print receipt row — always visible after last sale */}
        {lastSale && (
          <div className="cart-print-row">
            <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={reprintLastEsc} title="Send to thermal receipt printer">
              🖨️ ESC/POS
            </button>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={reprintLastReceipt} title="Print via browser (A4/80mm)">
              🖨️ Browser
            </button>
            <button className="btn btn-ghost btn-sm" onClick={openHistory} title="View today's sales history">
              📋
            </button>
          </div>
        )}

        {/* Checkout buttons */}
        <div className="checkout-btns">
          <button className="btn btn-ghost btn-lg" disabled={checkoutDisabled} onClick={() => setPaymentOpen('cash')}>
            💵 Cash
          </button>
          <button className="btn btn-primary btn-lg" disabled={checkoutDisabled} onClick={() => setPaymentOpen('card')}>
            💳 Card
          </button>
          <button className="btn btn-lg" disabled={checkoutDisabled} onClick={() => setPaymentOpen('mpesa')}
            style={{ background: '#4caf50', color: '#fff', border: 'none' }}>
            📱 M-Pesa
          </button>
          <button className="btn btn-lg" disabled={checkoutDisabled} onClick={() => setPaymentOpen('account')}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', opacity: 0.9 }}>
            🏦 Account
          </button>
          <button className="btn btn-ghost btn-lg" style={{ gridColumn: 'span 2' }} disabled={checkoutDisabled}
            onClick={() => setPaymentOpen('split')}>
            ✂️ Split
          </button>
        </div>
      </div>

      {/* ── Modals ── */}

      {/* Weight entry */}
      {weightModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 380 }}>
            <div className="modal-title">Enter Weight — {weightModal.name}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
              Price: {fmt(weightModal.price)} / {weightModal.weight_unit}
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
                Total: {fmt(weightModal.price * parseFloat(weightInput || 0))}
              </div>
            )}
            <button className="btn btn-ghost" style={{ width: '100%', marginBottom: 8 }}
              onClick={readScaleWeight} disabled={scaleBusy}>
              {scaleBusy ? 'Reading…' : '⚖️ Read from Scale'}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={() => setWeightModal(null)}>Cancel</button>
              <button className="btn btn-success btn-lg" style={{ flex: 2 }} onClick={confirmWeight}>Add to Cart</button>
            </div>
          </div>
        </div>
      )}

      {/* Age verify */}
      {ageVerifyModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 380, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
            <div className="modal-title" style={{ justifyContent: 'center' }}>Age Verification Required</div>
            <div style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
              <strong>{ageVerifyModal.product.name}</strong> requires age verification.
              <br />Customer must be <strong>{ageVerifyModal.product.min_age}+</strong>.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-danger btn-lg" style={{ flex: 1 }} onClick={() => setAgeVerifyModal(null)}>Deny — Too Young</button>
              <button className="btn btn-success btn-lg" style={{ flex: 1 }} onClick={ageVerifyModal.onConfirm}>✓ Age Verified</button>
            </div>
          </div>
        </div>
      )}

      {/* Manager auth: remove item */}
      {removeAuthTarget && (
        <ManagerAuthModal
          title="Remove Item from Cart"
          description={`${removeAuthTarget.name} — ${fmt(removeAuthTarget.total)}`}
          onAuthorize={() => { removeItem(removeAuthTarget.id); setRemoveAuthTarget(null) }}
          onCancel={() => setRemoveAuthTarget(null)}
        />
      )}

      {/* Manager auth: item discount */}
      {discountAuthTarget && discountStep === 'auth' && (
        <ManagerAuthModal
          title="Apply Item Discount"
          description="Manager authorization required to discount a line item"
          onAuthorize={() => setDiscountStep('input')}
          onCancel={() => setDiscountAuthTarget(null)}
        />
      )}
      {discountAuthTarget && discountStep === 'input' && (() => {
        const item = cartItems.find(i => (i._key || i.product_id) === discountAuthTarget)
        return (
          <div className="modal-overlay">
            <div className="modal" style={{ width: 360 }}>
              <div className="modal-title">Item Discount</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                {item?.product_name} — {fmt(item?.unit_price)} each
              </div>
              <label className="label">Discount per unit (KES)</label>
              <input className="input" type="number" min={0} step={1} max={item?.unit_price}
                value={discountInput}
                onChange={e => setDiscountInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyItemDiscount()}
                autoFocus style={{ marginBottom: 8 }}
              />
              {discountInput > 0 && item && (
                <div style={{ fontSize: 12, color: 'var(--success)', marginBottom: 12 }}>
                  New price: {fmt(item.unit_price - parseFloat(discountInput))} each
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setDiscountAuthTarget(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={applyItemDiscount}>Apply</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Sales History */}
      {historyOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setHistoryOpen(false)}>
          <div className="modal" style={{ width: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="modal-title" style={{ marginBottom: 0 }}>Today's Sales</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setHistoryOpen(false)}>✕</button>
            </div>
            {historyMsg && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{historyMsg}</div>}
            {historyLoading ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Loading…</div>
            ) : salesHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No sales recorded today</div>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <table className="table">
                  <thead>
                    <tr><th>Time</th><th>Receipt</th><th>Customer</th><th>Total</th><th>Method</th><th></th></tr>
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
                          {fmt(s.total)}
                          {s.status === 'voided' && <span className="badge badge-red" style={{ marginLeft: 6, fontSize: 9 }}>VOID</span>}
                        </td>
                        <td style={{ fontSize: 12, textTransform: 'capitalize', color: 'var(--text-muted)' }}>
                          {(s.payment_method || '').replace(/_/g, ' ')}
                        </td>
                        <td style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleHistoryEscReprint(s)}
                            disabled={s.status === 'voided'} title="ESC/POS printer">ESC</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleHistoryBrowserReprint(s)}
                            disabled={s.status === 'voided'} title="Browser print">Print</button>
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

      {/* Payment */}
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

// Category icon helper (reuse same map as CategorySidebar)
const CAT_ICONS = [
  [/nail|fastener/i, '🔩'], [/screw|bolt/i, '🪛'], [/wire|cable|elec/i, '⚡'],
  [/paint|colour/i, '🎨'], [/pipe|plumb/i, '🔧'], [/tool/i, '🛠️'],
  [/wood|timber/i, '🪵'], [/lock|security/i, '🔒'], [/glass/i, '🪟'],
  [/cement|concrete/i, '🏗️'], [/adhesive|glue/i, '🔗'], [/garden/i, '🌿'],
  [/safety|ppe/i, '🦺'], [/measur/i, '📏'], [/light|lamp/i, '💡'],
  [/door|window/i, '🚪'],
]
function getCategoryIcon(name) {
  for (const [p, icon] of CAT_ICONS) { if (p.test(name)) return icon }
  return '📦'
}

// ── Shift gate styles ─────────────────────────────────────────────────────────

const gateWrap = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--bg)' }
const gateCard = { background: 'var(--surface)', borderRadius: 16, padding: '40px 36px', width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }
const gateInput = { width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 16, border: '2px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', boxSizing: 'border-box', outline: 'none' }
const gateBtn = { width: '100%', padding: '12px', borderRadius: 8, border: 'none', background: 'var(--primary,#4f6ef7)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }
const gateErr = { padding: '8px 12px', borderRadius: 6, background: '#ef444420', color: '#ef4444', fontSize: 13, marginBottom: 10 }
const gateLinkBtn = { display: 'block', width: '100%', padding: '8px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }
