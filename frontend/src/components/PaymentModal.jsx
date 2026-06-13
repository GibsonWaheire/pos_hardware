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
  const [splitCash, setSplitCash] = useState('')
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
  const splitCashAmt = parseFloat(splitCash) || 0
  const splitCardAmt = Math.max(0, total - splitCashAmt)

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

  // ── Split ────────────────────────────────────────────────────────────────

  async function handleSplitPay() {
    if (splitCashAmt <= 0) { setError('Enter cash portion'); return }
    if (splitCashAmt >= total) { setError('Cash portion must be less than total — use Cash payment'); return }
    setProcessing(true); setError('')
    try {
      const amountCents = Math.round(splitCardAmt * 100)
      const intentRes = await createPaymentIntent(amountCents)
      setCardIntentId(intentRes.data.payment_intent_id)
      setCardStatus('waiting')
    } catch (e) { setError(e.message); setProcessing(false) }
  }

  async function handleSplitCapture() {
    if (!cardIntentId) return
    setCardStatus('capturing')
    try {
      await capturePaymentIntent(cardIntentId)
      const res = await createSale(buildPayload({ payment_method: 'split', cash_tendered: splitCashAmt, card_amount: splitCardAmt, stripe_payment_intent_id: cardIntentId }))
      setCardStatus('done')
      handleSaleSuccess(res.data)
    } catch (e) { setError(e.message); setCardStatus('error'); setProcessing(false) }
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
    cash: '💵 Cash Payment',
    card: '💳 Card Payment',
    mpesa: '📱 M-Pesa',
    account: '🏦 Account Payment',
    split: '✂️ Split Payment',
  }

  // ── Sale success screen ───────────────────────────────────────────────────

  if (completedSale) {
    const method = completedSale.payment_method || ''
    return (
      <div className="modal-overlay">
        <div className="modal" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>Sale Complete</div>
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
              🖨 ESC/POS
            </button>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={printBrowserReceipt}>
              🖨 Print
            </button>
            {(method === 'cash' || method === 'split') && (
              <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={handleOpenDrawer}>
                💰 Drawer
              </button>
            )}
          </div>
          <div style={{ marginBottom: 8 }}>
            <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={handlePrintInvoice}>
              Invoice (A4)
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <button className="tender-btn" onClick={() => setActiveMethod('cash')}
              style={{ background: '#22c55e18', border: '2px solid #22c55e44', color: 'var(--text)' }}>
              <span style={{ fontSize: 28 }}>💵</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Cash</span>
            </button>
            <button className="tender-btn" onClick={() => setActiveMethod('mpesa')}
              style={{ background: '#4caf5018', border: '2px solid #4caf5044', color: 'var(--text)' }}>
              <span style={{ fontSize: 28 }}>📱</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>M-Pesa</span>
            </button>
            <button className="tender-btn" onClick={() => setActiveMethod('split')}
              style={{ background: '#f59e0b18', border: '2px solid #f59e0b44', color: 'var(--text)' }}>
              <span style={{ fontSize: 28 }}>✂️</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Split</span>
            </button>
            <button className="tender-btn" onClick={() => setActiveMethod('account')}
              style={{ background: '#4f6ef718', border: '2px solid #4f6ef744', color: 'var(--text)' }}>
              <span style={{ fontSize: 28 }}>🏦</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Account</span>
            </button>
          </div>
          <button className="tender-btn" onClick={() => setActiveMethod('card')}
            style={{ background: '#6366f118', border: '2px solid #6366f144', color: 'var(--text)', width: '100%', flexDirection: 'row', marginBottom: 10 }}>
            <span style={{ fontSize: 22 }}>💳</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Card (Stripe Terminal)</span>
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

        {/* ── Split ── */}
        {method === 'split' && (
          <>
            {cardStatus === '' && (
              <>
                <label className="label">Cash Portion</label>
                <div style={{ fontSize: 28, fontWeight: 700, textAlign: 'center', padding: '10px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 4 }}>
                  {currency} {splitCash || '0.00'}
                </div>
                {splitCash && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>
                    <span>Cash: {KES(splitCashAmt)}</span>
                    <span>Card: {KES(splitCardAmt)}</span>
                  </div>
                )}
                <NumPad value={splitCash} onChange={setSplitCash} />
                {error && <p className="error-msg">{error}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
                  <button className="btn btn-primary btn-lg" style={{ flex: 2 }} onClick={handleSplitPay}
                    disabled={processing || splitCashAmt <= 0 || splitCashAmt >= total}>
                    Charge Card {KES(splitCardAmt)}
                  </button>
                </div>
              </>
            )}
            {cardStatus === 'waiting' && (
              <>
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>💳</div>
                  <div style={{ fontWeight: 600 }}>Card: {KES(splitCardAmt)}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Present card on reader</div>
                </div>
                {error && <p className="error-msg">{error}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" onClick={handleCardCancel}>Cancel</button>
                  <button className="btn btn-success btn-lg" style={{ flex: 1 }} onClick={handleSplitCapture}>Simulate Capture</button>
                </div>
              </>
            )}
            {(cardStatus === 'creating' || cardStatus === 'capturing') && <LoadingState msg="Processing..." />}
            {cardStatus === 'error' && (
              <>
                <p className="error-msg" style={{ textAlign: 'center', padding: '16px 0' }}>{error || 'Payment failed'}</p>
                <button className="btn btn-ghost btn-lg" style={{ width: '100%' }} onClick={handleCardCancel}>Try Again</button>
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

