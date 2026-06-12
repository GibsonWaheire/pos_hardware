import { useState, useEffect } from 'react'
import { getSyncStatus, runSync, getSyncLogs, getCloudDashboard, markAllPending } from '../api'
import { getQueue, resetErrors, clearAll, getPendingCount } from '../offlineQueue'
import { flushQueue } from '../offlineSync'
import { useOnlineStatus } from '../context/OnlineStatusContext'

function fmt(n) { return `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
function timeAgo(isoStr) {
  if (!isoStr) return 'Never'
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(isoStr).toLocaleDateString()
}

export default function CloudSync() {
  const [status, setStatus] = useState(null)
  const [logs, setLogs] = useState([])
  const [cloudData, setCloudData] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [tab, setTab] = useState('status')
  const [error, setError] = useState('')
  const [queue, setQueue] = useState(() => getQueue())
  const [flushResult, setFlushResult] = useState(null)
  const { isBackendUp, refreshPending } = useOnlineStatus()

  useEffect(() => { loadAll() }, [])

  function refreshQueue() { setQueue(getQueue()); refreshPending() }

  async function loadAll() {
    try {
      const [s, l] = await Promise.all([getSyncStatus(), getSyncLogs()])
      setStatus(s.data)
      setLogs(l.data)
    } catch (e) { console.error(e) }
  }

  async function loadCloudDashboard() {
    setError('')
    try {
      const r = await getCloudDashboard()
      if (r.data.error) { setError(r.data.error); return }
      setCloudData(r.data)
    } catch (e) { setError(e.message) }
  }

  async function handleSync() {
    setSyncing(true); setSyncResult(null); setError('')
    try {
      const r = await runSync()
      setSyncResult(r.data)
      loadAll()
    } catch (e) {
      setError(e.message)
    } finally { setSyncing(false) }
  }

  async function handleMarkPending() {
    if (!confirm('Reset sync state? All records will re-sync on next run.')) return
    await markAllPending()
    loadAll()
  }

  const pendingInQueue = queue.filter(i => i.status === 'pending').length
  const TABS = [
    { key: 'status', label: 'Sync Status' },
    { key: 'queue',  label: `Offline Queue${pendingInQueue > 0 ? ` (${pendingInQueue})` : ''}` },
    { key: 'cloud',  label: 'All Stores' },
    { key: 'logs',   label: 'Sync Logs' },
  ]

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <span className="page-title">Cloud Sync</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={loadAll}>Refresh</button>
          <button
            className="btn btn-primary"
            onClick={handleSync}
            disabled={syncing || !status?.cloud_configured}
          >
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '0 24px', borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.key}
            onClick={() => { setTab(t.key); if (t.key === 'cloud') loadCloudDashboard() }}
            style={{
              padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              color: tab === t.key ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              fontWeight: tab === t.key ? 600 : 400, fontSize: 14,
            }}>{t.label}</button>
        ))}
      </div>

      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>

        {/* ── Status tab ── */}
        {tab === 'status' && status && (
          <>
            {/* Cloud config banner */}
            <div className="card" style={{
              marginBottom: 20,
              borderColor: status.cloud_configured ? 'var(--success)' : 'var(--warning)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {status.cloud_configured
                      ? 'Cloud DB Connected'
                      : 'Cloud DB Not Configured'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {status.cloud_configured
                      ? `Store ID: ${status.store_id} · Auto-sync: ${status.auto_sync ? `every ${status.sync_interval_minutes} min` : 'off'}`
                      : 'Set CLOUD_DB_URL in your .env file to enable sync'}
                  </div>
                </div>
                <span className={`badge ${status.cloud_configured ? 'badge-green' : 'badge-yellow'}`}>
                  {status.cloud_configured ? 'Configured' : 'Not Set'}
                </span>
              </div>
            </div>

            {/* Setup instructions when not configured */}
            {!status.cloud_configured && (
              <div className="card" style={{ marginBottom: 20, background: 'var(--surface2)' }}>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>Setup Instructions</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 2 }}>
                  <div>1. Create a PostgreSQL database (e.g. on Railway, Supabase, Render, or self-hosted)</div>
                  <div>2. Add these to your <code style={{ background: 'var(--surface)', padding: '1px 6px', borderRadius: 4 }}>.env</code> file:</div>
                </div>
                <pre style={{
                  background: 'var(--bg)', padding: '12px 16px', borderRadius: 8,
                  fontSize: 12, color: 'var(--accent)', marginTop: 8, overflowX: 'auto',
                }}>
{`CLOUD_DB_URL=postgresql://user:password@host:5432/poscloud
STORE_ID=nairobi-main
STORE_NAME=Nairobi Main Branch
CLOUD_SYNC_AUTO=1
SYNC_INTERVAL_MINUTES=15`}
                </pre>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                  The sync engine will auto-create the required tables on first run.
                </div>
              </div>
            )}

            {/* Pending counts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
              <div className="card">
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Pending Sales</div>
                <div style={{
                  fontSize: 28, fontWeight: 700,
                  color: status.pending_sales > 0 ? 'var(--warning)' : 'var(--success)',
                }}>{status.pending_sales}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>not yet synced to cloud</div>
              </div>
              <div className="card">
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Pending Customers</div>
                <div style={{
                  fontSize: 28, fontWeight: 700,
                  color: status.pending_customers > 0 ? 'var(--warning)' : 'var(--success)',
                }}>{status.pending_customers}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>not yet synced</div>
              </div>
              <div className="card">
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Last Sync</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>
                  {status.last_sync ? timeAgo(status.last_sync.created_at) : 'Never'}
                </div>
                {status.last_sync && (
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    <span className={`badge ${status.last_sync.status === 'success' ? 'badge-green' : 'badge-red'}`}>
                      {status.last_sync.status}
                    </span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                      {status.last_sync.sales_synced} sales · {status.last_sync.customers_synced} customers
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Last sync result */}
            {syncResult && (
              <div className="card" style={{
                borderColor: syncResult.errors?.length ? 'var(--danger)' : 'var(--success)',
                marginBottom: 20,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: syncResult.errors?.length ? 'var(--danger)' : 'var(--success)' }}>
                  {syncResult.errors?.length ? 'Sync completed with errors' : 'Sync completed successfully'}
                </div>
                <div style={{ display: 'flex', gap: 24, fontSize: 14 }}>
                  <span>Sales pushed: <strong>{syncResult.sales}</strong></span>
                  <span>Customers: <strong>{syncResult.customers}</strong></span>
                  <span>Inventory rows: <strong>{syncResult.inventory}</strong></span>
                </div>
                {syncResult.errors?.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>
                    {syncResult.errors.join(' · ')}
                  </div>
                )}
              </div>
            )}

            {error && <p className="error-msg">{error}</p>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={handleMarkPending}>
                Reset — Re-sync All Records
              </button>
            </div>
          </>
        )}

        {/* ── All Stores (cloud dashboard) tab ── */}
        {tab === 'cloud' && (
          <>
            {error && (
              <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: 16 }}>
                <div style={{ fontWeight: 600, color: 'var(--danger)', marginBottom: 4 }}>Cloud Query Error</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{error}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                  Make sure CLOUD_DB_URL is set and the cloud DB is reachable.
                </div>
              </div>
            )}

            {cloudData && (
              <>
                {/* Global totals */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                  <div className="card">
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Stores Online</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>{cloudData.stores.length}</div>
                  </div>
                  <div className="card">
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Cloud Sales Records</div>
                    <div style={{ fontSize: 28, fontWeight: 700 }}>{cloudData.total_cloud_sales?.toLocaleString()}</div>
                  </div>
                  <div className="card">
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Cloud Customers</div>
                    <div style={{ fontSize: 28, fontWeight: 700 }}>{cloudData.total_cloud_customers?.toLocaleString()}</div>
                  </div>
                </div>

                {cloudData.stores.length === 0 ? (
                  <div className="empty-state">No stores have synced yet</div>
                ) : (
                  <>
                    {/* Revenue comparison bars */}
                    <div className="card" style={{ marginBottom: 16 }}>
                      <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 14 }}>All-Time Revenue by Store</div>
                      {(() => {
                        const maxRev = Math.max(...cloudData.stores.map(s => s.revenue), 0.01)
                        return cloudData.stores.map((s, i) => (
                          <div key={i} style={{ marginBottom: 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                              <span style={{ fontWeight: 600 }}>{s.store_name}</span>
                              <span style={{ color: 'var(--text-muted)' }}>
                                {s.transactions.toLocaleString()} sales
                                {s.last_sale && <span> · last {timeAgo(s.last_sale)}</span>}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ flex: 1, height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{
                                  width: `${(s.revenue / maxRev) * 100}%`,
                                  height: '100%',
                                  background: `hsl(${(i * 60) % 360}, 70%, 60%)`,
                                  borderRadius: 4,
                                  transition: 'width 0.5s ease',
                                }} />
                              </div>
                              <span style={{ fontSize: 14, fontWeight: 700, minWidth: 80, textAlign: 'right' }}>{fmt(s.revenue)}</span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                              Today: {fmt(s.today?.revenue)} ({s.today?.transactions} sales)
                            </div>
                          </div>
                        ))
                      })()}
                    </div>

                    {/* Store table */}
                    <div className="card" style={{ padding: 0 }}>
                      <table className="table">
                        <thead>
                          <tr><th>Store</th><th>Store ID</th><th>All-Time Revenue</th><th>Today</th><th>Transactions</th><th>Last Sale</th></tr>
                        </thead>
                        <tbody>
                          {cloudData.stores.map((s, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 600 }}>{s.store_name}</td>
                              <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{s.store_id}</td>
                              <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmt(s.revenue)}</td>
                              <td>{fmt(s.today?.revenue)}</td>
                              <td style={{ color: 'var(--text-muted)' }}>{s.transactions.toLocaleString()}</td>
                              <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{timeAgo(s.last_sale)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}

            {!cloudData && !error && (
              <div className="empty-state">Loading cloud data...</div>
            )}
          </>
        )}

        {/* ── Offline Queue tab ── */}
        {tab === 'queue' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>
                  Offline Queue
                  {pendingInQueue > 0 && <span style={{ marginLeft: 8, background: '#f59e0b', color: '#000', borderRadius: 10, fontSize: 11, padding: '1px 8px', fontWeight: 700 }}>{pendingInQueue} pending</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Operations saved locally while offline. They replay to the backend automatically on reconnect.
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={refreshQueue}>Refresh</button>
              {queue.some(i => i.status === 'error') && (
                <button className="btn btn-ghost btn-sm" onClick={() => { resetErrors(); refreshQueue() }}>Retry Errors</button>
              )}
              <button
                className="btn btn-primary btn-sm"
                disabled={!isBackendUp || pendingInQueue === 0 || syncing}
                onClick={async () => {
                  setSyncing(true); setFlushResult(null)
                  try { const r = await flushQueue(); setFlushResult(r); refreshQueue() }
                  catch (e) { setError(e.message) }
                  finally { setSyncing(false) }
                }}
              >
                {syncing ? 'Syncing...' : 'Flush Now'}
              </button>
              {queue.length > 0 && (
                <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Clear entire offline queue? This cannot be undone.')) { clearAll(); refreshQueue() } }}>
                  Clear All
                </button>
              )}
            </div>

            {flushResult && (
              <div className="card" style={{ marginBottom: 14, borderColor: flushResult.errors.length ? 'var(--danger)' : 'var(--success)' }}>
                <div style={{ fontWeight: 600, color: flushResult.errors.length ? 'var(--danger)' : 'var(--success)' }}>
                  {flushResult.synced} item{flushResult.synced !== 1 ? 's' : ''} synced
                  {flushResult.errors.length > 0 && `, ${flushResult.errors.length} failed`}
                </div>
                {flushResult.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>
                    [{e.type}] {e.error}
                  </div>
                ))}
              </div>
            )}

            {queue.length === 0 ? (
              <div className="empty-state">No items in offline queue</div>
            ) : (
              <div className="card" style={{ padding: 0 }}>
                <table className="table" style={{ fontSize: 13 }}>
                  <thead>
                    <tr><th>Time</th><th>Type</th><th>Status</th><th>Details</th><th>Error</th></tr>
                  </thead>
                  <tbody>
                    {queue.map(item => (
                      <tr key={item.id} style={{ background: item.status === 'error' ? '#fff5f5' : undefined }}>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {new Date(item.created_at).toLocaleString()}
                        </td>
                        <td>
                          <span className={`badge ${item.type === 'create_sale' ? 'badge-blue' : item.type === 'deposit_account' ? 'badge-green' : 'badge-yellow'}`}>
                            {item.type.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${item.status === 'pending' ? 'badge-yellow' : item.status === 'error' ? 'badge-red' : 'badge-green'}`}>
                            {item.status}
                          </span>
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.type === 'create_sale' && `${item.payload.items?.length ?? 0} items · ${item.payload.payment_method || ''}`}
                          {item.type === 'deposit_account' && `Acct #${item.payload.account_id} · ${fmt(item.payload.amount)}`}
                          {item.type === 'adjust_account' && `Acct #${item.payload.account_id} · ${fmt(item.payload.amount)}`}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--danger)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.error || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Sync logs tab ── */}
        {tab === 'logs' && (
          <div className="card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr><th>Time</th><th>Status</th><th>Sales</th><th>Customers</th><th>Inventory</th><th>Error</th></tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan={6} className="empty-state">No sync runs yet</td></tr>
                ) : logs.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(l.created_at).toLocaleString()}
                    </td>
                    <td>
                      <span className={`badge ${l.status === 'success' ? 'badge-green' : 'badge-red'}`}>
                        {l.status}
                      </span>
                    </td>
                    <td style={{ color: l.sales_synced > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                      {l.sales_synced}
                    </td>
                    <td style={{ color: l.customers_synced > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                      {l.customers_synced}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{l.inventory_synced}</td>
                    <td style={{ fontSize: 12, color: 'var(--danger)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {l.error_message || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  )
}
