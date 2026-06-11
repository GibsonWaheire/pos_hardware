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

const DEPT_PINS = { '0000':'admin','1111':'manager','2222':'cashier','3333':'inventory','4444':'purchasing' }

const K = {
  products:    'pos_hw_products',
  categories:  'pos_hw_categories',
  sales:       'pos_hw_sales',
  auditLogs:   'pos_hw_audit_logs',
  saleItems:   'pos_hw_sale_items',
  customers:   'pos_hw_customers',
  accounts:    'pos_hw_accounts',
  acctTxns:    'pos_hw_acct_txns',
  quotes:      'pos_hw_quotes',
  quoteItems:  'pos_hw_quote_items',
  staff:       'pos_hw_staff',
  suppliers:   'pos_hw_suppliers',
  purchaseOrders: 'pos_hw_pos',
  shifts:      'pos_hw_shifts',
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
    { id: 1, name: 'Cement & Aggregates',   tax_class: 'standard' },
    { id: 2, name: 'Steel & Reinforcement', tax_class: 'standard' },
    { id: 3, name: 'Roofing',              tax_class: 'standard' },
    { id: 4, name: 'Timber & Wood',        tax_class: 'standard' },
    { id: 5, name: 'Paint & Finishes',     tax_class: 'standard' },
    { id: 6, name: 'Plumbing',             tax_class: 'standard' },
    { id: 7, name: 'Electrical',           tax_class: 'standard' },
    { id: 8, name: 'Fasteners & Fixings',  tax_class: 'standard' },
    { id: 9, name: 'Hardware & Tools',     tax_class: 'standard' },
  ])

  // Helper for offline product seed — price=0 means client must set
  function prod(id, name, plu, catId, catName, wb, unit, stock, threshold) {
    return { id, name, barcode: null, plu_code: plu, price: 0, tax_rate: 0.16,
             stock_qty: stock, low_stock_threshold: threshold, category_id: catId,
             category_name: catName, is_active: true, is_weight_based: wb,
             weight_unit: unit, age_restricted: false, age_restriction_type: null, min_age: 0 }
  }
  const CA='Cement & Aggregates', ST='Steel & Reinforcement', RO='Roofing'
  const TW='Timber & Wood', PA='Paint & Finishes', PL='Plumbing'
  const EL='Electrical', FA='Fasteners & Fixings', HT='Hardware & Tools'
  save(K.products, [
    prod(1,  'Bamburi Cement 50kg',       'C01', 1, CA,  false,'pce', 0, 20),
    prod(2,  'Savannah Cement 50kg',      'C02', 1, CA,  false,'pce', 0, 20),
    prod(3,  'Mombasa Cement 50kg',       'C03', 1, CA,  false,'pce', 0, 20),
    prod(4,  'River Sand',                'S01', 1, CA,  true, 'tonne',0, 5),
    prod(5,  'Ballast / Hardcore',        'S02', 1, CA,  true, 'tonne',0, 5),
    prod(6,  'Crushed Stone',             'S03', 1, CA,  true, 'tonne',0, 5),
    prod(7,  'Steel Bar Y8 (6m)',         'R01', 2, ST,  false,'pce', 0, 20),
    prod(8,  'Steel Bar Y10 (6m)',        'R02', 2, ST,  false,'pce', 0, 20),
    prod(9,  'Steel Bar Y12 (6m)',        'R03', 2, ST,  false,'pce', 0, 20),
    prod(10, 'Steel Bar Y16 (6m)',        'R04', 2, ST,  false,'pce', 0, 20),
    prod(11, 'Steel Bar Y20 (6m)',        'R05', 2, ST,  false,'pce', 0, 10),
    prod(12, 'Round Bar R6 (6m)',         'R06', 2, ST,  false,'pce', 0, 10),
    prod(13, 'Binding Wire',              'R07', 2, ST,  true, 'kg',  0,  5),
    prod(14, 'BRC Mesh A142',             'R08', 2, ST,  false,'pce', 0, 10),
    prod(15, 'BRC Mesh A193',             'R09', 2, ST,  false,'pce', 0, 10),
    prod(16, 'Mabati G28 2m',             'M01', 3, RO,  false,'pce', 0, 20),
    prod(17, 'Mabati G28 2.5m',           'M02', 3, RO,  false,'pce', 0, 20),
    prod(18, 'Mabati G28 3m',             'M03', 3, RO,  false,'pce', 0, 20),
    prod(19, 'Mabati G30 2m',             'M04', 3, RO,  false,'pce', 0, 20),
    prod(20, 'Mabati G30 2.5m',           'M05', 3, RO,  false,'pce', 0, 20),
    prod(21, 'Mabati G30 3m',             'M06', 3, RO,  false,'pce', 0, 20),
    prod(22, 'Mabati G32 2m',             'M07', 3, RO,  false,'pce', 0, 10),
    prod(23, 'Mabati G32 3m',             'M08', 3, RO,  false,'pce', 0, 10),
    prod(24, 'Ridge Cap',                 'M09', 3, RO,  false,'pce', 0,  5),
    prod(25, 'Roofing Nails',             'M10', 3, RO,  true, 'kg',  0,  5),
    prod(26, 'Screw Cap Nails',           'M11', 3, RO,  true, 'kg',  0,  5),
    prod(27, 'Timber 2x2 (per ft)',       'T01', 4, TW,  false,'ft',  0, 50),
    prod(28, 'Timber 2x4 (per ft)',       'T02', 4, TW,  false,'ft',  0, 50),
    prod(29, 'Timber 2x6 (per ft)',       'T03', 4, TW,  false,'ft',  0, 30),
    prod(30, 'Timber 3x2 (per ft)',       'T04', 4, TW,  false,'ft',  0, 30),
    prod(31, 'Plywood 18mm 4x8',          'T05', 4, TW,  false,'pce', 0,  5),
    prod(32, 'Plywood 12mm 4x8',          'T06', 4, TW,  false,'pce', 0,  5),
    prod(33, 'Blockboard 18mm 4x8',       'T07', 4, TW,  false,'pce', 0,  5),
    prod(34, 'MDF 18mm 4x8',              'T08', 4, TW,  false,'pce', 0,  5),
    prod(35, 'Crown Emulsion 1L',         'P01', 5, PA,  false,'pce', 0,  5),
    prod(36, 'Crown Emulsion 4L',         'P02', 5, PA,  false,'pce', 0,  5),
    prod(37, 'Crown Emulsion 20L',        'P03', 5, PA,  false,'pce', 0,  3),
    prod(38, 'Crown Gloss 1L',            'P04', 5, PA,  false,'pce', 0,  5),
    prod(39, 'Crown Gloss 4L',            'P05', 5, PA,  false,'pce', 0,  5),
    prod(40, 'Crown Gloss 20L',           'P06', 5, PA,  false,'pce', 0,  3),
    prod(41, 'Sadolin Superdec 1L',       'P07', 5, PA,  false,'pce', 0,  5),
    prod(42, 'Sadolin Superdec 4L',       'P08', 5, PA,  false,'pce', 0,  5),
    prod(43, 'Basco Emulsion 4L',         'P09', 5, PA,  false,'pce', 0,  5),
    prod(44, 'Basco Gloss 4L',            'P10', 5, PA,  false,'pce', 0,  5),
    prod(45, 'Undercoat 4L',              'P11', 5, PA,  false,'pce', 0,  5),
    prod(46, 'Paint Thinner 1L',          'P12', 5, PA,  false,'pce', 0,  5),
    prod(47, 'PPR Pipe 1/2" (4m)',        'W01', 6, PL,  false,'pce', 0, 10),
    prod(48, 'PPR Pipe 3/4" (4m)',        'W02', 6, PL,  false,'pce', 0, 10),
    prod(49, 'PPR Pipe 1" (4m)',          'W03', 6, PL,  false,'pce', 0, 10),
    prod(50, 'PVC Waste Pipe 2" (3m)',    'W04', 6, PL,  false,'pce', 0,  5),
    prod(51, 'PVC Waste Pipe 3" (3m)',    'W05', 6, PL,  false,'pce', 0,  5),
    prod(52, 'PVC Waste Pipe 4" (3m)',    'W06', 6, PL,  false,'pce', 0,  5),
    prod(53, 'PPR Elbow 1/2"',           'W07', 6, PL,  false,'pce', 0,  5),
    prod(54, 'PPR Elbow 3/4"',           'W08', 6, PL,  false,'pce', 0,  5),
    prod(55, 'PPR Tee 1/2"',             'W09', 6, PL,  false,'pce', 0,  5),
    prod(56, 'Ball Valve 1/2"',          'W10', 6, PL,  false,'pce', 0,  5),
    prod(57, 'Ball Valve 3/4"',          'W11', 6, PL,  false,'pce', 0,  5),
    prod(58, 'Gate Valve 1/2"',          'W12', 6, PL,  false,'pce', 0,  5),
    prod(59, 'Pillar Tap',               'W13', 6, PL,  false,'pce', 0,  5),
    prod(60, 'Water Tank Float Valve',   'W14', 6, PL,  false,'pce', 0,  5),
    prod(61, 'Cable 1.5mm T&E (per m)',  'E01', 7, EL,  false,'m',   0, 50),
    prod(62, 'Cable 2.5mm T&E (per m)',  'E02', 7, EL,  false,'m',   0, 50),
    prod(63, 'Cable 4.0mm T&E (per m)',  'E03', 7, EL,  false,'m',   0, 30),
    prod(64, 'Cable 6.0mm T&E (per m)',  'E04', 7, EL,  false,'m',   0, 20),
    prod(65, 'Single Socket 13A',        'E05', 7, EL,  false,'pce', 0,  5),
    prod(66, 'Double Socket 13A',        'E06', 7, EL,  false,'pce', 0,  5),
    prod(67, 'Single Switch',            'E07', 7, EL,  false,'pce', 0,  5),
    prod(68, '2-Gang Switch',            'E08', 7, EL,  false,'pce', 0,  5),
    prod(69, 'MCB 20A',                  'E09', 7, EL,  false,'pce', 0,  5),
    prod(70, 'MCB 32A',                  'E10', 7, EL,  false,'pce', 0,  5),
    prod(71, 'LED Bulb 9W',              'E11', 7, EL,  false,'pce', 0,  5),
    prod(72, 'LED Bulb 18W',             'E12', 7, EL,  false,'pce', 0,  5),
    prod(73, 'Conduit 20mm (per m)',      'E13', 7, EL,  false,'m',   0, 10),
    prod(74, 'Wire Nails 2"',            'N01', 8, FA,  true, 'kg',  0,  5),
    prod(75, 'Wire Nails 3"',            'N02', 8, FA,  true, 'kg',  0,  5),
    prod(76, 'Wire Nails 4"',            'N03', 8, FA,  true, 'kg',  0,  5),
    prod(77, 'Wire Nails 6"',            'N04', 8, FA,  true, 'kg',  0,  5),
    prod(78, 'Bolts & Nuts 1/2" (per kg)','N05',8, FA,  true, 'kg',  0,  5),
    prod(79, 'Steel Hinge 4" (pair)',     'N06', 8, FA,  false,'pce', 0,  5),
    prod(80, 'Padlock 50mm',             'N07', 8, FA,  false,'pce', 0,  5),
    prod(81, 'Padlock 70mm',             'N08', 8, FA,  false,'pce', 0,  5),
    prod(82, 'Claw Hammer',              'H01', 9, HT,  false,'pce', 0,  3),
    prod(83, 'Tape Measure 5m',          'H02', 9, HT,  false,'pce', 0,  3),
    prod(84, 'Tape Measure 8m',          'H03', 9, HT,  false,'pce', 0,  3),
    prod(85, 'Spirit Level 600mm',       'H04', 9, HT,  false,'pce', 0,  3),
    prod(86, 'Masonry Trowel',           'H05', 9, HT,  false,'pce', 0,  3),
    prod(87, 'Hand Saw',                 'H06', 9, HT,  false,'pce', 0,  3),
    prod(88, 'Wheelbarrow',              'H07', 9, HT,  false,'pce', 0,  2),
    prod(89, 'Shovel',                   'H08', 9, HT,  false,'pce', 0,  3),
    prod(90, 'Paint Brush 2"',           'H09', 9, HT,  false,'pce', 0,  5),
    prod(91, 'Paint Brush 4"',           'H10', 9, HT,  false,'pce', 0,  5),
    prod(92, 'Paint Roller Set',         'H11', 9, HT,  false,'pce', 0,  3),
  ])

  save(K.staff, [
    { id:1, name:'Admin',       pin:'0000', personal_pin:'0000', department_pin:'0000', role:'admin',      is_active:true },
    { id:2, name:'Manager',     pin:'1111', personal_pin:'1111', department_pin:'1111', role:'manager',    is_active:true },
    { id:3, name:'Cashier 1',   pin:'2222', personal_pin:'1234', department_pin:'2222', role:'cashier',    is_active:true },
    { id:4, name:'Cashier 2',   pin:'2222', personal_pin:'5678', department_pin:'2222', role:'cashier',    is_active:true },
    { id:5, name:'Inventory',   pin:'3333', personal_pin:'3333', department_pin:'3333', role:'inventory',  is_active:true },
    { id:6, name:'Purchasing',  pin:'4444', personal_pin:'4444', department_pin:'4444', role:'purchasing', is_active:true },
  ])

  save(K.sales,          [])
  save(K.auditLogs,      [])
  save(K.saleItems,      [])
  save(K.customers,      [])
  save(K.accounts,       [])
  save(K.acctTxns,       [])
  save(K.quotes,         [])
  save(K.quoteItems,     [])
  save(K.suppliers,      [])
  save(K.purchaseOrders, [])
  save(K.shifts,         [])

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

// ── Auth (offline) ───────────────────────────────────────────────────────────

const LS_SESSION = 'pos_hw_session'

export function lsLogin(pin, staffId, role) {
  const allStaff = ls(K.staff)
  let found = null
  if (staffId) {
    found = allStaff.find(s => s.id === Number(staffId) && (s.personal_pin === pin || s.pin === pin) && s.is_active)
  } else if (role) {
    found = allStaff.find(s => s.role === role && (s.personal_pin === pin || s.pin === pin) && s.is_active)
  } else {
    found = allStaff.find(s => (s.personal_pin === pin || s.pin === pin) && s.is_active)
  }
  if (!found) throw new Error('Invalid PIN')
  localStorage.setItem(LS_SESSION, JSON.stringify(found))
  lsLogAudit(found, 'login', 'staff', found.id, found.name)
  return ok({ staff: found })
}

export function lsGetMe() {
  try {
    const staff = JSON.parse(localStorage.getItem(LS_SESSION))
    if (!staff) throw new Error('Not authenticated')
    return ok({ staff })
  } catch {
    throw new Error('Not authenticated')
  }
}

export function lsLogout() {
  try {
    const user = JSON.parse(localStorage.getItem(LS_SESSION))
    if (user) lsLogAudit(user, 'logout', 'staff', user.id, user.name)
  } catch {}
  localStorage.removeItem(LS_SESSION)
  return ok({ message: 'Logged out' })
}

// ── Audit Log (offline) ───────────────────────────────────────────────────────

function lsLogAudit(user, action, entityType, entityId, entityName, details) {
  try {
    const logs = ls(K.auditLogs)
    logs.push({
      id: nextId(logs),
      user_id:     user?.id   || null,
      user_name:   user?.name || 'Unknown',
      user_role:   user?.role || 'unknown',
      action, entity_type: entityType, entity_id: entityId,
      entity_name: entityName,
      details: details || null,
      created_at: now(),
    })
    save(K.auditLogs, logs)
  } catch {}
}

export function lsGetAuditLogs({ user_role, action, entity_type, date_from, date_to, limit = 200 } = {}) {
  let items = ls(K.auditLogs).slice().reverse()
  if (user_role)   items = items.filter(l => l.user_role === user_role)
  if (action)      items = items.filter(l => l.action === action)
  if (entity_type) items = items.filter(l => l.entity_type === entity_type)
  if (date_from)   items = items.filter(l => l.created_at >= date_from)
  if (date_to)     items = items.filter(l => l.created_at <= date_to + 'T23:59:59')
  return ok(items.slice(0, limit))
}

// ── Shifts (offline) ─────────────────────────────────────────────────────────

export function lsGetShifts() {
  return ok(ls(K.shifts).slice().reverse())
}

export function lsGetCurrentShift() {
  try {
    const user = JSON.parse(localStorage.getItem(LS_SESSION))
    if (!user) return ok({ shift: null })
    const shift = ls(K.shifts).find(s => s.cashier_id === user.id && s.status === 'open') || null
    return ok({ shift })
  } catch {
    return ok({ shift: null })
  }
}

export function lsOpenShift(data) {
  const shifts = ls(K.shifts)
  const shift = {
    id: nextId(shifts),
    cashier_id:     data.cashier_id || null,
    cashier_name:   data.cashier_name || '',
    opening_float:  parseFloat(data.opening_float || 0),
    status:         'open',
    opened_at:      now(),
    closed_at:      null,
    closing_float:  null,
    notes:          null,
  }
  save(K.shifts, [...shifts, shift])
  return ok({ shift })
}

export function lsCloseShift(id, data) {
  const shifts = ls(K.shifts)
  const updated = shifts.map(s => s.id !== id ? s : {
    ...s, status: 'closed', closed_at: now(),
    closing_float: parseFloat(data.closing_float || 0),
    notes: data.notes || null,
  })
  save(K.shifts, updated)
  return ok({ shift: updated.find(s => s.id === id) })
}

// ── Manager authorization (offline) ──────────────────────────────────────────

export function lsAuthorize(data) {
  const { card_code, pin } = data
  const allStaff = ls(K.staff)
  let member = null
  let method = null

  if (card_code) {
    member = allStaff.find(s => s.auth_card_code === card_code && s.is_active)
    method = 'card'
  }
  if (!member && pin) {
    const p = String(pin)
    member = allStaff.find(s =>
      s.is_active &&
      ['manager', 'admin'].includes(s.role) &&
      (s.personal_pin === p || s.pin === p)
    )
    method = 'pin'
  }

  if (!member) throw new Error('Invalid card or PIN')
  if (!['manager', 'admin'].includes(member.role)) throw new Error('Manager or admin authorization required')

  return ok({
    token: `offline-${Date.now()}`,
    authorizer: { id: member.id, name: member.name, role: member.role },
    expires_in: 30,
    auth_method: method,
  })
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
