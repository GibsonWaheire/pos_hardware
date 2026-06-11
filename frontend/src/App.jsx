import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'

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
import Login from './pages/Login'

// ── Nav items and their allowed roles ────────────────────────────────────────

const NAV = [
  { to: '/',                label: 'Checkout',  icon: '🛒', end: true,  roles: ['cashier','manager','admin'] },
  { to: '/dashboard',       label: 'Dashboard', icon: '📊',             roles: ['manager','admin'] },
  { to: '/quotes',          label: 'Quotes',    icon: '📄',             roles: ['cashier','manager','admin'] },
  { to: '/products',        label: 'Products',  icon: '📦',             roles: ['inventory','manager','admin'] },
  { to: '/inventory',       label: 'Inventory', icon: '🗂️',            roles: ['inventory','purchasing','manager','admin'] },
  { to: '/suppliers',       label: 'Suppliers', icon: '🚚',             roles: ['purchasing','manager','admin'] },
  { to: '/purchase-orders', label: 'Orders',    icon: '📋',             roles: ['purchasing','manager','admin'] },
  { to: '/returns',         label: 'Returns',   icon: '↩️',             roles: ['manager','admin'] },
  { to: '/shifts',          label: 'Shifts',    icon: '⏱️',             roles: ['cashier','manager','admin'] },
  { to: '/customers',       label: 'Customers', icon: '👤',             roles: ['cashier','manager','admin'] },
  { to: '/accounts',        label: 'Accounts',  icon: '🏦',             roles: ['manager','admin'] },
  { to: '/loyalty',         label: 'Loyalty',   icon: '⭐',             roles: ['manager','admin'] },
  { to: '/terminals',       label: 'Terminals', icon: '🖥️',             roles: ['manager','admin'] },
  { to: '/reports',         label: 'Reports',   icon: '📈',             roles: ['inventory','purchasing','manager','admin'] },
  { to: '/cloud-sync',      label: 'Cloud',     icon: '☁️',             roles: ['admin'] },
  { to: '/settings',        label: 'Settings',  icon: '⚙️',             roles: ['manager','admin'] },
]

const HOME_BY_ROLE = {
  cashier:    '/',
  inventory:  '/products',
  purchasing: '/suppliers',
  manager:    '/dashboard',
  admin:      '/dashboard',
}

const ROLE_COLOUR = {
  cashier:    '#4f6ef7',
  inventory:  '#22c55e',
  purchasing: '#f59e0b',
  manager:    '#a855f7',
  admin:      '#ef4444',
}

// ── Inner app (has access to Auth + Theme context) ────────────────────────────

function AppInner() {
  const { user, logout, checking } = useAuth()
  const { theme, toggleTheme }     = useTheme()
  const navigate = useNavigate()

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

  return (
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

        {/* Role dot at bottom of sidebar */}
        <div style={{ padding: '12px 0 4px', borderTop: '1px solid var(--border)', width: '100%', display: 'flex', justifyContent: 'center' }}>
          <div style={{ ...roleDot, background: ROLE_COLOUR[user.role] || '#888' }} title={user.role} />
        </div>
      </nav>

      <div style={mainWrap}>
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
          <Route path="/products"        element={<RoleGuard roles={['inventory','manager','admin']}><Products /></RoleGuard>} />
          <Route path="/inventory"       element={<RoleGuard roles={['inventory','purchasing','manager','admin']}><Inventory /></RoleGuard>} />
          <Route path="/suppliers"       element={<RoleGuard roles={['purchasing','manager','admin']}><Suppliers /></RoleGuard>} />
          <Route path="/purchase-orders" element={<RoleGuard roles={['purchasing','manager','admin']}><PurchaseOrders /></RoleGuard>} />
          <Route path="/returns"         element={<RoleGuard roles={['manager','admin']}><ReturnsPage /></RoleGuard>} />
          <Route path="/shifts"          element={<RoleGuard roles={['cashier','manager','admin']}><Shifts /></RoleGuard>} />
          <Route path="/customers"       element={<RoleGuard roles={['cashier','manager','admin']}><Customers /></RoleGuard>} />
          <Route path="/accounts"        element={<RoleGuard roles={['manager','admin']}><Accounts /></RoleGuard>} />
          <Route path="/loyalty"         element={<RoleGuard roles={['manager','admin']}><Loyalty /></RoleGuard>} />
          <Route path="/terminals"       element={<RoleGuard roles={['manager','admin']}><Terminals /></RoleGuard>} />
          <Route path="/reports"         element={<RoleGuard roles={['inventory','purchasing','manager','admin']}><Reports /></RoleGuard>} />
          <Route path="/cloud-sync"      element={<RoleGuard roles={['admin']}><CloudSync /></RoleGuard>} />
          <Route path="/settings"        element={<RoleGuard roles={['manager','admin']}><Settings /></RoleGuard>} />
          {/* Catch-all: redirect to role home */}
          <Route path="*" element={<RoleHome />} />
        </Routes>
        </main>
      </div>
    </div>
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
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppInner />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
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
