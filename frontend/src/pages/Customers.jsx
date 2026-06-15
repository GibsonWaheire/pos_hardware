import { useState, useEffect } from 'react'
import {
  getCustomers, createCustomer, updateCustomer,
  getCustomerTransactions, adjustPoints,
  getLoyaltyTiers, getCustomerInvoices, getStoreConfig,
} from '../api'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import { printTaxInvoice } from '../utils/print'
import Pagination from '../components/Pagination'

const PAGE_SIZE = 20

const EMPTY = { name: '', phone: '', email: '', date_of_birth: '', tier_id: '', notes: '' }

export default function Customers() {
  const { user } = useAuth()
  const { fmt } = useCurrency()
  const isManager = user && ['manager', 'admin'].includes(user.role)

  const [customers, setCustomers] = useState([])
  const [tiers, setTiers] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState(null)      // null | { mode: 'add'|'edit'|'detail', ... }
  const [form, setForm] = useState(EMPTY)
  const [detail, setDetail] = useState(null)    // { customer, transactions }
  const [invoices, setInvoices] = useState([])
  const [detailTab, setDetailTab] = useState('points') // 'points' | 'invoices'
  const [adjForm, setAdjForm] = useState({ points: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load(q = '') {
    try {
      const [c, t] = await Promise.all([getCustomers({ q }), getLoyaltyTiers()])
      setCustomers(c.data)
      setTiers(t.data)
    } catch (e) { console.error(e) }
  }

  async function openDetail(customer) {
    try {
      const res = await getCustomerTransactions(customer.id)
      setDetail(res.data)
      setDetailTab('points')
      setInvoices([])
      setModal({ mode: 'detail' })
      if (isManager) {
        try {
          const ir = await getCustomerInvoices(customer.id)
          setInvoices(ir.data)
        } catch {}
      }
    } catch (e) { alert(e.message) }
  }

  async function handleReprintInvoice(inv) {
    try {
      let store = {}
      try { const r = await getStoreConfig(); store = r.data || {} } catch {}
      printTaxInvoice(inv, store)
    } catch (e) { alert('Print error: ' + e.message) }
  }

  async function handleSave() {
    if (!form.name) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form, tier_id: form.tier_id ? parseInt(form.tier_id) : null }
      if (modal.mode === 'add') await createCustomer(payload)
      else await updateCustomer(modal.id, payload)
      setModal(null); load(search)
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  async function handleAdjust() {
    if (!adjForm.points || adjForm.points === '0') { setError('Enter a points amount'); return }
    setSaving(true); setError('')
    try {
      await adjustPoints({ customer_id: detail.customer.id, points: parseInt(adjForm.points), notes: adjForm.notes })
      const res = await getCustomerTransactions(detail.customer.id)
      setDetail(res.data)
      setAdjForm({ points: '', notes: '' })
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Customers & Loyalty</span>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setError(''); setModal({ mode: 'add' }) }}>
          + Add Customer
        </button>
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>
        <input className="input" placeholder="Search by name, phone, or member ID..."
          value={search}
          onChange={e => { setSearch(e.target.value); load(e.target.value) }}
          style={{ marginBottom: 16 }} />

        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Member ID</th><th>Phone</th><th>Tier</th><th>Points</th><th>Total Spent</th><th>Visits</th><th></th></tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr><td colSpan={8} className="empty-state">No customers yet</td></tr>
              ) : customers.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE).map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 12 }}>{c.member_id}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{c.phone || '—'}</td>
                  <td>
                    {c.tier_name
                      ? <span className="badge" style={{ background: c.tier_color + '33', color: c.tier_color }}>{c.tier_name}</span>
                      : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={{ fontWeight: 600 }}>{c.loyalty_points.toLocaleString()}</td>
                  <td>{fmt(c.total_spent)}</td>
                  <td>{c.visit_count}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" style={{ marginRight: 6 }} onClick={() => openDetail(c)}>Details</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      setForm({ name: c.name, phone: c.phone || '', email: c.email || '',
                        date_of_birth: c.date_of_birth || '', tier_id: c.tier_id ? String(c.tier_id) : '', notes: c.notes || '' })
                      setError(''); setModal({ mode: 'edit', id: c.id })
                    }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination total={customers.length} page={page} pageSize={PAGE_SIZE} onChange={setPage} />
        </div>
      </div>

      {/* Add / Edit modal */}
      {modal && modal.mode !== 'detail' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-title">{modal.mode === 'add' ? 'Add Customer' : 'Edit Customer'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="label">Full Name *</label>
                <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Phone</label>
                <input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Email</label>
                <input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Date of Birth (for age check)</label>
                <input className="input" type="date" value={form.date_of_birth}
                  onChange={e => setForm({ ...form, date_of_birth: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Tier</label>
                <select className="input" value={form.tier_id}
                  onChange={e => setForm({ ...form, tier_id: e.target.value })}>
                  <option value="">-- Auto-assign --</option>
                  {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="label">Notes</label>
                <input className="input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            {error && <p className="error-msg">{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Customer detail modal */}
      {modal?.mode === 'detail' && detail && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ width: 620 }}>
            <div className="modal-title">{detail.customer.name}</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              <MiniStat label="Points" value={detail.customer.loyalty_points.toLocaleString()}
                color={detail.customer.tier_color} />
              <MiniStat label="Tier" value={detail.customer.tier_name || '—'} />
              <MiniStat label="Total Spent" value={fmt(detail.customer.total_spent)} />
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              {[['points', 'Loyalty Points'], ...(isManager ? [['invoices', `Invoices (${invoices.length})`]] : [])].map(([key, label]) => (
                <button key={key} onClick={() => setDetailTab(key)} style={{
                  padding: '6px 14px', background: 'none', border: 'none', cursor: 'pointer',
                  color: detailTab === key ? 'var(--accent)' : 'var(--text-muted)',
                  borderBottom: detailTab === key ? '2px solid var(--accent)' : '2px solid transparent',
                  fontWeight: detailTab === key ? 600 : 400, fontSize: 13,
                }}>{label}</button>
              ))}
            </div>

            {detailTab === 'points' && (
              <>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Manual Point Adjustment</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input className="input" type="number" placeholder="e.g. 50 or -20"
                    value={adjForm.points} onChange={e => setAdjForm({ ...adjForm, points: e.target.value })}
                    style={{ width: 100 }} />
                  <input className="input" placeholder="Reason..."
                    value={adjForm.notes} onChange={e => setAdjForm({ ...adjForm, notes: e.target.value })} />
                  <button className="btn btn-primary" onClick={handleAdjust} disabled={saving}>Apply</button>
                </div>
                {error && <p className="error-msg" style={{ marginBottom: 8 }}>{error}</p>}
                <div style={{ maxHeight: 260, overflow: 'auto' }}>
                  <table className="table">
                    <thead><tr><th>Date</th><th>Type</th><th>Points</th><th>Balance</th><th>Notes</th></tr></thead>
                    <tbody>
                      {detail.transactions.length === 0 ? (
                        <tr><td colSpan={5} className="empty-state">No transactions yet</td></tr>
                      ) : detail.transactions.map(t => (
                        <tr key={t.id}>
                          <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(t.created_at).toLocaleDateString()}</td>
                          <td><span className={`badge ${t.points >= 0 ? 'badge-green' : 'badge-red'}`}>{t.type}</span></td>
                          <td style={{ fontWeight: 600, color: t.points >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                            {t.points >= 0 ? '+' : ''}{t.points}
                          </td>
                          <td>{t.balance_after.toLocaleString()}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {detailTab === 'invoices' && (
              <div style={{ maxHeight: 320, overflow: 'auto' }}>
                {invoices.length === 0 ? (
                  <div className="empty-state">No invoices for this customer</div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr><th>Invoice #</th><th>Receipt</th><th>Date</th><th>Total</th><th>Status</th><th></th></tr>
                    </thead>
                    <tbody>
                      {invoices.map(inv => (
                        <tr key={inv.id}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>{inv.invoice_number}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{inv.receipt_number || '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-KE') : '—'}
                          </td>
                          <td style={{ fontWeight: 600 }}>{fmt(inv.total)}</td>
                          <td>
                            <span style={{
                              padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                              background: inv.status === 'issued' ? '#dcfce7' : '#fee2e2',
                              color: inv.status === 'issued' ? '#15803d' : '#dc2626',
                            }}>{inv.status}</span>
                          </td>
                          <td>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleReprintInvoice(inv)}>
                              Reprint
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            <button className="btn btn-ghost" style={{ width: '100%', marginTop: 16 }} onClick={() => setModal(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value, color }) {
  return (
    <div className="card" style={{ padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 18, color: color || 'var(--text)' }}>{value}</div>
    </div>
  )
}
