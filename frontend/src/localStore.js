/**
 * localStore.js — complete browser-side data store using localStorage.
 *
 * Used automatically when the Flask backend is unreachable.
 * All functions return { data: ... } to match the axios response shape
 * so components need no changes.
 *
 * Data is stored under keys prefixed with "pos_hw_".
 * Call localStore.reset() in the console to wipe and re-seed.
 */

const K = {
  products:    'pos_hw_products',
  categories:  'pos_hw_categories',
  sales:       'pos_hw_sales',
  saleItems:   'pos_hw_sale_items',
  customers:   'pos_hw_customers',
  accounts:    'pos_hw_accounts',
  acctTxns:    'pos_hw_acct_txns',
  quotes:      'pos_hw_quotes',
  quoteItems:  'pos_hw_quote_items',
  staff:       'pos_hw_staff',
  suppliers:   'pos_hw_suppliers',
  purchaseOrders: 'pos_hw_pos',
  seeded:      'pos_hw_seeded',
}

// ── Storage helpers ─────────────────────────────────────────────────────────

function ls(key)       { try { return JSON.parse(localStorage.getItem(key)) ?? [] } catch { return [] } }
function save(key, v)  { localStorage.setItem(key, JSON.stringify(v)) }
function obj(key)      { try { return JSON.parse(localStorage.getItem(key)) ?? {} } catch { return {} } }
function nextId(arr)   { return arr.length ? Math.max(...arr.map(i => i.id)) + 1 : 1 }
function now()         { return new Date().toISOString() }
function ok(data)      { return { data } }  // mirrors axios response shape

function dateSeq(prefix, key) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const fullPrefix = `${prefix}-${today}-`
  const existing = ls(key).filter(x => (x.receipt_number || x.quote_number || '').startsWith(fullPrefix))
  const seq = existing.length + 1
  return `${fullPrefix}${String(seq).padStart(4, '0')}`
}

// ── Seed data ───────────────────────────────────────────────────────────────

function seed() {
  if (localStorage.getItem(K.seeded)) return

  save(K.categories, [
    { id: 1, name: 'Building Materials', tax_class: 'standard' },
    { id: 2, name: 'Plumbing',           tax_class: 'standard' },
    { id: 3, name: 'Electrical',         tax_class: 'standard' },
    { id: 4, name: 'Paint & Finishes',   tax_class: 'standard' },
    { id: 5, name: 'Hand Tools',         tax_class: 'standard' },
    { id: 6, name: 'Fasteners',          tax_class: 'standard' },
    { id: 7, name: 'Timber & Wood',      tax_class: 'standard' },
  ])

  save(K.products, [
    { id:1,  name:'Portland Cement 50kg',       barcode:'6001234000001', plu_code:null,  price:850,   tax_rate:0.16, stock_qty:200,  low_stock_threshold:20,  category_id:1, category_name:'Building Materials', is_active:true, is_weight_based:false, weight_unit:'kg',  age_restricted:false, age_restriction_type:null, min_age:0 },
    { id:2,  name:'River Sand',                 barcode:null,            plu_code:'S01', price:2500,  tax_rate:0.16, stock_qty:50,   low_stock_threshold:5,   category_id:1, category_name:'Building Materials', is_active:true, is_weight_based:true,  weight_unit:'ton', age_restricted:false, age_restriction_type:null, min_age:0 },
    { id:3,  name:'Ballast / Hardcore',         barcode:null,            plu_code:'S02', price:2200,  tax_rate:0.16, stock_qty:40,   low_stock_threshold:5,   category_id:1, category_name:'Building Materials', is_active:true, is_weight_based:true,  weight_unit:'ton', age_restricted:false, age_restriction_type:null, min_age:0 },
    { id:4,  name:'Steel Bar Y12 (6m)',         barcode:'6001234000004', plu_code:null,  price:1250,  tax_rate:0.16, stock_qty:300,  low_stock_threshold:30,  category_id:1, category_name:'Building Materials', is_active:true, is_weight_based:false, weight_unit:'kg',  age_restricted:false, age_restriction_type:null, min_age:0 },
    { id:5,  name:'Steel Bar Y16 (6m)',         barcode:'6001234000005', plu_code:null,  price:2200,  tax_rate:0.16, stock_qty:150,  low_stock_threshold:20,  category_id:1, category_name:'Building Materials', is_active:true, is_weight_based:false, weight_unit:'kg',  age_restricted:false, age_restriction_type:null, min_age:0 },
    { id:6,  name:'Roofing Sheet 32G (3m)',     barcode:'6001234000006', plu_code:null,  price:850,   tax_rate:0.16, stock_qty:500,  low_stock_threshold:50,  category_id:1, category_name:'Building Materials', is_active:true, is_weight_based:false, weight_unit:'kg',  age_restricted:false, age_restriction_type:null, min_age:0 },
    { id:7,  name:'Red Brick',                  barcode:'6001234000007', plu_code:'B01', price:25,    tax_rate:0.16, stock_qty:10000,low_stock_threshold:500, category_id:1, category_name:'Building Materials', is_active:true, is_weight_based:false, weight_unit:'kg',  age_restricted:false, age_restriction_type:null, min_age:0 },
    { id:8,  name:'PVC Pipe ½" (3m)',           barcode:'6001234000008', plu_code:null,  price:320,   tax_rate:0.16, stock_qty:80,   low_stock_threshold:10,  category_id:2, category_name:'Plumbing',           is_active:true, is_weight_based:false, weight_unit:'kg',  age_restricted:false, age_restriction_type:null, min_age:0 },
    { id:9,  name:'PVC Pipe 1" (3m)',           barcode:'6001234000009', plu_code:null,  price:480,   tax_rate:0.16, stock_qty:60,   low_stock_threshold:10,  category_id:2, category_name:'Plumbing',           is_active:true, is_weight_based:false, weight_unit:'kg',  age_restricted:false, age_restriction_type:null, min_age:0 },
    { id:10, name:'Ball Valve ½"',              barcode:'6001234000010', plu_code:null,  price:180,   tax_rate:0.16, stock_qty:40,   low_stock_threshold:5,   category_id:2, category_name:'Plumbing',           is_active:true, is_weight_based:false, weight_unit:'kg',  age_restricted:false, age_restriction_type:null, min_age:0 },
    { id:11, name:'Dulux Weathershield 4L',     barcode:'6001234000011', plu_code:null,  price:2400,  tax_rate:0.16, stock_qty:30,   low_stock_threshold:5,   category_id:4, category_name:'Paint & Finishes',   is_active:true, is_weight_based:false, weight_unit:'kg',  age_restricted:false, age_restriction_type:null, min_age:0 },
    { id:12, name:'Crown Paint Silk 4L',        barcode:'6001234000012', plu_code:null,  price:1800,  tax_rate:0.16, stock_qty:25,   low_stock_threshold:5,   category_id:4, category_name:'Paint & Finishes',   is_active:true, is_weight_based:false, weight_unit:'kg',  age_restricted:false, age_restriction_type:null, min_age:0 },
    { id:13, name:'Wire Nails 4"',              barcode:'6001234000013', plu_code:'N01', price:120,   tax_rate:0.16, stock_qty:100,  low_stock_threshold:10,  category_id:6, category_name:'Fasteners',          is_active:true, is_weight_based:true,  weight_unit:'kg',  age_restricted:false, age_restriction_type:null, min_age:0 },
    { id:14, name:'Roofing Nails',              barcode:'6001234000014', plu_code:'N02', price:140,   tax_rate:0.16, stock_qty:80,   low_stock_threshold:10,  category_id:6, category_name:'Fasteners',          is_active:true, is_weight_based:true,  weight_unit:'kg',  age_restricted:false, age_restriction_type:null, min_age:0 },
    { id:15, name:'Claw Hammer',                barcode:'6001234000015', plu_code:null,  price:450,   tax_rate:0.16, stock_qty:20,   low_stock_threshold:3,   category_id:5, category_name:'Hand Tools',         is_active:true, is_weight_based:false, weight_unit:'kg',  age_restricted:false, age_restriction_type:null, min_age:0 },
    { id:16, name:'Tape Measure 5m',            barcode:'6001234000016', plu_code:null,  price:250,   tax_rate:0.16, stock_qty:15,   low_stock_threshold:3,   category_id:5, category_name:'Hand Tools',         is_active:true, is_weight_based:false, weight_unit:'kg',  age_restricted:false, age_restriction_type:null, min_age:0 },
    { id:17, name:'Timber 2×4 (12ft)',          barcode:'6001234000017', plu_code:null,  price:650,   tax_rate:0.16, stock_qty:80,   low_stock_threshold:10,  category_id:7, category_name:'Timber & Wood',      is_active:true, is_weight_based:false, weight_unit:'kg',  age_restricted:false, age_restriction_type:null, min_age:0 },
    { id:18, name:'Plywood 18mm (4×8)',         barcode:'6001234000018', plu_code:null,  price:3200,  tax_rate:0.16, stock_qty:30,   low_stock_threshold:5,   category_id:7, category_name:'Timber & Wood',      is_active:true, is_weight_based:false, weight_unit:'kg',  age_restricted:false, age_restriction_type:null, min_age:0 },
    { id:19, name:'Electrical Wire 1.5mm (100m)',barcode:'6001234000019',plu_code:null,  price:3500,  tax_rate:0.16, stock_qty:15,   low_stock_threshold:3,   category_id:3, category_name:'Electrical',         is_active:true, is_weight_based:false, weight_unit:'kg',  age_restricted:false, age_restriction_type:null, min_age:0 },
    { id:20, name:'Single Switch (surface)',     barcode:'6001234000020', plu_code:null,  price:120,   tax_rate:0.16, stock_qty:50,   low_stock_threshold:5,   category_id:3, category_name:'Electrical',         is_active:true, is_weight_based:false, weight_unit:'kg',  age_restricted:false, age_restriction_type:null, min_age:0 },
  ])

  save(K.staff, [
    { id:1, name:'Admin',     pin:'0000', role:'admin',    is_active:true },
    { id:2, name:'Cashier 1', pin:'1234', role:'cashier',  is_active:true },
  ])

  save(K.sales,          [])
  save(K.saleItems,      [])
  save(K.customers,      [])
  save(K.accounts,       [])
  save(K.acctTxns,       [])
  save(K.quotes,         [])
  save(K.quoteItems,     [])
  save(K.suppliers,      [])
  save(K.purchaseOrders, [])

  localStorage.setItem(K.seeded, '1')
  console.info('[localStore] Seeded demo hardware store data')
}

// ── Products ────────────────────────────────────────────────────────────────

export function lsGetProducts({ q = '', active } = {}) {
  let items = ls(K.products)
  if (active === 'true') items = items.filter(p => p.is_active)
  if (q) {
    const lq = q.toLowerCase()
    items = items.filter(p =>
      p.name.toLowerCase().includes(lq) ||
      (p.barcode || '').includes(q) ||
      (p.plu_code || '').toLowerCase().includes(lq)
    )
  }
  return ok(items)
}

export function lsGetProductByBarcode(barcode) {
  const p = ls(K.products).find(p => p.barcode === barcode)
  if (!p) throw new Error('Product not found')
  return ok(p)
}

export function lsGetProductByPlu(plu) {
  const p = ls(K.products).find(p => p.plu_code === plu)
  if (!p) throw new Error('Product not found')
  return ok(p)
}

export function lsCreateProduct(data) {
  const products = ls(K.products)
  const cat = ls(K.categories).find(c => c.id === data.category_id)
  const product = {
    id: nextId(products),
    name: data.name,
    barcode: data.barcode || null,
    plu_code: data.plu_code || null,
    price: parseFloat(data.price),
    tax_rate: parseFloat(data.tax_rate || 0.16),
    is_weight_based: !!data.is_weight_based,
    weight_unit: data.weight_unit || 'kg',
    age_restricted: !!data.age_restricted,
    age_restriction_type: data.age_restriction_type || null,
    min_age: data.min_age || 18,
    stock_qty: parseInt(data.stock_qty || 0),
    low_stock_threshold: parseInt(data.low_stock_threshold || 5),
    category_id: data.category_id || null,
    category_name: cat?.name || null,
    is_active: true,
    created_at: now(),
  }
  save(K.products, [...products, product])
  return ok(product)
}

export function lsUpdateProduct(id, data) {
  const products = ls(K.products)
  const cat = data.category_id ? ls(K.categories).find(c => c.id === data.category_id) : null
  const updated = products.map(p => p.id !== id ? p : {
    ...p, ...data,
    category_name: cat?.name ?? p.category_name,
  })
  save(K.products, updated)
  return ok(updated.find(p => p.id === id))
}

export function lsDeleteProduct(id) {
  save(K.products, ls(K.products).filter(p => p.id !== id))
  return ok({ deleted: true })
}

export function lsGetCategories() {
  return ok(ls(K.categories))
}

export function lsCreateCategory(data) {
  const categories = ls(K.categories)
  const cat = { id: nextId(categories), name: data.name, tax_class: data.tax_class || 'standard' }
  save(K.categories, [...categories, cat])
  return ok(cat)
}

export function lsGetLowStock() {
  const products = ls(K.products).filter(p => p.is_active && p.stock_qty <= p.low_stock_threshold)
  return ok(products)
}

// ── Sales ───────────────────────────────────────────────────────────────────

export function lsCreateSale(data) {
  const sales    = ls(K.sales)
  const allItems = ls(K.saleItems)
  const products = ls(K.products)

  const itemsData = data.items || []
  const saleId    = nextId(sales)
  let subtotal = 0, tax = 0, disc = 0

  const builtItems = itemsData.map((it, idx) => {
    const qty       = parseInt(it.qty || 1)
    const unitPrice = parseFloat(it.unit_price || 0)
    const discount  = parseFloat(it.discount || 0)
    const taxRate   = parseFloat(it.tax_rate || 0)
    const linePre   = (unitPrice - discount) * qty
    const lineTax   = linePre * taxRate
    const lineTotal = linePre + lineTax
    subtotal += unitPrice * qty
    disc     += discount * qty
    tax      += lineTax

    // Deduct stock
    if (it.product_id) {
      const idx2 = products.findIndex(p => p.id === it.product_id)
      if (idx2 !== -1) products[idx2].stock_qty = Math.max(0, products[idx2].stock_qty - qty)
    }

    return {
      id: allItems.length + idx + 1,
      sale_id: saleId,
      product_id: it.product_id || null,
      product_name: it.product_name,
      unit_price: unitPrice,
      qty,
      weight: it.weight || null,
      discount,
      tax_rate: taxRate,
      line_total: Math.round(lineTotal * 100) / 100,
      item_type: 'product',
      service_id: null,
      staff_id: null,
      staff_name: null,
    }
  })

  save(K.products, products)

  const total      = Math.round((subtotal - disc + tax) * 100) / 100
  const cashTend   = parseFloat(data.cash_tendered || 0)
  const changeGiv  = data.payment_method === 'cash' ? Math.max(0, cashTend - total) : 0

  // Account payment
  let acctBalBefore = null, acctBalAfter = null
  if (data.payment_method === 'account' && data.account_id) {
    const accounts = ls(K.accounts)
    const ai = accounts.findIndex(a => a.id === data.account_id)
    if (ai !== -1) {
      acctBalBefore = accounts[ai].balance
      accounts[ai].balance = Math.round((accounts[ai].balance - total) * 100) / 100
      accounts[ai].total_charged = Math.round((accounts[ai].total_charged + total) * 100) / 100
      acctBalAfter = accounts[ai].balance
      save(K.accounts, accounts)

      // Account transaction
      const txns = ls(K.acctTxns)
      txns.push({
        id: nextId(txns), account_id: data.account_id,
        type: 'charge', amount: -total, balance_after: acctBalAfter,
        sale_id: saleId, receipt_number: null,
        payment_method: null, mpesa_ref: null,
        cashier_name: data.cashier_name || '',
        notes: `Sale charged to account`, created_at: now(),
      })
      save(K.acctTxns, txns)
    }
  }

  const sale = {
    id: saleId,
    receipt_number: dateSeq('RCP', K.sales),
    subtotal:        Math.round(subtotal * 100) / 100,
    tax_amount:      Math.round(tax * 100) / 100,
    discount_total:  Math.round(disc * 100) / 100,
    total,
    payment_method:  data.payment_method || 'cash',
    cash_tendered:   cashTend || null,
    change_given:    changeGiv,
    card_amount:     parseFloat(data.card_amount || 0),
    cashier_name:    data.cashier_name || '',
    customer_id:     data.customer_id || null,
    customer_name:   data.customer_name || null,
    mpesa_ref:       data.mpesa_ref || null,
    account_id:      data.account_id || null,
    account_balance_before: acctBalBefore,
    account_balance_after:  acctBalAfter,
    loyalty_points_earned:  0,
    loyalty_points_redeemed: 0,
    loyalty_discount: 0,
    status:          'completed',
    offline_id:      data.offline_id || null,
    created_at:      now(),
    items:           builtItems,
  }

  save(K.sales, [...sales, sale])
  save(K.saleItems, [...allItems, ...builtItems])
  return ok(sale)
}

export function lsGetSales({ date_from, date_to, status = 'completed', limit = 100 } = {}) {
  let sales = ls(K.sales)
  if (status)    sales = sales.filter(s => s.status === status)
  if (date_from) sales = sales.filter(s => s.created_at >= date_from)
  if (date_to)   sales = sales.filter(s => s.created_at <= date_to)
  return ok(sales.reverse().slice(0, limit))
}

export function lsGetSale(id) {
  const s = ls(K.sales).find(s => s.id === id)
  if (!s) throw new Error('Sale not found')
  return ok(s)
}

export function lsGetDailyTotals(date) {
  const day = date || new Date().toISOString().slice(0, 10)
  const sales = ls(K.sales).filter(s => s.status === 'completed' && s.created_at.startsWith(day))
  return ok({
    date: day,
    transaction_count: sales.length,
    total_revenue:  Math.round(sales.reduce((s, x) => s + x.total, 0) * 100) / 100,
    total_tax:      Math.round(sales.reduce((s, x) => s + x.tax_amount, 0) * 100) / 100,
    total_discounts:Math.round(sales.reduce((s, x) => s + x.discount_total, 0) * 100) / 100,
    cash_sales:     Math.round(sales.filter(x => x.payment_method === 'cash').reduce((s, x) => s + x.total, 0) * 100) / 100,
    card_sales:     Math.round(sales.filter(x => x.payment_method === 'card').reduce((s, x) => s + x.total, 0) * 100) / 100,
    split_sales:    Math.round(sales.filter(x => x.payment_method === 'split').reduce((s, x) => s + x.total, 0) * 100) / 100,
    mpesa_sales:    Math.round(sales.filter(x => x.payment_method === 'mpesa').reduce((s, x) => s + x.total, 0) * 100) / 100,
    account_sales:  Math.round(sales.filter(x => x.payment_method === 'account').reduce((s, x) => s + x.total, 0) * 100) / 100,
  })
}

// ── Customers ────────────────────────────────────────────────────────────────

export function lsGetCustomers({ q = '', limit = 100 } = {}) {
  let items = ls(K.customers)
  if (q) {
    const lq = q.toLowerCase()
    items = items.filter(c => c.name.toLowerCase().includes(lq) || (c.phone || '').includes(q))
  }
  return ok(items.slice(0, limit))
}

export function lsLookupCustomer(q) {
  const lq = q.toLowerCase()
  const c = ls(K.customers).find(c =>
    c.name.toLowerCase().includes(lq) || (c.phone || '').includes(q) || String(c.id) === q
  )
  return ok(c ? { found: true, customer: c } : { found: false })
}

export function lsGetCustomer(id) {
  const c = ls(K.customers).find(c => c.id === id)
  if (!c) throw new Error('Customer not found')
  return ok(c)
}

export function lsCreateCustomer(data) {
  const customers = ls(K.customers)
  const c = {
    id: nextId(customers),
    name: data.name,
    phone: data.phone || null,
    email: data.email || null,
    loyalty_points: 0,
    tier_name: null,
    tier_color: null,
    tier_discount_percent: 0,
    created_at: now(),
  }
  save(K.customers, [...customers, c])
  return ok(c)
}

export function lsUpdateCustomer(id, data) {
  const customers = ls(K.customers)
  const updated = customers.map(c => c.id !== id ? c : { ...c, ...data })
  save(K.customers, updated)
  return ok(updated.find(c => c.id === id))
}

// ── Customer Accounts ────────────────────────────────────────────────────────

export function lsGetAccounts() {
  return ok(ls(K.accounts).filter(a => a.is_active))
}

export function lsGetAccount(id) {
  const a = ls(K.accounts).find(a => a.id === id)
  if (!a) throw new Error('Account not found')
  const txns = ls(K.acctTxns).filter(t => t.account_id === id)
  return ok({ ...a, transactions: txns })
}

export function lsCreateAccount(data) {
  const accounts = ls(K.accounts)
  const a = {
    id: nextId(accounts),
    customer_id: data.customer_id || null,
    customer_name: data.customer_name,
    customer_phone: data.customer_phone || '',
    balance: 0,
    total_deposited: 0,
    total_charged: 0,
    credit_limit: parseFloat(data.credit_limit || 0),
    is_active: true,
    notes: data.notes || null,
    created_at: now(),
  }
  save(K.accounts, [...accounts, a])
  return ok(a)
}

export function lsUpdateAccount(id, data) {
  const accounts = ls(K.accounts)
  const updated = accounts.map(a => a.id !== id ? a : { ...a, ...data })
  save(K.accounts, updated)
  return ok(updated.find(a => a.id === id))
}

export function lsDepositToAccount(id, data) {
  const accounts = ls(K.accounts)
  const ai = accounts.findIndex(a => a.id === id)
  if (ai === -1) throw new Error('Account not found')
  const amount = parseFloat(data.amount)
  accounts[ai].balance         = Math.round((accounts[ai].balance + amount) * 100) / 100
  accounts[ai].total_deposited = Math.round((accounts[ai].total_deposited + amount) * 100) / 100
  save(K.accounts, accounts)

  // Generate receipt number for deposit
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const prefix = `DEP-${today}-`
  const txns = ls(K.acctTxns)
  const seq = txns.filter(t => (t.receipt_number || '').startsWith(prefix)).length + 1
  const txn = {
    id: nextId(txns),
    account_id: id,
    type: 'deposit',
    amount,
    balance_after: accounts[ai].balance,
    sale_id: null,
    receipt_number: `${prefix}${String(seq).padStart(4, '0')}`,
    payment_method: data.payment_method || 'cash',
    mpesa_ref: data.mpesa_ref || null,
    cashier_name: data.cashier_name || '',
    notes: data.notes || null,
    created_at: now(),
  }
  save(K.acctTxns, [...txns, txn])
  return ok({ account: accounts[ai], transaction: txn })
}

export function lsAdjustAccount(id, data) {
  const accounts = ls(K.accounts)
  const ai = accounts.findIndex(a => a.id === id)
  if (ai === -1) throw new Error('Account not found')
  const amount = parseFloat(data.amount)
  accounts[ai].balance = Math.round((accounts[ai].balance + amount) * 100) / 100
  save(K.accounts, accounts)
  const txns = ls(K.acctTxns)
  const txn = {
    id: nextId(txns), account_id: id, type: 'adjustment',
    amount, balance_after: accounts[ai].balance, sale_id: null,
    receipt_number: null, payment_method: null, mpesa_ref: null,
    cashier_name: data.cashier_name || '', notes: data.notes || null, created_at: now(),
  }
  save(K.acctTxns, [...txns, txn])
  return ok({ account: accounts[ai], transaction: txn })
}

export function lsLookupAccount(q) {
  const lq = q.toLowerCase()
  const results = ls(K.accounts).filter(a =>
    a.is_active && (
      a.customer_name.toLowerCase().includes(lq) ||
      (a.customer_phone || '').includes(q)
    )
  )
  return ok(results)
}

// ── Quotes ───────────────────────────────────────────────────────────────────

export function lsGetQuotes({ status, q, limit = 100 } = {}) {
  let items = ls(K.quotes)
  if (status) items = items.filter(x => x.status === status)
  if (q) {
    const lq = q.toLowerCase()
    items = items.filter(x =>
      (x.customer_name || '').toLowerCase().includes(lq) ||
      (x.quote_number || '').toLowerCase().includes(lq) ||
      (x.customer_phone || '').includes(q)
    )
  }
  return ok(items.reverse().slice(0, limit))
}

export function lsGetQuote(id) {
  const q = ls(K.quotes).find(x => x.id === id)
  if (!q) throw new Error('Quote not found')
  const items = ls(K.quoteItems).filter(i => i.quote_id === id)
  return ok({ ...q, items })
}

export function lsCreateQuote(data) {
  const quotes = ls(K.quotes)
  const allQItems = ls(K.quoteItems)
  const qId = nextId(quotes)

  const itemsData = data.items || []
  let subtotal = 0, tax = 0, disc = 0

  const builtItems = itemsData.map((it, idx) => {
    const qty       = parseInt(it.qty || 1)
    const unitPrice = parseFloat(it.unit_price || 0)
    const discount  = parseFloat(it.discount || 0)
    const taxRate   = parseFloat(it.tax_rate || 0)
    const linePre   = (unitPrice - discount) * qty
    const lineTax   = linePre * taxRate
    const lineTotal = linePre + lineTax
    subtotal += unitPrice * qty
    disc     += discount * qty
    tax      += lineTax
    return {
      id: allQItems.length + idx + 1,
      quote_id: qId,
      product_id: it.product_id || null,
      product_name: it.product_name,
      unit_price: unitPrice,
      qty, discount, tax_rate: taxRate,
      line_total: Math.round(lineTotal * 100) / 100,
      notes: it.notes || null,
    }
  })

  const total = Math.round((subtotal - disc + tax) * 100) / 100

  // Generate quote number
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const prefix = `QUO-${today}-`
  const seq = quotes.filter(q => (q.quote_number || '').startsWith(prefix)).length + 1
  const quoteNumber = `${prefix}${String(seq).padStart(4, '0')}`

  const quote = {
    id: qId,
    quote_number: quoteNumber,
    customer_id: data.customer_id || null,
    customer_name: data.customer_name || '',
    customer_phone: data.customer_phone || '',
    account_id: data.account_id || null,
    status: 'draft',
    subtotal: Math.round(subtotal * 100) / 100,
    tax_amount: Math.round(tax * 100) / 100,
    discount_total: Math.round(disc * 100) / 100,
    total,
    notes: data.notes || null,
    valid_until: data.valid_until || null,
    cashier_name: data.cashier_name || '',
    sale_id: null,
    converted_at: null,
    created_at: now(),
    items: builtItems,
  }

  save(K.quotes, [...quotes, quote])
  save(K.quoteItems, [...allQItems, ...builtItems])
  return ok(quote)
}

export function lsUpdateQuoteStatus(id, status) {
  const quotes = ls(K.quotes)
  const updated = quotes.map(q => q.id !== id ? q : { ...q, status })
  save(K.quotes, updated)
  const found = updated.find(q => q.id === id)
  return ok({ ...found, items: ls(K.quoteItems).filter(i => i.quote_id === id) })
}

export function lsConvertQuote(id, data) {
  const quotes = ls(K.quotes)
  const qi = quotes.findIndex(q => q.id === id)
  if (qi === -1) throw new Error('Quote not found')
  const quote = quotes[qi]
  const items = ls(K.quoteItems).filter(i => i.quote_id === id)

  // Create sale from quote items
  const saleResult = lsCreateSale({
    items: items.map(it => ({
      product_id: it.product_id,
      product_name: it.product_name,
      unit_price: it.unit_price,
      qty: it.qty,
      discount: it.discount,
      tax_rate: it.tax_rate,
    })),
    payment_method: data.payment_method || 'cash',
    cash_tendered: quote.total,
    cashier_name: data.cashier_name || quote.cashier_name || '',
    customer_id: quote.customer_id,
    customer_name: quote.customer_name,
    mpesa_ref: data.mpesa_ref || null,
    account_id: data.account_id || quote.account_id || null,
  })

  const sale = saleResult.data
  quotes[qi] = { ...quote, status: 'converted', sale_id: sale.id, converted_at: now() }
  save(K.quotes, quotes)

  return ok({ quote: { ...quotes[qi], items }, sale })
}

export function lsDeleteQuote(id) {
  save(K.quotes, ls(K.quotes).filter(q => q.id !== id))
  save(K.quoteItems, ls(K.quoteItems).filter(i => i.quote_id !== id))
  return ok({ deleted: true })
}

// ── Staff ────────────────────────────────────────────────────────────────────

export function lsGetStaff() {
  return ok(ls(K.staff))
}

export function lsVerifyPin(pin) {
  const s = ls(K.staff).find(s => s.pin === pin && s.is_active)
  return ok(s ? { found: true, staff: s } : { found: false })
}

// ── Suppliers ────────────────────────────────────────────────────────────────

export function lsGetSuppliers() {
  return ok(ls(K.suppliers))
}

export function lsCreateSupplier(data) {
  const suppliers = ls(K.suppliers)
  const s = { id: nextId(suppliers), ...data, is_active: true, created_at: now() }
  save(K.suppliers, [...suppliers, s])
  return ok(s)
}

export function lsUpdateSupplier(id, data) {
  const suppliers = ls(K.suppliers).map(s => s.id !== id ? s : { ...s, ...data })
  save(K.suppliers, suppliers)
  return ok(suppliers.find(s => s.id === id))
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export function lsGetDashboard() {
  const allSales = ls(K.sales).filter(s => s.status === 'completed')
  const todayStr = new Date().toISOString().slice(0, 10)

  const rangeRevenue = (days) => {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString()
    const s = allSales.filter(x => x.created_at >= cutoff)
    const rev = s.reduce((a, x) => a + x.total, 0)
    return { transactions: s.length, revenue: Math.round(rev * 100) / 100, avg_sale: s.length ? Math.round(rev / s.length * 100) / 100 : 0 }
  }

  const today   = allSales.filter(s => s.created_at.startsWith(todayStr))
  const todayRev = today.reduce((a, x) => a + x.total, 0)

  // Hourly (today)
  const hourly = Array.from({ length: 24 }, (_, h) => {
    const s = today.filter(x => new Date(x.created_at).getHours() === h)
    return { hour: h, transactions: s.length, revenue: Math.round(s.reduce((a, x) => a + x.total, 0) * 100) / 100 }
  })

  // 14-day trend
  const daily_trend = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10)
    const s = allSales.filter(x => x.created_at.startsWith(d))
    return { date: d, transactions: s.length, revenue: Math.round(s.reduce((a, x) => a + x.total, 0) * 100) / 100 }
  })

  // Top items (30 days)
  const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString()
  const recentItems = ls(K.saleItems).filter(i => {
    const sale = allSales.find(s => s.id === i.sale_id)
    return sale && sale.created_at >= cutoff30
  })
  const itemMap = {}
  recentItems.forEach(i => {
    if (!itemMap[i.product_name]) itemMap[i.product_name] = { name: i.product_name, qty: 0, revenue: 0 }
    itemMap[i.product_name].qty     += i.qty
    itemMap[i.product_name].revenue += i.line_total
  })
  const top_items = Object.values(itemMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)
    .map(x => ({ ...x, revenue: Math.round(x.revenue * 100) / 100 }))

  // Payment split (today)
  const payMap = {}
  today.forEach(s => {
    if (!payMap[s.payment_method]) payMap[s.payment_method] = { method: s.payment_method, count: 0, total: 0 }
    payMap[s.payment_method].count++
    payMap[s.payment_method].total += s.total
  })
  const payment_split = Object.values(payMap).map(x => ({ ...x, total: Math.round(x.total * 100) / 100 }))

  // Inventory alerts
  const products = ls(K.products).filter(p => p.is_active)
  const low_stock    = products.filter(p => p.stock_qty > 0 && p.stock_qty <= p.low_stock_threshold).length
  const out_of_stock = products.filter(p => p.stock_qty === 0).length

  // Accounts overview
  const accounts    = ls(K.accounts).filter(a => a.is_active)
  const totalCredit = accounts.filter(a => a.balance > 0).reduce((s, a) => s + a.balance, 0)
  const totalDebt   = accounts.filter(a => a.balance < 0).reduce((s, a) => s + (-a.balance), 0)

  return ok({
    today: { ...rangeRevenue(0), revenue: Math.round(todayRev * 100) / 100, transactions: today.length, avg_sale: today.length ? Math.round(todayRev / today.length * 100) / 100 : 0, new_customers: 0 },
    week:  rangeRevenue(7),
    month: rangeRevenue(30),
    hourly,
    daily_trend,
    top_items,
    payment_split,
    inventory: { low_stock, out_of_stock },
    purchase_orders: { pending: ls(K.purchaseOrders).filter(p => ['draft','ordered'].includes(p.status)).length },
    accounts: {
      count: accounts.length,
      total_balance: Math.round((totalCredit - totalDebt) * 100) / 100,
      total_credit:  Math.round(totalCredit * 100) / 100,
      total_debt:    Math.round(totalDebt * 100) / 100,
      accounts_in_debt: accounts.filter(a => a.balance < 0).length,
    },
  })
}

// ── Store config ──────────────────────────────────────────────────────────────

export function lsGetStoreConfig() {
  const cfg = obj('pos_hw_store_config')
  return ok({ id: 1, name: cfg.name || 'My Hardware Store', address: cfg.address || '', phone: cfg.phone || '', email: cfg.email || '', currency: cfg.currency || 'KES', timezone: cfg.timezone || 'Africa/Nairobi', tax_number: cfg.tax_number || '', receipt_header: cfg.receipt_header || '', receipt_footer: cfg.receipt_footer || '', ...cfg })
}

export function lsUpdateStoreConfig(data) {
  const existing = obj('pos_hw_store_config')
  const updated = { ...existing, ...data }
  localStorage.setItem('pos_hw_store_config', JSON.stringify(updated))
  return ok(updated)
}

// ── Stub responses for rarely-used endpoints ─────────────────────────────────

export function lsStub(data = []) { return ok(data) }

// ── Init ─────────────────────────────────────────────────────────────────────

seed()

// Expose reset helper in dev console
window.__posReset = () => {
  Object.values(K).forEach(k => localStorage.removeItem(k))
  localStorage.removeItem('pos_hw_store_config')
  console.info('[localStore] Reset complete — refresh the page')
}
