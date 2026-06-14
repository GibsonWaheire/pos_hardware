import { useState, useEffect, useRef } from 'react'
import { createSale, createPaymentIntent, capturePaymentIntent, cancelPaymentIntent, lookupAccount, printReceipt, openDrawer, getStoreConfig, createSaleInvoice, earnPoints, mpesaStkPush, mpesaStkStatus } from '../api'
import { useCurrency } from '../context/CurrencyContext'
import { useAuth } from '../context/AuthContext'
import { printSaleReceipt, printTaxInvoice } from '../utils/print'

function newUUID() {
  try { return crypto.randomUUID() }
  catch { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
}

export default function PaymentModal({
  method: methodProp, items, subtotal, discountTotal, taxAmount, total,
  customer, customerAccount, onSetCustomer,
  loyaltyPointsToRedeem, ageVerified,
  overrideApprovalIds,
  onClose, onComplete,
}) {
  const { currency, fmt: KES } = useCurrency()
  const { user } = useAuth()

  // When method='select', the user picks a method from the selector screen
  const [activeMethod, setActiveMethod] = useState(methodProp === 'select' ? null : methodProp)
  const method = activeMethod || (methodProp !== 'select' ? methodProp : null)

  const [cashInput, setCashInput] = useState('')
  const [cardStatus, setCardStatus] = useState('')
  const [cardIntentId, setCardIntentId] = useState(null)

  // ── Multi-tender split ────────────────────────────────────────────────────
  const [splitTenders, setSplitTenders]             = useState([])
  const [splitScreen, setSplitScreen]               = useState('select')   // select|cash|mpesa|card|account
  const [splitCashInput, setSplitCashInput]         = useState('')
  const [splitMpesaPhone, setSplitMpesaPhone]       = useState('')
  const [splitMpesaRef, setSplitMpesaRef]           = useState('')
  const [splitMpesaStage, setSplitMpesaStage]       = useState('input')   // input|pushing|polling|manual
  const [splitMpesaCheckoutId, setSplitMpesaCheckoutId] = useState(null)
  const [splitMpesaSimulated, setSplitMpesaSimulated]   = useState(false)
  const [splitMpesaPollCount, setSplitMpesaPollCount]   = useState(0)
  const splitMpesaPollRef = useRef(null)
  const [splitCardIntentId, setSplitCardIntentId]   = useState(null)
  const [splitCardStatus, setSplitCardStatus]       = useState('')
  const [splitAcctQuery, setSplitAcctQuery]         = useState('')
  const [splitAcctResults, setSplitAcctResults]     = useState([])
  const [splitAcct, setSplitAcct]                   = useState(null)
  const [splitAcctAmt, setSplitAcctAmt]             = useState('')
  const [splitAcctSearching, setSplitAcctSearching] = useState(false)

  const splitTendered  = splitTenders.reduce((s, t) => s + t.amount, 0)
  const splitRemaining = Math.max(0, total - splitTendered)

  const [mpesaPhone, setMpesaPhone] = useState('')
  const [mpesaRef, setMpesaRef] = useState('')
  const [mpesaStage, setMpesaStage] = useState('input')  // 'input' | 'pushing' | 'polling' | 'manual' | 'done'
  const [mpesaCheckoutId, setMpesaCheckoutId] = useState(null)
  const [mpesaSimulated, setMpesaSimulated] = useState(false)
  const [mpesaPollCount, setMpesaPollCount] = useState(0)
  const mpesaPollRef = useRef(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [completedSale, setCompletedSale] = useState(null)
  const [printMsg, setPrintMsg] = useState('')
  const [pointsEarned, setPointsEarned] = useState(null)  // { points_earned, new_balance }

  // Account payment state
  const [acctQuery, setAcctQuery] = useState('')
  const [acctResults, setAcctResults] = useState([])
  const [selectedAcct, setSelectedAcct] = useState(null)
  const [acctSearching, setAcctSearching] = useState(false)

  const cashAmount = parseFloat(cashInput) || 0
  const change = Math.max(0, cashAmount - total)

  // ── Shared payload builder ────────────────────────────────────────────────

  function buildPayload(overrides = {}) {
    return {
      items: items.map(i => ({
        product_id: i.product_id || null,
        product_name: i.product_name,
        unit_price: i.unit_price,
        qty: i.qty,
        discount: i.discount,
        tax_rate: i.tax_rate,
      })),
      customer_id: customer?.id || null,
      loyalty_points_to_redeem: loyaltyPointsToRedeem || 0,
      age_verified: ageVerified || false,
      override_approval_ids: overrideApprovalIds || [],
      offline_id: newUUID(),
      ...overrides,
    }
  }

  // ── Sale complete handler ─────────────────────────────────────────────────

  function handleSaleSuccess(sale) {
    setCompletedSale(sale)
    // Notify parent immediately so cart clears in background
    onComplete(sale)
    // Credit loyalty points silently if customer attached
    if (customer?.id && sale?.id) {
      earnPoints({ customer_id: customer.id, sale_id: sale.id, sale_total: total })
        .then(r => { if (r?.data?.points_earned) setPointsEarned(r.data) })
        .catch(() => {})
    }
  }

  async function handleReprint() {
    if (!completedSale?.id) return
    setPrintMsg('Printing...')
    try {
      await printReceipt(completedSale.id)
      setPrintMsg('Sent to printer')
    } catch (e) { setPrintMsg('Printer unavailable') }
    setTimeout(() => setPrintMsg(''), 3000)
  }

  async function printBrowserReceipt() {
    if (!completedSale) return
    let store = {}
    try { const r = await getStoreConfig(); store = r.data || {} } catch {}
    printSaleReceipt(completedSale, store)
  }

  async function handleOpenDrawer() {
    setPrintMsg('Opening drawer...')
    try {
      await openDrawer()
      setPrintMsg('Drawer opened')
    } catch (e) { setPrintMsg('Drawer unavailable') }
    setTimeout(() => setPrintMsg(''), 3000)
  }

  async function handlePrintInvoice() {
    if (!completedSale?.id) return
    setPrintMsg('Generating invoice...')
    try {
      let store = {}
      try { const r = await getStoreConfig(); store = r.data || {} } catch {}
      const r = await createSaleInvoice(completedSale.id, {
        customer_pin: customer?.tax_pin || '',
        customer_address: customer?.address || '',
        payment_terms: 'Cash on delivery',
      })
      const inv = r.data
      printTaxInvoice(inv, store)
      setPrintMsg(`Invoice ${inv.invoice_number}`)
    } catch (e) { setPrintMsg('Invoice error: ' + e.message) }
    setTimeout(() => setPrintMsg(''), 4000)
  }

  // ── Cash ─────────────────────────────────────────────────────────────────

  async function handleCashPay() {
    if (cashAmount < total) { setError('Cash tendered must be ≥ total'); return }
    setProcessing(true); setError('')
    try {
      const res = await createSale(buildPayload({ payment_method: 'cash', cash_tendered: cashAmount }))
      handleSaleSuccess(res.data)
    } catch (e) { setError(e.message); setProcessing(false) }
  }

  // ── M-Pesa STK Push ──────────────────────────────────────────────────────

  // Clean up polling interval on unmount or modal close
  useEffect(() => {
    return () => { if (mpesaPollRef.current) clearInterval(mpesaPollRef.current) }
  }, [])

  async function handleStkPush() {
    const phone = mpesaPhone.trim()
    if (!phone) { setError('Enter customer phone number'); return }
    setError(''); setMpesaStage('pushing')
    try {
      const res = await mpesaStkPush(phone, total, 'POS Sale')
      const { checkout_request_id, simulated } = res.data
      setMpesaCheckoutId(checkout_request_id)
      setMpesaSimulated(!!simulated)
      setMpesaPollCount(0)
      setMpesaStage('polling')
      // Start polling every 5s, max 18 times (90s)
      mpesaPollRef.current = setInterval(() => {
        setMpesaPollCount(c => c + 1)
      }, 5000)
    } catch (e) {
      setError(e.message || 'Failed to send STK push')
      setMpesaStage('input')
    }
  }

  // Poll status whenever mpesaPollCount increments
  useEffect(() => {
    if (mpesaStage !== 'polling' || !mpesaCheckoutId) return
    if (mpesaPollCount > 18) {
      // Timeout — fall back to manual code entry
      clearInterval(mpesaPollRef.current)
      setMpesaStage('manual')
      return
    }
    if (mpesaSimulated) {
      // Simulated: skip polling, go straight to manual fallback after a beat
      const t = setTimeout(() => setMpesaStage('manual'), 2000)
      return () => clearTimeout(t)
    }
    mpesaStkStatus(mpesaCheckoutId).then(res => {
      const { status, mpesa_ref } = res.data
      if (status === 'completed') {
        clearInterval(mpesaPollRef.current)
        setMpesaRef(mpesa_ref || mpesaCheckoutId)
        setMpesaStage('done')
        finalizeMpesaSale(mpesa_ref || mpesaCheckoutId)
      } else if (status === 'cancelled' || status === 'failed') {
        clearInterval(mpesaPollRef.current)
        setError(res.data.error_message || 'Payment failed or was cancelled')
        setMpesaStage('input')
      }
      // 'pending' → keep polling
    }).catch(() => { /* network blip, keep polling */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mpesaPollCount, mpesaStage])

  async function finalizeMpesaSale(ref) {
    setProcessing(true)
    try {
      const res = await createSale(buildPayload({ payment_method: 'mpesa', mpesa_ref: ref }))
      handleSaleSuccess(res.data)
    } catch (e) {
      setError(e.message)
      setMpesaStage('manual')
      setProcessing(false)
    }
  }

  async function handleMpesaManual() {
    if (!mpesaRef.trim()) { setError('Enter M-Pesa confirmation code'); return }
    await finalizeMpesaSale(mpesaRef.trim())
  }

  function cancelMpesaPolling() {
    if (mpesaPollRef.current) clearInterval(mpesaPollRef.current)
    setMpesaStage('input')
    setMpesaCheckoutId(null)
    setError('')
  }

  // ── Card (Stripe Terminal) ───────────────────────────────────────────────

  async function handleCardPay() {
    setProcessing(true); setCardStatus('creating'); setError('')
    try {
      const amountCents = Math.round(total * 100)
      const intentRes = await createPaymentIntent(amountCents)
      setCardIntentId(intentRes.data.payment_intent_id)
      setCardStatus('waiting')
    } catch (e) { setError(e.message); setCardStatus('error'); setProcessing(false) }
  }

  async function handleCapture() {
    if (!cardIntentId) return
    setCardStatus('capturing'); setError('')
    try {
      await capturePaymentIntent(cardIntentId)
      const res = await createSale(buildPayload({ payment_method: 'card', stripe_payment_intent_id: cardIntentId }))
      setCardStatus('done')
      handleSaleSuccess(res.data)
    } catch (e) { setError(e.message); setCardStatus('error'); setProcessing(false) }
  }

  async function handleCardCancel() {
    if (cardIntentId) { try { await cancelPaymentIntent(cardIntentId) } catch {} }
    setCardIntentId(null); setCardStatus(''); setProcessing(false)
  }

  // ── Account ──────────────────────────────────────────────────────────────

  async function handleAcctSearch(q) {
    setAcctQuery(q); setSelectedAcct(null)
    if (!q.trim()) { setAcctResults([]); return }
    setAcctSearching(true)
    try { const r = await lookupAccount(q); setAcctResults(r.data) }
    catch (e) { setError(e.message) }
    finally { setAcctSearching(false) }
  }

  async function handleAccountPay() {
    if (!selectedAcct) { setError('Select an account first'); return }
    const available = selectedAcct.balance + selectedAcct.credit_limit
    if (total > available) {
      setError(`Insufficient balance. Available: ${KES(available)}, Required: ${KES(total)}`)
      return
    }
    setProcessing(true); setError('')
    try {
      const res = await createSale(buildPayload({ payment_method: 'account', account_id: selectedAcct.id }))
      handleSaleSuccess(res.data)
    } catch (e) { setError(e.message); setProcessing(false) }
  }

  // ── Multi-tender helpers ─────────────────────────────────────────────────

  useEffect(() => {
    return () => { if (splitMpesaPollRef.current) clearInterval(splitMpesaPollRef.current) }
  }, [])

  function addSplitTender(tender) {
    setSplitTenders(prev => [...prev, tender])
    setSplitScreen('select')
    setError('')
    setSplitCashInput('')
    setSplitMpesaPhone(''); setSplitMpesaRef(''); setSplitMpesaStage('input'); setSplitMpesaCheckoutId(null)
    setSplitCardIntentId(null); setSplitCardStatus('')
    setSplitAcct(null); setSplitAcctQuery(''); setSplitAcctResults([]); setSplitAcctAmt('')
  }

  function removeSplitTender(idx) {
    setSplitTenders(prev => prev.filter((_, i) => i !== idx))
  }

  function handleSplitCashAdd() {
    const amt = parseFloat(splitCashInput) || 0
    if (amt <= 0) { setError('Enter cash amount'); return }
    addSplitTender({ method: 'cash', amount: amt })
  }

  async function handleSplitStkPush() {
    const phone = splitMpesaPhone.trim()
    if (!phone) { setError('Enter customer phone'); return }
    setError(''); setSplitMpesaStage('pushing')
    try {
      const res = await mpesaStkPush(phone, splitRemaining, 'POS Sale')
      const { checkout_request_id, simulated } = res.data
      setSplitMpesaCheckoutId(checkout_request_id)
      setSplitMpesaSimulated(!!simulated)
      setSplitMpesaPollCount(0)
      setSplitMpesaStage('polling')
      splitMpesaPollRef.current = setInterval(() => setSplitMpesaPollCount(c => c + 1), 5000)
    } catch (e) { setError(e.message || 'STK push failed'); setSplitMpesaStage('input') }
  }

  useEffect(() => {
    if (splitMpesaStage !== 'polling' || !splitMpesaCheckoutId) return
    if (splitMpesaPollCount > 18) { clearInterval(splitMpesaPollRef.current); setSplitMpesaStage('manual'); return }
    if (splitMpesaSimulated) {
      const t = setTimeout(() => setSplitMpesaStage('manual'), 2000)
      return () => clearTimeout(t)
    }
    mpesaStkStatus(splitMpesaCheckoutId).then(res => {
      const { status, mpesa_ref } = res.data
      if (status === 'completed') {
        clearInterval(splitMpesaPollRef.current)
        addSplitTender({ method: 'mpesa', amount: splitRemaining, ref: mpesa_ref || splitMpesaCheckoutId })
      } else if (status === 'cancelled' || status === 'failed') {
        clearInterval(splitMpesaPollRef.current)
        setError(res.data.error_message || 'M-Pesa payment failed')
        setSplitMpesaStage('input')
      }
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitMpesaPollCount, splitMpesaStage])

  function handleSplitMpesaManual() {
    if (!splitMpesaRef.trim()) { setError('Enter M-Pesa code'); return }
    addSplitTender({ method: 'mpesa', amount: splitRemaining, ref: splitMpesaRef.trim() })
  }

  async function handleSplitCardPay() {
    setError('')
    try {
      const res = await createPaymentIntent(Math.round(splitRemaining * 100))
      setSplitCardIntentId(res.data.payment_intent_id)
      setSplitCardStatus('waiting')
    } catch (e) { setError(e.message) }
  }

  async function handleSplitCardCapture() {
    if (!splitCardIntentId) return
    setSplitCardStatus('capturing')
    try {
      await capturePaymentIntent(splitCardIntentId)
      addSplitTender({ method: 'card', amount: splitRemaining, intentId: splitCardIntentId })
    } catch (e) { setError(e.message); setSplitCardStatus('error') }
  }

  async function handleSplitAcctSearch(q) {
    setSplitAcctQuery(q); setSplitAcct(null)
    if (!q.trim()) { setSplitAcctResults([]); return }
    setSplitAcctSearching(true)
    try { const r = await lookupAccount(q); setSplitAcctResults(r.data) }
    catch (e) { setError(e.message) }
    finally { setSplitAcctSearching(false) }
  }

  function handleSplitAcctAdd() {
    if (!splitAcct) { setError('Select an account first'); return }
    const amt = parseFloat(splitAcctAmt) || 0
    if (amt <= 0) { setError('Enter amount'); return }
    const available = splitAcct.balance + splitAcct.credit_limit
    if (amt > available + 0.01) { setError(`Insufficient balance. Available: ${KES(available)}`); return }
    if (amt > splitRemaining + 0.01) { setError(`Amount exceeds remaining (${KES(splitRemaining)})`); return }
    addSplitTender({ method: 'account', amount: amt, accountId: splitAcct.id, accountName: splitAcct.customer_name })
  }

  async function handleSplitFinalize() {
    if (splitRemaining > 0.01) { setError('Total not fully covered'); return }
    if (splitTenders.length === 0) { setError('Add at least one payment method'); return }
    setProcessing(true); setError('')
    try {
      const cashAmt   = splitTenders.filter(t => t.method === 'cash').reduce((s, t) => s + t.amount, 0)
      const mpesaAmt  = splitTenders.filter(t => t.method === 'mpesa').reduce((s, t) => s + t.amount, 0)
      const cardAmt   = splitTenders.filter(t => t.method === 'card').reduce((s, t) => s + t.amount, 0)
      const firstAcct = splitTenders.find(t => t.method === 'account')
      const res = await createSale(buildPayload({
        payment_method: 'split',
        tenders: splitTenders,
        cash_tendered: cashAmt || undefined,
        mpesa_ref: splitTenders.find(t => t.method === 'mpesa')?.ref,
        mpesa_amount: mpesaAmt || undefined,
        card_amount: cardAmt || undefined,
        stripe_payment_intent_id: splitTenders.find(t => t.method === 'card')?.intentId,
        account_id: firstAcct?.accountId,
      }))
      handleSaleSuccess(res.data)
    } catch (e) { setError(e.message); setProcessing(false) }
  }

  // ── NumPad ───────────────────────────────────────────────────────────────

  function NumPad({ value, onChange }) {
    function press(key) {
      if (key === 'C') { onChange(''); return }
      if (key === '⌫') { onChange(v => v.slice(0, -1)); return }
      if (key === '.' && value.includes('.')) return
      onChange(v => {
        const next = v + key
        if (next.includes('.') && next.split('.')[1]?.length > 2) return v
        return next
      })
    }
    const keys = ['7','8','9','4','5','6','1','2','3','C','0','⌫']
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, margin: '12px 0' }}>
        {keys.map(k => (
          <button key={k} className="btn btn-ghost" style={{ fontSize: 18, padding: '14px 0' }} onClick={() => press(k)}>{k}</button>
        ))}
        <button className="btn btn-ghost" style={{ gridColumn: 'span 2', fontSize: 18, padding: '14px 0' }} onClick={() => press('.')}>.</button>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const TITLE = {
    cash:    'Cash Payment',
    card:    'Card — Stripe Terminal',
    mpesa:   'M-Pesa Payment',
    account: 'Account Payment',
    split:   'Split / Multi-tender',
  }

  // ── Sale success screen ───────────────────────────────────────────────────

  if (completedSale) {
    const method = completedSale.payment_method || ''
    return (
      <div className="modal-overlay">
        <div className="modal" style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 4, letterSpacing: 0.2 }}>SALE COMPLETE</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 4 }}>
            {completedSale.receipt_number}
          </div>
          <div style={{ fontWeight: 700, fontSize: 28, color: 'var(--success)', marginBottom: pointsEarned ? 8 : 16 }}>
            {KES(completedSale.total)}
          </div>

          {pointsEarned && (
            <div style={{ background: '#ffd70022', border: '1px solid #ffd700', borderRadius: 8, padding: '8px 16px', marginBottom: 16, fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: '#b8860b' }}>+{pointsEarned.points_earned} pts earned</span>
              <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>Balance: {pointsEarned.new_balance.toLocaleString()} pts</span>
              {pointsEarned.tier && <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>· {pointsEarned.tier}</span>}
            </div>
          )}

          {method === 'cash' && (
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Cash tendered</span><span>{KES(completedSale.cash_tendered)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--success)', marginTop: 4 }}>
                <span>Change</span><span>{KES(completedSale.change_given)}</span>
              </div>
            </div>
          )}
          {method === 'mpesa' && completedSale.mpesa_ref && (
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 16px', marginBottom: 16, fontSize: 13 }}>
              M-Pesa ref: <strong>{completedSale.mpesa_ref}</strong>
            </div>
          )}

          {printMsg && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{printMsg}</div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={handleReprint}>
              ESC/POS
            </button>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={printBrowserReceipt}>
              Print Receipt
            </button>
            {(method === 'cash' || method === 'split') && (
              <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={handleOpenDrawer}>
                Open Drawer
              </button>
            )}
          </div>
          <div style={{ marginBottom: 8 }}>
            <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={handlePrintInvoice}>
              Print Invoice (A4)
            </button>
          </div>

          <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={onClose}>
            New Sale
          </button>
        </div>
      </div>
    )
  }

  // ── Method selector (shown when method='select') ─────────────────────────
  if (methodProp === 'select' && !activeMethod) {
    return (
      <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="modal" style={{ width: 420 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
              {items.reduce((s, i) => s + i.qty, 0)} item{items.reduce((s, i) => s + i.qty, 0) !== 1 ? 's' : ''}
            </div>
            <div style={{ fontSize: 42, fontWeight: 800, color: 'var(--success)', letterSpacing: -1 }}>
              {KES(total)}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            {[
              { key: 'cash',    label: 'Cash' },
              { key: 'mpesa',   label: 'M-Pesa' },
              { key: 'split',   label: 'Split / Multi' },
              { key: 'account', label: 'Account' },
            ].map(({ key, label }) => (
              <button key={key} className="tender-btn-clean" onClick={() => setActiveMethod(key)}>
                {label}
              </button>
            ))}
          </div>
          <button className="tender-btn-clean tender-btn-clean--wide" onClick={() => setActiveMethod('card')}
            style={{ marginBottom: 10 }}>
            Card — Stripe Terminal
          </button>
          <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !processing) onClose() }}>
      <div className="modal">
        <div className="modal-title">
          {methodProp === 'select' && (
            <button onClick={() => setActiveMethod(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, marginRight: 8, padding: 0 }}>←</button>
          )}
          {TITLE[method] || 'Payment'}
        </div>

        {/* Order summary */}
        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, color: 'var(--text-muted)' }}>
            <span>Items ({items.reduce((s, i) => s + i.qty, 0)})</span>
            <span>{KES(subtotal)}</span>
          </div>
          {discountTotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, color: 'var(--warning)' }}>
              <span>Discounts</span><span>−{KES(discountTotal)}</span>
            </div>
          )}
          {taxAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, color: 'var(--text-muted)' }}>
              <span>VAT</span><span>{KES(taxAmount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 20, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
            <span>Total</span><span>{KES(total)}</span>
          </div>
        </div>

        {/* ── Cash ── */}
        {method === 'cash' && (
          <>
            <label className="label">Cash Tendered</label>
            <div style={{
              fontSize: 32, fontWeight: 700, textAlign: 'center', padding: '12px',
              background: 'var(--surface2)', borderRadius: 8, marginBottom: 4,
              color: cashAmount >= total ? 'var(--success)' : 'var(--text)',
              border: `2px solid ${cashAmount >= total ? 'var(--success)' : 'var(--border)'}`,
            }}>
              {currency} {cashInput || '0.00'}
            </div>
            {cashAmount >= total && (
              <div style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 600, marginBottom: 8 }}>
                Change: {KES(change)}
              </div>
            )}
            <NumPad value={cashInput} onChange={setCashInput} />
            {error && <p className="error-msg">{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onClose} disabled={processing}>Cancel</button>
              <button className="btn btn-success btn-lg" style={{ flex: 2 }} onClick={handleCashPay}
                disabled={processing || cashAmount < total}>
                {processing ? 'Processing...' : `Collect ${KES(cashAmount)}`}
              </button>
            </div>
          </>
        )}

        {/* ── M-Pesa STK Push ── */}
        {method === 'mpesa' && (
          <>
            {/* Stage: input phone number */}
            {mpesaStage === 'input' && (
              <>
                <div style={{ textAlign: 'center', padding: '8px 0 12px' }}>
                  <div style={{ fontWeight: 700, fontSize: 24, color: 'var(--success)', marginBottom: 4 }}>{KES(total)}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Enter customer phone to send an STK push prompt directly to their handset.
                  </div>
                </div>
                <label className="label">Customer Phone (M-Pesa)</label>
                <input className="input"
                  value={mpesaPhone}
                  onChange={e => { setMpesaPhone(e.target.value); setError('') }}
                  placeholder="e.g. 0712 345 678"
                  inputMode="tel"
                  autoFocus
                  style={{ fontSize: 18, marginBottom: 4 }}
                />
                {error && <p className="error-msg">{error}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
                  <button className="btn btn-success btn-lg" style={{ flex: 2 }}
                    onClick={handleStkPush} disabled={!mpesaPhone.trim()}>
                    Send STK Push
                  </button>
                </div>
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setMpesaStage('manual')}
                    style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Skip — enter code manually
                  </button>
                </div>
              </>
            )}

            {/* Stage: pushing (waiting for Daraja response) */}
            {mpesaStage === 'pushing' && (
              <LoadingState msg="Sending STK push to customer..." />
            )}

            {/* Stage: polling for confirmation */}
            {mpesaStage === 'polling' && (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
                <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 6 }}>
                  Waiting for customer to confirm
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                  {mpesaSimulated
                    ? 'Simulated mode — no real push sent (MPESA_CONSUMER_KEY not set)'
                    : `STK push sent to ${mpesaPhone}. Customer should see a PIN prompt.`}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 20 }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: i <= (mpesaPollCount % 6) ? 'var(--success)' : 'var(--border)',
                      transition: 'background 0.4s',
                    }} />
                  ))}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                  Checking... ({mpesaPollCount * 5}s / 90s)
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button className="btn btn-ghost btn-sm" onClick={cancelMpesaPolling}>Cancel</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { clearInterval(mpesaPollRef.current); setMpesaStage('manual') }}>
                    Enter code manually
                  </button>
                </div>
              </div>
            )}

            {/* Stage: manual code fallback */}
            {mpesaStage === 'manual' && (
              <>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Ask the customer for their M-Pesa confirmation code and enter it below.
                </div>
                <label className="label">M-Pesa Confirmation Code</label>
                <input className="input"
                  value={mpesaRef}
                  onChange={e => { setMpesaRef(e.target.value.toUpperCase()); setError('') }}
                  placeholder="e.g. QJK8LPZ3A4"
                  style={{ fontFamily: 'monospace', fontSize: 18, letterSpacing: 2, textAlign: 'center', marginBottom: 4 }}
                  autoFocus
                />
                {error && <p className="error-msg">{error}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-ghost btn-lg" style={{ flex: 1 }}
                    onClick={() => setMpesaStage('input')} disabled={processing}>Back</button>
                  <button className="btn btn-success btn-lg" style={{ flex: 2 }}
                    onClick={handleMpesaManual} disabled={processing || !mpesaRef.trim()}>
                    {processing ? 'Processing...' : 'Confirm Payment'}
                  </button>
                </div>
              </>
            )}

            {mpesaStage === 'done' && <LoadingState msg="Recording sale..." />}
          </>
        )}

        {/* ── Card ── */}
        {method === 'card' && (
          <>
            {cardStatus === '' && (
              <>
                <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 13 }}>
                  Creates a Stripe Terminal payment intent and prompts the card reader.
                </p>
                {error && <p className="error-msg">{error}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
                  <button className="btn btn-primary btn-lg" style={{ flex: 2 }} onClick={handleCardPay}>Charge {KES(total)}</button>
                </div>
              </>
            )}
            {cardStatus === 'creating' && <LoadingState msg="Creating payment intent..." />}
            {cardStatus === 'waiting' && (
              <>
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>💳</div>
                  <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Waiting for card...</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Present card / tap / insert on the reader</div>
                  <div style={{ marginTop: 16, padding: '8px 16px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    No reader? Click "Simulate Capture" to test the flow.
                  </div>
                </div>
                {error && <p className="error-msg">{error}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" onClick={handleCardCancel}>Cancel</button>
                  <button className="btn btn-success btn-lg" style={{ flex: 1 }} onClick={handleCapture}>Simulate Capture (no reader)</button>
                </div>
              </>
            )}
            {cardStatus === 'capturing' && <LoadingState msg="Capturing payment..." />}
            {cardStatus === 'error' && (
              <>
                <p className="error-msg" style={{ textAlign: 'center', padding: '16px 0' }}>{error || 'Payment failed'}</p>
                <button className="btn btn-ghost btn-lg" style={{ width: '100%' }} onClick={handleCardCancel}>Try Again</button>
              </>
            )}
          </>
        )}

        {/* ── Account ── */}
        {method === 'account' && (
          <>
            <label className="label">Search Customer Account</label>
            <div style={{ marginBottom: 8 }}>
              <input className="input" placeholder="Name or phone..."
                value={acctQuery} onChange={e => handleAcctSearch(e.target.value)} autoFocus />
            </div>
            {acctSearching && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Searching...</div>}
            {acctResults.length > 0 && !selectedAcct && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
                {acctResults.map(a => (
                  <div key={a.id}
                    onClick={() => { setSelectedAcct(a); setAcctResults([]); setAcctQuery(a.customer_name) }}
                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseOut={e => e.currentTarget.style.background = ''}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{a.customer_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.customer_phone || 'No phone'}</div>
                    </div>
                    <div style={{ fontWeight: 700, color: a.balance >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: 14 }}>
                      {KES(a.balance)}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {selectedAcct && (
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{selectedAcct.customer_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedAcct.customer_phone || ''}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedAcct(null); setAcctQuery('') }}>Change</button>
                </div>
                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Current Balance</div>
                    <div style={{ fontWeight: 700, color: selectedAcct.balance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {KES(selectedAcct.balance)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>After This Sale</div>
                    <div style={{ fontWeight: 700, color: (selectedAcct.balance - total) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {KES(selectedAcct.balance - total)}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {error && <p className="error-msg">{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onClose} disabled={processing}>Cancel</button>
              <button className="btn btn-primary btn-lg" style={{ flex: 2 }}
                onClick={handleAccountPay} disabled={processing || !selectedAcct}>
                {processing ? 'Processing...' : `Charge ${KES(total)}`}
              </button>
            </div>
          </>
        )}

        {/* ── Split / Multi-tender ── */}
        {method === 'split' && (
          <>
            {/* ── Tender selector ── */}
            {splitScreen === 'select' && (
              <>
                {/* Running tally */}
                <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: splitTenders.length ? 8 : 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Remaining</span>
                    <span style={{ fontWeight: 800, fontSize: 22, color: splitRemaining <= 0.01 ? 'var(--success)' : 'var(--danger)' }}>
                      {KES(splitRemaining)}
                    </span>
                  </div>
                  {splitTenders.map((t, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--text-muted)', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                      <span>
                        {t.method === 'account' ? (t.accountName || 'Account') : t.method.charAt(0).toUpperCase() + t.method.slice(1)}
                        {t.ref ? <span style={{ fontSize: 11, marginLeft: 6, fontFamily: 'monospace' }}>{t.ref}</span> : null}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{KES(t.amount)}</span>
                        <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: 0 }}
                          onClick={() => removeSplitTender(i)}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add payment method buttons */}
                {splitRemaining > 0.01 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    {[
                      { label: 'Cash',    fn: () => { setSplitScreen('cash');    setSplitCashInput('');      setError('') } },
                      { label: 'M-Pesa',  fn: () => { setSplitScreen('mpesa');   setSplitMpesaStage('input'); setSplitMpesaRef(''); setError('') } },
                      { label: 'Card',    fn: () => { setSplitScreen('card');    setSplitCardStatus('');     setSplitCardIntentId(null); setError('') } },
                      { label: 'Account', fn: () => { setSplitScreen('account'); setSplitAcctAmt(splitRemaining.toFixed(2)); setError('') } },
                    ].map(({ label, fn }) => (
                      <button key={label} className="tender-btn-clean" onClick={fn}>{label}</button>
                    ))}
                  </div>
                )}

                {error && <p className="error-msg">{error}</p>}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onClose} disabled={processing}>Cancel</button>
                  <button className="btn btn-success btn-lg" style={{ flex: 2 }}
                    onClick={handleSplitFinalize}
                    disabled={processing || splitRemaining > 0.01 || splitTenders.length === 0}>
                    {processing ? 'Processing…' : `Complete  ${KES(total)}`}
                  </button>
                </div>
              </>
            )}

            {/* ── Cash sub-flow ── */}
            {splitScreen === 'cash' && (
              <>
                <div style={{ textAlign: 'center', marginBottom: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                  Remaining to cover: <strong>{KES(splitRemaining)}</strong>
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, textAlign: 'center', padding: '10px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 4 }}>
                  {currency} {splitCashInput || '0.00'}
                </div>
                {parseFloat(splitCashInput) > splitRemaining && (
                  <div style={{ textAlign: 'center', color: 'var(--success)', fontSize: 13, marginBottom: 4 }}>
                    Change: {KES((parseFloat(splitCashInput) || 0) - splitRemaining)}
                  </div>
                )}
                <NumPad value={splitCashInput} onChange={setSplitCashInput} />
                {error && <p className="error-msg">{error}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={() => { setSplitScreen('select'); setError('') }}>Back</button>
                  <button className="btn btn-success btn-lg" style={{ flex: 2 }}
                    onClick={handleSplitCashAdd}
                    disabled={(parseFloat(splitCashInput) || 0) <= 0}>
                    Add {KES(parseFloat(splitCashInput) || 0)}
                  </button>
                </div>
              </>
            )}

            {/* ── M-Pesa sub-flow ── */}
            {splitScreen === 'mpesa' && (
              <>
                {splitMpesaStage === 'input' && (
                  <>
                    <div style={{ textAlign: 'center', marginBottom: 12 }}>
                      <div style={{ fontWeight: 700, fontSize: 22, color: 'var(--success)' }}>{KES(splitRemaining)}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>M-Pesa amount</div>
                    </div>
                    <label className="label">Customer Phone</label>
                    <input className="input" value={splitMpesaPhone}
                      onChange={e => { setSplitMpesaPhone(e.target.value); setError('') }}
                      placeholder="0712 345 678" inputMode="tel" autoFocus style={{ marginBottom: 4 }} />
                    {error && <p className="error-msg">{error}</p>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={() => { setSplitScreen('select'); setError('') }}>Back</button>
                      <button className="btn btn-success btn-lg" style={{ flex: 2 }}
                        onClick={handleSplitStkPush} disabled={!splitMpesaPhone.trim()}>Send STK Push</button>
                    </div>
                    <div style={{ marginTop: 10, textAlign: 'center' }}>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: 'var(--text-muted)' }}
                        onClick={() => setSplitMpesaStage('manual')}>Enter code manually</button>
                    </div>
                  </>
                )}
                {splitMpesaStage === 'pushing' && <LoadingState msg="Sending STK push..." />}
                {splitMpesaStage === 'polling' && (
                  <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>📱</div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Waiting for customer…</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                      {splitMpesaSimulated ? 'Simulated mode' : `STK push sent to ${splitMpesaPhone}`}
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { clearInterval(splitMpesaPollRef.current); setSplitMpesaStage('input') }}>Cancel</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { clearInterval(splitMpesaPollRef.current); setSplitMpesaStage('manual') }}>Enter code</button>
                    </div>
                  </div>
                )}
                {splitMpesaStage === 'manual' && (
                  <>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                      Enter the M-Pesa confirmation code for <strong>{KES(splitRemaining)}</strong>.
                    </div>
                    <label className="label">Confirmation Code</label>
                    <input className="input" value={splitMpesaRef}
                      onChange={e => { setSplitMpesaRef(e.target.value.toUpperCase()); setError('') }}
                      placeholder="e.g. QJK8LPZ3A4"
                      style={{ fontFamily: 'monospace', fontSize: 18, letterSpacing: 2, textAlign: 'center', marginBottom: 4 }}
                      autoFocus />
                    {error && <p className="error-msg">{error}</p>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={() => setSplitMpesaStage('input')}>Back</button>
                      <button className="btn btn-success btn-lg" style={{ flex: 2 }}
                        onClick={handleSplitMpesaManual} disabled={!splitMpesaRef.trim()}>Confirm {KES(splitRemaining)}</button>
                    </div>
                  </>
                )}
              </>
            )}

            {/* ── Card sub-flow ── */}
            {splitScreen === 'card' && (
              <>
                {splitCardStatus === '' && (
                  <>
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                      <div style={{ fontSize: 40, marginBottom: 8 }}>💳</div>
                      <div style={{ fontWeight: 700, fontSize: 22, color: 'var(--success)' }}>{KES(splitRemaining)}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Card payment</div>
                    </div>
                    {error && <p className="error-msg">{error}</p>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={() => { setSplitScreen('select'); setError('') }}>Back</button>
                      <button className="btn btn-primary btn-lg" style={{ flex: 2 }} onClick={handleSplitCardPay}>Charge Card</button>
                    </div>
                  </>
                )}
                {splitCardStatus === 'waiting' && (
                  <>
                    <div style={{ textAlign: 'center', padding: '16px 0' }}>
                      <div style={{ fontSize: 40, marginBottom: 8 }}>💳</div>
                      <div style={{ fontWeight: 600 }}>Present card on reader — {KES(splitRemaining)}</div>
                    </div>
                    {error && <p className="error-msg">{error}</p>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost" onClick={() => { setSplitCardIntentId(null); setSplitCardStatus('') }}>Cancel</button>
                      <button className="btn btn-success btn-lg" style={{ flex: 1 }} onClick={handleSplitCardCapture}>Simulate Capture</button>
                    </div>
                  </>
                )}
                {splitCardStatus === 'capturing' && <LoadingState msg="Capturing card payment..." />}
                {splitCardStatus === 'error' && (
                  <>
                    <p className="error-msg" style={{ textAlign: 'center', padding: '16px 0' }}>{error || 'Card payment failed'}</p>
                    <button className="btn btn-ghost btn-lg" style={{ width: '100%' }} onClick={() => { setSplitCardIntentId(null); setSplitCardStatus('') }}>Try Again</button>
                  </>
                )}
              </>
            )}

            {/* ── Account sub-flow ── */}
            {splitScreen === 'account' && (
              <>
                <label className="label">Search Customer Account</label>
                <input className="input" placeholder="Name or phone…"
                  value={splitAcctQuery} onChange={e => handleSplitAcctSearch(e.target.value)}
                  autoFocus style={{ marginBottom: 8 }} />
                {splitAcctSearching && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Searching…</div>}
                {splitAcctResults.length > 0 && !splitAcct && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
                    {splitAcctResults.map(a => (
                      <div key={a.id}
                        onClick={() => { setSplitAcct(a); setSplitAcctResults([]) }}
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                        onMouseOut={e => e.currentTarget.style.background = ''}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{a.customer_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.customer_phone || 'No phone'}</div>
                        </div>
                        <div style={{ fontWeight: 700, color: a.balance >= 0 ? 'var(--success)' : 'var(--danger)' }}>{KES(a.balance)}</div>
                      </div>
                    ))}
                  </div>
                )}
                {splitAcct && (
                  <>
                    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{splitAcct.customer_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Balance: {KES(splitAcct.balance)}</div>
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setSplitAcct(null); setSplitAcctQuery('') }}>Change</button>
                      </div>
                    </div>
                    <label className="label">Amount to charge from account</label>
                    <div style={{ fontSize: 24, fontWeight: 700, textAlign: 'center', padding: '10px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 4 }}>
                      {currency} {splitAcctAmt || '0.00'}
                    </div>
                    <NumPad value={splitAcctAmt} onChange={setSplitAcctAmt} />
                  </>
                )}
                {error && <p className="error-msg">{error}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={() => { setSplitScreen('select'); setError('') }}>Back</button>
                  <button className="btn btn-primary btn-lg" style={{ flex: 2 }}
                    onClick={handleSplitAcctAdd}
                    disabled={!splitAcct || (parseFloat(splitAcctAmt) || 0) <= 0}>
                    Add {KES(parseFloat(splitAcctAmt) || 0)}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function LoadingState({ msg }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
      <div>{msg}</div>
    </div>
  )
}

