/**
 * Phase 32 — Hold Sale / Parked Transactions
 * localStorage-backed; up to 3 slots; auto-expire after 2 hours.
 */

const MAX_SLOTS  = 3
const EXPIRY_MS  = 2 * 60 * 60 * 1000   // 2 hours
const _key = (slot) => `pos_parked_${slot}`

function _clearExpired() {
  const now = Date.now()
  for (let s = 1; s <= MAX_SLOTS; s++) {
    const raw = localStorage.getItem(_key(s))
    if (!raw) continue
    try {
      const data = JSON.parse(raw)
      if (now - data.parked_at > EXPIRY_MS) localStorage.removeItem(_key(s))
    } catch {
      localStorage.removeItem(_key(s))
    }
  }
}

/**
 * Park the current sale into the first free slot.
 * Returns { ok: true, slot } or { ok: false, error }.
 */
export function parkSale({ items, customer = null, note = '' }) {
  _clearExpired()
  for (let s = 1; s <= MAX_SLOTS; s++) {
    if (!localStorage.getItem(_key(s))) {
      localStorage.setItem(_key(s), JSON.stringify({
        slot: s, items, customer, note, parked_at: Date.now(),
      }))
      return { ok: true, slot: s }
    }
  }
  return { ok: false, error: 'All 3 hold slots are occupied. Retrieve or discard a sale first.' }
}

/**
 * Return all parked sales (expired ones are removed automatically).
 */
export function getParkedSales() {
  _clearExpired()
  const result = []
  for (let s = 1; s <= MAX_SLOTS; s++) {
    const raw = localStorage.getItem(_key(s))
    if (!raw) continue
    try { result.push(JSON.parse(raw)) } catch {}
  }
  return result
}

/**
 * Retrieve (pop) a parked sale by slot number. Returns the data or null.
 */
export function retrieveSale(slot) {
  const raw = localStorage.getItem(_key(slot))
  if (!raw) return null
  try {
    const data = JSON.parse(raw)
    localStorage.removeItem(_key(slot))
    return data
  } catch { return null }
}

/**
 * Discard (delete) a parked sale without restoring it.
 */
export function discardSale(slot) {
  localStorage.removeItem(_key(slot))
}
