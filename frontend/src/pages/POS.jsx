import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getProducts, getProductByBarcode, getProductByPlu,
  getCurrentShift, openShift, getAccountByCustomer, getLoyaltyConfig,
  getSales, getStoreConfig, printReceipt, getCategories,
  selfApproveOverride, cashierEndShift,
} from '../api'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import { useIdleTimeout } from '../hooks/useIdleTimeout'
import { printSaleReceipt } from '../utils/print'
import { parkSale, getParkedSales, retrieveSale, discardSale } from '../utils/parkedSales'
import Cart from '../components/Cart'
import IdleScreen from '../components/IdleScreen'
import IdleCheckout from '../components/IdleCheckout'
import PaymentModal from '../components/PaymentModal'
import ManagerAuthModal from '../components/ManagerAuthModal'

const CAT_COLORS = [
  '#4f6ef7', '#16a34a', '#d97706', '#dc2626',
  '#7c3aed', '#0891b2', '#db2777', '#65a30d',
  '#ea580c', '#0284c7',
]

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

  const isElevated = ['manager', 'admin'].includes(user?.role)

  useEffect(() => {
    if (!user) return
    if (SHIFT_KEY && sessionStorage.getItem(SHIFT_KEY)) { setShiftStatus('open'); return }
    checkShift()
  }, [user]) // eslint-disable-line

  async function checkShift() {
    try {
      const res = await getCurrentShift()
      const shift = res.data.shift
      if (shift) {
        // pending_close shifts: cashier who ended it is locked out; elevated users proceed
        if (shift.status === 'pending_close' && !isElevated) {
          setShiftStatus('ended')
          return
        }
        if (SHIFT_KEY) sessionStorage.setItem(SHIFT_KEY, '1')
        setShiftStatus('open')
      } else {
        // Elevated users bypass the "no shift" gate — they can open one themselves
        setShiftStatus(isElevated ? 'none_elevated' : 'none')
      }
    } catch { setShiftStatus(isElevated ? 'none_elevated' : 'none') }
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

  // ── Search state ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery]     = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedIdx, setSelectedIdx]     = useState(0)
  const [noResults, setNoResults]         = useState(false)
  const searchRef   = useRef(null)
  const debounceRef = useRef(null)

  // ── Category pills ────────────────────────────────────────────────────────
  const [categories, setCategories] = useState([])
  const [activeCat, setActiveCat]   = useState(null)

  useEffect(() => {
    if (shiftStatus !== 'open') return
    getCategories().then(r => setCategories(r.data || [])).catch(() => {})
  }, [shiftStatus])

  // Auto-focus search when shift opens; F3 or '/' focuses from anywhere
  useEffect(() => {
    if (shiftStatus === 'open') setTimeout(() => searchRef.current?.focus(), 100)
  }, [shiftStatus])

  useEffect(() => {
    if (shiftStatus !== 'open') return
    function onGlobalKey(e) {
      if (e.key === 'F3' || (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA')) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onGlobalKey)
    return () => window.removeEventListener('keydown', onGlobalKey)
  }, [shiftStatus])

  // Debounced product search (also fires on category change)
  useEffect(() => {
    const q = searchQuery.trim()
    if (!q && !activeCat) {
      setSearchResults([])
      setNoResults(false)
      setSelectedIdx(0)
      return
    }
    clearTimeout(debounceRef.current)
    const delay = q ? 200 : 0  // instant on category tap, debounced on typing
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const params = { active: 'true', limit: 30 }
        if (q) params.q = q
        if (activeCat) params.category_id = activeCat
        const res = await getProducts(params)
        const data = res.data || []
        setSearchResults(data)
        setNoResults(data.length === 0)
        setSelectedIdx(0)
      } catch {
        setSearchResults([])
      }
      setSearchLoading(false)
    }, delay)
    return () => clearTimeout(debounceRef.current)
  }, [searchQuery, activeCat])

  // ── Scan/add flash ────────────────────────────────────────────────────────
  const [lastAdded, setLastAdded] = useState(null) // { name, price, image_url }
  const flashTimerRef = useRef(null)

  function flashProduct(product) {
    clearTimeout(flashTimerRef.current)
    setLastAdded({
      name:      product.product_name_display || product.name,
      price:     product.effective_price ?? product.price,
      image_url: product.image_url || null,
    })
    flashTimerRef.current = setTimeout(() => setLastAdded(null), 2500)
  }

  useEffect(() => () => clearTimeout(flashTimerRef.current), [])

  // ── Zero-price error banner ───────────────────────────────────────────────
  const [zeroPriceError, setZeroPriceError] = useState('')
  const zeroPriceTimer = useRef(null)
  function showZeroPriceError(msg) {
    clearTimeout(zeroPriceTimer.current)
    setZeroPriceError(msg)
    zeroPriceTimer.current = setTimeout(() => setZeroPriceError(''), 4000)
  }
  useEffect(() => () => clearTimeout(zeroPriceTimer.current), [])

  // ── Manual item entry ─────────────────────────────────────────────────────
  const [manualOpen, setManualOpen]   = useState(false)
  const [manualName, setManualName]   = useState('')
  const [manualPrice, setManualPrice] = useState('')
  const [manualQty, setManualQty]     = useState('1')

  function submitManualItem() {
    const price = parseFloat(manualPrice)
    const qty   = Math.max(1, parseInt(manualQty) || 1)
    if (!manualName.trim() || !price || price <= 0) return
    const key = `manual-${Date.now()}`
    const item = {
      product_id:   null,
      product_name: manualName.trim(),
      unit_price:   price,
      qty,
      weight:       null,
      discount:     0,
      tax_rate:     0,
      line_total:   price * qty,
      image_url:    null,
      _key:         key,
    }
    setCartItems(prev => [...prev, item])
    setCurrentItemId(key)
    flashProduct({ name: item.product_name, price: item.unit_price, image_url: null })
    setManualOpen(false)
    setManualName(''); setManualPrice(''); setManualQty('1')
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  // ── Cart state ────────────────────────────────────────────────────────────
  const [cartItems, setCartItems]         = useState([])
  const [currentItemId, setCurrentItemId] = useState(null)       // last-added item — unlocked
  const [pendingApprovalIds, setPendingApprovalIds] = useState([]) // override approval IDs for this sale
  const [pendingOverride, setPendingOverride] = useState(null)    // { itemId, delta, itemName, currentQty, newQty, action }
  const [customer, setCustomer]           = useState(null)
  const [customerAccount, setCustomerAccount] = useState(null)
  const [redeemPoints, setRedeemPoints]   = useState('')
  const [ageVerified, setAgeVerified]     = useState(false)
  const [loyaltyConfig, setLoyaltyConfig] = useState({ cents_per_point: 1 })

  useEffect(() => {
    if (shiftStatus !== 'open') return
    getLoyaltyConfig().then(r => { if (r.data) setLoyaltyConfig(r.data) }).catch(() => {})
  }, [shiftStatus])

  useEffect(() => {
    if (!customer?.id) { setCustomerAccount(null); return }
    getAccountByCustomer(customer.id)
      .then(r => setCustomerAccount(r.data))
      .catch(() => setCustomerAccount(null))
  }, [customer?.id])

  // ── Modals ────────────────────────────────────────────────────────────────
  const [weightModal, setWeightModal]               = useState(null)
  const [weightInput, setWeightInput]               = useState('')
  const [ageVerifyModal, setAgeVerifyModal]         = useState(null)
  const [voidAllAuth, setVoidAllAuth]               = useState(false)
  const [discountAuthTarget, setDiscountAuthTarget] = useState(null)
  const [discountStep, setDiscountStep]             = useState('auth')
  const [discountInput, setDiscountInput]           = useState('')

  // Sales history
  const [historyOpen, setHistoryOpen]       = useState(false)
  const [salesHistory, setSalesHistory]     = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyMsg, setHistoryMsg]         = useState('')
  const today = new Date().toISOString().split('T')[0]
  const [historyDateFrom, setHistoryDateFrom] = useState(today)
  const [historyDateTo, setHistoryDateTo]     = useState(today)

  // End Shift (cashier-initiated)
  const [endShiftOpen, setEndShiftOpen]   = useState(false)
  const [endShiftCash, setEndShiftCash]   = useState('')
  const [endShiftNotes, setEndShiftNotes] = useState('')
  const [endShiftBusy, setEndShiftBusy]   = useState(false)
  const [endShiftMsg, setEndShiftMsg]     = useState('')
  const [endShiftDone, setEndShiftDone]   = useState(false)

  // Payment
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [lastSale, setLastSale]       = useState(null)

  // ── Parked / held sales (Phase 32) ───────────────────────────────────────
  const [parkedSales, setParkedSales]   = useState(() => getParkedSales())
  const [holdNoteOpen, setHoldNoteOpen] = useState(false)
  const [holdNote, setHoldNote]         = useState('')
  const [retrieveOpen, setRetrieveOpen] = useState(false)

  function refreshParked() { setParkedSales(getParkedSales()) }

  function handleHoldSale() {
    setHoldNote('')
    setHoldNoteOpen(true)
  }

  function confirmHold() {
    const result = parkSale({ items: cartItems, customer, note: holdNote })
    if (!result.ok) { alert(result.error); return }
    clearCart()
    setHoldNoteOpen(false)
    refreshParked()
  }

  function handleRetrieveSale(parked) {
    if (cartItems.length > 0 && !confirm('Replace current sale with the parked one?')) return
    const data = retrieveSale(parked.slot)
    if (!data) return
    setCartItems(data.items)
    setCurrentItemId(null)
    if (data.customer) setCustomer(data.customer)
    setRetrieveOpen(false)
    refreshParked()
  }

  function handleDiscardParked(slot) {
    if (!confirm('Discard this parked sale permanently?')) return
    discardSale(slot)
    refreshParked()
  }
  // ── Search keyboard handler ───────────────────────────────────────────────
  function handleSearchKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, searchResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (searchResults.length > 0) {
        addToCart(searchResults[selectedIdx] ?? searchResults[0])
      } else if (searchQuery.trim()) {
        handleBarcodeEnter(searchQuery.trim())
      }
    } else if (e.key === 'Escape') {
      setSearchQuery('')
      setSearchResults([])
      setNoResults(false)
    }
  }

  async function handleBarcodeEnter(code) {
    setSearchLoading(true)
    setNoResults(false)
    try {
      let res
      try { res = await getProductByBarcode(code) } catch { res = await getProductByPlu(code) }
      addToCart(res.data)
    } catch {
      setNoResults(true)
    }
    setSearchLoading(false)
  }

  // ── Weight modal ──────────────────────────────────────────────────────────
  function confirmWeight() {
    const w = parseFloat(weightInput)
    if (!w || w <= 0) return
    const p = weightModal
    const linePrice = parseFloat((p.price * w).toFixed(2))
    const enriched = { ...p, product_name_display: `${p.name} (${w}${p.weight_unit})`, effective_price: linePrice, weight: w }
    addItemToCart(enriched)
    flashProduct(enriched)
    clearSearch()
    setWeightModal(null)
  }

  // ── Add to cart ───────────────────────────────────────────────────────────
  const addToCart = useCallback((product) => {
    if (product.is_weight_based) {
      setWeightInput('')
      setWeightModal(product)
      return
    }
    if (product.age_restricted && !ageVerified) {
      setAgeVerifyModal({
        product,
        onConfirm: () => {
          setAgeVerified(true)
          setAgeVerifyModal(null)
          addItemToCart(product)
          flashProduct(product)
          clearSearch()
        },
      })
      return
    }
    addItemToCart(product)
    flashProduct(product)
    clearSearch()
  }, [ageVerified]) // eslint-disable-line

  function clearSearch() {
    setSearchQuery('')
    setSearchResults([])
    setNoResults(false)
    setSelectedIdx(0)
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  function addItemToCart(product) {
    const productId   = product.id || null
    const unitPrice   = product.effective_price ?? product.price
    const weight      = product.weight ?? null
    const displayName = product.product_name_display ?? product.name
    const imageUrl    = product.image_url || null

    // Zero-price block — reject before adding
    if (!unitPrice || unitPrice <= 0) {
      showZeroPriceError(`"${displayName}" has no price set. Contact your manager.`)
      return
    }

    if (weight !== null) {
      const wKey = `weight-${productId}-${Date.now()}`
      setCartItems(prev => [...prev, {
        _key: wKey, product_id: productId, product_name: displayName, unit_price: unitPrice,
        qty: 1, weight, discount: 0, tax_rate: product.tax_rate || 0,
        line_total: unitPrice * (1 + (product.tax_rate || 0)),
        image_url: imageUrl,
      }])
      setCurrentItemId(wKey)
      return
    }

    setCartItems(prev => {
      const existing = prev.find(i => i.product_id && i.product_id === productId && i.weight == null)
      if (existing) {
        return prev.map(i => (i.product_id === productId && i.weight == null)
          ? { ...i, qty: i.qty + 1, line_total: (i.qty + 1) * (i.unit_price - i.discount) * (1 + i.tax_rate) }
          : i)
      }
      return [...prev, {
        product_id: productId, product_name: displayName, unit_price: unitPrice,
        qty: 1, weight: null, discount: 0, tax_rate: product.tax_rate || 0,
        line_total: unitPrice * (1 + (product.tax_rate || 0)),
        image_url: imageUrl,
      }]
    })
    setCurrentItemId(productId)
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
    if (!item) return
    setPendingOverride({
      itemId: id,
      delta: -item.qty,
      itemName: item.product_name,
      currentQty: item.qty,
      newQty: 0,
      action: 'REMOVE_COMMITTED_ITEM',
    })
  }, [cartItems])

  const requestQtyChange = useCallback((id, delta) => {
    const item = cartItems.find(i => (i._key || i.product_id) === id)
    if (!item) return
    const newQty = item.qty + delta
    setPendingOverride({
      itemId: id,
      delta,
      itemName: item.product_name,
      currentQty: item.qty,
      newQty: Math.max(0, newQty),
      action: newQty <= 0 ? 'REMOVE_COMMITTED_ITEM' : 'ADJUST_QTY',
    })
  }, [cartItems])

  function handleOverrideAuthorized(approvalResult) {
    const { itemId, delta, action } = pendingOverride
    setPendingApprovalIds(prev => [...prev, approvalResult.id])
    if (action === 'REMOVE_COMMITTED_ITEM') {
      removeItem(itemId)
    } else {
      updateQty(itemId, delta)
    }
    setPendingOverride(null)
  }

  // Elevated users (manager/admin) self-approve overrides without a PIN dialog
  useEffect(() => {
    if (!pendingOverride || !isElevated) return
    const po = pendingOverride
    selfApproveOverride({
      action:       po.action,
      item_name:    po.itemName,
      original_qty: po.currentQty,
      new_qty:      po.newQty,
    }).then(res => {
      setPendingApprovalIds(prev => [...prev, res.data.id])
      if (po.action === 'REMOVE_COMMITTED_ITEM') removeItem(po.itemId)
      else updateQty(po.itemId, po.delta)
      setPendingOverride(null)
    }).catch(() => setPendingOverride(null))
  }, [pendingOverride]) // eslint-disable-line

  // Elevated users auto-approve void-all
  useEffect(() => {
    if (!voidAllAuth || !isElevated) return
    clearCart()
    setVoidAllAuth(false)
  }, [voidAllAuth]) // eslint-disable-line

  async function handleEndShift() {
    setEndShiftBusy(true); setEndShiftMsg('')
    try {
      await cashierEndShift({
        actual_cash: parseFloat(endShiftCash) || 0,
        notes: endShiftNotes,
      })
      setEndShiftDone(true)
      if (SHIFT_KEY) sessionStorage.removeItem(SHIFT_KEY)
      setTimeout(() => {
        setEndShiftOpen(false)
        setShiftStatus('ended')
      }, 2500)
    } catch (e) {
      setEndShiftMsg(e.response?.data?.error || e.message)
    } finally { setEndShiftBusy(false) }
  }

  const clearCart = useCallback(() => {
    setCartItems([])
    setCurrentItemId(null)
    setPendingApprovalIds([])
    setPendingOverride(null)
    setCustomer(null)
    setCustomerAccount(null)
    setRedeemPoints('')
    setAgeVerified(false)
  }, [])

  // ── Per-item discount ─────────────────────────────────────────────────────
  function requestItemDiscount(itemId) {
    setDiscountAuthTarget(itemId)
    setDiscountInput('')
    setDiscountStep(isElevated ? 'input' : 'auth')  // elevated users skip auth step
  }

  function applyItemDiscount() {
    const amt = parseFloat(discountInput) || 0
    setCartItems(prev => prev.map(i => {
      if ((i._key || i.product_id) !== discountAuthTarget) return i
      const discount = Math.min(amt, i.unit_price)
      return { ...i, discount, line_total: i.qty * (i.unit_price - discount) * (1 + i.tax_rate) }
    }))
    setDiscountAuthTarget(null)
    setDiscountInput('')
  }

  // ── Cart totals ───────────────────────────────────────────────────────────
  const cartSubtotal    = cartItems.reduce((s, i) => s + i.unit_price * i.qty, 0)
  const cartDiscount    = cartItems.reduce((s, i) => s + i.discount * i.qty, 0)
  const cartTax         = cartItems.reduce((s, i) => s + (i.unit_price - i.discount) * i.qty * i.tax_rate, 0)
  const kesPerPoint     = (loyaltyConfig.cents_per_point || 1) / 100
  const tierDiscount    = customer?.tier_discount_percent
    ? (cartSubtotal - cartDiscount) * (customer.tier_discount_percent / 100) : 0
  const pointsRedeemAmt = redeemPoints
    ? Math.min(parseFloat(redeemPoints) * kesPerPoint, cartSubtotal - cartDiscount) : 0
  const cartTotal = Math.max(0, cartSubtotal - cartDiscount + cartTax - tierDiscount - pointsRedeemAmt)

  const hasAgeRestricted = cartItems.some(i => i.age_restricted)

  // ── Sale complete ─────────────────────────────────────────────────────────
  function handleSaleComplete(completedSale) {
    setLastSale(completedSale)
    setPaymentOpen(false)
    clearCart()
    setTimeout(() => searchRef.current?.focus(), 100)
  }

  // ── Reprint ───────────────────────────────────────────────────────────────
  async function reprintLastReceipt() {
    if (!lastSale) return
    printSaleReceipt(lastSale, storeConfig)
  }

  async function reprintLastEsc() {
    if (!lastSale) return
    try { await printReceipt(lastSale.id) } catch { alert('Printer unavailable') }
  }

  // ── Sales history ─────────────────────────────────────────────────────────
  const isCashier = user?.role === 'cashier'
  const MAX_CASHIER_DAYS = 4

  async function fetchHistory(dateFrom, dateTo) {
    setHistoryLoading(true); setHistoryMsg('')
    try {
      // Cashier can only see their own sales, max 4-day window
      const params = { date_from: dateFrom, date_to: dateTo + 'T23:59:59', limit: 200 }
      if (isCashier) params.cashier_id = user.id
      const res = await getSales(params)
      setSalesHistory(res.data || [])
    } catch {}
    finally { setHistoryLoading(false) }
  }

  async function openHistory() {
    setHistoryOpen(true)
    await fetchHistory(historyDateFrom, historyDateTo)
  }

  function handleHistoryFilter() {
    // Enforce 4-day cap for cashier
    if (isCashier) {
      const from = new Date(historyDateFrom)
      const to   = new Date(historyDateTo)
      const diffDays = (to - from) / 86400000
      if (diffDays > MAX_CASHIER_DAYS - 1) {
        setHistoryMsg(`Cashiers can view up to ${MAX_CASHIER_DAYS} days of history`)
        return
      }
    }
    fetchHistory(historyDateFrom, historyDateTo)
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

  // ── Shift gate screens ────────────────────────────────────────────────────
  if (shiftStatus === 'checking') {
    return <div style={gateWrap}><div style={{ color: 'var(--text-muted)' }}>Checking shift…</div></div>
  }

  // Cashier whose shift was ended (pending manager close)
  if (shiftStatus === 'ended') {
    return (
      <div style={gateWrap}>
        <div style={gateCard}>
          <div style={{ fontSize: 48, textAlign: 'center' }}>✅</div>
          <h2 style={{ margin: '8px 0 4px', textAlign: 'center' }}>Shift Submitted</h2>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 13, margin: '0 0 24px' }}>
            Your cash count has been submitted. The manager will review and close the shift.
          </p>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 12 }}>
            You can now hand over to the next cashier or log out.
          </p>
        </div>
      </div>
    )
  }

  // Manager/admin opening their own shift (no extra auth needed)
  if (shiftStatus === 'none_elevated') {
    return (
      <div style={gateWrap}>
        <div style={gateCard}>
          <div style={{ fontSize: 48, textAlign: 'center' }}>🔓</div>
          <h2 style={{ margin: '8px 0 4px', textAlign: 'center' }}>Open Shift</h2>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 13, margin: '0 0 24px' }}>
            Opening shift as <strong>{user?.name}</strong>
          </p>
          <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Opening Float (KES)</label>
          <input type="number" min="0" value={gateFloat}
            onChange={e => setGateFloat(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleOpenShift()}
            placeholder="0" style={{ ...gateInput, marginBottom: 12 }} autoFocus />
          {gateError && <div style={gateErr}>{gateError}</div>}
          <button style={gateBtn} onClick={handleOpenShift} disabled={gateBusy}>
            {gateBusy ? 'Opening…' : 'Open Shift'}
          </button>
        </div>
      </div>
    )
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

  // ── Main checkout layout ──────────────────────────────────────────────────
  const checkoutDisabled = cartItems.length === 0 || cartTotal <= 0 || (hasAgeRestricted && !ageVerified)

  return (
    <div className="pos-checkout" style={{ position: 'relative' }}>

      {attracted && <IdleScreen storeName={storeConfig.name} onDismiss={() => setAttracted(false)} />}

      {/* ══ Far left: Category sidebar ══ */}
      <div className="pos-cat-sidebar">
        <div className="cat-sidebar-title">Categories</div>
        <button
          className={`cat-sidebar-btn${!activeCat ? ' active' : ''}`}
          style={{ '--cat-color': '#6b7280' }}
          onClick={() => setActiveCat(null)}
        >All</button>
        {categories.map((c, i) => (
          <button
            key={c.id}
            className={`cat-sidebar-btn${activeCat === c.id ? ' active' : ''}`}
            style={{ '--cat-color': CAT_COLORS[i % CAT_COLORS.length] }}
            onClick={() => setActiveCat(c.id)}
          >{c.name}</button>
        ))}
      </div>

      {/* ══ Middle: Search panel ══ */}
      <div className="pos-search-panel">
        <div className="pos-search-wrap">
          <input
            ref={searchRef}
            className="pos-search-input"
            placeholder="Search / scan  (F3)"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setNoResults(false) }}
            onKeyDown={handleSearchKey}
            autoComplete="off"
            autoFocus
          />
        </div>

        {zeroPriceError && (
          <div style={{
            padding: '8px 16px', background: '#ef444420', borderBottom: '2px solid #ef4444',
            color: '#ef4444', fontSize: 12, fontWeight: 600, flexShrink: 0,
          }}>
            ⚠ {zeroPriceError}
          </div>
        )}

        {searchLoading && <div className="search-loading">Searching…</div>}

        {!searchLoading && searchResults.length > 0 && (
          <div className="search-results">
            {searchResults.map((p, i) => {
              const unit       = p.is_weight_based ? (p.weight_unit || 'kg') : (p.weight_unit || 'pc')
              const hasNoPrice = !p.price || p.price <= 0
              const blocked    = hasNoPrice && user?.role === 'cashier'
              return (
                <div
                  key={p.id}
                  className={`search-result-item${i === selectedIdx ? ' active' : ''}${blocked ? ' sri-blocked' : ''}`}
                  onClick={() => blocked ? showZeroPriceError(`"${p.name}" has no price set. Contact your manager.`) : addToCart(p)}
                  onMouseEnter={() => !blocked && setSelectedIdx(i)}
                >
                  <span className="sri-name">
                    {p.name}
                    <span className="sri-unit">/{unit}</span>
                  </span>
                  {hasNoPrice
                    ? <span className="sri-no-price">No price</span>
                    : <span className="sri-price">{fmt(p.price)}</span>
                  }
                </div>
              )
            })}
          </div>
        )}

        {!searchLoading && noResults && (
          <div className="search-no-result">
            <div>No product found for <strong>"{searchQuery}"</strong></div>
            {user?.role !== 'cashier' && (
              <button onClick={() => { setManualOpen(true); setManualName(searchQuery) }}>
                Add manually
              </button>
            )}
            {user?.role === 'cashier' && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Contact manager to add unlisted items
              </div>
            )}
          </div>
        )}

        {!searchQuery && !activeCat && !searchLoading && !noResults && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 24, gap: 6 }}>
            <div style={{ fontSize: 28, opacity: 0.2 }}>🔍</div>
            <div>Search or scan to add items</div>
          </div>
        )}

        <div className="search-footer" style={{ marginTop: 'auto' }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={openHistory}>
            History
          </button>
        </div>
      </div>

      {/* ══ Right: Bill / Cart (main panel) ══ */}
      <div className="pos-bill">

        {/* Scan/add flash — large customer-facing overlay */}
        {lastAdded && (
          <div className="scan-flash-overlay">
            <div className="scan-flash-card">
              {lastAdded.image_url
                ? <img className="scan-flash-card-img" src={lastAdded.image_url} alt={lastAdded.name} />
                : <div className="scan-flash-card-placeholder">🔩</div>
              }
              <div className="scan-flash-card-name">{lastAdded.name}</div>
              <div className="scan-flash-card-price">{fmt(lastAdded.price)}</div>
              <div className="scan-flash-card-badge">Added to bill</div>
            </div>
          </div>
        )}

        {/* Bill header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            Bill
            {cartItems.length > 0 && (
              <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>
                {cartItems.length} item{cartItems.length !== 1 ? 's' : ''}
              </span>
            )}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {customer && (
              <span style={{ fontSize: 11, background: 'var(--surface2)', borderRadius: 8, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
                {customer.name}
                {customer.loyalty_points > 0 && (
                  <span style={{ color: 'var(--warning)', marginLeft: 2 }}>{customer.loyalty_points.toLocaleString()} pts</span>
                )}
                <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: 0, marginLeft: 2 }}
                  onClick={() => { setCustomer(null); setRedeemPoints('') }}>✕</button>
              </span>
            )}
            {parkedSales.length > 0 && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--warning)' }}
                onClick={() => setRetrieveOpen(true)}>
                Parked ({parkedSales.length})
              </button>
            )}
            {cartItems.length > 0 && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                onClick={handleHoldSale}>
                Hold
              </button>
            )}
            {cartItems.length > 0 && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                onClick={() => setVoidAllAuth(true)}>
                Void All
              </button>
            )}
            <button className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, color: 'var(--danger)', marginLeft: 4 }}
              onClick={() => { setEndShiftOpen(true); setEndShiftMsg(''); setEndShiftDone(false) }}>
              End Shift
            </button>
          </div>
        </div>

        {/* Cart / Bill items */}
        <div className="bill-items" style={{ position: 'relative' }}>
          {cartItems.length > 0 && (
            <Cart
              items={cartItems}
              currentItemId={currentItemId}
              onUpdateQty={updateQty}
              onQtyChangeRequest={requestQtyChange}
              onRemoveRequest={requestRemoveItem}
              onDiscountRequest={requestItemDiscount}
            />
          )}
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

        {/* Reprint last sale + parked retrieve shortcut */}
        {(lastSale || parkedSales.length > 0) && (
          <div className="bill-reprint-row">
            {lastSale && (
              <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={reprintLastEsc}>Reprint</button>
            )}
            {parkedSales.length > 0 && (
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)', flex: lastSale ? undefined : 1 }}
                onClick={() => setRetrieveOpen(true)}>
                Parked ({parkedSales.length})
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={openHistory} title="Today's sales">📋</button>
          </div>
        )}

        {/* Totals */}
        <div className="bill-totals">
          {cartItems.length > 0 && (
            <>
              <div className="totals-row"><span>Subtotal</span><span>{fmt(cartSubtotal)}</span></div>
              {cartDiscount > 0 && <div className="totals-row" style={{ color: 'var(--warning)' }}><span>Discounts</span><span>−{fmt(cartDiscount)}</span></div>}
              {tierDiscount > 0 && <div className="totals-row" style={{ color: 'var(--success)' }}><span>{customer?.tier_name}</span><span>−{fmt(tierDiscount)}</span></div>}
              {pointsRedeemAmt > 0 && <div className="totals-row" style={{ color: 'var(--success)' }}><span>Points</span><span>−{fmt(pointsRedeemAmt)}</span></div>}
              {cartTax > 0 && <div className="totals-row"><span>VAT</span><span>{fmt(cartTax)}</span></div>}
            </>
          )}
          <div className="totals-row grand"><span>Total</span><span>{fmt(cartTotal)}</span></div>
        </div>

        {/* CHARGE button */}
        <button
          className="charge-btn"
          disabled={checkoutDisabled}
          onClick={() => setPaymentOpen(true)}
        >
          {cartItems.length === 0 ? 'Charge' : cartTotal <= 0 ? 'Nothing to charge' : `Charge  ${fmt(cartTotal)}`}
        </button>
      </div>

      {/* ══ Modals ══ */}

      {/* Hold Sale — note prompt */}
      {holdNoteOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 360 }}>
            <div className="modal-title">Hold Sale</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              {cartItems.length} item{cartItems.length !== 1 ? 's' : ''} will be parked.
              Add an optional note to identify this sale.
            </div>
            <label className="label">Hold Note (optional)</label>
            <input className="input" value={holdNote}
              onChange={e => setHoldNote(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmHold()}
              placeholder="e.g. Customer returning, Table 3…"
              autoFocus style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Parked sales expire after 2 hours. Up to 3 slots available.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-lg" style={{ flex: 1 }}
                onClick={() => setHoldNoteOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-lg" style={{ flex: 2 }}
                onClick={confirmHold}>Park Sale</button>
            </div>
          </div>
        </div>
      )}

      {/* Retrieve parked sales modal */}
      {retrieveOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setRetrieveOpen(false)}>
          <div className="modal" style={{ width: 520 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="modal-title" style={{ marginBottom: 0 }}>Parked Sales</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setRetrieveOpen(false)}>✕</button>
            </div>
            {parkedSales.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
                No parked sales
              </div>
            ) : parkedSales.map(p => {
              const total = p.items.reduce((s, i) => s + (i.line_total || i.unit_price * i.qty), 0)
              const age   = Math.round((Date.now() - p.parked_at) / 60000)
              const expiresIn = Math.round((2 * 60) - age)
              return (
                <div key={p.slot} style={{
                  padding: '14px 16px', borderRadius: 10,
                  border: '1.5px solid var(--border)', marginBottom: 10,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>
                      Slot {p.slot}
                      {p.note && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8, fontSize: 13 }}>— {p.note}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {p.items.length} item{p.items.length !== 1 ? 's' : ''} · {fmt(total)}
                      {p.customer && <span style={{ marginLeft: 8 }}>· {p.customer.name}</span>}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 3, color: expiresIn < 30 ? 'var(--warning)' : 'var(--text-muted)' }}>
                      Parked {age}m ago · expires in {Math.max(0, expiresIn)}m
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => handleRetrieveSale(p)}>Retrieve</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDiscardParked(p.slot)}>Discard</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Manual item entry — manager/admin only */}
      {manualOpen && user?.role !== 'cashier' && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 380 }}>
            <div className="modal-title">Add Item Manually</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              No barcode on record — logged for purchaser review.
            </div>
            <label className="label">Item Name</label>
            <input className="input" value={manualName} onChange={e => setManualName(e.target.value)}
              placeholder="e.g. Wire mesh (loose)" autoFocus style={{ marginBottom: 8 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <div>
                <label className="label">Price (KES)</label>
                <input className="input" type="number" min={0} step="0.01"
                  value={manualPrice} onChange={e => setManualPrice(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className="label">Qty</label>
                <input className="input" type="number" min={1} step={1}
                  value={manualQty} onChange={e => setManualQty(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitManualItem()} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-lg" style={{ flex: 1 }}
                onClick={() => { setManualOpen(false); setManualName(''); setManualPrice(''); setManualQty('1') }}>
                Cancel
              </button>
              <button className="btn btn-primary btn-lg" style={{ flex: 2 }}
                onClick={submitManualItem}
                disabled={!manualName.trim() || !manualPrice || parseFloat(manualPrice) <= 0}>
                Add to Bill
              </button>
            </div>
          </div>
        </div>
      )}

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
                onKeyDown={e => e.key === 'Enter' && confirmWeight()}
                style={{ fontSize: 20, textAlign: 'center' }} autoFocus />
              <span style={{ alignSelf: 'center', fontWeight: 600 }}>{weightModal.weight_unit}</span>
            </div>
            {weightInput && (
              <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 22, marginBottom: 12, color: 'var(--accent)' }}>
                Total: {fmt(weightModal.price * parseFloat(weightInput || 0))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={() => setWeightModal(null)}>Cancel</button>
              <button className="btn btn-success btn-lg" style={{ flex: 2 }} onClick={confirmWeight}>Add to Bill</button>
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
              <button className="btn btn-danger btn-lg" style={{ flex: 1 }} onClick={() => setAgeVerifyModal(null)}>Deny</button>
              <button className="btn btn-success btn-lg" style={{ flex: 1 }} onClick={ageVerifyModal.onConfirm}>✓ Age Verified</button>
            </div>
          </div>
        </div>
      )}

      {/* Manager auth: locked item override — skipped for elevated users (auto via useEffect) */}
      {pendingOverride && !isElevated && (
        <ManagerAuthModal
          title={pendingOverride.action === 'REMOVE_COMMITTED_ITEM' ? 'Remove Locked Item' : 'Modify Locked Item'}
          description={
            pendingOverride.action === 'REMOVE_COMMITTED_ITEM'
              ? `Remove "${pendingOverride.itemName}" (qty ${pendingOverride.currentQty}) from bill`
              : `"${pendingOverride.itemName}" qty ${pendingOverride.currentQty} → ${pendingOverride.newQty}`
          }
          overridePayload={{
            action:       pendingOverride.action,
            item_name:    pendingOverride.itemName,
            original_qty: pendingOverride.currentQty,
            new_qty:      pendingOverride.newQty,
          }}
          onAuthorize={handleOverrideAuthorized}
          onCancel={() => setPendingOverride(null)}
        />
      )}

      {/* Manager auth: void all — skipped for elevated users (auto via useEffect) */}
      {voidAllAuth && !isElevated && (
        <ManagerAuthModal
          title="Void Entire Sale"
          description={`Clear all ${cartItems.length} item${cartItems.length !== 1 ? 's' : ''} from the bill`}
          onAuthorize={() => { clearCart(); setVoidAllAuth(false) }}
          onCancel={() => setVoidAllAuth(false)}
        />
      )}

      {/* Manager auth: item discount — step 1 (skipped for elevated users) */}
      {discountAuthTarget && discountStep === 'auth' && !isElevated && (
        <ManagerAuthModal
          title="Apply Item Discount"
          description="Manager authorization required to discount a line item"
          onAuthorize={() => setDiscountStep('input')}
          onCancel={() => setDiscountAuthTarget(null)}
        />
      )}

      {/* End Shift modal */}
      {endShiftOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !endShiftBusy && setEndShiftOpen(false)}>
          <div className="modal" style={{ width: 400 }}>
            <div className="modal-title">End Shift</div>
            {endShiftDone ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Shift submitted for manager review</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>You can now hand over to the next cashier.</div>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                  Count your cash drawer and enter the total. The manager will review and finalize the close.
                </p>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="label">Cash in Drawer (KES)</label>
                  <input className="input" type="number" min="0" step="0.01" autoFocus
                    placeholder="0.00" value={endShiftCash}
                    onChange={e => setEndShiftCash(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="label">Handover Notes (optional)</label>
                  <textarea className="input" rows={3} placeholder="Any notes for the manager…"
                    value={endShiftNotes}
                    onChange={e => setEndShiftNotes(e.target.value)}
                    style={{ resize: 'vertical' }} />
                </div>
                {endShiftMsg && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{endShiftMsg}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={() => setEndShiftOpen(false)} disabled={endShiftBusy}>Cancel</button>
                  <button className="btn btn-danger" onClick={handleEndShift} disabled={endShiftBusy}>
                    {endShiftBusy ? 'Submitting…' : 'Submit & End Shift'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* Manager auth: item discount — step 2 */}
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

      {/* Sales history */}
      {historyOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setHistoryOpen(false)}>
          <div className="modal" style={{ width: 740, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="modal-title" style={{ marginBottom: 0 }}>Sales History</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setHistoryOpen(false)}>✕</button>
            </div>

            {/* Date filter */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>From</label>
                <input type="date" className="input" style={{ padding: '4px 8px', fontSize: 13 }}
                  value={historyDateFrom}
                  max={historyDateTo}
                  onChange={e => {
                    const v = e.target.value
                    if (isCashier) {
                      // Keep within 4-day window
                      const to = new Date(historyDateTo)
                      const from = new Date(v)
                      if ((to - from) / 86400000 > MAX_CASHIER_DAYS - 1) {
                        const newTo = new Date(from)
                        newTo.setDate(newTo.getDate() + MAX_CASHIER_DAYS - 1)
                        setHistoryDateTo(newTo.toISOString().split('T')[0])
                      }
                    }
                    setHistoryDateFrom(v)
                  }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>To</label>
                <input type="date" className="input" style={{ padding: '4px 8px', fontSize: 13 }}
                  value={historyDateTo}
                  min={historyDateFrom}
                  max={!isCashier ? undefined : (() => {
                    const d = new Date(historyDateFrom)
                    d.setDate(d.getDate() + MAX_CASHIER_DAYS - 1)
                    return d.toISOString().split('T')[0]
                  })()}
                  onChange={e => setHistoryDateTo(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-sm" onClick={handleHistoryFilter}
                disabled={historyLoading}>
                {historyLoading ? 'Loading…' : 'Search'}
              </button>
              {isCashier && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Max {MAX_CASHIER_DAYS} days</span>
              )}
            </div>

            {historyMsg && <div style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 8 }}>{historyMsg}</div>}

            {historyLoading ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Loading…</div>
            ) : salesHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No sales found for this period</div>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {salesHistory.length} transaction{salesHistory.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
                  Total: <strong>{fmt(salesHistory.filter(s => s.status !== 'voided').reduce((a, s) => a + (s.total || 0), 0))}</strong>
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date / Time</th><th>Receipt</th>
                      {!isCashier && <th>Cashier</th>}
                      <th>Customer</th><th>Total</th><th>Method</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesHistory.map(s => (
                      <tr key={s.id} style={{ opacity: s.status === 'voided' ? 0.45 : 1 }}>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {new Date(s.created_at).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.receipt_number}</td>
                        {!isCashier && <td style={{ fontSize: 12 }}>{s.cashier_name || '—'}</td>}
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{s.customer_name || '—'}</td>
                        <td style={{ fontWeight: 600 }}>
                          {fmt(s.total)}
                          {s.status === 'voided' && <span className="badge badge-red" style={{ marginLeft: 6, fontSize: 9 }}>VOID</span>}
                        </td>
                        <td style={{ fontSize: 12, textTransform: 'capitalize', color: 'var(--text-muted)' }}>
                          {(s.payment_method || '').replace(/_/g, ' ')}
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleHistoryEscReprint(s)}
                            disabled={s.status === 'voided'}>Reprint</button>
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

      {/* Payment overlay */}
      {paymentOpen && (
        <PaymentModal
          method="select"
          items={cartItems}
          subtotal={cartSubtotal}
          discountTotal={cartDiscount + tierDiscount + pointsRedeemAmt}
          taxAmount={cartTax}
          total={cartTotal}
          customer={customer}
          customerAccount={customerAccount}
          onSetCustomer={setCustomer}
          loyaltyPointsToRedeem={redeemPoints ? parseInt(redeemPoints) : 0}
          ageVerified={ageVerified}
          overrideApprovalIds={pendingApprovalIds}
          onClose={() => setPaymentOpen(false)}
          onComplete={handleSaleComplete}
        />
      )}
    </div>
  )
}

// ── Shift gate styles ─────────────────────────────────────────────────────────

const gateWrap    = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--bg)' }
const gateCard    = { background: 'var(--surface)', borderRadius: 16, padding: '40px 36px', width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }
const gateInput   = { width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 16, border: '2px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', boxSizing: 'border-box', outline: 'none' }
const gateBtn     = { width: '100%', padding: '12px', borderRadius: 8, border: 'none', background: 'var(--primary,#4f6ef7)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }
const gateErr     = { padding: '8px 12px', borderRadius: 6, background: '#ef444420', color: '#ef4444', fontSize: 13, marginBottom: 10 }
const gateLinkBtn = { display: 'block', width: '100%', padding: '8px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }
