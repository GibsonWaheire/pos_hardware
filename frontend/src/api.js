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

export default api
