import { useState, useEffect } from 'react'
import { getLoyaltyTiers, createLoyaltyTier, updateLoyaltyTier, deleteLoyaltyTier, getLoyaltyConfig } from '../api'

const TIER_COLORS = ['#cd7f32', '#c0c0c0', '#ffd700', '#4f6ef7', '#22c55e']
const EMPTY = { name: '', min_points: '0', discount_percent: '0', points_multiplier: '1', description: '', color: '#888888', sort_order: '0' }

export default function Loyalty() {
  const [tiers, setTiers] = useState([])
  const [config, setConfig] = useState(null)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [t, c] = await Promise.all([getLoyaltyTiers(), getLoyaltyConfig()])
      setTiers(t.data)
      setConfig(c.data)
    } catch (e) { console.error(e) }
  }

  async function handleSave() {
    if (!form.name) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        name: form.name,
        min_points: parseInt(form.min_points) || 0,
        discount_percent: parseFloat(form.discount_percent) || 0,
        points_multiplier: parseFloat(form.points_multiplier) || 1,
        description: form.description,
        color: form.color,
        sort_order: parseInt(form.sort_order) || 0,
      }
      if (modal.mode === 'add') await createLoyaltyTier(payload)
      else await updateLoyaltyTier(modal.id, payload)
      setModal(null); load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  async function handleDelete(tier) {
    if (!confirm(`Delete tier "${tier.name}"?`)) return
    try { await deleteLoyaltyTier(tier.id); load() } catch (e) { alert(e.message) }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Loyalty Program</span>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setError(''); setModal({ mode: 'add' }) }}>
          + Add Tier
        </button>
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>
        {/* Config info */}
        {config && (
          <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 32 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Points Earn Rate</div>
              <div style={{ fontWeight: 700 }}>{config.points_per_kes} pt / KES 1 spent</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Redemption Value</div>
              <div style={{ fontWeight: 700 }}>{config.redemption_rate}</div>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, alignSelf: 'center' }}>
              Configure via LOYALTY_POINTS_PER_DOLLAR and LOYALTY_CENTS_PER_POINT env vars
            </div>
          </div>
        )}

        {/* Tier cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {tiers.length === 0 && (
            <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
              No tiers yet. Add tiers like Bronze, Silver, Gold to reward loyal customers.
            </div>
          )}
          {tiers.map((tier, i) => (
            <div key={tier.id} className="card" style={{ borderColor: tier.color }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: tier.color }}>{tier.name}</div>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: tier.color }} />
              </div>
              <div style={{ fontSize: 13, lineHeight: 2, color: 'var(--text-muted)' }}>
                <div><b style={{ color: 'var(--text)' }}>{tier.min_points.toLocaleString()}</b> points to unlock</div>
                <div><b style={{ color: 'var(--text)' }}>{tier.discount_percent}%</b> automatic discount</div>
                <div><b style={{ color: 'var(--text)' }}>{tier.points_multiplier}×</b> earn multiplier</div>
                {tier.description && <div style={{ marginTop: 6, fontStyle: 'italic' }}>{tier.description}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  setForm({
                    name: tier.name, min_points: String(tier.min_points),
                    discount_percent: String(tier.discount_percent),
                    points_multiplier: String(tier.points_multiplier),
                    description: tier.description || '', color: tier.color,
                    sort_order: String(tier.sort_order),
                  })
                  setError(''); setModal({ mode: 'edit', id: tier.id })
                }}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(tier)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-title">{modal.mode === 'add' ? 'Add Tier' : 'Edit Tier'}</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="label">Tier Name *</label>
                <input className="input" placeholder="e.g. Bronze, Silver, Gold"
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Color</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
                    style={{ width: 40, height: 36, border: 'none', background: 'none', cursor: 'pointer' }} />
                  {TIER_COLORS.map(c => (
                    <div key={c} onClick={() => setForm({ ...form, color: c })}
                      style={{ width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer',
                        outline: form.color === c ? '2px solid white' : 'none' }} />
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="label">Min Points to Reach</label>
                <input className="input" type="number" min={0}
                  value={form.min_points} onChange={e => setForm({ ...form, min_points: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Auto Discount (%)</label>
                <input className="input" type="number" min={0} max={100} step="0.5"
                  value={form.discount_percent} onChange={e => setForm({ ...form, discount_percent: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Points Multiplier</label>
                <input className="input" type="number" min={1} step="0.5"
                  value={form.points_multiplier} onChange={e => setForm({ ...form, points_multiplier: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Sort Order</label>
                <input className="input" type="number" min={0}
                  value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })} />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="label">Description</label>
                <input className="input" placeholder="e.g. Free birthday drink, priority checkout..."
                  value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
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
    </div>
  )
}
