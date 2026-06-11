import { useState } from 'react'
import { createSale, createPaymentIntent, capturePaymentIntent, cancelPaymentIntent, lookupAccount } from '../api'

function newUUID() {
  try { return crypto.randomUUID() }
  catch { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
}

const KES = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function PaymentModal({
  method, items, subtotal, discountTotal, taxAmount, total,
  customer, loyaltyPointsToRedeem, ageVerified,
  onClose, onComplete,
}) {
  const [cashInput, setCashInput] = useState('')
  const [cardStatus, setCardStatus] = useState('')
  const [cardIntentId, setCardIntentId] = useState(null)
  const [splitCash, setSplitCash] = useState('')
  const [mpesaRef, setMpesaRef] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

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
      offline_id: newUUID(),
      ...overrides,
    }
  }

  // ── Cash ─────────────────────────────────────────────────────────────────

  async function handleCashPay() {
    if (cashAmount < total) { setError('Cash tendered must be ≥ total'); return }
    setProcessing(true); setError('')
    try {
      const res = await createSale(buildPayload({ payment_method: 'cash', cash_tendered: cashAmount }))
      onComplete(res.data)
    } catch (e) { setError(e.message); setProcessing(false) }
  }

  // ── M-Pesa ───────────────────────────────────────────────────────────────

  async function handleMpesaPay() {
    if (!mpesaRef.trim()) { setError('Enter M-Pesa confirmation code'); return }
    setProcessing(true); setError('')
    try {
      const res = await createSale(buildPayload({ payment_method: 'mpesa', mpesa_ref: mpesaRef.trim() }))
      onComplete(res.data)
    } catch (e) { setError(e.message); setProcessing(false) }
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
      onComplete(res.data)
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
      onComplete(res.data)
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
      onComplete(res.data)
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

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !processing) onClose() }}>
      <div className="modal">
        <div className="modal-title">{TITLE[method] || 'Payment'}</div>

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
              KES {cashInput || '0.00'}
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

        {/* ── M-Pesa ── */}
        {method === 'mpesa' && (
          <>
            <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
              <div style={{ fontSize: 42, marginBottom: 8 }}>📱</div>
              <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>{KES(total)}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Customer sends via M-Pesa, then enter the confirmation code below.
              </div>
            </div>
            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <label className="label">M-Pesa Confirmation Code</label>
              <input className="input"
                value={mpesaRef}
                onChange={e => setMpesaRef(e.target.value.toUpperCase())}
                placeholder="e.g. QJK8LPZ3A4"
                style={{ fontFamily: 'monospace', fontSize: 18, letterSpacing: 2, textAlign: 'center' }}
                autoFocus
              />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onClose} disabled={processing}>Cancel</button>
              <button className="btn btn-success btn-lg" style={{ flex: 2 }} onClick={handleMpesaPay}
                disabled={processing || !mpesaRef.trim()}>
                {processing ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
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
                  KES {splitCash || '0.00'}
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
