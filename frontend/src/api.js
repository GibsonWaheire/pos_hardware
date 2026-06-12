import axios from 'axios'
import * as local from './localStore'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

api.interceptors.response.use(
  res => res,
  err => {
    const isNet = !err.response
    const msg = err.response?.data?.error || err.message || 'Request failed'
    const e2 = new Error(msg)
    if (isNet) e2.isNetworkError = true
    return Promise.reject(e2)
  }
)

const isOffline = e => e.isNetworkError

async function withLocal(apiFn, localFn) {
  try { return await apiFn() }
  catch (e) { if (isOffline(e)) return localFn(); throw e }
}

// ── Products ─────────────────────────────────────────────────────────────────

export const getProducts = (params) => withLocal(
  () => api.get('/products', { params }),
  () => local.lsGetProducts(params)
)
export const getProductByBarcode = (barcode) => withLocal(
  () => api.get(`/products/barcode/${barcode}`),
  () => local.lsGetProductByBarcode(barcode)
)
export const createProduct = (data) => withLocal(
  () => api.post('/products', data),
  () => local.lsCreateProduct(data)
)
export const updateProduct = (id, data) => withLocal(
  () => api.put(`/products/${id}`, data),
  () => local.lsUpdateProduct(id, data)
)
export const deleteProduct = (id) => withLocal(
  () => api.delete(`/products/${id}`),
  () => local.lsDeleteProduct(id)
)
export const getCategories = () => withLocal(
  () => api.get('/categories'),
  () => local.lsGetCategories()
)
export const createCategory = (data) => withLocal(
  () => api.post('/categories', data),
  () => local.lsCreateCategory(data)
)
export const getLowStock = () => withLocal(
  () => api.get('/products/low-stock'),
  () => local.lsGetLowStock()
)

// ── Sales ─────────────────────────────────────────────────────────────────────

export const createSale = (data) => withLocal(
  () => api.post('/sales', data),
  () => local.lsCreateSale(data)
)
export const getSales = (params) => withLocal(
  () => api.get('/sales', { params }),
  () => local.lsGetSales(params)
)
export const getSale = (id) => withLocal(
  () => api.get(`/sales/${id}`),
  () => local.lsGetSale(id)
)
export const voidSale = (id) => withLocal(
  () => api.post(`/sales/${id}/void`),
  () => local.lsStub({ voided: true })
)
export const getDailyTotals = (date) => withLocal(
  () => api.get('/sales/daily-totals', { params: { date } }),
  () => local.lsGetDailyTotals(date)
)

// ── Reports ───────────────────────────────────────────────────────────────────

export const getSalesReport = (params) => withLocal(
  () => api.get('/reports/sales', { params }),
  () => local.lsStub([])
)
export const getTopProducts = (params) => withLocal(
  () => api.get('/reports/top-products', { params }),
  () => local.lsStub([])
)
export const getPaymentBreakdown = (params) => withLocal(
  () => api.get('/reports/payment-methods', { params }),
  () => local.lsStub([])
)

// ── Staff ─────────────────────────────────────────────────────────────────────

export const getStaff = () => withLocal(
  () => api.get('/staff'),
  () => local.lsGetStaff()
)
export const verifyPin = (pin) => withLocal(
  () => api.post('/staff/verify-pin', { pin }),
  () => local.lsVerifyPin(pin)
)
export const createStaff = (data) => withLocal(
  () => api.post('/staff', data),
  () => local.lsStub(data)
)
export const updateStaff = (id, data) => withLocal(
  () => api.put(`/staff/${id}`, data),
  () => local.lsStub(data)
)

// ── Payments (Stripe Terminal) ────────────────────────────────────────────────

export const getConnectionToken = () => withLocal(
  () => api.post('/payments/terminal/connection-token'),
  () => local.lsStub({})
)
export const createPaymentIntent = (amount, currency = 'usd') => withLocal(
  () => api.post('/payments/terminal/create-intent', { amount, currency }),
  () => local.lsStub({})
)
export const capturePaymentIntent = (payment_intent_id) => withLocal(
  () => api.post('/payments/terminal/capture', { payment_intent_id }),
  () => local.lsStub({})
)
export const cancelPaymentIntent = (payment_intent_id) => withLocal(
  () => api.post('/payments/terminal/cancel-intent', { payment_intent_id }),
  () => local.lsStub({})
)

// ── Suppliers ─────────────────────────────────────────────────────────────────

export const getSuppliers = (params) => withLocal(
  () => api.get('/suppliers', { params }),
  () => local.lsGetSuppliers()
)
export const getSupplier = (id) => withLocal(
  () => api.get(`/suppliers/${id}`),
  () => local.lsStub({})
)
export const createSupplier = (data) => withLocal(
  () => api.post('/suppliers', data),
  () => local.lsCreateSupplier(data)
)
export const updateSupplier = (id, data) => withLocal(
  () => api.put(`/suppliers/${id}`, data),
  () => local.lsUpdateSupplier(id, data)
)
export const deleteSupplier = (id) => withLocal(
  () => api.delete(`/suppliers/${id}`),
  () => local.lsStub({ deleted: true })
)

// ── Purchase Orders ───────────────────────────────────────────────────────────

export const getPurchaseOrders = (params) => withLocal(
  () => api.get('/purchase-orders', { params }),
  () => local.lsStub([])
)
export const getPurchaseOrder = (id) => withLocal(
  () => api.get(`/purchase-orders/${id}`),
  () => local.lsStub({})
)
export const createPurchaseOrder = (data) => withLocal(
  () => api.post('/purchase-orders', data),
  () => local.lsStub(data)
)
export const markPOOrdered = (id) => withLocal(
  () => api.post(`/purchase-orders/${id}/mark-ordered`),
  () => local.lsStub({})
)
export const receivePO = (id, data) => withLocal(
  () => api.post(`/purchase-orders/${id}/receive`, data),
  () => local.lsStub({})
)
export const cancelPO = (id) => withLocal(
  () => api.post(`/purchase-orders/${id}/cancel`),
  () => local.lsStub({})
)
export const getPendingPOs = () => withLocal(
  () => api.get('/purchase-orders/pending-approvals'),
  () => local.lsStub([])
)
export const approvePO = (id) => withLocal(
  () => api.post(`/purchase-orders/${id}/approve`),
  () => local.lsStub({})
)
export const rejectPO = (id, data) => withLocal(
  () => api.post(`/purchase-orders/${id}/reject`, data),
  () => local.lsStub({})
)
export const confirmPO = (id) => withLocal(
  () => api.post(`/purchase-orders/${id}/confirm`),
  () => local.lsStub({})
)
export const markPODispatched = (id) => withLocal(
  () => api.post(`/purchase-orders/${id}/mark-dispatched`),
  () => local.lsStub({})
)

// ── Purchaser Limits ──────────────────────────────────────────────────────────

export const getPurchaserLimits = () => withLocal(
  () => api.get('/purchaser-limits'),
  () => local.lsStub([])
)
export const getPurchaserLimit = (staffId) => withLocal(
  () => api.get(`/purchaser-limits/${staffId}`),
  () => local.lsStub(null)
)
export const setPurchaserLimit = (staffId, data) => withLocal(
  () => api.put(`/purchaser-limits/${staffId}`, data),
  () => local.lsStub(data)
)
export const deletePurchaserLimit = (staffId) => withLocal(
  () => api.delete(`/purchaser-limits/${staffId}`),
  () => local.lsStub({})
)

// ── Returns ───────────────────────────────────────────────────────────────────

export const getReturns = (params) => withLocal(
  () => api.get('/returns', { params }),
  () => local.lsStub([])
)
export const getPendingReturns = () => withLocal(
  () => api.get('/returns/pending'),
  () => local.lsStub([])
)
export const getReturn = (id) => withLocal(
  () => api.get(`/returns/${id}`),
  () => local.lsStub({})
)
export const createReturn = (data) => withLocal(
  () => api.post('/returns', data),
  () => local.lsStub(data)
)
export const approveReturn = (id, data) => withLocal(
  () => api.post(`/returns/${id}/approve`, data),
  () => local.lsStub({})
)
export const rejectReturn = (id, data) => withLocal(
  () => api.post(`/returns/${id}/reject`, data),
  () => local.lsStub({})
)

// ── Shifts ────────────────────────────────────────────────────────────────────

export const getShifts = (params) => withLocal(
  () => api.get('/shifts', { params }),
  () => local.lsGetShifts()
)
export const openShift = (data) => withLocal(
  () => api.post('/shifts/open', data),
  () => local.lsOpenShift(data)
)
export const closeShift = (id, data) => withLocal(
  () => api.post(`/shifts/${id}/close`, data),
  () => local.lsCloseShift(id, data)
)
export const getShiftSummary = (id) => withLocal(
  () => api.get(`/shifts/${id}/summary`),
  () => local.lsStub({})
)

// ── Inventory ─────────────────────────────────────────────────────────────────

export const getInventoryOverview = () => withLocal(
  () => api.get('/inventory/overview'),
  () => local.lsStub({})
)
export const getStockLevels = () => withLocal(
  () => api.get('/inventory/stock-levels'),
  () => local.lsStub([])
)
export const adjustStock = (data) => withLocal(
  () => api.post('/inventory/adjust', data),
  () => local.lsStub({})
)
export const getStockAdjustments = (params) => withLocal(
  () => api.get('/inventory/adjustments', { params }),
  () => local.lsStub([])
)

// ── Phase 17: Stock Movements ──────────────────────────────────────────────────
export const getStockMovements = (params) => withLocal(
  () => api.get('/inventory/movements', { params }),
  () => local.lsStub([])
)

// ── Phase 17: Damage Reports ───────────────────────────────────────────────────
export const getDamageReports = (params) => withLocal(
  () => api.get('/inventory/damage-reports', { params }),
  () => local.lsStub([])
)
export const createDamageReport = (data) => withLocal(
  () => api.post('/inventory/damage-reports', data),
  () => local.lsStub(data)
)
export const approveDamageReport = (id, data) => withLocal(
  () => api.post(`/inventory/damage-reports/${id}/approve`, data),
  () => local.lsStub({})
)
export const rejectDamageReport = (id, data) => withLocal(
  () => api.post(`/inventory/damage-reports/${id}/reject`, data),
  () => local.lsStub({})
)

// ── Phase 17: GRNs ─────────────────────────────────────────────────────────────
export const getGRNs = (params) => withLocal(
  () => api.get('/grns', { params }),
  () => local.lsStub([])
)
export const getGRN = (id) => withLocal(
  () => api.get(`/grns/${id}`),
  () => local.lsStub({})
)
export const confirmGRN = (id, data) => withLocal(
  () => api.post(`/grns/${id}/confirm`, data),
  () => local.lsStub({})
)
export const signOffGRN = (id, data) => withLocal(
  () => api.post(`/grns/${id}/sign-off`, data),
  () => local.lsStub({})
)

// ── Customers & Loyalty ───────────────────────────────────────────────────────

export const getCustomers = (params) => withLocal(
  () => api.get('/customers', { params }),
  () => local.lsGetCustomers(params)
)
export const lookupCustomer = (q) => withLocal(
  () => api.get('/customers/lookup', { params: { q } }),
  () => local.lsLookupCustomer(q)
)
export const getCustomer = (id) => withLocal(
  () => api.get(`/customers/${id}`),
  () => local.lsGetCustomer(id)
)
export const createCustomer = (data) => withLocal(
  () => api.post('/customers', data),
  () => local.lsCreateCustomer(data)
)
export const updateCustomer = (id, data) => withLocal(
  () => api.put(`/customers/${id}`, data),
  () => local.lsUpdateCustomer(id, data)
)
export const getCustomerTransactions = (id) => withLocal(
  () => api.get(`/customers/${id}/transactions`),
  () => local.lsStub([])
)

export const getLoyaltyTiers = () => withLocal(
  () => api.get('/loyalty/tiers'),
  () => local.lsStub([])
)
export const createLoyaltyTier = (data) => withLocal(
  () => api.post('/loyalty/tiers', data),
  () => local.lsStub(data)
)
export const updateLoyaltyTier = (id, data) => withLocal(
  () => api.put(`/loyalty/tiers/${id}`, data),
  () => local.lsStub(data)
)
export const deleteLoyaltyTier = (id) => withLocal(
  () => api.delete(`/loyalty/tiers/${id}`),
  () => local.lsStub({ deleted: true })
)
export const earnPoints = (data) => withLocal(
  () => api.post('/loyalty/earn', data),
  () => local.lsStub({})
)
export const redeemPoints = (data) => withLocal(
  () => api.post('/loyalty/redeem', data),
  () => local.lsStub({})
)
export const adjustPoints = (data) => withLocal(
  () => api.post('/loyalty/adjust', data),
  () => local.lsStub({})
)
export const getLoyaltyConfig = () => withLocal(
  () => api.get('/loyalty/config'),
  () => local.lsStub({})
)

// ── Terminals ─────────────────────────────────────────────────────────────────

export const getTerminals = () => withLocal(
  () => api.get('/terminals'),
  () => local.lsStub([])
)
export const registerTerminal = (data) => withLocal(
  () => api.post('/terminals/register', data),
  () => local.lsStub(data)
)
export const terminalHeartbeat = (terminal_id) => withLocal(
  () => api.post('/terminals/heartbeat', { terminal_id }),
  () => local.lsStub({})
)
export const getTerminalSales = (terminal_id, params) => withLocal(
  () => api.get(`/terminals/${terminal_id}/sales`, { params }),
  () => local.lsStub([])
)
export const updateTerminal = (id, data) => withLocal(
  () => api.put(`/terminals/${id}`, data),
  () => local.lsStub(data)
)

// ── Voids & No-sale ───────────────────────────────────────────────────────────

export const getVoidLogs = (params) => withLocal(
  () => api.get('/voids', { params }),
  () => local.lsStub([])
)
export const voidSaleWithPin = (data) => withLocal(
  () => api.post('/voids/void-sale', data),
  () => local.lsStub({})
)
export const recordNoSale = (data) => withLocal(
  () => api.post('/voids/no-sale', data),
  () => local.lsStub({})
)
export const getVoidStats = (params) => withLocal(
  () => api.get('/voids/stats', { params }),
  () => local.lsStub({})
)

// ── Scale ─────────────────────────────────────────────────────────────────────

export const readScale = () => withLocal(
  () => api.get('/scale/read'),
  () => local.lsStub({ weight: 0 })
)

// ── PLU lookup ────────────────────────────────────────────────────────────────

export const getProductByPlu = (plu) => withLocal(
  () => api.get(`/products/plu/${plu}`),
  () => local.lsGetProductByPlu(plu)
)

// ── Services & Service Categories ────────────────────────────────────────────

export const getServiceCategories = () => withLocal(
  () => api.get('/service-categories'),
  () => local.lsStub([])
)
export const createServiceCategory = (data) => withLocal(
  () => api.post('/service-categories', data),
  () => local.lsStub(data)
)
export const updateServiceCategory = (id, data) => withLocal(
  () => api.put(`/service-categories/${id}`, data),
  () => local.lsStub(data)
)
export const deleteServiceCategory = (id) => withLocal(
  () => api.delete(`/service-categories/${id}`),
  () => local.lsStub({ deleted: true })
)
export const getServices = (params) => withLocal(
  () => api.get('/services', { params }),
  () => local.lsStub([])
)
export const getService = (id) => withLocal(
  () => api.get(`/services/${id}`),
  () => local.lsStub({})
)
export const createService = (data) => withLocal(
  () => api.post('/services', data),
  () => local.lsStub(data)
)
export const updateService = (id, data) => withLocal(
  () => api.put(`/services/${id}`, data),
  () => local.lsStub(data)
)
export const deleteService = (id) => withLocal(
  () => api.delete(`/services/${id}`),
  () => local.lsStub({ deleted: true })
)

// ── Appointments ──────────────────────────────────────────────────────────────

export const getAppointments = (params) => withLocal(
  () => api.get('/appointments', { params }),
  () => local.lsStub([])
)
export const getAppointment = (id) => withLocal(
  () => api.get(`/appointments/${id}`),
  () => local.lsStub({})
)
export const createAppointment = (data) => withLocal(
  () => api.post('/appointments', data),
  () => local.lsStub(data)
)
export const updateAppointment = (id, data) => withLocal(
  () => api.put(`/appointments/${id}`, data),
  () => local.lsStub(data)
)
export const updateAppointmentStatus = (id, status) => withLocal(
  () => api.post(`/appointments/${id}/status`, { status }),
  () => local.lsStub({})
)
export const deleteAppointment = (id) => withLocal(
  () => api.delete(`/appointments/${id}`),
  () => local.lsStub({ deleted: true })
)
export const getClientAppointments = (clientId) => withLocal(
  () => api.get(`/appointments/by-client/${clientId}`),
  () => local.lsStub([])
)

// ── Dashboard ─────────────────────────────────────────────────────────────────

export const getDashboard = () => withLocal(
  () => api.get('/dashboard'),
  () => local.lsGetDashboard()
)
export const getManagerDashboard = () => withLocal(
  () => api.get('/dashboard/manager'),
  () => local.lsStub({ pending_approvals: { total: 0, returns: [], purchase_orders: [], grns: [], damage_reports: [] }, shift: null, alerts: { unprinted_shift_reports: 0, unfiled_shift_reports: 0, over_limit_accounts: 0, over_limit_details: [] }, last_sync: null })
)

// ── Phase 19: Invoices & Credit Notes ─────────────────────────────────────────

export const getSaleInvoice = (saleId) => withLocal(
  () => api.get(`/sales/${saleId}/invoice`),
  () => local.lsStub(null)
)
export const createSaleInvoice = (saleId, data) => withLocal(
  () => api.post(`/sales/${saleId}/invoice`, data),
  () => local.lsStub({})
)
export const getInvoices = (params) => withLocal(
  () => api.get('/invoices', { params }),
  () => local.lsStub([])
)
export const getInvoice = (id) => withLocal(
  () => api.get(`/invoices/${id}`),
  () => local.lsStub({})
)
export const voidInvoice = (id) => withLocal(
  () => api.post(`/invoices/${id}/void`),
  () => local.lsStub({})
)
export const getCustomerInvoices = (customerId) => withLocal(
  () => api.get(`/customers/${customerId}/invoices`),
  () => local.lsStub([])
)
export const getCreditNotes = (params) => withLocal(
  () => api.get('/credit-notes', { params }),
  () => local.lsStub([])
)
export const getCreditNote = (id) => withLocal(
  () => api.get(`/credit-notes/${id}`),
  () => local.lsStub({})
)

// ── Extended Reports ──────────────────────────────────────────────────────────

export const getReturnsReport = (params) => withLocal(
  () => api.get('/reports/returns', { params }),
  () => local.lsStub({})
)
export const getPurchasingReport = (params) => withLocal(
  () => api.get('/reports/purchasing', { params }),
  () => local.lsStub({})
)
export const getReportByCashier = (params) => withLocal(
  () => api.get('/reports/by-cashier', { params }),
  () => local.lsStub([])
)
export const getReportByCategory = (params) => withLocal(
  () => api.get('/reports/by-category', { params }),
  () => local.lsStub([])
)
export const getInventoryReport = () => withLocal(
  () => api.get('/reports/inventory'),
  () => local.lsStub([])
)
export const getExportCsvUrl = (params) => {
  const q = new URLSearchParams(params).toString()
  return `/api/reports/export/csv?${q}`
}

// ── Shift Reports (Phase 14 — filing system) ──────────────────────────────────

export const getShiftReports  = (params) => api.get('/shift-reports', { params })
export const getShiftReport   = (id)     => api.get(`/shift-reports/${id}`)
export const getPendingReports = ()      => api.get('/shift-reports/pending')
export const printShiftReport = (id)    => api.post(`/shift-reports/${id}/print`)
export const fileShiftReport  = (id, data) => api.post(`/shift-reports/${id}/file`, data)

// ── Store config ──────────────────────────────────────────────────────────────

export const getStoreConfig = () => withLocal(
  () => api.get('/stores/config'),
  () => local.lsGetStoreConfig()
)
export const updateStoreConfig = (data) => withLocal(
  () => api.put('/stores/config', data),
  () => local.lsUpdateStoreConfig(data)
)

// ── Quotes / Proforma Invoices ────────────────────────────────────────────────

export const getQuotes = (params) => withLocal(
  () => api.get('/quotes', { params }),
  () => local.lsGetQuotes(params)
)
export const getQuote = (id) => withLocal(
  () => api.get(`/quotes/${id}`),
  () => local.lsGetQuote(id)
)
export const createQuote = (data) => withLocal(
  () => api.post('/quotes', data),
  () => local.lsCreateQuote(data)
)
export const updateQuote = (id, data) => withLocal(
  () => api.put(`/quotes/${id}`, data),
  () => local.lsStub(data)
)
export const updateQuoteStatus = (id, status) => withLocal(
  () => api.post(`/quotes/${id}/status`, { status }),
  () => local.lsUpdateQuoteStatus(id, status)
)
export const convertQuote = (id, data) => withLocal(
  () => api.post(`/quotes/${id}/convert`, data),
  () => local.lsConvertQuote(id, data)
)
export const deleteQuote = (id) => withLocal(
  () => api.delete(`/quotes/${id}`),
  () => local.lsDeleteQuote(id)
)

// ── Customer Accounts ─────────────────────────────────────────────────────────

export const getAccounts = (params) => withLocal(
  () => api.get('/accounts', { params }),
  () => local.lsGetAccounts()
)
export const getAccount = (id) => withLocal(
  () => api.get(`/accounts/${id}`),
  () => local.lsGetAccount(id)
)
export const createAccount = (data) => withLocal(
  () => api.post('/accounts', data),
  () => local.lsCreateAccount(data)
)
export const updateAccount = (id, data) => withLocal(
  () => api.put(`/accounts/${id}`, data),
  () => local.lsUpdateAccount(id, data)
)
export const depositToAccount = (id, data) => withLocal(
  () => api.post(`/accounts/${id}/deposit`, data),
  () => local.lsDepositToAccount(id, data)
)
export const adjustAccount = (id, data) => withLocal(
  () => api.post(`/accounts/${id}/adjust`, data),
  () => local.lsAdjustAccount(id, data)
)
export const lookupAccount = (q) => withLocal(
  () => api.get('/accounts/lookup', { params: { q } }),
  () => local.lsLookupAccount(q)
)
export const getAccountByCustomer = (customerId) => withLocal(
  () => api.get(`/accounts/by-customer/${customerId}`),
  () => local.lsStub(null)
)
export const getAccountStatement = (id, params) => withLocal(
  () => api.get(`/accounts/${id}/statement`, { params }),
  () => local.lsStub({ account: {}, transactions: [], opening_balance: 0, closing_balance: 0 })
)
export const getAccountAlerts = () => withLocal(
  () => api.get('/accounts/alerts'),
  () => local.lsStub([])
)

// ── Audit Log ─────────────────────────────────────────────────────────────────

export const getAuditLogs = (params) => withLocal(
  () => api.get('/audit', { params }),
  () => local.lsGetAuditLogs(params)
)
export const getAuditUsers = () => withLocal(
  () => api.get('/audit/users'),
  () => local.lsStub([])
)

// ── Auth ──────────────────────────────────────────────────────────────────────

export const login = (pin, staffId, role) => withLocal(
  () => api.post('/auth/login', { personal_pin: pin, staff_id: staffId, role }),
  () => local.lsLogin(pin, staffId, role)
)
export const getMe = () => withLocal(
  () => api.get('/auth/me'),
  () => local.lsGetMe()
)
export const logout = () => withLocal(
  () => api.post('/auth/logout'),
  () => local.lsLogout()
)
export const authorizeAction = (data) => withLocal(
  () => api.post('/auth/authorize', data),
  () => local.lsAuthorize(data)
)
export const getCurrentShift = () => withLocal(
  () => api.get('/auth/current-shift'),
  () => local.lsGetCurrentShift()
)
export const generateAuthCard = (staffId) => withLocal(
  () => api.post(`/auth/generate-card/${staffId}`),
  () => local.lsStub({ auth_card_code: `MGR-OFFLINE-${staffId}` })
)
export const revokeAuthCard = (staffId) => withLocal(
  () => api.post(`/auth/revoke-card/${staffId}`),
  () => local.lsStub({})
)

// ── Cloud Sync ────────────────────────────────────────────────────────────────

export const getSyncStatus = () => withLocal(
  () => api.get('/sync/status'),
  () => local.lsStub({ status: 'offline', last_sync: null })
)
export const runSync = () => withLocal(
  () => api.post('/sync/run-sync'),
  () => local.lsStub({ synced: 0, message: 'Offline — no sync performed' })
)
export const getSyncLogs = (params) => withLocal(
  () => api.get('/sync/logs', { params }),
  () => local.lsStub([])
)
export const getCloudDashboard = () => withLocal(
  () => api.get('/sync/cloud-dashboard'),
  () => local.lsStub({})
)
export const markAllPending = () => withLocal(
  () => api.post('/sync/mark-all-pending'),
  () => local.lsStub({})
)

// ── Hardware ──────────────────────────────────────────────────────────────────

export const printReceipt = (saleId) => withLocal(
  () => api.post(`/hardware/print-receipt/${saleId}`),
  () => local.lsStub({ message: 'Offline — cannot print' })
)
export const openDrawer = () => withLocal(
  () => api.post('/hardware/open-drawer'),
  () => local.lsStub({ message: 'Offline — cannot open drawer' })
)
export const getHardwareStatus = () => withLocal(
  () => api.get('/hardware/status'),
  () => local.lsStub({ printer: { type: 'network' }, cash_drawer: { port: '/dev/ttyUSB0' } })
)

export default api
