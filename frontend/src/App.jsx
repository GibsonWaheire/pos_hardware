import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
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
import Appointments from './pages/Appointments'
import Services from './pages/Services'
import Dashboard from './pages/Dashboard'
import CloudSync from './pages/CloudSync'

const NAV = [
  { to: '/',               label: 'Checkout',     icon: '🛒', end: true },
  { to: '/dashboard',      label: 'Dashboard',    icon: '📊' },
  { to: '/appointments',   label: 'Appointments', icon: '📅' },
  { to: '/services',       label: 'Services',     icon: '✂️' },
  { to: '/products',       label: 'Products',     icon: '📦' },
  { to: '/inventory',      label: 'Inventory',    icon: '🗂️' },
  { to: '/suppliers',      label: 'Suppliers',    icon: '🚚' },
  { to: '/purchase-orders',label: 'Orders',       icon: '📋' },
  { to: '/returns',        label: 'Returns',      icon: '↩️' },
  { to: '/shifts',         label: 'Shifts',       icon: '⏱️' },
  { to: '/customers',      label: 'Customers',    icon: '👤' },
  { to: '/loyalty',        label: 'Loyalty',      icon: '⭐' },
  { to: '/terminals',      label: 'Terminals',    icon: '🖥️' },
  { to: '/reports',        label: 'Reports',      icon: '📈' },
  { to: '/cloud-sync',     label: 'Cloud Sync',   icon: '☁️' },
  { to: '/settings',       label: 'Settings',     icon: '⚙️' },
]

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-layout">
        <nav className="sidebar">
          <div className="sidebar-logo">POS</div>
          {NAV.map(({ to, label, icon, end }) => (
            <NavLink key={to} to={to} end={!!end}
              className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/"                element={<POS />} />
            <Route path="/products"        element={<Products />} />
            <Route path="/inventory"       element={<Inventory />} />
            <Route path="/suppliers"       element={<Suppliers />} />
            <Route path="/purchase-orders" element={<PurchaseOrders />} />
            <Route path="/returns"         element={<ReturnsPage />} />
            <Route path="/shifts"          element={<Shifts />} />
            <Route path="/customers"       element={<Customers />} />
            <Route path="/loyalty"         element={<Loyalty />} />
            <Route path="/terminals"       element={<Terminals />} />
            <Route path="/reports"         element={<Reports />} />
            <Route path="/settings"        element={<Settings />} />
            <Route path="/appointments"    element={<Appointments />} />
            <Route path="/services"        element={<Services />} />
            <Route path="/dashboard"       element={<Dashboard />} />
            <Route path="/cloud-sync"      element={<CloudSync />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
