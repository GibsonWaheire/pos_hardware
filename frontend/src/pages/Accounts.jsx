import { useState, useEffect } from 'react'
import { getAccounts, getAccount, createAccount, updateAccount, depositToAccount, adjustAccount, lookupAccount } from '../api'

function fmt(n) { return `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleString() : '—' }

export default function Accounts() {
  const [accounts, setAccounts] = useState([])
  const [selected, setSelected] = useState(null)   // full account with transactions
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showDeposit, setShowDeposit] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try { const r = await getAccounts(); setAccounts(r.data) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function openAccount(id) {
    const r = await getAccount(id)
    setSelected(r.data)
  }

  async function handleSearch(q) {
    setSearch(q)
    if (!q.trim()) { setSearchResults(null); return }
    const r = await lookupAccount(q)
    setSearchResults(r.data)
  }

  const displayList = searchResults !== null ? searchResults : accounts

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Customer Accounts</span>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Account</button>
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>
        {/* Search */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          <input className="input" placeholder="Search by name or phone..."
            value={search} onChange={e => handleSearch(e.target.value)} style={{ maxWidth: 320 }} />
          {searchResults !== null && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setSearchResults(null) }}>Clear</button>
          )}
        </div>

        {loading ? (
          <div className="empty-state">Loading accounts...</div>
        ) : displayList.length === 0 ? (
          <div className="empty-state">No accounts found</div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Balance</th>
                  <th>Total Deposited</th>
                  <th>Total Charged</th>
                  <th>Credit Limit</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {displayList.map(acct => (
                  <tr key={acct.id} style={{ cursor: 'pointer' }} onClick={() => openAccount(acct.id)}>
                    <td style={{ fontWeight: 600 }}>{acct.customer_name}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{acct.customer_phone || '—'}</td>
                    <td>
                      <span style={{
                        fontWeight: 700, fontSize: 15,
                        color: acct.balance >= 0 ? 'var(--success)' : 'var(--danger)',
                      }}>
                        {fmt(acct.balance)}
                      </span>
                      {acct.balance < 0 && (
                        <span className="badge badge-red" style={{ marginLeft: 8, fontSize: 10 }}>OWES</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{fmt(acct.total_deposited)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{fmt(acct.total_charged)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {acct.credit_limit > 0 ? fmt(acct.credit_limit) : '—'}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); openAccount(acct.id) }}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Account Detail / Statement ── */}
      {selected && (
        <AccountDetail
          account={selected}
          onClose={() => setSelected(null)}
          onDeposit={() => setShowDeposit(true)}
          onAdjust={() => setShowAdjust(true)}
          onRefresh={async () => { const r = await getAccount(selected.id); setSelected(r.data); load() }}
        />
      )}

      {/* ── Create account modal ── */}
      {showCreate && (
        <CreateAccountModal
          onClose={() => setShowCreate(false)}
          onSave={async (data) => {
            await createAccount(data)
            setShowCreate(false)
            load()
          }}
        />
      )}

      {/* ── Deposit modal ── */}
      {showDeposit && selected && (
        <DepositModal
          account={selected}
          onClose={() => setShowDeposit(false)}
          onSave={async (data) => {
            await depositToAccount(selected.id, data)
            setShowDeposit(false)
            const r = await getAccount(selected.id)
            setSelected(r.data)
            load()
          }}
        />
      )}

      {/* ── Adjust modal ── */}
      {showAdjust && selected && (
        <AdjustModal
          account={selected}
          onClose={() => setShowAdjust(false)}
          onSave={async (data) => {
            await adjustAccount(selected.id, data)
            setShowAdjust(false)
            const r = await getAccount(selected.id)
            setSelected(r.data)
            load()
          }}
        />
      )}
    </div>
  )
}


// ── Account Detail Drawer ────────────────────────────────────────────────────

function AccountDetail({ account, onClose, onDeposit, onAdjust, onRefresh }) {
  const txns = account.transactions || []
  const available = account.balance + account.credit_limit

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 680, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 20 }}>{account.customer_name}</div>
            {account.customer_phone && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{account.customer_phone}</div>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Balance summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
          <div className="card" style={{ padding: '10px 12px', borderColor: account.balance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Balance</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: account.balance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {fmt(account.balance)}
            </div>
          </div>
          <div className="card" style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Available</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--accent)' }}>{fmt(available)}</div>
          </div>
          <div className="card" style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Deposited</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{fmt(account.total_deposited)}</div>
          </div>
          <div className="card" style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Charged</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{fmt(account.total_charged)}</div>
          </div>
        </div>

        {account.credit_limit > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Credit limit: {fmt(account.credit_limit)}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={onDeposit}>+ Deposit</button>
          <button className="btn btn-ghost" onClick={onAdjust}>Adjust Balance</button>
        </div>

        {/* Transaction statement */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Transaction History</div>
          {txns.length === 0 ? (
            <div className="empty-state">No transactions yet</div>
          ) : (
            <table className="table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Ref / Receipt</th>
                  <th>Amount</th>
                  <th>Balance After</th>
                  <th>Method</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {[...txns].reverse().map(t => (
                  <tr key={t.id}>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{fmtDate(t.created_at)}</td>
                    <td>
                      <span className={`badge ${
                        t.type === 'deposit' ? 'badge-green' :
                        t.type === 'charge' ? 'badge-red' :
                        t.type === 'refund' ? 'badge-blue' : 'badge-yellow'
                      }`} style={{ textTransform: 'capitalize' }}>{t.type}</span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                      {t.receipt_number || (t.sale_id ? `Sale #${t.sale_id}` : '—')}
                      {t.mpesa_ref && <div style={{ color: 'var(--accent)' }}>M-Pesa: {t.mpesa_ref}</div>}
                    </td>
                    <td style={{ fontWeight: 600, color: t.amount >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {t.amount >= 0 ? '+' : ''}{fmt(t.amount)}
                    </td>
                    <td style={{ fontWeight: 600 }}>{fmt(t.balance_after)}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                      {t.payment_method || '—'}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}


// ── Create Account Modal ──────────────────────────────────────────────────────

function CreateAccountModal({ onClose, onSave }) {
  const [form, setForm] = useState({ customer_name: '', customer_phone: '', credit_limit: '', notes: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!form.customer_name.trim()) { setError('Customer name required'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({ ...form, credit_limit: parseFloat(form.credit_limit) || 0 })
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 420 }}>
        <div className="modal-title">New Customer Account</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="label">Customer Name *</label>
            <input className="input" value={form.customer_name}
              onChange={e => setForm({ ...form, customer_name: e.target.value })}
              placeholder="Full name or company" autoFocus />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.customer_phone}
              onChange={e => setForm({ ...form, customer_phone: e.target.value })}
              placeholder="0712 345 678" />
          </div>
          <div>
            <label className="label">Credit Limit (KES)</label>
            <input className="input" type="number" min="0" step="1000"
              value={form.credit_limit}
              onChange={e => setForm({ ...form, credit_limit: e.target.value })}
              placeholder="0 = no credit line" />
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Site address, contractor type..." />
          </div>
        </div>
        {error && <p className="error-msg" style={{ marginTop: 12 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" style={{ flex: 2 }} onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating...' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ── Deposit Modal ─────────────────────────────────────────────────────────────

function DepositModal({ account, onClose, onSave }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('mpesa')
  const [mpesaRef, setMpesaRef] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (method === 'mpesa' && !mpesaRef.trim()) { setError('M-Pesa reference code required'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({ amount: amt, payment_method: method, mpesa_ref: mpesaRef, notes })
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const newBalance = account.balance + (parseFloat(amount) || 0)

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 420 }}>
        <div className="modal-title">Deposit to Account</div>
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{account.customer_name}</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: account.balance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            Current balance: {fmt(account.balance)}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="label">Amount (KES) *</label>
            <input className="input" type="number" min="1" step="100"
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="e.g. 100000" autoFocus style={{ fontSize: 18 }} />
            {amount && (
              <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4 }}>
                New balance: {fmt(newBalance)}
              </div>
            )}
          </div>
          <div>
            <label className="label">Payment Method</label>
            <select className="input" value={method} onChange={e => setMethod(e.target.value)}>
              <option value="mpesa">M-Pesa</option>
              <option value="cash">Cash</option>
              <option value="card">Card / Bank Transfer</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>
          {method === 'mpesa' && (
            <div>
              <label className="label">M-Pesa Confirmation Code *</label>
              <input className="input" value={mpesaRef} onChange={e => setMpesaRef(e.target.value.toUpperCase())}
                placeholder="e.g. QJK8LPZ3A4" style={{ fontFamily: 'monospace', letterSpacing: 1 }} />
            </div>
          )}
          <div>
            <label className="label">Notes (optional)</label>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. For roofing materials - Phase 2" />
          </div>
        </div>

        {error && <p className="error-msg" style={{ marginTop: 12 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-success btn-lg" style={{ flex: 2 }} onClick={handleSubmit} disabled={saving}>
            {saving ? 'Depositing...' : `Record Deposit`}
          </button>
        </div>
      </div>
    </div>
  )
}


// ── Adjust Modal ──────────────────────────────────────────────────────────────

function AdjustModal({ account, onClose, onSave }) {
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    const amt = parseFloat(amount)
    if (!amt || amt === 0) { setError('Enter a non-zero adjustment amount'); return }
    if (!notes.trim()) { setError('Notes required for adjustments'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({ amount: amt, notes })
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const newBalance = account.balance + (parseFloat(amount) || 0)

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 420 }}>
        <div className="modal-title">Manual Balance Adjustment</div>
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{account.customer_name}</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: account.balance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            Current balance: {fmt(account.balance)}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="label">Adjustment Amount (KES)</label>
            <input className="input" type="number" step="100"
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="Positive = add, Negative = deduct" autoFocus />
            {amount && (
              <div style={{ fontSize: 12, marginTop: 4, color: newBalance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                New balance: {fmt(newBalance)}
              </div>
            )}
          </div>
          <div>
            <label className="label">Reason / Notes *</label>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Reason for adjustment" />
          </div>
        </div>

        {error && <p className="error-msg" style={{ marginTop: 12 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" style={{ flex: 2 }} onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Apply Adjustment'}
          </button>
        </div>
      </div>
    </div>
  )
}
