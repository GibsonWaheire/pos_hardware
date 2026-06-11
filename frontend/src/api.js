import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

api.interceptors.response.use(
  res => res,
  err => {
    const msg = err.response?.data?.error || err.message || 'Request failed'
    return Promise.reject(new Error(msg))
  }
)

// Products
export const getProducts = (params) => api.get('/products', { params })
export const getProductByBarcode = (barcode) => api.get(`/products/barcode/${barcode}`)
export const createProduct = (data) => api.post('/products', data)
export const updateProduct = (id, data) => api.put(`/products/${id}`, data)
export const deleteProduct = (id) => api.delete(`/products/${id}`)
export const getCategories = () => api.get('/categories')
export const createCategory = (data) => api.post('/categories', data)
export const getLowStock = () => api.get('/products/low-stock')

// Sales
export const createSale = (data) => api.post('/sales', data)
export const getSales = (params) => api.get('/sales', { params })
export const getSale = (id) => api.get(`/sales/${id}`)
export const voidSale = (id) => api.post(`/sales/${id}/void`)
export const getDailyTotals = (date) => api.get('/sales/daily-totals', { params: { date } })

// Reports
export const getSalesReport = (params) => api.get('/reports/sales', { params })
export const getTopProducts = (params) => api.get('/reports/top-products', { params })
export const getPaymentBreakdown = (params) => api.get('/reports/payment-methods', { params })

// Staff
export const getStaff = () => api.get('/staff')
export const verifyPin = (pin) => api.post('/staff/verify-pin', { pin })
export const createStaff = (data) => api.post('/staff', data)
export const updateStaff = (id, data) => api.put(`/staff/${id}`, data)

// Payments (Stripe Terminal)
export const getConnectionToken = () => api.post('/payments/terminal/connection-token')
export const createPaymentIntent = (amount, currency = 'usd') =>
  api.post('/payments/terminal/create-intent', { amount, currency })
export const capturePaymentIntent = (payment_intent_id) =>
  api.post('/payments/terminal/capture', { payment_intent_id })
export const cancelPaymentIntent = (payment_intent_id) =>
  api.post('/payments/terminal/cancel-intent', { payment_intent_id })

// Suppliers
export const getSuppliers = (params) => api.get('/suppliers', { params })
export const getSupplier = (id) => api.get(`/suppliers/${id}`)
export const createSupplier = (data) => api.post('/suppliers', data)
export const updateSupplier = (id, data) => api.put(`/suppliers/${id}`, data)
export const deleteSupplier = (id) => api.delete(`/suppliers/${id}`)

// Purchase Orders
export const getPurchaseOrders = (params) => api.get('/purchase-orders', { params })
export const getPurchaseOrder = (id) => api.get(`/purchase-orders/${id}`)
export const createPurchaseOrder = (data) => api.post('/purchase-orders', data)
export const markPOOrdered = (id) => api.post(`/purchase-orders/${id}/mark-ordered`)
export const receivePO = (id, data) => api.post(`/purchase-orders/${id}/receive`, data)
export const cancelPO = (id) => api.post(`/purchase-orders/${id}/cancel`)

// Returns
export const getReturns = () => api.get('/returns')
export const getReturn = (id) => api.get(`/returns/${id}`)
export const createReturn = (data) => api.post('/returns', data)

// Shifts
export const getShifts = (params) => api.get('/shifts', { params })
export const getCurrentShift = () => api.get('/shifts/current')
export const openShift = (data) => api.post('/shifts/open', data)
export const closeShift = (id, data) => api.post(`/shifts/${id}/close`, data)
export const getShiftSummary = (id) => api.get(`/shifts/${id}/summary`)

// Inventory
export const getInventoryOverview = () => api.get('/inventory/overview')
export const getStockLevels = () => api.get('/inventory/stock-levels')
export const adjustStock = (data) => api.post('/inventory/adjust', data)
export const getStockAdjustments = (params) => api.get('/inventory/adjustments', { params })

// Customers & Loyalty
export const getCustomers = (params) => api.get('/customers', { params })
export const lookupCustomer = (q) => api.get('/customers/lookup', { params: { q } })
export const getCustomer = (id) => api.get(`/customers/${id}`)
export const createCustomer = (data) => api.post('/customers', data)
export const updateCustomer = (id, data) => api.put(`/customers/${id}`, data)
export const getCustomerTransactions = (id) => api.get(`/customers/${id}/transactions`)

export const getLoyaltyTiers = () => api.get('/loyalty/tiers')
export const createLoyaltyTier = (data) => api.post('/loyalty/tiers', data)
export const updateLoyaltyTier = (id, data) => api.put(`/loyalty/tiers/${id}`, data)
export const deleteLoyaltyTier = (id) => api.delete(`/loyalty/tiers/${id}`)
export const earnPoints = (data) => api.post('/loyalty/earn', data)
export const redeemPoints = (data) => api.post('/loyalty/redeem', data)
export const adjustPoints = (data) => api.post('/loyalty/adjust', data)
export const getLoyaltyConfig = () => api.get('/loyalty/config')

// Terminals
export const getTerminals = () => api.get('/terminals')
export const registerTerminal = (data) => api.post('/terminals/register', data)
export const terminalHeartbeat = (terminal_id) => api.post('/terminals/heartbeat', { terminal_id })
export const getTerminalSales = (terminal_id, params) => api.get(`/terminals/${terminal_id}/sales`, { params })
export const updateTerminal = (id, data) => api.put(`/terminals/${id}`, data)

// Voids & No-sale
export const getVoidLogs = (params) => api.get('/voids', { params })
export const voidSaleWithPin = (data) => api.post('/voids/void-sale', data)
export const recordNoSale = (data) => api.post('/voids/no-sale', data)
export const getVoidStats = (params) => api.get('/voids/stats', { params })

// Scale
export const readScale = () => api.get('/scale/read')

// PLU lookup
export const getProductByPlu = (plu) => api.get(`/products/plu/${plu}`)

// Services & Service Categories (Phase 4)
export const getServiceCategories = () => api.get('/service-categories')
export const createServiceCategory = (data) => api.post('/service-categories', data)
export const updateServiceCategory = (id, data) => api.put(`/service-categories/${id}`, data)
export const deleteServiceCategory = (id) => api.delete(`/service-categories/${id}`)
export const getServices = (params) => api.get('/services', { params })
export const getService = (id) => api.get(`/services/${id}`)
export const createService = (data) => api.post('/services', data)
export const updateService = (id, data) => api.put(`/services/${id}`, data)
export const deleteService = (id) => api.delete(`/services/${id}`)

// Appointments (Phase 4)
export const getAppointments = (params) => api.get('/appointments', { params })
export const getAppointment = (id) => api.get(`/appointments/${id}`)
export const createAppointment = (data) => api.post('/appointments', data)
export const updateAppointment = (id, data) => api.put(`/appointments/${id}`, data)
export const updateAppointmentStatus = (id, status) => api.post(`/appointments/${id}/status`, { status })
export const deleteAppointment = (id) => api.delete(`/appointments/${id}`)
export const getClientAppointments = (clientId) => api.get(`/appointments/by-client/${clientId}`)

// Dashboard (Phase 5)
export const getDashboard = () => api.get('/dashboard')

// Extended Reports (Phase 5)
export const getReportByCashier = (params) => api.get('/reports/by-cashier', { params })
export const getReportByCategory = (params) => api.get('/reports/by-category', { params })
export const getInventoryReport = () => api.get('/reports/inventory')
export const getExportCsvUrl = (params) => {
  const q = new URLSearchParams(params).toString()
  return `/api/reports/export/csv?${q}`
}

// Store config (Phase 5)
export const getStoreConfig = () => api.get('/stores/config')
export const updateStoreConfig = (data) => api.put('/stores/config', data)

// Customer Accounts / Deposit Accounts (Phase 7)
export const getAccounts = (params) => api.get('/accounts', { params })
export const getAccount = (id) => api.get(`/accounts/${id}`)
export const createAccount = (data) => api.post('/accounts', data)
export const updateAccount = (id, data) => api.put(`/accounts/${id}`, data)
export const depositToAccount = (id, data) => api.post(`/accounts/${id}/deposit`, data)
export const adjustAccount = (id, data) => api.post(`/accounts/${id}/adjust`, data)
export const lookupAccount = (q) => api.get('/accounts/lookup', { params: { q } })
export const getAccountByCustomer = (customerId) => api.get(`/accounts/by-customer/${customerId}`)

// Cloud Sync (Phase 6)
export const getSyncStatus = () => api.get('/sync/status')
export const runSync = () => api.post('/sync/run-sync')   // blocking — returns result
export const getSyncLogs = (params) => api.get('/sync/logs', { params })
export const getCloudDashboard = () => api.get('/sync/cloud-dashboard')
export const markAllPending = () => api.post('/sync/mark-all-pending')

export default api
