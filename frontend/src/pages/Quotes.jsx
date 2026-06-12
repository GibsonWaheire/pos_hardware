import { useState, useEffect, useRef } from 'react'
import { getQuotes, getQuote, createQuote, updateQuote, updateQuoteStatus, convertQuote, deleteQuote, getProducts, getStoreConfig } from '../api'
import { useCurrency } from '../context/CurrencyContext'
import { printDoc, A4_CSS } from '../utils/print'

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-KE') : '—'

const STATUS_COLOR = {
  draft:     'badge-yellow',
  sent:      'badge-blue',
  accepted:  'badge-green',
  converted: 'badge-green',
  expired:   'badge-red',
}

export default function Quotes() {
  const { fmt: KES } = useCurrency()
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showConvert, setShowConvert] = useState(null)  // quote to convert

  useEffect(() => { load() }, [statusFilter])

  async function load() {
    setLoading(true)
    try {
      const r = await getQuotes({ status: statusFilter || undefined, q: search || undefined })
      setQuotes(r.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function handleSearch(e) {
    e.preventDefault()
    load()
  }

  async function openDetail(id) {
    const r = await getQuote(id)
    setSelected(r.data)
  }

  async function handleStatusChange(qt, status) {
    await updateQuoteStatus(qt.id, status)
    load()
    if (selected?.id === qt.id) openDetail(qt.id)
  }

  async function handleDelete(qt) {
    if (!confirm(`Delete quote ${qt.quote_number}?`)) return
    await deleteQuote(qt.id)
    load()
    if (selected?.id === qt.id) setSelected(null)
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Quotes & Proforma</span>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Quote</button>
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 6 }}>
            <input className="input" placeholder="Search customer / quote no..."
              value={search} onChange={e => setSearch(e.target.value)} style={{ width: 240 }} />
            <button className="btn btn-ghost btn-sm" type="submit">Search</button>
          </form>
          <select className="input" style={{ width: 140 }}
            value={statusFilter} onChange={e => { setStatusFilter(e.target.value) }}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="converted">Converted</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        {loading ? (
          <div className="empty-state">Loading quotes...</div>
        ) : quotes.length === 0 ? (
          <div className="empty-state">No quotes found</div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Quote No.</th>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Total</th>
                  <th>Valid Until</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {quotes.map(qt => (
                  <tr key={qt.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(qt.id)}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{qt.quote_number}</td>
                    <td style={{ fontWeight: 500 }}>{qt.customer_name || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{qt.customer_phone || '—'}</td>
                    <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{KES(qt.total)}</td>
                    <td style={{ fontSize: 12, color: qt.valid_until && new Date(qt.valid_until) < new Date() ? 'var(--danger)' : 'var(--text-muted)' }}>
                      {fmtDate(qt.valid_until)}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_COLOR[qt.status] || 'badge-yellow'}`} style={{ textTransform: 'capitalize' }}>
                        {qt.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(qt.created_at)}</td>
                    <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                      {qt.status !== 'converted' && qt.status !== 'expired' && (
                        <button className="btn btn-primary btn-sm" style={{ marginRight: 4 }}
                          onClick={() => setShowConvert(qt)}>
                          Convert
                        </button>
                      )}
                      {(qt.status === 'draft' || qt.status === 'expired') && (
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => handleDelete(qt)}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quote detail panel */}
      {selected && (
        <QuoteDetail
          quote={selected}
          onClose={() => setSelected(null)}
          onStatusChange={(status) => handleStatusChange(selected, status)}
          onConvert={() => { setShowConvert(selected); setSelected(null) }}
          onRefresh={() => openDetail(selected.id)}
        />
      )}

      {/* Create/edit modal */}
      {showCreate && (
        <QuoteFormModal
          onClose={() => setShowCreate(false)}
          onSave={async (data) => {
            await createQuote(data)
            setShowCreate(false)
            load()
          }}
        />
      )}

      {/* Convert to sale modal */}
      {showConvert && (
        <ConvertModal
          quote={showConvert}
          onClose={() => setShowConvert(null)}
          onConverted={() => { setShowConvert(null); load() }}
        />
      )}
    </div>
  )
}


// ── Quote Detail Drawer ───────────────────────────────────────────────────────

function QuoteDetail({ quote, onClose, onStatusChange, onConvert }) {
  const { currency, fmt: KES } = useCurrency()
  const printRef = useRef()

  async function handlePrint() {
    let store = {}
    try { const r = await getStoreConfig(); store = r.data || {} } catch {}
    const storeSub = [store.phone, store.email].filter(Boolean).join(' &nbsp;|&nbsp; ')
    printDoc(quote.quote_number, `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${quote.quote_number}</title><style>${A4_CSS}</style></head><body>
      <div class="letterhead">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div class="store-name">${store.name || 'Store'}</div>
            <div class="store-sub">${store.address ? store.address + '<br>' : ''}${storeSub}${store.tax_number ? ' &nbsp;|&nbsp; PIN: ' + store.tax_number : ''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:9pt;color:#777;margin-bottom:2pt">Document No.</div>
            <div style="font-size:15pt;font-weight:700">${quote.quote_number}</div>
          </div>
        </div>
      </div>
      <div class="doc-title"><h2>Proforma Invoice</h2><div class="doc-num">This is not a tax invoice</div></div>
      <div class="info-grid">
        <div class="info-box">
          <div class="label">Quote Details</div>
          <div class="value">
            <div>Date: ${new Date(quote.created_at).toLocaleDateString('en-KE')}</div>
            ${quote.valid_until ? `<div>Valid until: ${new Date(quote.valid_until).toLocaleDateString('en-KE')}</div>` : ''}
            <div>Status: <strong style="text-transform:capitalize">${quote.status}</strong></div>
            ${quote.cashier_name ? `<div>Prepared by: ${quote.cashier_name}</div>` : ''}
          </div>
        </div>
        <div class="info-box">
          <div class="label">Bill To</div>
          <div class="value">
            ${quote.customer_name ? `<div style="font-weight:700">${quote.customer_name}</div>` : '<div style="color:#aaa">Walk-in Customer</div>'}
            ${quote.customer_phone ? `<div>${quote.customer_phone}</div>` : ''}
          </div>
        </div>
      </div>
      <table>
        <thead><tr>
          <th style="width:24pt">#</th><th>Description</th>
          <th class="right" style="width:36pt">Qty</th>
          <th class="right" style="width:72pt">Unit Price</th>
          <th class="right" style="width:58pt">Discount</th>
          <th class="right" style="width:36pt">Tax</th>
          <th class="right" style="width:72pt">Total</th>
        </tr></thead>
        <tbody>
        ${(quote.items || []).map((item, i) => `
          <tr>
            <td style="color:#777">${i + 1}</td>
            <td><div style="font-weight:600">${item.product_name}</div>${item.notes ? `<div style="font-size:8.5pt;color:#666;margin-top:2pt">${item.notes}</div>` : ''}</td>
            <td class="right">${item.qty}</td>
            <td class="right">${KES(item.unit_price)}</td>
            <td class="right" style="color:#777">${item.discount > 0 ? KES(item.discount) : '—'}</td>
            <td class="right" style="color:#777">${item.tax_rate > 0 ? `${(item.tax_rate * 100).toFixed(0)}%` : '—'}</td>
            <td class="right" style="font-weight:600">${KES(item.line_total)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="totals">
        <div class="row"><span>Subtotal</span><span>${KES(quote.subtotal)}</span></div>
        ${quote.discount_total > 0 ? `<div class="row"><span>Discounts</span><span style="color:#dc2626">− ${KES(quote.discount_total)}</span></div>` : ''}
        ${quote.tax_amount > 0 ? `<div class="row"><span>VAT / Tax</span><span>${KES(quote.tax_amount)}</span></div>` : ''}
        <div class="row grand"><span>TOTAL</span><span>${KES(quote.total)}</span></div>
      </div>
      ${quote.notes ? `<div style="border:0.5pt solid #ddd;border-radius:3pt;padding:8pt 10pt;margin-bottom:12pt;font-size:9.5pt"><strong>Notes:</strong> ${quote.notes}</div>` : ''}
      <div style="font-size:9pt;color:#666;margin-bottom:14pt">
        This is a proforma invoice. Prices are valid until ${quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('en-KE') : 'further notice'}.
        All prices are in ${currency}.
      </div>
      <div class="sig-section">
        <div class="sig-title">Authorisation &amp; Acceptance</div>
        <div class="sig-grid" style="grid-template-columns:1fr 1fr 1fr">
          <div class="sig-box">
            <div class="line"></div>
            <div class="name">Prepared by</div>
            <div class="role">${quote.cashier_name || '________________'}</div>
            <div class="role">Date: ________________</div>
          </div>
          <div class="sig-box">
            <div class="line"></div>
            <div class="name">Customer Signature</div>
            <div class="role">${quote.customer_name || '________________'}</div>
            <div class="role">Date: ________________</div>
          </div>
          <div class="sig-box">
            <div class="line"></div>
            <div class="name">Authorized by</div>
            <div class="role">Manager / Director</div>
            <div class="role">Date: ________________</div>
          </div>
        </div>
      </div>
      <div class="doc-footer">
        ${store.name || ''} &nbsp;|&nbsp; ${storeSub}${store.tax_number ? ' &nbsp;|&nbsp; PIN: ' + store.tax_number : ''}
        <br>Generated by POS System &mdash; ${new Date().toLocaleString('en-KE')}
      </div>
    </body></html>`)
  }

  const canConvert = !['converted', 'expired'].includes(quote.status)

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 700, maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, fontFamily: 'monospace' }}>{quote.quote_number}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              {quote.customer_name || 'No customer'}{quote.customer_phone ? ` · ${quote.customer_phone}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={`badge ${STATUS_COLOR[quote.status]}`} style={{ textTransform: 'capitalize', fontSize: 12 }}>{quote.status}</span>
            <button className="btn btn-ghost btn-sm" onClick={handlePrint}>Print</button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Items table */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="table" style={{ fontSize: 13 }}>
            <thead>
              <tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Discount</th><th>Tax</th><th>Line Total</th></tr>
            </thead>
            <tbody>
              {(quote.items || []).map(item => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{item.product_name}</div>
                    {item.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.notes}</div>}
                  </td>
                  <td>{item.qty}</td>
                  <td>{KES(item.unit_price)}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{item.discount > 0 ? KES(item.discount) : '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{item.tax_rate > 0 ? `${(item.tax_rate * 100).toFixed(0)}%` : '—'}</td>
                  <td style={{ fontWeight: 600 }}>{KES(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', textAlign: 'right', fontSize: 13 }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>Subtotal: {KES(quote.subtotal)}</div>
            {quote.discount_total > 0 && <div style={{ color: 'var(--warning)', marginBottom: 4 }}>Discounts: −{KES(quote.discount_total)}</div>}
            {quote.tax_amount > 0 && <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>VAT/Tax: {KES(quote.tax_amount)}</div>}
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>Total: {KES(quote.total)}</div>
          </div>

          {quote.notes && (
            <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
              Notes: {quote.notes}
            </div>
          )}
          {quote.valid_until && (
            <div style={{ padding: '4px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
              Valid until: {fmtDate(quote.valid_until)}
            </div>
          )}
        </div>

        {/* Action bar */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 0 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {quote.status === 'draft' && (
            <button className="btn btn-ghost btn-sm" onClick={() => onStatusChange('sent')}>Mark as Sent</button>
          )}
          {quote.status === 'sent' && (
            <button className="btn btn-ghost btn-sm" onClick={() => onStatusChange('accepted')}>Mark as Accepted</button>
          )}
          {!['converted', 'expired'].includes(quote.status) && (
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => onStatusChange('expired')}>
              Mark Expired
            </button>
          )}
          {canConvert && (
            <button className="btn btn-primary" onClick={onConvert}>
              Convert to Sale
            </button>
          )}
          {quote.status === 'converted' && (
            <span style={{ fontSize: 12, color: 'var(--success)', alignSelf: 'center' }}>
              Converted to Sale #{quote.sale_id} on {fmtDate(quote.converted_at)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}


// ── Quote Form Modal (Create) ─────────────────────────────────────────────────

function QuoteFormModal({ onClose, onSave }) {
  const { fmt: KES } = useCurrency()
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [cashierName, setCashierName] = useState('')
  const [items, setItems] = useState([{ product_id: null, product_name: '', unit_price: '', qty: 1, discount: 0, tax_rate: 0.16, notes: '' }])
  const [productSearch, setProductSearch] = useState({})  // index → search string
  const [productResults, setProductResults] = useState({}) // index → results[]
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function searchProduct(idx, q) {
    setProductSearch(prev => ({ ...prev, [idx]: q }))
    if (!q.trim()) { setProductResults(prev => ({ ...prev, [idx]: [] })); return }
    try {
      const { getProducts } = await import('../api')
      const r = await getProducts({ q, active: 'true' })
      setProductResults(prev => ({ ...prev, [idx]: r.data.slice(0, 8) }))
    } catch (e) { /* ignore */ }
  }

  function pickProduct(idx, product) {
    setItems(prev => prev.map((it, i) => i !== idx ? it : {
      ...it,
      product_id: product.id,
      product_name: product.name,
      unit_price: product.price,
      tax_rate: product.tax_rate || 0,
    }))
    setProductSearch(prev => ({ ...prev, [idx]: product.name }))
    setProductResults(prev => ({ ...prev, [idx]: [] }))
  }

  function updateItem(idx, field, value) {
    setItems(prev => prev.map((it, i) => i !== idx ? it : { ...it, [field]: value }))
  }

  function addItem() {
    setItems(prev => [...prev, { product_id: null, product_name: '', unit_price: '', qty: 1, discount: 0, tax_rate: 0.16, notes: '' }])
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function calcLine(item) {
    const qty = parseInt(item.qty) || 0
    const price = parseFloat(item.unit_price) || 0
    const disc = parseFloat(item.discount) || 0
    const tax = parseFloat(item.tax_rate) || 0
    return ((price - disc) * qty * (1 + tax))
  }

  const subtotal = items.reduce((s, it) => s + (parseFloat(it.unit_price) || 0) * (parseInt(it.qty) || 0), 0)
  const discTotal = items.reduce((s, it) => s + (parseFloat(it.discount) || 0) * (parseInt(it.qty) || 0), 0)
  const taxTotal = items.reduce((s, it) => {
    const qty = parseInt(it.qty) || 0
    const price = parseFloat(it.unit_price) || 0
    const disc = parseFloat(it.discount) || 0
    const tax = parseFloat(it.tax_rate) || 0
    return s + (price - disc) * qty * tax
  }, 0)
  const grandTotal = subtotal - discTotal + taxTotal

  async function handleSave() {
    const validItems = items.filter(it => it.product_name.trim() && parseFloat(it.unit_price) > 0)
    if (!validItems.length) { setError('Add at least one item with name and price'); return }
    setSaving(true); setError('')
    try {
      await onSave({
        customer_name: customerName,
        customer_phone: customerPhone,
        notes,
        cashier_name: cashierName,
        valid_until: validUntil || null,
        items: validItems.map(it => ({
          product_id: it.product_id,
          product_name: it.product_name,
          unit_price: parseFloat(it.unit_price),
          qty: parseInt(it.qty) || 1,
          discount: parseFloat(it.discount) || 0,
          tax_rate: parseFloat(it.tax_rate) || 0,
          notes: it.notes || null,
        })),
      })
    } catch (e) { setError(e.message); setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 760, maxHeight: '94vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title" style={{ marginBottom: 16 }}>New Quote / Proforma Invoice</div>

        {/* Customer info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div>
            <label className="label">Customer Name</label>
            <input className="input" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer / contractor" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="07XX XXX XXX" />
          </div>
          <div>
            <label className="label">Valid Until</label>
            <input className="input" type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
          </div>
          <div>
            <label className="label">Prepared By</label>
            <input className="input" value={cashierName} onChange={e => setCashierName(e.target.value)} placeholder="Staff name" />
          </div>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflow: 'auto', marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 120px 80px 70px 80px 28px', gap: 6, fontSize: 12, color: 'var(--text-muted)', padding: '0 0 4px', fontWeight: 600 }}>
            <span>Product</span><span>Qty</span><span>Unit Price</span><span>Discount</span><span>Tax%</span><span>Line Total</span><span></span>
          </div>
          {items.map((item, idx) => (
            <div key={idx} style={{ position: 'relative', marginBottom: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 120px 80px 70px 80px 28px', gap: 6 }}>
                <div style={{ position: 'relative' }}>
                  <input className="input" style={{ fontSize: 13 }}
                    placeholder="Search or type product name..."
                    value={productSearch[idx] ?? item.product_name}
                    onChange={e => {
                      searchProduct(idx, e.target.value)
                      updateItem(idx, 'product_name', e.target.value)
                      if (!e.target.value) updateItem(idx, 'product_id', null)
                    }}
                  />
                  {(productResults[idx] || []).length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.2)', maxHeight: 200, overflow: 'auto',
                    }}>
                      {productResults[idx].map(p => (
                        <div key={p.id}
                          onMouseDown={() => pickProduct(idx, p)}
                          style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border)' }}
                          onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                          onMouseOut={e => e.currentTarget.style.background = ''}>
                          <span style={{ fontWeight: 500 }}>{p.name}</span>
                          <span style={{ color: 'var(--accent)', marginLeft: 8 }}>{KES(p.price)}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 6 }}>stock: {p.stock_qty}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <input className="input" style={{ fontSize: 13, textAlign: 'center' }} type="number" min="1"
                  value={item.qty} onChange={e => updateItem(idx, 'qty', e.target.value)} />
                <input className="input" style={{ fontSize: 13, textAlign: 'right' }} type="number" min="0" step="0.01"
                  value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)} />
                <input className="input" style={{ fontSize: 13, textAlign: 'right' }} type="number" min="0" step="0.01"
                  value={item.discount} onChange={e => updateItem(idx, 'discount', e.target.value)} />
                <input className="input" style={{ fontSize: 13, textAlign: 'center' }} type="number" min="0" step="0.01" max="1"
                  value={item.tax_rate} onChange={e => updateItem(idx, 'tax_rate', e.target.value)}
                  title="e.g. 0.16 = 16% VAT" />
                <div style={{ display: 'flex', alignItems: 'center', fontWeight: 600, fontSize: 13, color: 'var(--accent)' }}>
                  {KES(calcLine(item))}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => removeItem(idx)}
                  style={{ padding: '0', color: 'var(--danger)', fontSize: 16 }} title="Remove">✕</button>
              </div>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={addItem}>+ Add Item</button>
        </div>

        {/* Notes + Totals */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'flex-end', marginBottom: 12 }}>
          <div>
            <label className="label">Notes</label>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Delivery terms, site address, payment terms..." />
          </div>
          <div style={{ textAlign: 'right', fontSize: 13, minWidth: 200 }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Subtotal: {KES(subtotal)}</div>
            {discTotal > 0 && <div style={{ color: 'var(--warning)', marginBottom: 2 }}>Discount: −{KES(discTotal)}</div>}
            {taxTotal > 0 && <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>VAT: {KES(taxTotal)}</div>}
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--accent)' }}>{KES(grandTotal)}</div>
          </div>
        </div>

        {error && <p className="error-msg">{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" style={{ flex: 2 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Creating...' : 'Create Quote'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ── Convert to Sale Modal ─────────────────────────────────────────────────────

function ConvertModal({ quote, onClose, onConverted }) {
  const [method, setMethod] = useState('cash')
  const [mpesaRef, setMpesaRef] = useState('')
  const [cashierName, setCashierName] = useState(quote.cashier_name || '')
  const [error, setError] = useState('')
  const [converting, setConverting] = useState(false)

  async function handleConvert() {
    if (method === 'mpesa' && !mpesaRef.trim()) { setError('Enter M-Pesa confirmation code'); return }
    setConverting(true); setError('')
    try {
      await convertQuote(quote.id, { payment_method: method, mpesa_ref: mpesaRef || null, cashier_name: cashierName })
      onConverted()
    } catch (e) { setError(e.message); setConverting(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 420 }}>
        <div className="modal-title">Convert Quote to Sale</div>

        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 600, marginBottom: 4 }}>{quote.quote_number}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{quote.customer_name || 'No customer'}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)', marginTop: 8 }}>{KES(quote.total)}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="label">Payment Method</label>
            <select className="input" value={method} onChange={e => setMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="mpesa">M-Pesa</option>
              <option value="card">Card</option>
              <option value="account">Customer Account</option>
            </select>
          </div>
          {method === 'mpesa' && (
            <div>
              <label className="label">M-Pesa Confirmation Code</label>
              <input className="input" value={mpesaRef} onChange={e => setMpesaRef(e.target.value.toUpperCase())}
                placeholder="e.g. QJK8LPZ3A4" style={{ fontFamily: 'monospace', letterSpacing: 1 }} autoFocus />
            </div>
          )}
          {method === 'account' && (
            <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: 6, fontSize: 13, color: 'var(--text-muted)' }}>
              Will charge to account linked to this customer. Ensure the account has sufficient balance.
            </div>
          )}
          <div>
            <label className="label">Cashier</label>
            <input className="input" value={cashierName} onChange={e => setCashierName(e.target.value)} placeholder="Staff name" />
          </div>
        </div>

        {error && <p className="error-msg" style={{ marginTop: 12 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-success btn-lg" style={{ flex: 2 }} onClick={handleConvert} disabled={converting}>
            {converting ? 'Converting...' : `Confirm Sale — ${KES(quote.total)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
