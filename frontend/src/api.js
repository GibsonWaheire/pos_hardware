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

export default api
