/**
 * Open a new browser window and print an HTML string.
 * Used by all print functions across the app.
 */
export function printDoc(title, html) {
  const win = window.open('', '_blank')
  win.document.write(html)
  win.document.close()
  win.document.title = title
  setTimeout(() => { win.focus(); win.print() }, 300)
}

/** Shared A4 page CSS injected into every print document */
export const A4_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Georgia', 'Times New Roman', serif;
    font-size: 11pt;
    color: #111;
    background: #fff;
    padding: 18mm 20mm;
    width: 210mm;
    min-height: 297mm;
  }
  @media print {
    @page { size: A4; margin: 0; }
    body { padding: 18mm 20mm; }
  }

  /* Layout helpers */
  .flex  { display: flex; }
  .sb    { justify-content: space-between; }
  .ac    { align-items: center; }
  .right { text-align: right; }
  .center{ text-align: center; }
  .bold  { font-weight: 700; }
  .muted { color: #555; }
  .small { font-size: 9pt; }
  .gap   { margin-bottom: 6pt; }

  /* Letterhead */
  .letterhead { border-bottom: 2.5pt solid #111; padding-bottom: 10pt; margin-bottom: 14pt; }
  .store-name { font-size: 18pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1pt; }
  .store-sub  { font-size: 9pt; color: #444; margin-top: 3pt; line-height: 1.5; }

  /* Document title block */
  .doc-title  { text-align: center; margin-bottom: 14pt; }
  .doc-title h2 { font-size: 14pt; text-transform: uppercase; letter-spacing: 2pt; margin-bottom: 4pt; }
  .doc-title .doc-num { font-size: 9pt; color: #555; }

  /* Info grid */
  .info-grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; margin-bottom: 12pt; }
  .info-box   { border: 0.5pt solid #ccc; border-radius: 3pt; padding: 8pt 10pt; }
  .info-box .label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5pt; color: #777; margin-bottom: 4pt; font-weight: 700; }
  .info-box .value { font-size: 10pt; line-height: 1.5; }

  /* Table */
  table { width: 100%; border-collapse: collapse; margin-bottom: 10pt; font-size: 10pt; }
  thead th {
    background: #1a1a1a; color: #fff;
    padding: 6pt 8pt;
    text-align: left; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.5pt;
  }
  thead th.right { text-align: right; }
  tbody td { padding: 6pt 8pt; border-bottom: 0.5pt solid #e5e5e5; vertical-align: top; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:nth-child(even) td { background: #fafafa; }

  /* Totals block */
  .totals { margin-left: auto; width: 200pt; margin-bottom: 14pt; }
  .totals .row { display: flex; justify-content: space-between; padding: 3pt 0; font-size: 10pt; border-bottom: 0.5pt dotted #ddd; }
  .totals .row.grand { font-size: 13pt; font-weight: 700; border-top: 1.5pt solid #111; border-bottom: none; margin-top: 4pt; padding-top: 6pt; }

  /* Stamp */
  .stamp {
    display: inline-block; border: 3pt solid currentColor;
    padding: 3pt 12pt; font-size: 13pt; font-weight: 700;
    text-transform: uppercase; letter-spacing: 2pt;
    transform: rotate(-10deg); opacity: 0.75;
  }

  /* Signatures */
  .sig-section { margin-top: 20pt; border-top: 0.5pt solid #ccc; padding-top: 12pt; }
  .sig-section .sig-title { font-size: 9pt; text-transform: uppercase; letter-spacing: 1pt; font-weight: 700; margin-bottom: 16pt; }
  .sig-grid { display: grid; gap: 20pt; }
  .sig-box .line { border-bottom: 1pt solid #111; height: 28pt; margin-bottom: 4pt; }
  .sig-box .name { font-size: 9pt; color: #333; }
  .sig-box .role { font-size: 8pt; color: #777; margin-top: 2pt; }

  /* Doc footer */
  .doc-footer { margin-top: 14pt; padding-top: 6pt; border-top: 0.5pt solid #ddd; font-size: 8pt; color: #777; text-align: center; line-height: 1.6; }

  /* Watermark for special states */
  .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-35deg); font-size: 72pt; font-weight: 900; opacity: 0.04; pointer-events: none; text-transform: uppercase; white-space: nowrap; }
`

/** Print a GRN document */
export function printGRN(grn, store = {}) {
  const fmt2 = (n) => Number(n || 0).toFixed(2)
  const rows = (grn.items || []).map(it => {
    const variance = it.qty_received - it.qty_ordered
    const varColor = variance < 0 ? '#cc0000' : variance > 0 ? '#007700' : '#333'
    return `<tr>
      <td>${it.product_name}</td>
      <td class="right">${it.qty_ordered}</td>
      <td class="right">${it.qty_received}</td>
      <td class="right" style="color:${varColor};font-weight:600">${variance > 0 ? '+' : ''}${variance}</td>
      <td class="right">${fmt2(it.unit_cost)}</td>
      <td class="right">${fmt2(it.qty_received * it.unit_cost)}</td>
    </tr>`
  }).join('')

  const totalReceived = (grn.items || []).reduce((s, i) => s + i.qty_received * i.unit_cost, 0)
  const statusStamp = grn.status === 'signed_off'
    ? `<div style="text-align:center;margin:8pt 0"><span class="stamp" style="color:#007700">Signed Off</span></div>`
    : grn.status === 'confirmed'
    ? `<div style="text-align:center;margin:8pt 0"><span class="stamp" style="color:#1a73e8">Confirmed</span></div>`
    : ''

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${A4_CSS}</style></head><body>
    <div class="watermark">${grn.grn_number}</div>
    <div class="letterhead flex sb ac">
      <div>
        <div class="store-name">${store.name || 'Store'}</div>
        <div class="store-sub">${store.address || ''}<br>${store.phone || ''} · ${store.email || ''}</div>
      </div>
      <div class="right">
        <div class="bold" style="font-size:8pt;text-transform:uppercase;letter-spacing:1pt">Goods Received Note</div>
        <div style="font-size:10pt;font-weight:700">${grn.grn_number}</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <div class="label">Supplier</div>
        <div class="value bold">${grn.supplier_name || '—'}</div>
      </div>
      <div class="info-box">
        <div class="label">Purchase Order</div>
        <div class="value bold">${grn.po_number || '—'}</div>
      </div>
      <div class="info-box">
        <div class="label">Received By</div>
        <div class="value">${grn.received_by_name || '—'}</div>
        <div class="value small muted">${grn.received_at ? new Date(grn.received_at).toLocaleString('en-KE') : '—'}</div>
      </div>
      <div class="info-box">
        <div class="label">Status</div>
        <div class="value bold">${grn.status.toUpperCase()}</div>
        ${grn.signed_off_by_name ? `<div class="value small muted">Signed off by ${grn.signed_off_by_name}</div>` : ''}
      </div>
    </div>

    ${statusStamp}

    <table>
      <thead><tr>
        <th>Product</th>
        <th class="right">Ordered</th>
        <th class="right">Received</th>
        <th class="right">Variance</th>
        <th class="right">Unit Cost</th>
        <th class="right">Line Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div class="row grand"><span>Total Received Value</span><span>${fmt2(totalReceived)}</span></div>
    </div>

    ${grn.notes ? `<div class="info-box" style="margin-bottom:12pt"><div class="label">Notes</div><div class="value">${grn.notes}</div></div>` : ''}

    <div class="sig-section">
      <div class="sig-title">Authorisation</div>
      <div class="sig-grid" style="grid-template-columns:1fr 1fr 1fr">
        <div class="sig-box"><div class="line"></div><div class="name">Received By (Inventory)</div><div class="role">${grn.received_by_name || ''}</div></div>
        <div class="sig-box"><div class="line"></div><div class="name">Verified By (Purchasing)</div><div class="role"></div></div>
        <div class="sig-box"><div class="line"></div><div class="name">Approved By (Manager)</div><div class="role">${grn.signed_off_by_name || ''}</div></div>
      </div>
    </div>
    <div class="doc-footer">Generated ${new Date().toLocaleString('en-KE')} · ${store.name || ''}</div>
  </body></html>`
  printDoc(grn.grn_number, html)
}

/** Print a Damage / Write-off Report */
export function printDamageReport(report, store = {}) {
  const statusColor = { approved: '#007700', rejected: '#cc0000', raised: '#b45309', pending_approval: '#1a73e8' }
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${A4_CSS}</style></head><body>
    <div class="letterhead flex sb ac">
      <div>
        <div class="store-name">${store.name || 'Store'}</div>
        <div class="store-sub">${store.address || ''}<br>${store.phone || ''}</div>
      </div>
      <div class="right">
        <div class="bold" style="font-size:8pt;text-transform:uppercase;letter-spacing:1pt">Damage / Write-off Report</div>
        <div style="font-size:10pt;font-weight:700">${report.report_number}</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <div class="label">Product</div>
        <div class="value bold">${report.product_name}</div>
      </div>
      <div class="info-box">
        <div class="label">Quantity Written Off</div>
        <div class="value bold" style="font-size:16pt">${report.qty}</div>
      </div>
      <div class="info-box">
        <div class="label">Estimated Value</div>
        <div class="value bold">KES ${Number(report.estimated_value || 0).toFixed(2)}</div>
      </div>
      <div class="info-box">
        <div class="label">Status</div>
        <div class="value bold" style="color:${statusColor[report.status] || '#333'}">${report.status.toUpperCase()}</div>
      </div>
    </div>

    <div class="info-box" style="margin-bottom:10pt">
      <div class="label">Reason</div>
      <div class="value">${report.reason || '—'}</div>
    </div>
    ${report.details ? `<div class="info-box" style="margin-bottom:10pt"><div class="label">Details</div><div class="value">${report.details}</div></div>` : ''}
    ${report.review_notes ? `<div class="info-box" style="margin-bottom:10pt"><div class="label">Review Notes</div><div class="value">${report.review_notes}</div></div>` : ''}

    <table>
      <thead><tr><th>Field</th><th>Value</th></tr></thead>
      <tbody>
        <tr><td>Raised By</td><td>${report.raised_by_name || '—'}</td></tr>
        <tr><td>Raised At</td><td>${report.raised_at ? new Date(report.raised_at).toLocaleString('en-KE') : '—'}</td></tr>
        <tr><td>Reviewed By</td><td>${report.reviewed_by_name || '—'}</td></tr>
        <tr><td>Reviewed At</td><td>${report.reviewed_at ? new Date(report.reviewed_at).toLocaleString('en-KE') : '—'}</td></tr>
        <tr><td>Stock Adjusted</td><td>${report.stock_adjusted ? 'Yes' : 'No'}</td></tr>
      </tbody>
    </table>

    <div class="sig-section">
      <div class="sig-title">Authorisation</div>
      <div class="sig-grid" style="grid-template-columns:1fr 1fr">
        <div class="sig-box"><div class="line"></div><div class="name">Raised By (Inventory)</div><div class="role">${report.raised_by_name || ''}</div></div>
        <div class="sig-box"><div class="line"></div><div class="name">Approved By (Manager)</div><div class="role">${report.reviewed_by_name || ''}</div></div>
      </div>
    </div>
    <div class="doc-footer">Generated ${new Date().toLocaleString('en-KE')} · ${store.name || ''}</div>
  </body></html>`
  printDoc(report.report_number, html)
}

/** Print a physical count sheet — blank rows for staff to fill in */
export function printCountSheet(products, store = {}, category = 'All Categories') {
  const rows = products.map(p => `<tr>
    <td>${p.name}</td>
    <td style="font-family:monospace;font-size:9pt">${p.barcode || '—'}</td>
    <td>${p.category_name || '—'}</td>
    <td class="right">${p.weight_unit || 'pcs'}</td>
    <td class="right" style="color:#aaa">${p.stock_qty}</td>
    <td></td>
    <td></td>
  </tr>`).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${A4_CSS}
    tbody td { padding: 8pt 6pt; border-bottom: 0.5pt solid #ddd; }
    tbody tr td:nth-child(6), tbody tr td:nth-child(7) { border-bottom: 1pt solid #999; }
  </style></head><body>
    <div class="letterhead flex sb ac">
      <div>
        <div class="store-name">${store.name || 'Store'}</div>
        <div class="store-sub">Physical Stock Count Sheet</div>
      </div>
      <div class="right small muted">
        <div>Category: <strong>${category}</strong></div>
        <div>Date: ___________________________</div>
        <div>Counter: ___________________________</div>
        <div>Supervisor: ___________________________</div>
      </div>
    </div>

    <table>
      <thead><tr>
        <th>Product Name</th>
        <th>Barcode</th>
        <th>Category</th>
        <th class="right">Unit</th>
        <th class="right">System Qty</th>
        <th class="right">Physical Count</th>
        <th class="right">Initials</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="sig-section">
      <div class="sig-grid" style="grid-template-columns:1fr 1fr 1fr">
        <div class="sig-box"><div class="line"></div><div class="name">Counted By</div></div>
        <div class="sig-box"><div class="line"></div><div class="name">Verified By</div></div>
        <div class="sig-box"><div class="line"></div><div class="name">Manager Sign-off</div></div>
      </div>
    </div>
    <div class="doc-footer">Printed ${new Date().toLocaleString('en-KE')} · ${products.length} products · ${store.name || ''}</div>
  </body></html>`
  printDoc('Count Sheet', html)
}

/** Print a stock movement report */
export function printMovementReport(movements, store = {}, filters = {}) {
  const rows = movements.map(m => `<tr>
    <td style="font-size:9pt;color:#555;white-space:nowrap">${new Date(m.created_at).toLocaleString('en-KE')}</td>
    <td>${m.product_name}</td>
    <td><span style="background:#f0f0f0;padding:2pt 6pt;border-radius:3pt;font-size:8pt">${m.movement_type}</span></td>
    <td class="right">${m.qty_before}</td>
    <td class="right" style="font-weight:700;color:${m.qty_change >= 0 ? '#007700' : '#cc0000'}">${m.qty_change >= 0 ? '+' : ''}${m.qty_change}</td>
    <td class="right">${m.qty_after}</td>
    <td style="font-size:9pt;color:#555">${m.reference_id || '—'}</td>
    <td style="font-size:9pt;color:#555">${m.user_name || '—'}</td>
  </tr>`).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${A4_CSS}</style></head><body>
    <div class="letterhead flex sb ac">
      <div>
        <div class="store-name">${store.name || 'Store'}</div>
        <div class="store-sub">Stock Movement Report</div>
      </div>
      <div class="right small muted">
        ${filters.date_from ? `<div>From: ${filters.date_from}</div>` : ''}
        ${filters.date_to ? `<div>To: ${filters.date_to}</div>` : ''}
        <div>${movements.length} movements</div>
      </div>
    </div>

    <table>
      <thead><tr>
        <th>Date / Time</th><th>Product</th><th>Type</th>
        <th class="right">Before</th><th class="right">Change</th><th class="right">After</th>
        <th>Reference</th><th>By</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="8" style="text-align:center;color:#999">No movements in this period</td></tr>'}</tbody>
    </table>

    <div class="sig-section">
      <div class="sig-grid" style="grid-template-columns:1fr 1fr">
        <div class="sig-box"><div class="line"></div><div class="name">Prepared By</div></div>
        <div class="sig-box"><div class="line"></div><div class="name">Manager Sign-off</div></div>
      </div>
    </div>
    <div class="doc-footer">Generated ${new Date().toLocaleString('en-KE')} · ${store.name || ''}</div>
  </body></html>`
  printDoc('Movement Report', html)
}

/** Print A4 Sales & Revenue Report */
export function printSalesReport(salesData, topProducts, paymentData, dateFrom, dateTo, store = {}) {
  const fmt2 = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const dailyRows = (salesData.rows || []).map(r => `<tr>
    <td>${r.date}</td><td class="right">${r.transactions}</td>
    <td class="right">${fmt2(r.revenue)}</td><td class="right">${fmt2(r.tax)}</td>
  </tr>`).join('')
  const topRows = topProducts.slice(0, 15).map((p, i) => `<tr>
    <td>${i + 1}</td><td>${p.product_name}</td>
    <td class="right">${p.total_qty}</td><td class="right">${fmt2(p.total_revenue)}</td>
  </tr>`).join('')
  const pmtRows = paymentData.map(p => `<tr>
    <td>${p.method}</td><td class="right">${p.count}</td><td class="right">${fmt2(p.total)}</td>
  </tr>`).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${A4_CSS}</style></head><body>
    <div class="letterhead flex sb ac">
      <div><div class="store-name">${store.name || 'Store'}</div>
        <div class="store-sub">${store.address || ''}<br>${store.phone || ''}</div></div>
      <div class="right"><div class="bold small" style="text-transform:uppercase;letter-spacing:1pt">Sales & Revenue Report</div>
        <div class="small muted">${dateFrom} to ${dateTo}</div></div>
    </div>
    <div class="info-grid">
      <div class="info-box"><div class="label">Total Revenue</div><div class="value bold" style="font-size:16pt">${fmt2(salesData.total_revenue)}</div></div>
      <div class="info-box"><div class="label">Transactions</div><div class="value bold" style="font-size:16pt">${salesData.total_transactions}</div></div>
      <div class="info-box"><div class="label">Avg Sale</div><div class="value bold">${salesData.total_transactions ? fmt2(salesData.total_revenue / salesData.total_transactions) : '—'}</div></div>
      <div class="info-box"><div class="label">Period</div><div class="value">${dateFrom}<br>to ${dateTo}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12pt;margin-bottom:10pt">
      <div><div class="bold gap" style="font-size:10pt">Daily Breakdown</div>
        <table><thead><tr><th>Date</th><th class="right">Sales</th><th class="right">Revenue</th><th class="right">Tax</th></tr></thead>
        <tbody>${dailyRows}</tbody></table></div>
      <div><div class="bold gap" style="font-size:10pt">Payment Methods</div>
        <table><thead><tr><th>Method</th><th class="right">Count</th><th class="right">Total</th></tr></thead>
        <tbody>${pmtRows}</tbody></table>
        <div class="bold gap" style="font-size:10pt;margin-top:8pt">Top Products</div>
        <table><thead><tr><th>#</th><th>Product</th><th class="right">Qty</th><th class="right">Revenue</th></tr></thead>
        <tbody>${topRows}</tbody></table></div>
    </div>
    <div class="sig-section"><div class="sig-title">Authorisation</div>
      <div class="sig-grid" style="grid-template-columns:1fr 1fr">
        <div class="sig-box"><div class="line"></div><div class="name">Prepared By</div></div>
        <div class="sig-box"><div class="line"></div><div class="name">Manager Sign-off</div></div>
      </div></div>
    <div class="doc-footer">Generated ${new Date().toLocaleString('en-KE')} · ${store.name || ''}</div>
  </body></html>`
  printDoc(`Sales Report ${dateFrom} – ${dateTo}`, html)
}

/** Print A4 Cashier Performance Report */
export function printCashierReport(cashierData, dateFrom, dateTo, store = {}) {
  const fmt2 = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const rows = cashierData.map(c => `<tr>
    <td style="font-weight:600">${c.cashier_name}</td>
    <td class="right">${c.transactions}</td>
    <td class="right">${fmt2(c.revenue)}</td>
    <td class="right">${fmt2(c.tax)}</td>
    <td class="right">${fmt2(c.avg_sale)}</td>
  </tr>`).join('')
  const totalRev = cashierData.reduce((s, c) => s + (c.revenue || 0), 0)
  const totalTx  = cashierData.reduce((s, c) => s + (c.transactions || 0), 0)

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${A4_CSS}</style></head><body>
    <div class="letterhead flex sb ac">
      <div><div class="store-name">${store.name || 'Store'}</div>
        <div class="store-sub">${store.address || ''}</div></div>
      <div class="right"><div class="bold small" style="text-transform:uppercase;letter-spacing:1pt">Cashier Performance Report</div>
        <div class="small muted">${dateFrom} to ${dateTo}</div></div>
    </div>
    <div class="info-grid" style="grid-template-columns:1fr 1fr 1fr">
      <div class="info-box"><div class="label">Total Revenue</div><div class="value bold" style="font-size:14pt">${fmt2(totalRev)}</div></div>
      <div class="info-box"><div class="label">Total Transactions</div><div class="value bold" style="font-size:14pt">${totalTx}</div></div>
      <div class="info-box"><div class="label">Cashiers Active</div><div class="value bold" style="font-size:14pt">${cashierData.length}</div></div>
    </div>
    <table><thead><tr>
      <th>Cashier</th><th class="right">Transactions</th><th class="right">Revenue</th><th class="right">Tax</th><th class="right">Avg Sale</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <div class="sig-section"><div class="sig-title">Authorisation</div>
      <div class="sig-grid" style="grid-template-columns:1fr 1fr">
        <div class="sig-box"><div class="line"></div><div class="name">Prepared By</div></div>
        <div class="sig-box"><div class="line"></div><div class="name">Manager Sign-off</div></div>
      </div></div>
    <div class="doc-footer">Generated ${new Date().toLocaleString('en-KE')} · ${store.name || ''}</div>
  </body></html>`
  printDoc(`Cashier Report ${dateFrom} – ${dateTo}`, html)
}

/** Print A4 Inventory Status Report */
export function printInventoryReport(inventoryData, store = {}, showPrices = true) {
  const fmt2 = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const s = inventoryData.summary || {}
  const outRows = (inventoryData.out_of_stock || []).map(p =>
    `<tr><td>${p.name}</td>${showPrices ? `<td class="right">${fmt2(p.price)}</td>` : ''}</tr>`).join('')
  const lowRows = (inventoryData.low_stock || []).map(p =>
    `<tr><td>${p.name}</td><td class="right" style="color:#b45309">${p.stock_qty}</td><td class="right">${p.threshold}</td>${showPrices ? `<td class="right">${fmt2(p.price)}</td>` : ''}</tr>`).join('')
  const valRows = (inventoryData.top_by_value || []).map((p, i) =>
    `<tr><td>${i+1}</td><td>${p.name}</td><td class="right">${p.stock_qty}</td>${showPrices ? `<td class="right">${fmt2(p.price)}</td><td class="right">${fmt2(p.value)}</td>` : ''}</tr>`).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${A4_CSS}</style></head><body>
    <div class="letterhead flex sb ac">
      <div><div class="store-name">${store.name || 'Store'}</div>
        <div class="store-sub">${store.address || ''}</div></div>
      <div class="right"><div class="bold small" style="text-transform:uppercase;letter-spacing:1pt">Inventory Status Report</div>
        <div class="small muted">Generated ${new Date().toLocaleDateString('en-KE')}</div></div>
    </div>
    <div class="info-grid" style="grid-template-columns:repeat(${showPrices ? 4 : 3},1fr)">
      <div class="info-box"><div class="label">Total Products</div><div class="value bold" style="font-size:16pt">${s.total_products || 0}</div></div>
      ${showPrices ? `<div class="info-box"><div class="label">Stock Value</div><div class="value bold" style="font-size:14pt">${fmt2(s.total_stock_value)}</div></div>` : ''}
      <div class="info-box"><div class="label">Out of Stock</div><div class="value bold" style="font-size:16pt;color:#cc0000">${s.out_of_stock_count || 0}</div></div>
      <div class="info-box"><div class="label">Low Stock</div><div class="value bold" style="font-size:16pt;color:#b45309">${s.low_stock_count || 0}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12pt;margin-bottom:10pt">
      <div><div class="bold gap" style="font-size:10pt">Out of Stock (${(inventoryData.out_of_stock || []).length})</div>
        <table><thead><tr><th>Product</th>${showPrices ? '<th class="right">Price</th>' : ''}</tr></thead>
        <tbody>${outRows || '<tr><td colspan="2" style="color:#888;text-align:center">None</td></tr>'}</tbody></table></div>
      <div><div class="bold gap" style="font-size:10pt">Low Stock (${(inventoryData.low_stock || []).length})</div>
        <table><thead><tr><th>Product</th><th class="right">Qty</th><th class="right">Min</th>${showPrices ? '<th class="right">Price</th>' : ''}</tr></thead>
        <tbody>${lowRows || '<tr><td colspan="4" style="color:#888;text-align:center">None</td></tr>'}</tbody></table></div>
    </div>
    ${showPrices ? `<div class="bold gap" style="font-size:10pt">Top 10 by Stock Value</div>
    <table><thead><tr><th>#</th><th>Product</th><th class="right">Qty</th><th class="right">Unit Price</th><th class="right">Value</th></tr></thead>
    <tbody>${valRows}</tbody></table>` : ''}
    <div class="sig-section"><div class="sig-title">Authorisation</div>
      <div class="sig-grid" style="grid-template-columns:1fr 1fr">
        <div class="sig-box"><div class="line"></div><div class="name">Prepared By (Inventory)</div></div>
        <div class="sig-box"><div class="line"></div><div class="name">Manager Sign-off</div></div>
      </div></div>
    <div class="doc-footer">Generated ${new Date().toLocaleString('en-KE')} · ${store.name || ''}</div>
  </body></html>`
  printDoc('Inventory Status Report', html)
}

/** Print A4 Purchasing / PO Report */
export function printPurchasingReport(data, dateFrom, dateTo, store = {}, showCost = true) {
  const fmt2 = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const statusRows = Object.entries(data.by_status || {}).map(([s, n]) =>
    `<tr><td>${s}</td><td class="right">${n}</td></tr>`).join('')
  const poRows = (data.pos || []).map(po => `<tr>
    <td style="font-family:monospace;font-size:9pt">${po.po_number}</td>
    <td>${po.supplier_name}</td>
    <td class="right">${po.items_count}</td>
    ${showCost ? `<td class="right">${fmt2(po.total_cost)}</td>` : ''}
    <td><span style="font-size:8pt;background:#f0f0f0;padding:1pt 5pt;border-radius:3pt">${po.status}</span></td>
    <td style="font-size:9pt;color:#555">${po.created_by_name}</td>
    <td style="font-size:9pt;color:#555">${po.created_at ? new Date(po.created_at).toLocaleDateString('en-KE') : '—'}</td>
  </tr>`).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${A4_CSS}</style></head><body>
    <div class="letterhead flex sb ac">
      <div><div class="store-name">${store.name || 'Store'}</div>
        <div class="store-sub">${store.address || ''}</div></div>
      <div class="right"><div class="bold small" style="text-transform:uppercase;letter-spacing:1pt">Purchasing Report</div>
        <div class="small muted">${dateFrom} to ${dateTo}</div></div>
    </div>
    <div class="info-grid" style="grid-template-columns:repeat(${showCost ? 4 : 3},1fr)">
      <div class="info-box"><div class="label">Total POs</div><div class="value bold" style="font-size:16pt">${data.total_pos || 0}</div></div>
      ${showCost ? `<div class="info-box"><div class="label">Total Cost</div><div class="value bold" style="font-size:14pt">${fmt2(data.total_cost)}</div></div>` : ''}
      <div class="info-box"><div class="label">GRNs Raised</div><div class="value bold" style="font-size:16pt">${data.grn_count || 0}</div></div>
      <div class="info-box"><div class="label">GRNs Signed Off</div><div class="value bold" style="font-size:16pt;color:#007700">${data.grn_signed_off || 0}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:12pt;margin-bottom:10pt">
      <div><div class="bold gap" style="font-size:10pt">POs by Status</div>
        <table><thead><tr><th>Status</th><th class="right">Count</th></tr></thead>
        <tbody>${statusRows}</tbody></table></div>
    </div>
    <div class="bold gap" style="font-size:10pt">Purchase Orders</div>
    <table><thead><tr>
      <th>PO Number</th><th>Supplier</th><th class="right">Items</th>
      ${showCost ? '<th class="right">Total Cost</th>' : ''}
      <th>Status</th><th>Created By</th><th>Date</th>
    </tr></thead><tbody>${poRows || '<tr><td colspan="7" style="text-align:center;color:#888">No purchase orders in this period</td></tr>'}</tbody></table>
    <div class="sig-section"><div class="sig-title">Authorisation</div>
      <div class="sig-grid" style="grid-template-columns:1fr 1fr">
        <div class="sig-box"><div class="line"></div><div class="name">Purchasing Officer</div></div>
        <div class="sig-box"><div class="line"></div><div class="name">Manager Sign-off</div></div>
      </div></div>
    <div class="doc-footer">Generated ${new Date().toLocaleString('en-KE')} · ${store.name || ''}</div>
  </body></html>`
  printDoc(`Purchasing Report ${dateFrom} – ${dateTo}`, html)
}

/** Print A4 Returns & Refunds Report */
export function printReturnsReport(data, store = {}) {
  const fmt2 = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const methodRows = Object.entries(data.by_method || {}).map(([m, v]) =>
    `<tr><td style="text-transform:capitalize">${m.replace('_', ' ')}</td><td class="right">${fmt2(v)}</td></tr>`
  ).join('')

  const reasonRows = Object.entries(data.by_reason || {}).map(([r, v]) =>
    `<tr><td>${r}</td><td class="right">${fmt2(v)}</td></tr>`
  ).join('')

  const productRows = (data.top_products || []).map((p, i) =>
    `<tr><td>${i+1}</td><td>${p.product_name}</td><td class="right">${p.qty}</td><td class="right">${fmt2(p.refund)}</td></tr>`
  ).join('')

  const returnRows = (data.returns || []).slice(0, 50).map(r => `<tr>
    <td style="font-family:monospace;font-size:9pt">${r.return_number}</td>
    <td style="font-size:9pt">${r.original_receipt}</td>
    <td style="font-size:9pt">${r.reason}</td>
    <td style="font-size:9pt;text-transform:capitalize">${(r.refund_method||'').replace('_',' ')}</td>
    <td class="right" style="font-weight:700;color:#cc0000">${fmt2(r.total_refund)}</td>
    <td><span style="font-size:8pt;background:#f0f0f0;padding:1pt 5pt;border-radius:3pt">${r.status}</span></td>
    <td style="font-size:9pt;color:#555">${r.created_at ? new Date(r.created_at).toLocaleDateString('en-KE') : '—'}</td>
  </tr>`).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${A4_CSS}</style></head><body>
    <div class="letterhead flex sb ac">
      <div><div class="store-name">${store.name || 'Store'}</div>
        <div class="store-sub">${store.address || ''}</div></div>
      <div class="right"><div class="bold small" style="text-transform:uppercase;letter-spacing:1pt">Returns & Refunds Report</div>
        <div class="small muted">${data.date_from || ''} to ${data.date_to || ''}</div></div>
    </div>
    <div class="info-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="info-box"><div class="label">Total Returns</div><div class="value bold" style="font-size:16pt">${data.total_returns || 0}</div></div>
      <div class="info-box"><div class="label">Total Refunded</div><div class="value bold" style="font-size:14pt;color:#cc0000">${fmt2(data.total_refund)}</div></div>
      <div class="info-box"><div class="label">Pending Approval</div><div class="value bold" style="font-size:16pt">${(data.by_status||{}).pending_approval || 0}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12pt;margin-bottom:10pt">
      <div><div class="bold gap" style="font-size:10pt">By Refund Method</div>
        <table><thead><tr><th>Method</th><th class="right">Amount</th></tr></thead>
        <tbody>${methodRows || '<tr><td colspan="2" style="color:#999;text-align:center">None</td></tr>'}</tbody></table></div>
      <div><div class="bold gap" style="font-size:10pt">By Reason</div>
        <table><thead><tr><th>Reason</th><th class="right">Amount</th></tr></thead>
        <tbody>${reasonRows || '<tr><td colspan="2" style="color:#999;text-align:center">None</td></tr>'}</tbody></table></div>
      <div><div class="bold gap" style="font-size:10pt">Top Returned Products</div>
        <table><thead><tr><th>#</th><th>Product</th><th class="right">Qty</th><th class="right">Value</th></tr></thead>
        <tbody>${productRows || '<tr><td colspan="4" style="color:#999;text-align:center">None</td></tr>'}</tbody></table></div>
    </div>
    <div class="bold gap" style="font-size:10pt">Return Transactions (first 50)</div>
    <table><thead><tr><th>Return #</th><th>Receipt</th><th>Reason</th><th>Method</th><th class="right">Refund</th><th>Status</th><th>Date</th></tr></thead>
    <tbody>${returnRows || '<tr><td colspan="7" style="text-align:center;color:#999">No returns in this period</td></tr>'}</tbody></table>
    <div class="sig-section"><div class="sig-title">Authorisation</div>
      <div class="sig-grid" style="grid-template-columns:1fr 1fr">
        <div class="sig-box"><div class="line"></div><div class="name">Prepared By</div></div>
        <div class="sig-box"><div class="line"></div><div class="name">Manager Sign-off</div></div>
      </div></div>
    <div class="doc-footer">Generated ${new Date().toLocaleString('en-KE')} · ${store.name || ''}</div>
  </body></html>`
  printDoc(`Returns Report ${data.date_from} – ${data.date_to}`, html)
}


/** Print A4 KRA-compliant Tax Invoice */
export function printTaxInvoice(invoice, store = {}) {
  const fmt2 = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const items = invoice.items || []
  const itemRows = items.map(i => `<tr>
    <td>${i.product_name}${i.item_type === 'service' ? ' <em style="font-size:8pt;color:#666">(service)</em>' : ''}</td>
    <td class="right">${i.qty}</td>
    <td class="right">${fmt2(i.unit_price)}</td>
    <td class="right">${i.discount > 0 ? fmt2(i.discount) : '—'}</td>
    <td class="right">${((i.tax_rate || 0) * 100).toFixed(0)}%</td>
    <td class="right bold">${fmt2(i.line_total)}</td>
  </tr>`).join('')

  const vatRows = (() => {
    const grouped = {}
    items.forEach(i => {
      const rate = (i.tax_rate || 0)
      const label = rate > 0 ? `VAT ${(rate * 100).toFixed(0)}%` : 'Exempt'
      const taxable = i.line_total - (i.discount || 0)
      const vat = taxable * rate
      if (!grouped[label]) grouped[label] = { taxable: 0, vat: 0 }
      grouped[label].taxable += taxable
      grouped[label].vat += vat
    })
    return Object.entries(grouped).map(([label, v]) =>
      `<tr><td>${label}</td><td class="right">${fmt2(v.taxable)}</td><td class="right">${fmt2(v.vat)}</td></tr>`
    ).join('')
  })()

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${A4_CSS}
    .inv-meta { display:grid; grid-template-columns:1fr 1fr; gap:12pt; margin-bottom:14pt; }
    .inv-box  { border:1pt solid #ccc; border-radius:3pt; padding:8pt 10pt; }
    .inv-box .title { font-size:8pt; text-transform:uppercase; color:#666; margin-bottom:4pt; letter-spacing:.5pt; }
    .inv-box .val   { font-size:10pt; font-weight:600; }
    .vat-table { margin-top:10pt; }
    .badge { display:inline-block; padding:2pt 8pt; border-radius:10pt; font-size:8pt; font-weight:700;
      background:#dcfce7; color:#15803d; }
    .badge.voided { background:#fee2e2; color:#dc2626; }
  </style></head><body>
    <div class="letterhead flex sb ac">
      <div>
        <div class="store-name">${store.name || 'Store'}</div>
        <div class="store-sub">${store.address || ''}</div>
        <div class="store-sub">${[store.phone, store.email].filter(Boolean).join(' | ')}${store.tax_number ? ' | KRA PIN: ' + store.tax_number : ''}</div>
      </div>
      <div class="right">
        <div style="font-size:16pt;font-weight:700;text-transform:uppercase;letter-spacing:2pt">TAX INVOICE</div>
        <div class="small muted" style="margin-top:3pt">${invoice.invoice_number}</div>
        <div class="small muted">${invoice.created_at ? new Date(invoice.created_at).toLocaleDateString('en-KE') : ''}</div>
        ${invoice.status === 'voided' ? '<div class="badge voided" style="margin-top:4pt">VOIDED</div>' : '<div class="badge" style="margin-top:4pt">ISSUED</div>'}
      </div>
    </div>

    <div class="inv-meta">
      <div class="inv-box">
        <div class="title">Bill To</div>
        <div class="val">${invoice.customer_name || 'Cash Customer'}</div>
        ${invoice.customer_pin ? `<div class="small muted">KRA PIN: ${invoice.customer_pin}</div>` : ''}
        ${invoice.customer_address ? `<div class="small muted">${invoice.customer_address}</div>` : ''}
      </div>
      <div class="inv-box">
        <div class="title">Invoice Details</div>
        <div class="small">Invoice No: <strong>${invoice.invoice_number}</strong></div>
        <div class="small">Receipt No: ${invoice.receipt_number || '—'}</div>
        <div class="small">Date: ${invoice.created_at ? new Date(invoice.created_at).toLocaleDateString('en-KE') : '—'}</div>
        <div class="small">Payment Terms: ${invoice.payment_terms || 'Cash on delivery'}</div>
        ${invoice.due_date ? `<div class="small">Due: ${invoice.due_date}</div>` : ''}
        <div class="small">Issued By: ${invoice.issued_by_name || '—'}</div>
      </div>
    </div>

    <table><thead><tr>
      <th>Description</th><th class="right">Qty</th><th class="right">Unit Price</th>
      <th class="right">Discount</th><th class="right">VAT</th><th class="right">Line Total</th>
    </tr></thead><tbody>${itemRows}</tbody></table>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16pt;margin-top:10pt">
      <div>
        <div class="bold gap" style="font-size:9pt;text-transform:uppercase;letter-spacing:.5pt">VAT Summary</div>
        <table class="vat-table"><thead><tr><th>Rate</th><th class="right">Taxable</th><th class="right">VAT</th></tr></thead>
        <tbody>${vatRows}</tbody></table>
        ${invoice.notes ? `<div style="margin-top:8pt;font-size:9pt;border:1pt solid #ddd;padding:6pt;border-radius:3pt"><strong>Notes:</strong> ${invoice.notes}</div>` : ''}
      </div>
      <div>
        <table><tbody>
          <tr><td>Subtotal</td><td class="right">${fmt2(invoice.subtotal)}</td></tr>
          ${invoice.discount_total > 0 ? `<tr><td>Discounts</td><td class="right" style="color:#dc2626">−${fmt2(invoice.discount_total)}</td></tr>` : ''}
          <tr><td>VAT</td><td class="right">${fmt2(invoice.tax_amount)}</td></tr>
          <tr style="border-top:2pt solid #111">
            <td class="bold" style="font-size:13pt;padding-top:4pt">TOTAL</td>
            <td class="right bold" style="font-size:13pt;padding-top:4pt">${fmt2(invoice.total)}</td>
          </tr>
        </tbody></table>
      </div>
    </div>

    <div class="sig-section" style="margin-top:20pt"><div class="sig-title">Authorisation</div>
      <div class="sig-grid" style="grid-template-columns:1fr 1fr 1fr">
        <div class="sig-box"><div class="line"></div><div class="name">Issued By</div></div>
        <div class="sig-box"><div class="line"></div><div class="name">Received By (Customer)</div></div>
        <div class="sig-box"><div class="line"></div><div class="name">Manager</div></div>
      </div>
    </div>
    <div class="doc-footer">
      ${store.name || ''} ${store.tax_number ? '| KRA PIN: ' + store.tax_number : ''} | Generated ${new Date().toLocaleString('en-KE')}
      <br>This is a computer-generated tax invoice. No signature required unless stated above.
    </div>
  </body></html>`
  printDoc(invoice.invoice_number, html)
}


/** Print A4 Credit Note */
export function printCreditNote(cn, store = {}) {
  const fmt2 = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const items = cn.items || []
  const itemRows = items.map(i => `<tr>
    <td>${i.product_name}</td>
    <td class="right">${i.qty}</td>
    <td class="right">${fmt2(i.unit_price)}</td>
    <td class="right bold">${fmt2(i.line_refund)}</td>
  </tr>`).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${A4_CSS}
    .cn-header { background:#fff3f3; border:2pt solid #dc2626; border-radius:4pt; padding:10pt 14pt; margin-bottom:14pt; }
  </style></head><body>
    <div class="letterhead flex sb ac">
      <div>
        <div class="store-name">${store.name || 'Store'}</div>
        <div class="store-sub">${store.address || ''}</div>
        <div class="store-sub">${[store.phone, store.email].filter(Boolean).join(' | ')}${store.tax_number ? ' | KRA PIN: ' + store.tax_number : ''}</div>
      </div>
      <div class="right">
        <div style="font-size:16pt;font-weight:700;text-transform:uppercase;letter-spacing:2pt;color:#dc2626">CREDIT NOTE</div>
        <div class="small muted" style="margin-top:3pt">${cn.credit_note_number}</div>
        <div class="small muted">${cn.created_at ? new Date(cn.created_at).toLocaleDateString('en-KE') : ''}</div>
      </div>
    </div>

    <div class="cn-header">
      <div class="flex sb">
        <div><span class="small muted">Credit Note No:</span> <strong>${cn.credit_note_number}</strong></div>
        <div><span class="small muted">Original Invoice:</span> <strong>${cn.invoice_number || '—'}</strong></div>
        <div><span class="small muted">Return No:</span> <strong>${cn.return_number || '—'}</strong></div>
        <div><span class="small muted">Receipt No:</span> <strong>${cn.original_receipt || '—'}</strong></div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12pt;margin-bottom:14pt">
      <div style="border:1pt solid #ccc;border-radius:3pt;padding:8pt 10pt">
        <div style="font-size:8pt;text-transform:uppercase;color:#666;margin-bottom:4pt">Customer</div>
        <div style="font-weight:600">${cn.customer_name || 'Cash Customer'}</div>
      </div>
      <div style="border:1pt solid #ccc;border-radius:3pt;padding:8pt 10pt">
        <div style="font-size:8pt;text-transform:uppercase;color:#666;margin-bottom:4pt">Reason for Credit</div>
        <div style="font-weight:600">${cn.reason || '—'}</div>
        <div class="small muted">Refund Method: ${cn.refund_method || '—'}</div>
        <div class="small muted">Issued By: ${cn.issued_by_name || '—'}</div>
        <div class="small muted">Date: ${cn.created_at ? new Date(cn.created_at).toLocaleDateString('en-KE') : '—'}</div>
      </div>
    </div>

    <table><thead><tr>
      <th>Product / Service</th><th class="right">Qty</th><th class="right">Unit Price</th><th class="right">Credit</th>
    </tr></thead><tbody>${itemRows}</tbody></table>

    <div style="text-align:right;margin-top:10pt;padding-top:8pt;border-top:2pt solid #111">
      <span class="bold" style="font-size:14pt;color:#dc2626">TOTAL CREDIT: ${fmt2(cn.total_credit)}</span>
    </div>

    <div class="sig-section" style="margin-top:20pt"><div class="sig-title">Authorisation</div>
      <div class="sig-grid" style="grid-template-columns:1fr 1fr">
        <div class="sig-box"><div class="line"></div><div class="name">Issued By (${cn.issued_by_name || '—'})</div></div>
        <div class="sig-box"><div class="line"></div><div class="name">Manager Sign-off</div></div>
      </div>
    </div>
    <div class="doc-footer">
      ${store.name || ''} | Generated ${new Date().toLocaleString('en-KE')}
      <br>This credit note is valid for 30 days from date of issue.
    </div>
  </body></html>`
  printDoc(cn.credit_note_number, html)
}


/** Shared receipt CSS (80mm thermal width) */
export const RECEIPT_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 10pt; color: #000; background: #fff; width: 80mm; padding: 4mm; }
  @media print { @page { size: 80mm auto; margin: 0; } body { width: 80mm; } }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: 700; }
  .store-name { font-size: 14pt; font-weight: 700; text-align: center; letter-spacing: 1pt; text-transform: uppercase; }
  .store-sub  { font-size: 8pt; color: #333; text-align: center; line-height: 1.5; margin: 2mm 0; }
  .divider    { border-top: 1pt dashed #000; margin: 3mm 0; }
  .solid-div  { border-top: 1pt solid #000; margin: 3mm 0; }
  .row    { display: flex; justify-content: space-between; font-size: 9pt; margin-bottom: 1mm; }
  .item-name  { font-size: 9pt; margin-bottom: 0.5mm; }
  .item-calc  { font-size: 8pt; color: #444; padding-left: 4mm; }
  .item-total { font-size: 9pt; text-align: right; font-weight: 700; margin-bottom: 2mm; }
  .total-label { font-size: 10pt; font-weight: 700; }
  .total-val   { font-size: 12pt; font-weight: 700; }
  .sig-line { border-bottom: 1pt solid #000; margin: 8mm 0 2mm; }
  .sig-label{ font-size: 8pt; color: #444; }
  .footer   { text-align: center; font-size: 8pt; color: #444; margin-top: 4mm; line-height: 1.5; }
`
