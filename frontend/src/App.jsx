import { useState, useCallback, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import { CurrencyProvider } from './context/CurrencyContext'
import { OnlineStatusProvider, useOnlineStatus } from './context/OnlineStatusContext'
import { useIdleTimeout } from './hooks/useIdleTimeout'
import { login as apiLogin, getStoreConfig } from './api'

import POS from './pages/POS'
import Products from './pages/Products'
import Inventory from './pages/Inventory'
import Suppliers from './pages/Suppliers'
import PurchaseOrders from './pages/PurchaseOrders'
import ReturnsPage from './pages/ReturnsPage'
import Shifts from './pages/Shifts'
import Customers from './pages/Customers'
import Loyalty from './pages/Loyalty'
import Terminals from './pages/Terminals'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Dashboard from './pages/Dashboard'
import CloudSync from './pages/CloudSync'
import Accounts from './pages/Accounts'
import Quotes from './pages/Quotes'
import Services from './pages/Services'
import Appointments from './pages/Appointments'
import Login from './pages/Login'

// ── Nav items and their allowed roles ────────────────────────────────────────

const NAV = [
  // Cashier — only sees Checkout
  { to: '/',                label: 'Checkout',  icon: '🛒', end: true,  roles: ['cashier','manager','admin'] },
  // Manager / Admin
  { to: '/dashboard',       label: 'Dashboard', icon: '📊',             roles: ['manager','admin'] },
  { to: '/quotes',          label: 'Quotes',    icon: '📄',             roles: ['manager','admin'] },
  { to: '/customers',       label: 'Customers', icon: '👤',             roles: ['manager','admin'] },
  { to: '/returns',         label: 'Returns',   icon: '↩️',             roles: ['manager','admin'] },
  { to: '/shifts',          label: 'Shifts',    icon: '⏱️',             roles: ['manager','admin'] },
  { to: '/accounts',        label: 'Accounts',  icon: '🏦',             roles: ['manager','admin'] },
  { to: '/loyalty',         label: 'Loyalty',   icon: '⭐',             roles: ['manager','admin'] },
  { to: '/terminals',       label: 'Terminals', icon: '🖥️',             roles: ['manager','admin'] },
  { to: '/reports',         label: 'Reports',   icon: '📈',             roles: ['manager','admin'] },
  { to: '/settings',        label: 'Settings',  icon: '⚙️',             roles: ['manager','admin'] },
  { to: '/services',        label: 'Services',  icon: '🔧',             roles: ['manager','admin'] },
  { to: '/appointments',    label: 'Appointments', icon: '📅',          roles: ['manager','admin'] },
  // Inventory
  { to: '/products',        label: 'Products',  icon: '📦',             roles: ['inventory','manager','admin'] },
  { to: '/inventory',       label: 'Inventory', icon: '🗂️',            roles: ['inventory','manager','admin'] },
  { to: '/reports',         label: 'Reports',   icon: '📈',             roles: ['inventory'] },
  // Purchasing
  { to: '/inventory',       label: 'Stock',     icon: '🗂️',            roles: ['purchasing'] },
  { to: '/suppliers',       label: 'Suppliers', icon: '🚚',             roles: ['purchasing','manager','admin'] },
  { to: '/purchase-orders', label: 'Orders',    icon: '📋',             roles: ['supplier','purchasing','manager','admin'] },
  // Admin
  { to: '/cloud-sync',      label: 'Cloud',     icon: '☁️',             roles: ['admin'] },
]

const HOME_BY_ROLE = {
  cashier:    '/',
  inventory:  '/inventory',
  purchasing: '/purchase-orders',
  supplier:   '/purchase-orders',
  manager:    '/dashboard',
  admin:      '/dashboard',
}

const ROLE_COLOUR = {
  cashier:    '#4f6ef7',
  inventory:  '#22c55e',
  purchasing: '#f59e0b',
  supplier:   '#06b6d4',
  manager:    '#a855f7',
  admin:      '#ef4444',
}

// ── Lock screen shown when session is idle ────────────────────────────────────

function LockScreen({ user, onUnlock }) {
  const [pin, setPin]     = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy]   = useState(false)

  async function handleUnlock(e) {
    e.preventDefault()
    if (!pin) return
    setBusy(true)
    setError('')
    try {
      const res = await apiLogin(pin, user.id, user.role)
      if (res.data?.staff) {
        onUnlock()
        setPin('')
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid PIN')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 16,
    }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
      <div style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>Session Locked</div>
      <div style={{ color: '#aaa', fontSize: 14, marginBottom: 8 }}>
        {user.name} — enter your PIN to resume
      </div>
      <form onSubmit={handleUnlock} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: 240 }}>
        <input
          type="password"
          inputMode="numeric"
          placeholder="PIN"
          value={pin}
          onChange={e => setPin(e.target.value)}
          autoFocus
          style={{
            width: '100%', padding: '12px 16px', fontSize: 18, letterSpacing: 6,
            borderRadius: 8, border: '1px solid #555', background: '#1a1a1a',
            color: '#fff', textAlign: 'center', outline: 'none',
          }}
        />
        {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        <button
          type="submit"
          disabled={busy || !pin}
          style={{
            width: '100%', padding: '12px', background: 'var(--accent)',
            border: 'none', borderRadius: 8, color: '#fff',
            fontSize: 15, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy || !pin ? 0.6 : 1,
          }}
        >
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  )
}

// ── Inner app (has access to Auth + Theme context) ────────────────────────────

function AppInner() {
  const { user, logout, checking } = useAuth()
  const { theme, toggleTheme }     = useTheme()
  const navigate = useNavigate()
  const [locked, setLocked]             = useState(false)
  const [idleTimeoutMs, setIdleTimeoutMs] = useState(10 * 60 * 1000)

  // Load session timeout from store config once on login
  useEffect(() => {
    if (!user) return
    getStoreConfig().then(res => {
      const mins = res.data?.session_timeout_minutes || 10
      setIdleTimeoutMs(mins * 60 * 1000)
    }).catch(() => {})
  }, [user?.id])

  const onIdle   = useCallback(() => setLocked(true),  [])
  const onActive = useCallback(() => setLocked(false), [])

  useIdleTimeout({
    timeoutMs: idleTimeoutMs,
    onIdle,
    onActive,
    enabled: !!user,
  })

  if (checking) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg)', color:'var(--text-muted)' }}>
      Loading...
    </div>
  )

  if (!user) return <Login />

  const visibleNav = NAV.filter(n => n.roles.includes(user.role))

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  const { isBackendUp, pendingCount, syncResult } = useOnlineStatus()

  return (
    <>
    {locked && <LockScreen user={user} onUnlock={() => setLocked(false)} />}
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-logo">POS</div>

        {visibleNav.map(({ to, label, icon, end }) => (
          <NavLink key={to} to={to} end={!!end}
            className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Pending sync badge */}
        {pendingCount > 0 && (
          <div style={{ padding: '6px 12px', margin: '0 8px 4px', background: '#f59e0b22', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>{pendingCount} pending sync</div>
          </div>
        )}

        {/* Role dot at bottom of sidebar */}
        <div style={{ padding: '12px 0 4px', borderTop: '1px solid var(--border)', width: '100%', display: 'flex', justifyContent: 'center' }}>
          <div style={{ ...roleDot, background: ROLE_COLOUR[user.role] || '#888' }} title={user.role} />
        </div>
      </nav>

      <div style={mainWrap}>
        {/* Offline banner */}
        {!isBackendUp && (
          <div style={{
            background: '#f59e0b', color: '#000', textAlign: 'center',
            padding: '6px 16px', fontSize: 13, fontWeight: 600, flexShrink: 0,
          }}>
            Offline — sales and transactions are saved locally and will sync when connection is restored
            {pendingCount > 0 && <span style={{ marginLeft: 12, background: '#00000033', borderRadius: 10, padding: '1px 8px' }}>{pendingCount} queued</span>}
          </div>
        )}

        {/* Sync result toast */}
        {syncResult && syncResult.synced > 0 && (
          <div style={{
            background: 'var(--success)', color: '#fff', textAlign: 'center',
            padding: '6px 16px', fontSize: 13, fontWeight: 600, flexShrink: 0,
          }}>
            Back online — {syncResult.synced} offline operation{syncResult.synced !== 1 ? 's' : ''} synced to server
            {syncResult.errors.length > 0 && <span style={{ marginLeft: 8, opacity: 0.85 }}>({syncResult.errors.length} failed)</span>}
          </div>
        )}

        {/* Top header bar */}
        <header style={topBar}>
          <div style={topBarLeft}>
            <div style={{ ...roleDot, width: 10, height: 10, background: ROLE_COLOUR[user.role] || '#888' }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{user.name}</span>
            <span style={{ fontSize: 12, color: ROLE_COLOUR[user.role] || '#888', textTransform: 'capitalize', background: (ROLE_COLOUR[user.role] || '#888') + '22', padding: '2px 8px', borderRadius: 10 }}>
              {user.role}
            </span>
          </div>
          <div style={topBarRight}>
            {pendingCount > 0 && (
              <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, background: '#f59e0b22', padding: '3px 10px', borderRadius: 10 }}>
                {pendingCount} pending
              </span>
            )}
            <button onClick={toggleTheme} style={topBarBtn} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button onClick={handleLogout} style={logoutBtn}>
              Log out
            </button>
          </div>
        </header>

        <main className="main-content">
          <Routes>
          <Route path="/"                element={<RoleGuard roles={['cashier','manager','admin']}><POS /></RoleGuard>} />
          <Route path="/dashboard"       element={<RoleGuard roles={['manager','admin']}><Dashboard /></RoleGuard>} />
          <Route path="/quotes"          element={<RoleGuard roles={['cashier','manager','admin']}><Quotes /></RoleGuard>} />
          <Route path="/products"        element={<RoleGuard roles={['inventory','purchasing','manager','admin']}><Products /></RoleGuard>} />
          <Route path="/inventory"       element={<RoleGuard roles={['inventory','purchasing','manager','admin']}><Inventory /></RoleGuard>} />
          <Route path="/suppliers"       element={<RoleGuard roles={['purchasing','manager','admin']}><Suppliers /></RoleGuard>} />
          <Route path="/purchase-orders" element={<RoleGuard roles={['supplier','purchasing','manager','admin']}><PurchaseOrders /></RoleGuard>} />
          <Route path="/returns"         element={<RoleGuard roles={['manager','admin']}><ReturnsPage /></RoleGuard>} />
          <Route path="/shifts"          element={<RoleGuard roles={['manager','admin']}><Shifts /></RoleGuard>} />
          <Route path="/customers"       element={<RoleGuard roles={['cashier','manager','admin']}><Customers /></RoleGuard>} />
          <Route path="/accounts"        element={<RoleGuard roles={['manager','admin']}><Accounts /></RoleGuard>} />
          <Route path="/loyalty"         element={<RoleGuard roles={['manager','admin']}><Loyalty /></RoleGuard>} />
          <Route path="/terminals"       element={<RoleGuard roles={['manager','admin']}><Terminals /></RoleGuard>} />
          <Route path="/reports"         element={<RoleGuard roles={['inventory','manager','admin']}><Reports /></RoleGuard>} />
          <Route path="/services"        element={<RoleGuard roles={['manager','admin']}><Services /></RoleGuard>} />
          <Route path="/appointments"    element={<RoleGuard roles={['cashier','manager','admin']}><Appointments /></RoleGuard>} />
          <Route path="/cloud-sync"      element={<RoleGuard roles={['admin']}><CloudSync /></RoleGuard>} />
          <Route path="/settings"        element={<RoleGuard roles={['manager','admin']}><Settings /></RoleGuard>} />
          {/* Catch-all: redirect to role home */}
          <Route path="*" element={<RoleHome />} />
        </Routes>
        </main>
      </div>
    </div>
    </>
  )
}

function RoleGuard({ roles, children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/" replace />
  if (!roles.includes(user.role)) return <RoleHome />
  return children
}

function RoleHome() {
  const { user } = useAuth()
  const dest = HOME_BY_ROLE[user?.role] || '/'
  return <Navigate to={dest} replace />
}

// ── Root export ───────────────────────────────────────────────────────────────

export default function App() {
  return (
    <CurrencyProvider>
      <ThemeProvider>
        <AuthProvider>
          <OnlineStatusProvider>
            <BrowserRouter>
              <AppInner />
            </BrowserRouter>
          </OnlineStatusProvider>
        </AuthProvider>
      </ThemeProvider>
    </CurrencyProvider>
  )
}

// ── Inline styles ─────────────────────────────────────────────────────────────

const mainWrap = {
  display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden',
}
const topBar = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '0 20px', height: 48, flexShrink: 0,
  background: 'var(--surface)', borderBottom: '1px solid var(--border)',
}
const topBarLeft = {
  display: 'flex', alignItems: 'center', gap: 10,
}
const topBarRight = {
  display: 'flex', alignItems: 'center', gap: 10,
}
const topBarBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 16, color: 'var(--text-muted)', padding: '4px',
}
const roleDot = {
  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
}
const logoutBtn = {
  padding: '6px 14px',
  background: 'transparent',
  border: '1px solid var(--danger)',
  borderRadius: 6,
  color: 'var(--danger)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  letterSpacing: 0.3,
}
