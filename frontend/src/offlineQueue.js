/**
 * offlineQueue.js — queue of write operations that failed due to no backend.
 * Items are replayed by offlineSync.flushQueue() when the backend comes back.
 */

const KEY = 'pos_hw_offline_queue'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] }
}
function persist(q) { localStorage.setItem(KEY, JSON.stringify(q)) }

/** Add an operation to the queue. Returns the generated id. */
export function enqueue(type, payload) {
  const q = load()
  const id = `oq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  q.push({ id, type, payload, created_at: new Date().toISOString(), status: 'pending', error: null })
  persist(q)
  return id
}

/** All queue items (pending + errored). */
export function getQueue() { return load() }

/** Count of items still needing a sync attempt. */
export function getPendingCount() { return load().filter(i => i.status === 'pending').length }

/** Remove a successfully-replayed item. */
export function markSynced(id) { persist(load().filter(i => i.id !== id)) }

/** Flag an item as failed with an error message (keeps it for retry). */
export function markError(id, error) {
  persist(load().map(i => i.id === id ? { ...i, status: 'error', error } : i))
}

/** Reset all errored items back to pending (for manual retry). */
export function resetErrors() {
  persist(load().map(i => i.status === 'error' ? { ...i, status: 'pending', error: null } : i))
}

/** Wipe the entire queue. */
export function clearAll() { persist([]) }
