/**
 * offlineSync.js — replays queued offline operations to the backend.
 * Uses raw axios (not api.js) to avoid circular imports.
 */

import axios from 'axios'
import { getQueue, markSynced, markError } from './offlineQueue'

const http = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

/** Returns true if the backend health endpoint responds within 3 s. */
export async function checkBackendReachable() {
  try {
    await http.get('/health', { timeout: 3000 })
    return true
  } catch { return false }
}

/**
 * Replay every pending queue item against the live backend.
 * Items that succeed are removed; items that fail are marked with an error
 * and left for the next attempt.
 * Returns { synced: N, errors: [{ id, type, error }] }
 */
export async function flushQueue() {
  const pending = getQueue().filter(i => i.status === 'pending')
  let synced = 0
  const errors = []

  for (const item of pending) {
    try {
      if (item.type === 'create_sale') {
        await http.post('/sales', item.payload)

      } else if (item.type === 'deposit_account') {
        const { account_id, ...body } = item.payload
        await http.post(`/accounts/${account_id}/deposit`, body)

      } else if (item.type === 'adjust_account') {
        const { account_id, ...body } = item.payload
        await http.post(`/accounts/${account_id}/adjust`, body)

      } else {
        // Unknown type — skip silently so it doesn't block the queue
        markSynced(item.id)
        continue
      }
      markSynced(item.id)
      synced++
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Request failed'
      markError(item.id, msg)
      errors.push({ id: item.id, type: item.type, error: msg })
    }
  }

  return { synced, errors }
}
