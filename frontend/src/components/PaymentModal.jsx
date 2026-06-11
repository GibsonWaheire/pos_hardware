/**
 * PaymentModal — handles cash, card (Stripe Terminal), and split payment flows.
 *
 * Cash:  Enter amount tendered, calculate change, complete sale.
 * Card:  Create Stripe Terminal payment intent, wait for reader, capture.
 * Split: Enter cash portion, card handles the rest.
 */

import { useState } from 'react'
import { createSale, createPaymentIntent, capturePaymentIntent, cancelPaymentIntent } from '../api'

// Simple UUID — crypto.randomUUID() works in modern browsers
function newUUID() {
  try { return crypto.randomUUID() }
  catch { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
}

export default function PaymentModal({
  method, items, subtotal, discountTotal, taxAmount, total,
  customer, loyaltyPointsToRedeem, ageVerified,
  salonMode, staff,
  onClose, onComplete,
}) {
  // Tip step (salon only)
  const [tipStep, setTipStep] = useState(salonMode)   // show tip before payment
  const [tipAmount, setTipAmount] = useState(0)
  const [tipCustom, setTipCustom] = useState('')
  const [tipMethod, setTipMethod] = useState('card')  // card | cash
  const [tipStaffId, setTipStaffId] = useState(staff?.[0]?.id || '')

  const [cashInput, setCashInput] = useState('')
  const [cardStatus, setCardStatus] = useState('')  // '' | 'creating' | 'waiting' | 'capturing' | 'done' | 'error'
  const [cardIntentId, setCardIntentId] = useState(null)
  const [splitCash, setSplitCash] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  const grandTotal = total + tipAmount

  const cashAmount = parseFloat(cashInput) || 0
  const change = Math.max(0, cashAmount - grandTotal)

  const splitCashAmt = parseFloat(splitCash) || 0
  const splitCardAmt = Math.max(0, grandTotal - splitCashAmt)

  // ── Shared sale payload builder ──────────────────────────────────────────

  function buildPayload(overrides = {}) {
    const tipStaff = staff?.find(s => s.id === parseInt(tipStaffId))
    return {
      items: items.map(i => ({
        product_id: i.product_id || null,
        product_name: i.product_name,
        unit_price: i.unit_price,
        qty: i.qty,
        discount: i.discount,
        tax_rate: i.tax_rate,
        item_type: i.item_type || 'product',
        service_id: i.service_id || null,
        staff_id: i.staff_id || null,
        staff_name: i.staff_name || '',
      })),
      sale_type: salonMode ? 'salon' : 'retail',
      tip_amount: tipAmount,
      tip_method: tipAmount > 0 ? tipMethod : null,
      tip_staff_id: tipAmount > 0 && tipStaff ? tipStaff.id : null,
      tip_staff_name: tipAmount > 0 && tipStaff ? tipStaff.name : null,
      customer_id: customer?.id || null,
      loyalty_points_to_redeem: loyaltyPointsToRedeem || 0,
      age_verified: ageVerified || false,
      offline_id: newUUID(),
      ...overrides,
    }
  }

  // ── Cash payment ────────────────────────────────────────────────────────

  async function handleCashPay() {
    if (cashAmount < grandTotal) { setError('Cash tendered must be ≥ total'); return }
    setProcessing(true)
    setError('')
    try {
      const res = await createSale(buildPayload({ payment_method: 'cash', cash_tendered: cashAmount }))
      onComplete(res.data)
    } catch (e) {
      setError(e.message)
      setProcessing(false)
    }
  }

  // ── Card payment (Stripe Terminal) ──────────────────────────────────────

  async function handleCardPay() {
    setProcessing(true)
    setCardStatus('creating')
    setError('')
    try {
      // Amount in cents for Stripe
      const amountCents = Math.round(grandTotal * 100)
      const intentRes = await createPaymentIntent(amountCents)
      const intentId = intentRes.data.payment_intent_id
      setCardIntentId(intentId)
      setCardStatus('waiting')

      // In a real Stripe Terminal integration you'd use the JS SDK here to
      // collect the payment on the physical reader. For now we expose a
      // "Simulate Capture" button so you can test the flow without hardware.
      // In production: replace this block with StripeTerminal.collectPaymentMethod()

    } catch (e) {
      setError(e.message)
      setCardStatus('error')
      setProcessing(false)
    }
  }

  async function handleCapture() {
    if (!cardIntentId) return
    setCardStatus('capturing')
    setError('')
    try {
      await capturePaymentIntent(cardIntentId)
      const res = await createSale(buildPayload({ payment_method: 'card', stripe_payment_intent_id: cardIntentId }))
      setCardStatus('done')
      onComplete(res.data)
    } catch (e) {
      setError(e.message)
      setCardStatus('error')
      setProcessing(false)
    }
  }

  async function handleCardCancel() {
    if (cardIntentId) {
      try { await cancelPaymentIntent(cardIntentId) } catch {}
    }
    setCardIntentId(null)
    setCardStatus('')
    setProcessing(false)
  }

  // ── Split payment ────────────────────────────────────────────────────────

  async function handleSplitPay() {
    if (splitCashAmt <= 0) { setError('Enter cash portion'); return }
    if (splitCashAmt >= grandTotal) { setError('Cash portion must be less than total — use Cash payment'); return }
    setProcessing(true)
    setError('')
    try {
      // Create card intent for the card portion
      const amountCents = Math.round(splitCardAmt * 100)
      const intentRes = await createPaymentIntent(amountCents)
      setCardIntentId(intentRes.data.payment_intent_id)
      setCardStatus('waiting')
    } catch (e) {
      setError(e.message)
      setProcessing(false)
    }
  }

  async function handleSplitCapture() {
    if (!cardIntentId) return
    setCardStatus('capturing')
    try {
      await capturePaymentIntent(cardIntentId)
      const res = await createSale(buildPayload({
        payment_method: 'split',
        cash_tendered: splitCashAmt,
        card_amount: splitCardAmt,
        stripe_payment_intent_id: cardIntentId,
      }))
      setCardStatus('done')
      onComplete(res.data)
    } catch (e) {
      setError(e.message)
      setCardStatus('error')
      setProcessing(false)
    }
  }

  // ── Numpad helper ────────────────────────────────────────────────────────

  function NumPad({ value, onChange }) {
    function press(key) {
      if (key === 'C') { onChange(''); return }
      if (key === '⌫') { onChange(v => v.slice(0, -1)); return }
      if (key === '.' && value.includes('.')) return
      onChange(v => {
        const next = v + key
        // Max 2 decimal places
        if (next.includes('.') && next.split('.')[1]?.length > 2) return v
        return next
      })
    }
    const keys = ['7','8','9','4','5','6','1','2','3','C','0','⌫']
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, margin: '12px 0' }}>
        {keys.map(k => (
          <button key={k} className="btn btn-ghost" style={{ fontSize: 18, padding: '14px 0' }}
            onClick={() => press(k)}>
            {k}
          </button>
        ))}
        <button className="btn btn-ghost" style={{ gridColumn: 'span 2', fontSize: 18, padding: '14px 0' }}
          onClick={() => press('.')}>.</button>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !processing) onClose() }}>
      <div className="modal">
        <div className="modal-title">
          {tipStep ? 'Add a Tip?'
            : method === 'cash' ? '💵 Cash Payment'
            : method === 'card' ? '💳 Card Payment'
            : '✂️ Split Payment'}
        </div>

        {/* Order total summary */}
        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, color: 'var(--text-muted)' }}>
            <span>Items ({items.reduce((s, i) => s + i.qty, 0)})</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          {discountTotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, color: 'var(--warning)' }}>
              <span>Discounts</span><span>-${discountTotal.toFixed(2)}</span>
            </div>
          )}
          {taxAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, color: 'var(--text-muted)' }}>
              <span>Tax</span><span>${taxAmount.toFixed(2)}</span>
            </div>
          )}
          {tipAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, color: 'var(--success)' }}>
              <span>Tip ({tipMethod})</span><span>+${tipAmount.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 20, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
            <span>Total</span><span>${grandTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* ── Tip step (salon mode) ── */}
        {tipStep && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
              {[0, 2, 5, 10, 15, 20].map(amt => (
                <button key={amt} onClick={() => { setTipAmount(amt); setTipCustom('') }}
                  className={`btn ${tipAmount === amt && !tipCustom ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ padding: '10px 0', fontSize: 14 }}>
                  {amt === 0 ? 'No Tip' : `$${amt}`}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <input className="input" type="number" min="0" step="0.01" placeholder="Custom amount"
                value={tipCustom}
                onChange={e => { setTipCustom(e.target.value); setTipAmount(parseFloat(e.target.value) || 0) }}
                style={{ flex: 1 }} />
            </div>
            {tipAmount > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label className="label">Tip Method</label>
                  <select className="input" value={tipMethod} onChange={e => setTipMethod(e.target.value)}>
                    <option value="card">Card</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
                {staff?.length > 0 && (
                  <div>
                    <label className="label">Tip For</label>
                    <select className="input" value={tipStaffId} onChange={e => setTipStaffId(e.target.value)}>
                      <option value="">Any staff</option>
                      {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
              <button className="btn btn-primary btn-lg" style={{ flex: 2 }} onClick={() => setTipStep(false)}>
                {tipAmount > 0 ? `Continue with $${tipAmount.toFixed(2)} tip` : 'Skip Tip'}
              </button>
            </div>
          </>
        )}

        {!tipStep && (<>


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
              ${cashInput || '0.00'}
            </div>
            {cashAmount >= total && (
              <div style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 600, marginBottom: 8 }}>
                Change: ${change.toFixed(2)}
              </div>
            )}
            <NumPad value={cashInput} onChange={setCashInput} />
            {error && <p className="error-msg">{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onClose} disabled={processing}>Cancel</button>
              <button className="btn btn-success btn-lg" style={{ flex: 2 }} onClick={handleCashPay}
                disabled={processing || cashAmount < total}>
                {processing ? 'Processing...' : `Collect $${cashAmount.toFixed(2)}`}
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
                  This will create a Stripe Terminal payment intent and prompt the
                  physical card reader to collect payment.
                </p>
                {error && <p className="error-msg">{error}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
                  <button className="btn btn-primary btn-lg" style={{ flex: 2 }} onClick={handleCardPay}>
                    Charge ${grandTotal.toFixed(2)}
                  </button>
                </div>
              </>
            )}
            {cardStatus === 'creating' && <LoadingState msg="Creating payment intent..." />}
            {cardStatus === 'waiting' && (
              <>
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>💳</div>
                  <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Waiting for card...</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    Present card / tap / insert on the reader
                  </div>
                  <div style={{ marginTop: 16, padding: '8px 16px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    No reader yet? Click "Simulate Capture" to test the flow.
                  </div>
                </div>
                {error && <p className="error-msg">{error}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" onClick={handleCardCancel}>Cancel</button>
                  <button className="btn btn-success btn-lg" style={{ flex: 1 }} onClick={handleCapture}>
                    Simulate Capture (no reader)
                  </button>
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

        {/* ── Split ── */}
        {method === 'split' && (
          <>
            {cardStatus === '' && (
              <>
                <label className="label">Cash Portion</label>
                <div style={{
                  fontSize: 28, fontWeight: 700, textAlign: 'center', padding: '10px',
                  background: 'var(--surface2)', borderRadius: 8, marginBottom: 4,
                }}>
                  ${splitCash || '0.00'}
                </div>
                {splitCash && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>
                    <span>Cash: ${splitCashAmt.toFixed(2)}</span>
                    <span>Card: ${splitCardAmt.toFixed(2)}</span>
                  </div>
                )}
                <NumPad value={splitCash} onChange={setSplitCash} />
                {error && <p className="error-msg">{error}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
                  <button className="btn btn-primary btn-lg" style={{ flex: 2 }} onClick={handleSplitPay}
                    disabled={processing || splitCashAmt <= 0 || splitCashAmt >= grandTotal}>
                    Charge Card ${splitCardAmt.toFixed(2)}
                  </button>
                </div>
              </>
            )}
            {cardStatus === 'waiting' && (
              <>
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>💳</div>
                  <div style={{ fontWeight: 600 }}>Card: ${splitCardAmt.toFixed(2)}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Present card on reader</div>
                </div>
                {error && <p className="error-msg">{error}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" onClick={handleCardCancel}>Cancel</button>
                  <button className="btn btn-success btn-lg" style={{ flex: 1 }} onClick={handleSplitCapture}>
                    Simulate Capture
                  </button>
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
        </>)}
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
