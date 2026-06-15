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
        ${invoice.etims_cu_invoice_number ? `<div class="small" style="color:#15803d;margin-top:3pt">CU Invoice No: <strong>${invoice.etims_cu_invoice_number}</strong></div>` : ''}
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
    ${invoice.etims_cu_invoice_number ? `
    <div style="display:flex;align-items:flex-start;gap:16pt;margin-top:14pt;border:1.5pt solid #15803d;border-radius:4pt;padding:8pt 12pt;background:#f0fdf4">
      <div style="flex:1">
        <div style="font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.5pt;color:#15803d;margin-bottom:4pt">KRA eTIMS Verified Invoice</div>
        <div class="small">CU Invoice No: <strong>${invoice.etims_cu_invoice_number}</strong></div>
        ${invoice.etims_submitted_at ? `<div class="small">Submitted: ${new Date(invoice.etims_submitted_at).toLocaleString('en-KE')}</div>` : ''}
        <div class="small muted" style="margin-top:4pt;font-size:7.5pt">Scan QR code to verify this invoice on the KRA portal.</div>
      </div>
      ${invoice.etims_qr_code ? `<img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(invoice.etims_qr_code)}&size=100x100&margin=4" style="width:90pt;height:90pt;border:1pt solid #ccc;border-radius:3pt" alt="KRA QR">` : ''}
    </div>` : ''}
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


/** Print A4 Account Statement */
export function printAccountStatement(account, transactions, openingBalance, closingBalance, dateFrom, dateTo, store = {}) {
  const fmt2 = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const period = dateFrom && dateTo ? `${dateFrom} to ${dateTo}`
    : dateFrom ? `From ${dateFrom}`
    : dateTo   ? `Up to ${dateTo}`
    : 'All time'

  const rows = transactions.map(t => {
    const credit = t.amount >= 0
    return `<tr>
      <td>${t.created_at ? new Date(t.created_at).toLocaleDateString('en-KE') : '—'}</td>
      <td style="text-transform:capitalize">${t.type}</td>
      <td style="font-family:monospace;font-size:8pt">${t.receipt_number || (t.sale_id ? 'Sale #' + t.sale_id : '—')}${t.mpesa_ref ? '<br><span style="color:#0284c7">M-Pesa: ' + t.mpesa_ref + '</span>' : ''}</td>
      <td class="right" style="color:${credit ? '#16a34a' : '#dc2626'}">${credit ? '+' : ''}${fmt2(t.amount)}</td>
      <td class="right bold">${fmt2(t.balance_after)}</td>
      <td style="text-transform:capitalize">${t.payment_method || '—'}</td>
      <td style="font-size:8pt;color:#666">${t.notes || '—'}</td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${A4_CSS}
    .stmt-hdr { background:#f0f9ff; border:1pt solid #0ea5e9; border-radius:4pt; padding:10pt 14pt; margin-bottom:14pt; }
  </style></head><body>
    <div class="letterhead flex sb ac">
      <div>
        <div class="store-name">${store.name || 'Store'}</div>
        <div class="store-sub">${store.address || ''}</div>
        <div class="store-sub">${[store.phone, store.email].filter(Boolean).join(' | ')}</div>
      </div>
      <div class="right">
        <div style="font-size:14pt;font-weight:700;text-transform:uppercase;letter-spacing:2pt">ACCOUNT STATEMENT</div>
        <div class="small muted">Period: ${period}</div>
        <div class="small muted">Generated: ${new Date().toLocaleDateString('en-KE')}</div>
      </div>
    </div>

    <div class="stmt-hdr">
      <div class="flex sb ac">
        <div>
          <div style="font-weight:700;font-size:13pt">${account.customer_name || ''}</div>
          ${account.customer_phone ? `<div class="small muted">${account.customer_phone}</div>` : ''}
          ${account.notes ? `<div class="small muted">${account.notes}</div>` : ''}
        </div>
        <div class="right">
          <div class="small muted">Opening Balance</div>
          <div style="font-weight:700;font-size:12pt">${fmt2(openingBalance)}</div>
        </div>
        <div class="right">
          <div class="small muted">Closing Balance</div>
          <div style="font-weight:700;font-size:12pt;color:${closingBalance >= 0 ? '#16a34a' : '#dc2626'}">${fmt2(closingBalance)}</div>
        </div>
        ${account.credit_limit > 0 ? `<div class="right"><div class="small muted">Credit Limit</div><div style="font-weight:600">${fmt2(account.credit_limit)}</div></div>` : ''}
      </div>
    </div>

    ${transactions.length === 0
      ? '<div style="text-align:center;padding:24pt;color:#666;font-style:italic">No transactions in this period.</div>'
      : `<table><thead><tr>
          <th>Date</th><th>Type</th><th>Reference</th>
          <th class="right">Amount</th><th class="right">Balance</th>
          <th>Method</th><th>Notes</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr style="background:#f5f5f5;font-weight:700">
          <td colspan="4" class="right">Closing Balance</td>
          <td class="right" style="color:${closingBalance >= 0 ? '#16a34a' : '#dc2626'}">${fmt2(closingBalance)}</td>
          <td colspan="2"></td>
        </tr></tfoot>
        </table>`}

    <div class="sig-section" style="margin-top:20pt"><div class="sig-title">Acknowledgement</div>
      <div class="sig-grid" style="grid-template-columns:1fr 1fr">
        <div class="sig-box"><div class="line"></div><div class="name">Accounts Manager</div></div>
        <div class="sig-box"><div class="line"></div><div class="name">Customer / Authorised Signatory</div></div>
      </div>
    </div>
    <div class="doc-footer">
      ${store.name || ''} | Statement generated ${new Date().toLocaleString('en-KE')}
      <br>Please contact us within 7 days if you dispute any entry on this statement.
    </div>
  </body></html>`
  printDoc(`STMT-${account.customer_name || account.id}`, html)
}


/** Print A4 Delivery Note / Packing List (supplier-side document) */
export function printDeliveryNote(po, store = {}) {
  const fmt2 = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const dd = po.dispatch_details || {}
  const dispatchItems = (dd.items || [])
  // Build a map of qty_dispatched by po_item_id
  const qtyMap = {}
  dispatchItems.forEach(i => { qtyMap[i.po_item_id] = i.qty_dispatched })

  const rows = (po.items || []).map((item, i) => {
    const qtyDisp = qtyMap[item.id] ?? item.qty_ordered
    return `<tr>
      <td>${i + 1}</td>
      <td style="font-weight:600">${item.product_name}</td>
      <td class="right">${item.qty_ordered}</td>
      <td class="right bold">${qtyDisp}</td>
      <td class="right">${qtyDisp !== item.qty_ordered ? `<span style="color:#dc2626">${qtyDisp - item.qty_ordered > 0 ? '+' : ''}${qtyDisp - item.qty_ordered}</span>` : '—'}</td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${A4_CSS}
    .dn-header { background:#f0fdf4; border:1pt solid #16a34a; border-radius:4pt; padding:10pt 14pt; margin-bottom:14pt; }
  </style></head><body>
    <div class="letterhead flex sb ac">
      <div>
        <div class="store-name">${store.name || 'Supplier'}</div>
        <div class="store-sub">${store.address || ''}</div>
        <div class="store-sub">${[store.phone, store.email].filter(Boolean).join(' | ')}</div>
      </div>
      <div class="right">
        <div style="font-size:14pt;font-weight:700;text-transform:uppercase;letter-spacing:2pt">Delivery Note</div>
        <div class="small muted">PO Ref: ${po.po_number}</div>
        <div class="small muted">${po.dispatched_at ? new Date(po.dispatched_at).toLocaleDateString('en-KE') : new Date().toLocaleDateString('en-KE')}</div>
      </div>
    </div>

    <div class="dn-header">
      <div class="flex sb">
        <div>
          <div class="small muted">Deliver To</div>
          <div style="font-weight:700">${dd.deliver_to || (store.name ? 'Attn: ' + store.name : 'Customer Store')}</div>
          <div class="small muted">${store.address || ''}</div>
        </div>
        <div>
          <div class="small muted">Dispatch Date</div>
          <div style="font-weight:600">${dd.delivery_date || '—'}</div>
        </div>
        <div>
          <div class="small muted">Driver / Vehicle</div>
          <div style="font-weight:600">${dd.driver_name || '—'}</div>
          <div class="small muted">${dd.vehicle_ref || ''}</div>
        </div>
        <div>
          <div class="small muted">Tracking Ref</div>
          <div style="font-weight:600;font-family:monospace">${dd.tracking_ref || '—'}</div>
        </div>
      </div>
    </div>

    <table><thead><tr>
      <th>#</th>
      <th>Product / Description</th>
      <th class="right">Qty Ordered</th>
      <th class="right">Qty Dispatched</th>
      <th class="right">Variance</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    </table>

    <div class="sig-section" style="margin-top:20pt"><div class="sig-title">Delivery Confirmation</div>
      <div class="sig-grid" style="grid-template-columns:1fr 1fr">
        <div class="sig-box"><div class="line"></div><div class="name">Dispatched By (Supplier)</div><div class="role">${dd.driver_name || '________________'}</div></div>
        <div class="sig-box"><div class="line"></div><div class="name">Received By (Store)</div><div class="role">Date: ________________</div></div>
      </div>
    </div>
    <div class="doc-footer">
      PO: ${po.po_number} | Generated ${new Date().toLocaleString('en-KE')}
      <br>This delivery note must be signed by the receiver. Retain a copy for your records.
    </div>
  </body></html>`
  printDoc(`DN-${po.po_number}`, html)
}


/** Print A4 Purchase Order — Supplier-facing version with acknowledgement block */
export function printPOForSupplier(po, store = {}) {
  const fmt2 = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const rows = (po.items || []).map((item, i) => `<tr>
    <td>${i + 1}</td>
    <td style="font-weight:600">${item.product_name}</td>
    <td class="right">${item.qty_ordered}</td>
    <td class="right">${fmt2(item.unit_cost)}</td>
    <td class="right bold">${fmt2(item.qty_ordered * item.unit_cost)}</td>
  </tr>`).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${A4_CSS}
    .terms { background:#fffbeb; border:1pt solid #fbbf24; border-radius:3pt; padding:8pt 12pt; margin:12pt 0; font-size:9pt; }
    .ack-box { border:1pt solid #ccc; border-radius:3pt; padding:10pt 14pt; margin-top:12pt; }
  </style></head><body>
    <div class="letterhead flex sb ac">
      <div>
        <div class="store-name">${store.name || 'Store'}</div>
        <div class="store-sub">${store.address || ''}</div>
        <div class="store-sub">${[store.phone, store.email].filter(Boolean).join(' | ')}${store.tax_number ? ' | KRA PIN: ' + store.tax_number : ''}</div>
      </div>
      <div class="right">
        <div style="font-size:14pt;font-weight:700;text-transform:uppercase;letter-spacing:2pt">Purchase Order</div>
        <div style="font-family:monospace;font-size:11pt;font-weight:700">${po.po_number}</div>
        <div class="small muted">${po.created_at ? new Date(po.created_at).toLocaleDateString('en-KE') : new Date().toLocaleDateString('en-KE')}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12pt;margin-bottom:14pt">
      <div style="border:1pt solid #ccc;border-radius:3pt;padding:8pt 10pt">
        <div style="font-size:8pt;text-transform:uppercase;color:#666;margin-bottom:4pt">Bill To / Buyer</div>
        <div style="font-weight:700">${store.name || '—'}</div>
        <div class="small muted">${store.address || ''}</div>
        ${store.tax_number ? `<div class="small muted">KRA PIN: ${store.tax_number}</div>` : ''}
        ${store.phone ? `<div class="small muted">Tel: ${store.phone}</div>` : ''}
      </div>
      <div style="border:1pt solid #ccc;border-radius:3pt;padding:8pt 10pt">
        <div style="font-size:8pt;text-transform:uppercase;color:#666;margin-bottom:4pt">Supplier</div>
        <div style="font-weight:700">${po.supplier_name || '—'}</div>
        <div class="small muted">PO Number: <strong>${po.po_number}</strong></div>
        <div class="small muted">Prepared by: ${po.created_by_name || '—'}</div>
        ${po.notes ? `<div class="small muted" style="margin-top:4pt">Notes: ${po.notes}</div>` : ''}
      </div>
    </div>

    <table><thead><tr>
      <th>#</th><th>Product / Description</th>
      <th class="right">Qty</th><th class="right">Unit Price (KES)</th><th class="right">Total (KES)</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="font-weight:700;background:#f5f5f5">
      <td colspan="4" class="right">ORDER TOTAL</td>
      <td class="right">${fmt2(po.total_cost)}</td>
    </tr></tfoot>
    </table>

    <div class="terms">
      <strong>Terms &amp; Conditions:</strong>
      1. Please deliver to the address above by the agreed delivery date.
      2. All goods must match the specifications listed and be in good condition.
      3. Invoice must quote this PO number: <strong>${po.po_number}</strong>.
      4. Partial deliveries are acceptable — please advise quantities in advance.
      5. Payment terms as per supplier agreement.
    </div>

    <div class="sig-section"><div class="sig-title">Authorisation</div>
      <div class="sig-grid" style="grid-template-columns:1fr 1fr">
        <div class="sig-box"><div class="line"></div><div class="name">Authorised by (Buyer)</div><div class="role">${po.created_by_name || '________________'}</div><div class="role">Date: ________________</div></div>
        <div class="sig-box"><div class="line"></div><div class="name">Approved by (Manager)</div><div class="role">Date: ________________</div></div>
      </div>
    </div>

    <div style="page-break-before:always"></div>

    <div class="ack-box">
      <div style="font-size:13pt;font-weight:700;text-align:center;margin-bottom:12pt;text-transform:uppercase;letter-spacing:1pt">
        Purchase Order Acknowledgement
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10pt;margin-bottom:12pt;font-size:10pt">
        <div><span class="muted">PO Number:</span> <strong>${po.po_number}</strong></div>
        <div><span class="muted">Date:</span> ${po.created_at ? new Date(po.created_at).toLocaleDateString('en-KE') : ''}</div>
        <div><span class="muted">Buyer:</span> ${store.name || '—'}</div>
        <div><span class="muted">Supplier:</span> ${po.supplier_name || '—'}</div>
        <div><span class="muted">Order Value:</span> ${fmt2(po.total_cost)}</div>
      </div>
      <div style="font-size:10pt;margin-bottom:14pt">
        We, <strong>${po.supplier_name || '____________________'}</strong>, hereby acknowledge receipt of Purchase Order
        <strong>${po.po_number}</strong> dated ${po.created_at ? new Date(po.created_at).toLocaleDateString('en-KE') : '________________'}
        and confirm acceptance of all items and terms as stated therein.
      </div>
      <div style="margin-bottom:8pt;font-size:10pt">Estimated delivery date: ________________________________</div>
      <div class="sig-grid" style="grid-template-columns:1fr 1fr;margin-top:16pt">
        <div class="sig-box"><div class="line"></div><div class="name">Supplier Signature</div><div class="role">Name &amp; Designation</div><div class="role">Date: ________________</div></div>
        <div class="sig-box"><div class="line"></div><div class="name">Supplier Stamp</div></div>
      </div>
      <div style="font-size:9pt;color:#666;margin-top:14pt;text-align:center">
        Please sign and return this acknowledgement to ${store.name || 'the buyer'} within 2 working days.
        ${store.email ? 'Email: ' + store.email : ''}
      </div>
    </div>

    <div class="doc-footer">
      ${store.name || ''} | PO: ${po.po_number} | Generated ${new Date().toLocaleString('en-KE')}
    </div>
  </body></html>`
  printDoc(`PO-SUPPLIER-${po.po_number}`, html)
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

/**
 * Print a browser-window receipt from a Sale dict (from backend to_dict).
 * Uses the sale's own created_at for the date — safe for both fresh sales and reprints.
 */
export function printSaleReceipt(sale, store = {}) {
  const currency = store.currency || 'KES'
  function fmt(v) {
    return `${currency} ${Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  const storeSub = [store.phone, store.email].filter(Boolean).join(' | ')
  const pm = sale.payment_method || ''
  const receiptNum = sale.receipt_number || `SALE-${sale.id}`
  const saleDate = sale.created_at
    ? new Date(sale.created_at).toLocaleString('en-KE')
    : new Date().toLocaleString('en-KE')
  const items = sale.items || []

  printDoc(receiptNum, `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${receiptNum}</title><style>${RECEIPT_CSS}</style></head><body>
    <div class="store-name">${store.name || 'STORE'}</div>
    ${store.address ? `<div class="store-sub">${store.address}</div>` : ''}
    ${storeSub ? `<div class="store-sub">${storeSub}</div>` : ''}
    ${store.tax_number ? `<div class="store-sub">PIN: ${store.tax_number}</div>` : ''}
    <div class="solid-div"></div>
    <div class="center bold" style="font-size:11pt;letter-spacing:1pt">TAX INVOICE</div>
    <div class="solid-div"></div>
    <div class="row"><span>Receipt:</span><span>${receiptNum}</span></div>
    <div class="row"><span>Date:</span><span>${saleDate}</span></div>
    <div class="row"><span>Cashier:</span><span>${sale.cashier_name || '—'}</span></div>
    ${sale.customer_name ? `<div class="row"><span>Customer:</span><span>${sale.customer_name}</span></div>` : ''}
    <div class="divider"></div>
    ${items.map(item => `
      <div class="item-name">${item.product_name}</div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="item-calc">${fmt(item.unit_price)} &times; ${item.qty}${item.discount > 0 ? `  &minus; disc ${fmt(item.discount)}` : ''}</div>
        <div class="item-total">${fmt(item.line_total)}</div>
      </div>`).join('')}
    <div class="divider"></div>
    <div class="row"><span>Subtotal</span><span>${fmt(sale.subtotal)}</span></div>
    ${(sale.discount_total || 0) > 0 ? `<div class="row"><span>Discounts</span><span>&minus;${fmt(sale.discount_total)}</span></div>` : ''}
    ${(sale.loyalty_discount || 0) > 0 ? `<div class="row"><span>Points Discount</span><span>&minus;${fmt(sale.loyalty_discount)}</span></div>` : ''}
    ${(sale.tax_amount || 0) > 0 ? `<div class="row"><span>VAT</span><span>${fmt(sale.tax_amount)}</span></div>` : ''}
    <div class="solid-div"></div>
    <div class="row" style="margin:2mm 0">
      <span class="total-label">TOTAL</span><span class="total-val">${fmt(sale.total)}</span>
    </div>
    <div class="solid-div"></div>
    ${(function() {
      const tenders = (() => { try { return JSON.parse(sale.tenders_json || 'null') } catch { return null } })()
      if (tenders && tenders.length > 0) {
        const rows = tenders.map(t => {
          const label = t.method === 'cash'    ? 'Cash'
                      : t.method === 'mpesa'   ? 'M-Pesa'
                      : t.method === 'card'    ? 'Card'
                      : t.method === 'account' ? `Account${t.accountName ? ' — ' + t.accountName : ''}`
                      : t.method
          const detail = t.method === 'mpesa' && t.ref  ? `<div class="row" style="font-size:8.5pt;color:#555"><span style="padding-left:8pt">Ref:</span><span>${t.ref}</span></div>` : ''
          return `<div class="row"><span>${label}</span><span>${fmt(t.amount)}</span></div>${detail}`
        }).join('')
        const change = sale.change_given > 0 ? `<div class="row bold"><span>Change</span><span>${fmt(sale.change_given)}</span></div>` : ''
        return `<div class="row" style="font-weight:700">Payment breakdown</div>${rows}${change}`
      }
      if (pm === 'cash') return `
        <div class="row"><span>Payment</span><span>Cash</span></div>
        <div class="row"><span>Tendered</span><span>${fmt(sale.cash_tendered)}</span></div>
        <div class="row bold"><span>Change</span><span>${fmt(sale.change_given)}</span></div>`
      if (pm === 'mpesa') return `
        <div class="row"><span>Payment</span><span>M-Pesa</span></div>
        ${sale.mpesa_ref ? `<div class="row"><span>Ref</span><span>${sale.mpesa_ref}</span></div>` : ''}`
      if (pm === 'card') return `<div class="row"><span>Payment</span><span>Card</span></div>`
      if (pm === 'account') return `
        <div class="row"><span>Payment</span><span>Account</span></div>
        ${sale.account_name ? `<div class="row"><span>Account</span><span>${sale.account_name}</span></div>` : ''}`
      return `<div class="row"><span>Payment</span><span style="text-transform:capitalize">${pm.replace(/_/g,' ')}</span></div>`
    })()}
    <div class="divider"></div>
    <div style="margin:3mm 0 1mm;font-size:8.5pt">Customer Signature</div>
    <div class="sig-line"></div>
    <div class="sig-label">Name: ___________________________</div>
    <div class="footer">
      ${store.receipt_footer || 'Thank you for your business!'}
      <br>All goods sold are not returnable without receipt.
      <br>${currency} ${new Date(sale.created_at || Date.now()).getFullYear()} &mdash; ${store.name || ''}
    </div>
  </body></html>`)
}

// ── Shift Report PDF ─────────────────────────────────────────────────────────
export function printShiftReportDoc(report) {
  const c    = report.content || {}
  const store   = c.store   || {}
  const shift   = c.shift   || {}
  const summary = c.summary || {}
  const ov      = c.overrides     || {}
  const iov     = c.item_overrides || {}
  const salesLog   = c.sales_log    || []
  const invLog     = c.inventory_log || []
  const accLog     = c.account_log  || []
  const loyaltyLog = c.loyalty_log  || []

  const kes  = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const t    = (s) => s ? new Date(s).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : '—'
  const dt   = (s) => s ? new Date(s).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' }) : '—'
  const esc  = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const isReprint = report.print_count > 1

  const CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', serif; font-size: 10pt; color: #111; background: #fff; }
    @page { size: A4; margin: 18mm 16mm; }
    @media print { body { font-size: 9.5pt; } }

    .hdr { border-bottom: 2.5pt solid #111; padding-bottom: 10pt; margin-bottom: 12pt; display: flex; justify-content: space-between; align-items: flex-start; }
    .store-name { font-size: 16pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1pt; }
    .store-sub  { font-size: 8.5pt; color: #444; margin-top: 2pt; }
    .rpt-title  { text-align: right; }
    .rpt-title h2 { font-size: 13pt; text-transform: uppercase; letter-spacing: 1pt; }
    .rpt-title .sub { font-size: 8.5pt; color: #555; margin-top: 2pt; }
    .reprint { display: inline-block; border: 2pt solid #cc0000; color: #cc0000; font-weight: 700;
               font-size: 9pt; padding: 2pt 10pt; text-transform: uppercase; letter-spacing: 1pt; margin-top: 6pt; }

    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; margin-bottom: 10pt; }
    .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10pt; margin-bottom: 10pt; }
    .box { border: 1pt solid #ccc; border-radius: 3pt; overflow: hidden; }
    .box-title { background: #e8e8e8; padding: 4pt 8pt; font-weight: 700; font-size: 8.5pt;
                 text-transform: uppercase; letter-spacing: 0.5pt; border-bottom: 1pt solid #ccc; }
    .box-body { padding: 6pt 8pt; }
    .kv { display: flex; justify-content: space-between; padding: 1.5pt 0; font-size: 9.5pt; border-bottom: 0.5pt dotted #ddd; }
    .kv:last-child { border-bottom: none; }
    .kv .lbl { color: #444; }
    .kv .val { font-weight: 500; text-align: right; }
    .kv.bold .val { font-weight: 700; }
    .kv.red  .val { color: #cc0000; }
    .kv.grn  .val { color: #007700; }

    section { margin-bottom: 12pt; }
    section h3 { font-size: 9.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5pt;
                 background: #222; color: #fff; padding: 3pt 8pt; margin-bottom: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
    thead tr { background: #e8e8e8; }
    th { padding: 3pt 5pt; text-align: left; font-weight: 700; border-bottom: 1pt solid #bbb; white-space: nowrap; }
    td { padding: 2.5pt 5pt; border-bottom: 0.5pt solid #e0e0e0; vertical-align: top; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .right { text-align: right; }
    .center { text-align: center; }
    .mono { font-family: 'Courier New', monospace; }
    .red-hdr h3 { background: #a00; }
    .amber-hdr h3 { background: #7a5c00; }
    .green-hdr h3 { background: #005f00; }
    .blue-hdr h3 { background: #003080; }

    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin-bottom: 10pt; }
    .stat-box { border: 1pt solid #ccc; border-radius: 3pt; padding: 6pt 8pt; text-align: center; }
    .stat-box .lbl { font-size: 7.5pt; color: #555; text-transform: uppercase; letter-spacing: 0.4pt; }
    .stat-box .val { font-size: 14pt; font-weight: 700; margin-top: 2pt; }

    .sig { border-top: 1.5pt solid #111; padding-top: 14pt; margin-top: 14pt; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 30pt; margin-top: 10pt; }
    .sig-line { border-bottom: 1pt solid #111; height: 30pt; margin-bottom: 4pt; }
    .sig-label { font-size: 8.5pt; }
    .footer { margin-top: 14pt; font-size: 7.5pt; color: #666; border-top: 0.5pt solid #ccc; padding-top: 6pt; text-align: center; }

    .void-row td { color: #a00; }
    .sub-items { margin: 2pt 0 2pt 8pt; font-size: 7.5pt; color: #555; }
    .sub-items div { display: flex; justify-content: space-between; }
  `

  // ── Sales log table rows ─────────────────────────────────────────────────
  const txnRows = salesLog.map((s, i) => {
    const isVoid = s.status === 'voided'
    const subItems = (s.items || []).map(it =>
      `<div><span>${esc(it.product_name)} ×${it.qty}</span><span>${kes(it.line_total)}</span></div>`
    ).join('')
    return `<tr class="${isVoid ? 'void-row' : ''}">
      <td class="mono">${esc(s.receipt_number)}</td>
      <td>${t(s.created_at)}</td>
      <td>${isVoid ? '<strong>VOID</strong>' : esc(s.payment_method?.toUpperCase())}</td>
      <td class="right">${s.items_count}</td>
      <td class="right">${kes(s.subtotal)}</td>
      <td class="right">${s.discount_total > 0 ? '-'+kes(s.discount_total) : '—'}</td>
      <td class="right">${s.tax_amount > 0 ? kes(s.tax_amount) : '—'}</td>
      <td class="right"><strong>${isVoid ? '(VOID)' : kes(s.total)}</strong></td>
      <td>
        ${s.mpesa_ref ? `<span class="mono">${esc(s.mpesa_ref)}</span>` : ''}
        ${s.change_given > 0 ? `Change: ${kes(s.change_given)}` : ''}
      </td>
    </tr>
    ${subItems ? `<tr><td colspan="9"><div class="sub-items">${subItems}</div></td></tr>` : ''}`
  }).join('')

  // ── Inventory log rows ───────────────────────────────────────────────────
  const invRows = invLog.map((m, i) => {
    const chg = m.qty_change > 0 ? `+${m.qty_change}` : String(m.qty_change)
    const col = m.qty_change < 0 ? 'color:#a00' : m.qty_change > 0 ? 'color:#007700' : ''
    return `<tr>
      <td>${t(m.created_at)}</td>
      <td>${esc(m.product_name)}</td>
      <td>${esc(m.movement_type?.replace(/_/g,' '))}</td>
      <td class="right">${m.qty_before}</td>
      <td class="right mono" style="${col}"><strong>${chg}</strong></td>
      <td class="right">${m.qty_after}</td>
      <td class="mono">${esc(m.reference_id || '—')}</td>
      <td>${esc(m.user_name || '—')}</td>
      <td>${esc(m.notes || '')}</td>
    </tr>`
  }).join('')

  // ── Account log rows ─────────────────────────────────────────────────────
  const accRows = accLog.map((a) => {
    const col = a.type === 'charge' ? 'color:#a00' : 'color:#007700'
    const sign = a.type === 'charge' ? '-' : '+'
    return `<tr>
      <td>${t(a.created_at)}</td>
      <td>${esc(a.type?.toUpperCase())}</td>
      <td class="mono">${esc(a.receipt_number || '—')}</td>
      <td class="right" style="${col}"><strong>${sign}${kes(Math.abs(a.amount))}</strong></td>
      <td class="right">${kes(a.balance_after)}</td>
      <td>${esc(a.payment_method || '—')}</td>
      <td>${esc(a.cashier_name || '—')}</td>
      <td>${esc(a.notes || '')}</td>
    </tr>`
  }).join('')

  // ── Loyalty log rows ─────────────────────────────────────────────────────
  const loyRows = loyaltyLog.map((l) => {
    const col = l.type === 'earn' ? 'color:#007700' : 'color:#a00'
    const sign = l.type === 'earn' ? '+' : '-'
    return `<tr>
      <td>${t(l.created_at)}</td>
      <td>${esc(l.type?.toUpperCase())}</td>
      <td class="right" style="${col}"><strong>${sign}${l.points} pts</strong></td>
      <td class="right">${l.balance_after} pts</td>
      <td>${esc(l.notes || '')}</td>
    </tr>`
  }).join('')

  // ── Override log rows ─────────────────────────────────────────────────────
  const ovrRows = (iov.details || []).map((oa) =>
    `<tr>
      <td>${t(oa.created_at)}</td>
      <td style="color:#a00;font-weight:700">${oa.action === 'REMOVE_COMMITTED_ITEM' ? 'REMOVE' : 'ADJUST QTY'}</td>
      <td>${esc(oa.item_name)}</td>
      <td class="right">${oa.original_qty}</td>
      <td class="right">${oa.action === 'REMOVE_COMMITTED_ITEM' ? '—' : oa.new_qty}</td>
      <td>${esc(oa.manager_name)} (${esc(oa.manager_role)})</td>
      <td>${esc(oa.auth_method)}</td>
      <td>${oa.sale_id ? '#'+oa.sale_id : 'cancelled'}</td>
    </tr>`
  ).join('')

  const voidRows = (ov.void_details || []).map((v) =>
    `<tr>
      <td>${dt(v.created_at)}</td>
      <td class="mono">${esc(v.reference_id || '—')}</td>
      <td class="right" style="color:#a00">${kes(v.amount)}</td>
      <td>${esc(v.cashier_name || '—')}</td>
      <td>${esc(v.reason || '—')}</td>
    </tr>`
  ).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Shift Report ${esc(report.report_number)}</title>
  <style>${CSS}</style></head><body>

  <!-- HEADER -->
  <div class="hdr">
    <div>
      <div class="store-name">${esc(store.name || 'Store')}</div>
      ${store.address ? `<div class="store-sub">${esc(store.address)}</div>` : ''}
      <div class="store-sub">${[store.phone, store.email].filter(Boolean).map(esc).join(' | ')}${store.tax_number ? ' | PIN: '+esc(store.tax_number) : ''}</div>
    </div>
    <div class="rpt-title">
      <h2>Shift Daily Report</h2>
      <div class="sub">${esc(report.report_number)} &nbsp;|&nbsp; Generated: ${dt(report.created_at)}</div>
      ${isReprint ? `<div class="reprint">REPRINT — COPY ${report.print_count}</div>` : ''}
    </div>
  </div>

  <!-- KEY METRICS -->
  <div class="stat-grid">
    <div class="stat-box">
      <div class="lbl">Total Revenue</div>
      <div class="val" style="font-size:12pt">${kes(summary.total_revenue)}</div>
    </div>
    <div class="stat-box">
      <div class="lbl">Transactions</div>
      <div class="val">${summary.transaction_count ?? 0}</div>
    </div>
    <div class="stat-box">
      <div class="lbl">Cash Variance</div>
      <div class="val" style="color:${shift.variance < 0 ? '#cc0000' : shift.variance > 0 ? '#007700' : '#111'};font-size:12pt">${kes(shift.variance)}</div>
    </div>
    <div class="stat-box">
      <div class="lbl">Override Events</div>
      <div class="val" style="color:${(iov.count||0)>0?'#cc0000':'#111'}">${iov.count ?? 0}</div>
    </div>
  </div>

  <!-- SHIFT + CASH RECON (2-col) -->
  <div class="grid2">
    <div class="box">
      <div class="box-title">Shift Details</div>
      <div class="box-body">
        <div class="kv"><span class="lbl">Cashier</span><span class="val">${esc(shift.cashier_name || '—')}</span></div>
        <div class="kv"><span class="lbl">Shift ID</span><span class="val mono">#${shift.id || '—'}</span></div>
        <div class="kv"><span class="lbl">Opened</span><span class="val">${dt(shift.opened_at)}</span></div>
        <div class="kv"><span class="lbl">Closed</span><span class="val">${dt(shift.closed_at)}</span></div>
        <div class="kv"><span class="lbl">Duration</span><span class="val">${(() => {
          if (!shift.opened_at || !shift.closed_at) return '—'
          const mins = Math.round((new Date(shift.closed_at) - new Date(shift.opened_at)) / 60000)
          return `${Math.floor(mins/60)}h ${mins%60}m`
        })()}</span></div>
        ${shift.notes ? `<div class="kv"><span class="lbl">Notes</span><span class="val">${esc(shift.notes)}</span></div>` : ''}
      </div>
    </div>
    <div class="box">
      <div class="box-title">Cash Reconciliation</div>
      <div class="box-body">
        <div class="kv"><span class="lbl">Opening Float</span><span class="val">${kes(shift.opening_float)}</span></div>
        <div class="kv"><span class="lbl">Cash Sales</span><span class="val">${kes(summary.cash_sales)}</span></div>
        <div class="kv bold"><span class="lbl">Expected in Drawer</span><span class="val">${kes(shift.expected_cash)}</span></div>
        <div class="kv bold"><span class="lbl">Actual Count</span><span class="val">${kes(shift.closing_float)}</span></div>
        <div class="kv bold ${shift.variance < 0 ? 'red' : shift.variance > 0 ? 'grn' : ''}">
          <span class="lbl">Variance ${shift.variance < 0 ? '(SHORT)' : shift.variance > 0 ? '(OVER)' : '(BALANCED)'}</span>
          <span class="val">${kes(shift.variance)}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- PAYMENT BREAKDOWN (3-col) -->
  <div class="grid3">
    <div class="box">
      <div class="box-title">Payment Breakdown</div>
      <div class="box-body">
        <div class="kv bold"><span class="lbl">Total Revenue</span><span class="val">${kes(summary.total_revenue)}</span></div>
        <div class="kv"><span class="lbl">Cash</span><span class="val">${kes(summary.cash_sales)}</span></div>
        <div class="kv"><span class="lbl">Card / EFTPOS</span><span class="val">${kes(summary.card_sales)}</span></div>
        <div class="kv"><span class="lbl">M-Pesa</span><span class="val">${kes(summary.mpesa_sales)}</span></div>
        <div class="kv"><span class="lbl">Split</span><span class="val">${kes(summary.split_sales)}</span></div>
        <div class="kv"><span class="lbl">Account</span><span class="val">${kes(summary.account_sales)}</span></div>
      </div>
    </div>
    <div class="box">
      <div class="box-title">Tax & Discounts</div>
      <div class="box-body">
        <div class="kv"><span class="lbl">Gross Sales</span><span class="val">${kes((summary.total_revenue||0) + (summary.total_discounts||0))}</span></div>
        <div class="kv"><span class="lbl">Discounts Given</span><span class="val" style="color:#a00">-${kes(summary.total_discounts)}</span></div>
        <div class="kv bold"><span class="lbl">Net Revenue</span><span class="val">${kes(summary.total_revenue)}</span></div>
        <div class="kv"><span class="lbl">VAT Collected</span><span class="val">${kes(summary.total_tax)}</span></div>
      </div>
    </div>
    <div class="box">
      <div class="box-title">Exceptions Summary</div>
      <div class="box-body">
        <div class="kv ${ov.void_count > 0 ? 'red' : ''}"><span class="lbl">Voided Sales</span><span class="val">${ov.void_count ?? 0}</span></div>
        <div class="kv ${ov.void_count > 0 ? 'red' : ''}"><span class="lbl">Voided Amount</span><span class="val">${kes(ov.void_amount)}</span></div>
        <div class="kv"><span class="lbl">No-Sale Events</span><span class="val">${ov.no_sale_count ?? 0}</span></div>
        <div class="kv ${(iov.count||0) > 0 ? 'red' : ''}"><span class="lbl">Item Overrides</span><span class="val">${iov.count ?? 0}</span></div>
        <div class="kv"><span class="lbl">Loyalty Txns</span><span class="val">${loyaltyLog.length}</span></div>
        <div class="kv"><span class="lbl">Account Txns</span><span class="val">${accLog.length}</span></div>
      </div>
    </div>
  </div>

  <!-- TRANSACTION LOG -->
  <section>
    <h3>Transaction Log (${salesLog.length} transactions)</h3>
    ${salesLog.length === 0 ? '<p style="padding:8pt;color:#666">No transactions this shift.</p>' : `
    <table>
      <thead><tr>
        <th>Receipt #</th><th>Time</th><th>Method</th><th class="right">Items</th>
        <th class="right">Subtotal</th><th class="right">Discount</th><th class="right">VAT</th>
        <th class="right">Total</th><th>Ref / Change</th>
      </tr></thead>
      <tbody>${txnRows}</tbody>
    </table>`}
  </section>

  ${ovrRows ? `
  <!-- ITEM OVERRIDE LOG -->
  <section class="red-hdr">
    <h3>Item Override Log — Manager Authorization Required (${iov.count ?? 0} events)</h3>
    <table>
      <thead><tr>
        <th>Time</th><th>Action</th><th>Item</th><th class="right">Qty Before</th>
        <th class="right">Qty After</th><th>Authorized By</th><th>Method</th><th>Sale #</th>
      </tr></thead>
      <tbody>${ovrRows}</tbody>
    </table>
  </section>` : ''}

  ${voidRows ? `
  <!-- VOIDED SALES LOG -->
  <section class="red-hdr">
    <h3>Voided Sales (${ov.void_count ?? 0})</h3>
    <table>
      <thead><tr>
        <th>Time</th><th>Receipt #</th><th class="right">Amount</th><th>Cashier</th><th>Reason</th>
      </tr></thead>
      <tbody>${voidRows}</tbody>
    </table>
  </section>` : ''}

  ${invRows ? `
  <!-- INVENTORY MOVEMENT LOG -->
  <section class="amber-hdr">
    <h3>Inventory Movement Log (${invLog.length} movements)</h3>
    <table>
      <thead><tr>
        <th>Time</th><th>Product</th><th>Type</th><th class="right">Before</th>
        <th class="right">Change</th><th class="right">After</th><th>Reference</th><th>User</th><th>Notes</th>
      </tr></thead>
      <tbody>${invRows}</tbody>
    </table>
  </section>` : ''}

  ${accRows ? `
  <!-- ACCOUNT / CREDIT LOG -->
  <section class="blue-hdr">
    <h3>Customer Account Transactions (${accLog.length})</h3>
    <table>
      <thead><tr>
        <th>Time</th><th>Type</th><th>Receipt</th><th class="right">Amount</th>
        <th class="right">Balance After</th><th>Method</th><th>Cashier</th><th>Notes</th>
      </tr></thead>
      <tbody>${accRows}</tbody>
    </table>
  </section>` : ''}

  ${loyRows ? `
  <!-- LOYALTY ACTIVITY -->
  <section class="green-hdr">
    <h3>Loyalty Programme Activity (${loyaltyLog.length} transactions)</h3>
    <table>
      <thead><tr>
        <th>Time</th><th>Type</th><th class="right">Points</th><th class="right">Balance After</th><th>Notes</th>
      </tr></thead>
      <tbody>${loyRows}</tbody>
    </table>
  </section>` : ''}

  <!-- SIGNATURES -->
  <div class="sig">
    <div style="font-weight:700;font-size:9pt;text-transform:uppercase;letter-spacing:0.5pt">Acknowledgement &amp; Signatures</div>
    <div class="sig-grid">
      <div>
        <div class="sig-line"></div>
        <div class="sig-label">Cashier: <strong>${esc(shift.cashier_name || '______________________')}</strong></div>
        <div class="sig-label" style="margin-top:3pt">Date: ____________________</div>
      </div>
      <div>
        <div class="sig-line"></div>
        <div class="sig-label">Supervisor / Manager: ____________________</div>
        <div class="sig-label" style="margin-top:3pt">Date: ____________________</div>
      </div>
      <div>
        <div class="sig-line"></div>
        <div class="sig-label">Accountant / Finance: ____________________</div>
        <div class="sig-label" style="margin-top:3pt">Date: ____________________</div>
      </div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    ${esc(report.report_number)} &nbsp;|&nbsp; Generated by POS System &nbsp;|&nbsp; ${esc(report.generated_by_name || '')} &nbsp;|&nbsp; ${dt(report.created_at)}
    ${report.filed_by_name ? ` &nbsp;|&nbsp; Filed by ${esc(report.filed_by_name)} on ${dt(report.filed_at)}` : ''}
    &nbsp;|&nbsp; This is an official document. Alterations are prohibited.
  </div>

  </body></html>`

  printDoc(`Shift Report ${report.report_number}`, html)
}

/**
 * Phase 39 — A4 Daily Shift Reconciliation Report
 * Uses the Phase 39 content JSON shape (tenders, overrides, transactions).
 */
export function printShiftReconciliation(report) {
  const c       = report.content || {}
  const store   = c.store   || {}
  const shift   = c.shift   || {}
  const tenders = c.tenders || []
  const ov      = c.overrides  || {}
  const txns    = c.transactions || {}
  const recoBy  = c.reconciled_by || {}

  const kes = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const dt  = (s) => s ? new Date(s).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' }) : '—'
  const esc = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

  const shiftDate = shift.opened_at ? new Date(shift.opened_at).toLocaleDateString('en-KE') : '—'
  const reportId  = c.report_id || report.report_number || 'PREVIEW'

  const overallStatus = c.overall_status || 'BALANCED'
  const hasDisc = tenders.some(t => t.variance !== 0)

  function varStyle(v) {
    if (v === 0) return 'color:#007700; font-weight:700'
    return v < 0 ? 'color:#a00; font-weight:700' : 'color:#7a5c00; font-weight:700'
  }
  function varText(v) {
    if (v === 0) return 'BALANCED'
    return v < 0 ? `SHORT ${kes(Math.abs(v))}` : `OVER ${kes(v)}`
  }

  // ── Antitheft alert data ─────────────────────────────────────────────────
  const voidedTxns    = (txns.list || []).filter(t => t.status !== 'completed')
  const removedItems  = (ov.details || []).filter(d => d.action === 'REMOVE_ITEM')
  const qtyAdjusts    = (ov.details || []).filter(d => d.action === 'ADJUST_QTY')
  const hasAlerts     = voidedTxns.length > 0 || removedItems.length > 0 || qtyAdjusts.length > 0 || ov.flagged

  const alertVoidRows = voidedTxns.map(t => `
    <tr>
      <td>${dt(t.time)}</td>
      <td class="mono">${esc(t.receipt_number || '—')}</td>
      <td style="text-transform:capitalize">${esc(t.tender || '—')}</td>
      <td class="right" style="color:#a00;font-weight:700">${kes(t.amount)}</td>
      <td style="color:#a00;font-weight:600">VOIDED</td>
    </tr>
  `).join('')

  const alertRemoveRows = removedItems.map(d => `
    <tr>
      <td>${dt(d.time)}</td>
      <td>${esc(d.cashier_name || '—')}</td>
      <td>${esc(d.item_name || '—')}</td>
      <td class="right">${d.original_qty || 0} → 0</td>
      <td class="right" style="color:#a00;font-weight:700">${kes(d.value_impact || 0)}</td>
    </tr>
  `).join('')

  const alertQtyRows = qtyAdjusts.map(d => `
    <tr>
      <td>${dt(d.time)}</td>
      <td>${esc(d.cashier_name || '—')}</td>
      <td>${esc(d.item_name || '—')}</td>
      <td class="right">${d.original_qty || 0} → ${d.new_qty ?? 0}</td>
      <td class="right" style="color:#7a5c00;font-weight:700">${(d.value_impact || 0) >= 0 ? '+' : ''}${kes(d.value_impact || 0)}</td>
    </tr>
  `).join('')

  const tenderRows = tenders.map(t => `
    <tr>
      <td style="font-weight:500;text-transform:capitalize">${esc(t.tender)}</td>
      <td class="right">${kes(t.expected)}</td>
      <td class="right">${kes(t.actual)}</td>
      <td class="right" style="${varStyle(t.variance)}">${varText(t.variance)}</td>
      <td class="center"><span style="${varStyle(t.variance)}">${esc(t.status)}</span></td>
    </tr>
  `).join('')

  const overrideRows = (ov.details || []).map(d => `
    <tr>
      <td>${dt(d.time)}</td>
      <td>${esc(d.cashier_name || '—')}</td>
      <td style="color:${d.action === 'REMOVE_ITEM' ? '#a00' : '#7a5c00'}">${esc(d.action)}</td>
      <td>${esc(d.item_name || '—')}</td>
      <td class="right">${d.original_qty || 0} → ${d.new_qty ?? 0}</td>
      <td class="right" style="${d.value_impact < 0 ? 'color:#a00' : ''}">${(d.value_impact || 0) >= 0 ? '+' : ''}${kes(d.value_impact || 0)}</td>
    </tr>
  `).join('')

  const txnRows = (txns.list || []).slice(0, 100).map(t => `
    <tr style="${t.status !== 'completed' ? 'opacity:0.5' : ''}">
      <td>${dt(t.time)}</td>
      <td class="mono">${esc(t.receipt_number || '—')}</td>
      <td class="right">${t.items_count || 0}</td>
      <td style="text-transform:capitalize">${esc(t.tender || '—')}</td>
      <td class="right">${kes(t.amount)}</td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', serif; font-size: 10pt; color: #111; }
    @page { size: A4 portrait; margin: 18mm; }
    .hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5pt solid #111; padding-bottom: 10pt; margin-bottom: 12pt; }
    .store-name { font-size: 15pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1pt; }
    .store-sub { font-size: 8pt; color: #444; margin-top: 2pt; }
    .rpt-right { text-align: right; }
    .rpt-right h2 { font-size: 12pt; text-transform: uppercase; letter-spacing: 1pt; }
    .rpt-right .sub { font-size: 8pt; color: #555; margin-top: 2pt; }
    .overall { padding: 8pt 12pt; margin-bottom: 12pt; border: 2pt solid ${hasDisc ? '#a00' : '#007700'}; border-radius: 3pt; font-size: 11pt; font-weight: 700; color: ${hasDisc ? '#a00' : '#007700'}; }
    section { margin-bottom: 14pt; }
    section h3 { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5pt; background: #222; color: #fff; padding: 3pt 8pt; }
    table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-top: 0; }
    thead tr { background: #e8e8e8; }
    th { padding: 3pt 5pt; text-align: left; font-weight: 700; border-bottom: 1pt solid #bbb; }
    td { padding: 2.5pt 5pt; border-bottom: 0.5pt solid #e0e0e0; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .right { text-align: right; }
    .center { text-align: center; }
    .mono { font-family: 'Courier New', monospace; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; margin-bottom: 12pt; font-size: 9pt; }
    .meta .kv { display: flex; justify-content: space-between; padding: 1.5pt 0; border-bottom: 0.5pt dotted #ddd; }
    .meta .kv .lbl { color: #555; }
    .meta .kv .val { font-weight: 500; }
    .totals { margin-top: 6pt; padding-top: 6pt; border-top: 1.5pt solid #111; display: flex; justify-content: space-between; font-size: 9.5pt; }
    .sig { border-top: 1.5pt solid #111; padding-top: 14pt; margin-top: 14pt; page-break-inside: avoid; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40pt; margin-top: 10pt; }
    .sig-line { border-bottom: 1pt solid #111; height: 30pt; margin-bottom: 4pt; }
    .sig-label { font-size: 8pt; color: #444; }
    .footer { margin-top: 12pt; font-size: 7.5pt; color: #666; border-top: 0.5pt solid #ccc; padding-top: 6pt; text-align: center; }
    .flagged-warn { background: #fee2e2; border: 1pt solid #fca5a5; padding: 4pt 8pt; margin: 4pt 0; font-size: 8.5pt; color: #a00; }
    .cwp-warn { background: #fef3c7; border: 1pt solid #f59e0b; padding: 4pt 8pt; margin-bottom: 8pt; font-size: 8.5pt; color: #7a5c00; }
    .alert-box { border: 2.5pt solid #b91c1c; border-radius: 3pt; margin-bottom: 14pt; page-break-inside: avoid; }
    .alert-box-hdr { background: #b91c1c; color: #fff; padding: 5pt 10pt; font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1pt; display: flex; justify-content: space-between; align-items: center; }
    .alert-box-hdr span { font-size: 8pt; font-weight: 400; letter-spacing: 0; text-transform: none; }
    .alert-sub { background: #fee2e2; padding: 3pt 10pt; font-size: 8pt; font-weight: 700; color: #7f1d1d; text-transform: uppercase; letter-spacing: 0.5pt; margin-top: 0; border-top: 1pt solid #fca5a5; }
    .alert-box table { margin: 0; }
    .alert-box td, .alert-box th { padding: 2.5pt 8pt; }
    .alert-box thead tr { background: #fecaca; }
    .alert-box tbody tr:nth-child(even) td { background: #fff5f5; }
    .alert-none { padding: 10pt; font-size: 9pt; color: #555; font-style: italic; text-align: center; }
  </style></head><body>

  <!-- Header -->
  <div class="hdr">
    <div>
      <div class="store-name">${esc(store.name || 'Store')}</div>
      <div class="store-sub">${esc(store.address || '')}${store.kra_pin ? ' · KRA PIN: ' + esc(store.kra_pin) : ''}</div>
    </div>
    <div class="rpt-right">
      <h2>Daily Shift Reconciliation</h2>
      <div class="sub">Report ID: ${esc(reportId)}</div>
      <div class="sub">Date: ${shiftDate}</div>
    </div>
  </div>

  ${c.closed_without_print ? '<div class="cwp-warn">CLOSED WITHOUT PRINTING — no hardcopy on record</div>' : ''}

  <!-- Shift meta -->
  <div class="meta">
    <div>
      <div class="kv"><span class="lbl">Cashier</span><span class="val">${esc(shift.cashier_name || '—')}</span></div>
      <div class="kv"><span class="lbl">Manager / Reconciled by</span><span class="val">${esc(recoBy.name || '—')}</span></div>
      <div class="kv"><span class="lbl">Shift opened</span><span class="val">${dt(shift.opened_at)}</span></div>
      <div class="kv"><span class="lbl">Shift closed</span><span class="val">${dt(shift.closed_at)}</span></div>
    </div>
    <div>
      <div class="kv"><span class="lbl">Opening float</span><span class="val">${kes(shift.opening_float)}</span></div>
      <div class="kv"><span class="lbl">Expected revenue</span><span class="val">${kes(c.total_expected_revenue)}</span></div>
      <div class="kv"><span class="lbl">Actual revenue</span><span class="val">${kes(c.total_actual_revenue)}</span></div>
      <div class="kv"><span class="lbl">Net variance</span><span class="val" style="${varStyle(c.total_variance || 0)}">${(c.total_variance || 0) >= 0 ? '+' : ''}${kes(c.total_variance || 0)}</span></div>
    </div>
  </div>

  <!-- Overall status -->
  <div class="overall">
    Overall: ${esc(overallStatus)}${hasDisc ? ' — DISCREPANCY DETECTED' : ' — ALL TENDERS BALANCED'}
  </div>

  <!-- Antitheft Alerts -->
  ${hasAlerts ? `
  <div class="alert-box">
    <div class="alert-box-hdr">
      &#9888; Antitheft Alerts
      <span>${voidedTxns.length} void${voidedTxns.length !== 1 ? 's' : ''} &nbsp;·&nbsp; ${removedItems.length} removed item${removedItems.length !== 1 ? 's' : ''} &nbsp;·&nbsp; ${qtyAdjusts.length} qty adjustment${qtyAdjusts.length !== 1 ? 's' : ''}${ov.flagged ? ' &nbsp;·&nbsp; ⚑ HIGH OVERRIDE %' : ''}</span>
    </div>

    ${ov.flagged ? `<div class="flagged-warn" style="margin:0;border-radius:0;border-left:none;border-right:none;border-top:none">Override activity is ${ov.pct_of_sales}% of total sales — investigate before filing</div>` : ''}

    ${voidedTxns.length > 0 ? `
    <div class="alert-sub">Voided / Cancelled Sales (${voidedTxns.length})</div>
    <table>
      <thead><tr><th>Time</th><th>Receipt #</th><th>Tender</th><th class="right">Amount</th><th>Status</th></tr></thead>
      <tbody>${alertVoidRows}</tbody>
    </table>` : ''}

    ${removedItems.length > 0 ? `
    <div class="alert-sub">Items Removed from Sales (${removedItems.length})</div>
    <table>
      <thead><tr><th>Time</th><th>Cashier</th><th>Item removed</th><th class="right">Qty before</th><th class="right">Value impact</th></tr></thead>
      <tbody>${alertRemoveRows}</tbody>
    </table>` : ''}

    ${qtyAdjusts.length > 0 ? `
    <div class="alert-sub">Quantity Adjustments (${qtyAdjusts.length})</div>
    <table>
      <thead><tr><th>Time</th><th>Cashier</th><th>Item</th><th class="right">Qty change</th><th class="right">Value impact</th></tr></thead>
      <tbody>${alertQtyRows}</tbody>
    </table>` : ''}
  </div>` : '<div style="margin-bottom:14pt;font-size:8.5pt;color:#007700;padding:6pt 0">&#10003; No antitheft flags for this shift.</div>'}

  <!-- Section 1: Tender reconciliation -->
  <section>
    <h3>Section 1 — Tender Reconciliation</h3>
    <table>
      <thead><tr><th>Tender</th><th class="right">Expected</th><th class="right">Actual (counted)</th><th class="right">Variance</th><th class="center">Status</th></tr></thead>
      <tbody>
        ${tenderRows}
      </tbody>
    </table>
    ${tenders.length > 0 ? `
    <div class="totals">
      <span>Total expected revenue</span>
      <strong>${kes(c.total_expected_revenue)}</strong>
    </div>` : ''}
  </section>

  <!-- Section 2: Override summary -->
  <section>
    <h3>Section 2 — Override Summary</h3>
    ${ov.flagged ? `<div class="flagged-warn">Override activity is ${ov.pct_of_sales}% of today's sales — review recommended</div>` : ''}
    <div style="font-size:9pt; padding: 4pt 0 6pt; display:flex; gap:20pt">
      <span>Total overrides: <strong>${ov.count || 0}</strong></span>
      <span>Total value impacted: <strong>${kes(ov.total_value_impact)}</strong></span>
    </div>
    ${(ov.details || []).length > 0 ? `
    <table>
      <thead><tr><th>Time</th><th>Cashier</th><th>Action</th><th>Item</th><th class="right">Qty change</th><th class="right">Value impact</th></tr></thead>
      <tbody>${overrideRows}</tbody>
    </table>` : '<div style="font-size:9pt;color:#555;padding:4pt 0">No manager overrides recorded for this shift.</div>'}
  </section>

  <!-- Section 3: Transaction summary -->
  <section>
    <h3>Section 3 — Transaction Summary</h3>
    <div style="font-size:9pt; padding: 4pt 0 6pt; display:flex; gap:20pt; flex-wrap:wrap">
      <span>Total transactions: <strong>${txns.total_count || 0}</strong></span>
      ${Object.entries(txns.by_tender || {}).map(([t, d]) =>
        `<span style="text-transform:capitalize">${esc(t)}: <strong>${d.count}</strong> · ${kes(d.total)}</span>`
      ).join('')}
    </div>
    ${txnRows ? `
    <table>
      <thead><tr><th>Time</th><th>Receipt</th><th class="right">Items</th><th>Tender</th><th class="right">Amount</th></tr></thead>
      <tbody>${txnRows}</tbody>
    </table>
    ${(txns.list || []).length > 100 ? '<div style="font-size:8pt;color:#555;padding:4pt 0">Showing first 100 transactions. See full report for complete list.</div>' : ''}
    ` : ''}
  </section>

  <!-- Signature block -->
  <div class="sig">
    <div style="font-size:9pt;font-weight:700;margin-bottom:8pt">Acknowledgement &amp; Sign-off</div>
    <div class="sig-grid">
      <div>
        <div class="sig-line"></div>
        <div class="sig-label">Cashier: ${esc(shift.cashier_name || '________________')}</div>
        <div class="sig-label" style="margin-top:4pt">Signature: _________________ &nbsp;&nbsp; Date: _________</div>
      </div>
      <div>
        <div class="sig-line"></div>
        <div class="sig-label">Manager: ${esc(recoBy.name || '________________')}</div>
        <div class="sig-label" style="margin-top:4pt">Signature: _________________ &nbsp;&nbsp; Date: _________</div>
      </div>
    </div>
  </div>

  <div class="footer">
    This report was generated automatically and constitutes an official record of shift activity.
    Print in portrait, A4, no margins.
  </div>

  </body></html>`

  printDoc(`Shift Reconciliation ${reportId}`, html)
}


// ── Phase 31C — Barcode Label Printing ───────────────────────────────────────

/**
 * Print a barcode label for a product.
 * format: 'label' (58mm single) | 'a4' (30-up Avery sheet)
 */
// ── Barcode label printing ────────────────────────────────────────────────────
// printBarcodeLabels(items, format, storeName)
//
//   items    — array of { product, qty } where qty = number of label copies
//   format   — '58mm' | 'a4'
//   storeName — optional store name printed on each label
//
// Replaces the old single-product printBarcodeLabel.
// The legacy export alias is kept for backward compat.

export function printBarcodeLabels(items = [], format = '58mm', storeName = '') {
  if (!items.length) return

  function bv(p) { return p.barcode || p.plu_code || String(p.id) }

  function labelHtml(p) {
    const code = bv(p)
    return `
      <div class="label">
        ${storeName ? `<div class="lbl-store">${storeName}</div>` : ''}
        <div class="lbl-name">${p.name || ''}</div>
        <svg class="lbl-barcode" data-val="${code}"></svg>
        <div class="lbl-meta">
          <span class="lbl-code">${code !== String(p.id) ? code : ''}</span>
          ${p.price != null ? `<span class="lbl-price">KES ${Number(p.price).toFixed(2)}</span>` : ''}
        </div>
      </div>`
  }

  // Expand items × qty into flat label list
  const labels = items.flatMap(({ product, qty = 1 }) =>
    Array.from({ length: Math.max(1, qty) }, () => labelHtml(product))
  )

  const isA4 = format === 'a4'
  const title = items.length === 1 ? (items[0].product.name || 'Label') : `${labels.length} Labels`

  const css = isA4 ? `
    @page { size: A4; margin: 10mm 8mm; }
    body { margin: 0; font-family: Arial, sans-serif; }
    .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
    .label { border: 0.3mm solid #ccc; border-radius: 2mm; padding: 3mm 4mm; display: flex; flex-direction: column; align-items: center; gap: 1mm; page-break-inside: avoid; min-height: 28mm; }
    .lbl-store { font-size: 6pt; color: #888; text-transform: uppercase; letter-spacing: 0.5pt; }
    .lbl-name { font-size: 8pt; font-weight: 700; text-align: center; line-height: 1.2; }
    .lbl-barcode { width: 100%; height: 13mm; }
    .lbl-meta { display: flex; justify-content: space-between; width: 100%; font-size: 7pt; color: #333; margin-top: 1mm; }
    .lbl-price { font-weight: 700; }
    .lbl-code { color: #666; }
  ` : `
    @page { size: 58mm 35mm; margin: 1.5mm; }
    body { margin: 0; font-family: Arial, sans-serif; }
    .sheet { display: block; }
    .label { display: flex; flex-direction: column; align-items: center; gap: 0.5mm; padding: 1mm; page-break-after: always; }
    .label:last-child { page-break-after: auto; }
    .lbl-store { font-size: 6pt; color: #888; text-transform: uppercase; }
    .lbl-name { font-size: 9pt; font-weight: 700; text-align: center; }
    .lbl-barcode { width: 52mm; height: 14mm; }
    .lbl-meta { display: flex; justify-content: space-between; width: 54mm; font-size: 8pt; }
    .lbl-price { font-weight: 700; font-size: 10pt; }
    .lbl-code { font-size: 7pt; color: #666; }
  `

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${title}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>${css}</style>
</head><body>
<div class="sheet">${labels.join('')}</div>
<script>
  try {
    document.querySelectorAll('.lbl-barcode').forEach(function(el) {
      if (el.dataset.val) {
        JsBarcode(el, el.dataset.val, { format:'CODE128', width:1.4, height:36, displayValue:true, fontSize:8, margin:2 });
      }
    });
  } catch(e) { console.error(e); }
  window.onload = function() { window.print(); };
<\/script>
</body></html>`

  const w = window.open('', '_blank', 'width=700,height=500')
  if (!w) return
  w.document.write(html)
  w.document.close()
}

// Legacy single-product alias
export function printBarcodeLabel(product, format = 'label') {
  printBarcodeLabels(
    [{ product, qty: format === 'a4' ? 30 : 1 }],
    format === 'a4' ? 'a4' : '58mm'
  )
}

// ── Reconciliation / Day Audit Report ─────────────────────────────────────────

export function printReconciliation(data, store = {}) {
  const { date_from, date_to, summary = {}, events = [] } = data
  const storeName = store.name || 'Store'
  const fmtDate = (iso) => {
    if (!iso) return ''
    return new Date(iso).toLocaleString('en-KE', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }
  const fmt = (n) => `KES ${(+n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const SOURCE_LABEL = {
    sale:     'Sale',
    void:     'Void',
    override: 'Override',
    stock:    'Stock Move',
    audit:    'System',
  }
  const TYPE_COLOR = {
    completed:  '#16a34a',
    voided:     '#dc2626',
    void_sale:  '#dc2626',
    no_sale:    '#f59e0b',
    override:   '#7c3aed',
    sale_adj:   '#2563eb',
    stock:      '#0891b2',
  }

  const headerRow = `<tr style="background:#1e3a5f;color:#fff;font-size:9pt;">
    <th style="padding:4px 6px;text-align:left;width:130px">Time</th>
    <th style="padding:4px 6px;text-align:left;width:70px">Source</th>
    <th style="padding:4px 6px;text-align:left;width:80px">Type</th>
    <th style="padding:4px 6px;text-align:left">User</th>
    <th style="padding:4px 6px;text-align:left">Entity / Receipt</th>
    <th style="padding:4px 6px;text-align:right">Amount (KES)</th>
    <th style="padding:4px 6px;text-align:left">Details</th>
  </tr>`

  const rows = events.map(e => {
    const color = TYPE_COLOR[e.type] || '#374151'
    let amount = ''
    let detail = ''

    if (e.source === 'sale') {
      amount = fmt(e.details?.total)
      const items = (e.details?.items || [])
        .map(i => `${i.product_name} x${i.qty} @ ${fmt(i.unit_price)} = ${fmt(i.line_total)}`)
        .join('<br>')
      const pay = e.details?.payment_method || ''
      const tenders = e.details?.tenders
      const payInfo = tenders
        ? tenders.map(t => `${t.method}: ${fmt(t.amount)}`).join(', ')
        : pay
      detail = `${payInfo}${items ? '<br>' + items : ''}`
    } else if (e.source === 'void') {
      amount = fmt(e.details?.amount)
      detail = `Reason: ${e.details?.reason || '—'} | Manager: ${e.details?.manager || '—'}`
    } else if (e.source === 'override') {
      detail = `${e.details?.action || ''}: ${e.details?.item_name || ''} | ${e.details?.original_qty ?? '?'} → ${e.details?.new_qty ?? '?'} | Auth: ${e.authorizer || '—'}`
    } else if (e.source === 'stock') {
      const ch = e.details?.qty_change ?? 0
      detail = `${ch >= 0 ? '+' : ''}${ch} units (${e.details?.qty_before} → ${e.details?.qty_after}) | ${e.details?.notes || ''}`
    } else if (e.source === 'audit') {
      const d = e.details
      detail = d ? Object.entries(d).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(' | ') : ''
    }

    return `<tr style="border-bottom:1px solid #e5e7eb;font-size:8.5pt;vertical-align:top;">
      <td style="padding:3px 6px;white-space:nowrap">${fmtDate(e.time)}</td>
      <td style="padding:3px 6px">${SOURCE_LABEL[e.source] || e.source}</td>
      <td style="padding:3px 6px;color:${color};font-weight:600">${e.type || ''}</td>
      <td style="padding:3px 6px">${e.user || '—'}<br><span style="color:#6b7280;font-size:7.5pt">${e.user_role || ''}</span></td>
      <td style="padding:3px 6px">${e.entity || '—'}</td>
      <td style="padding:3px 6px;text-align:right;font-weight:600">${amount}</td>
      <td style="padding:3px 6px;color:#374151;font-size:8pt">${detail}</td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Reconciliation Report — ${date_from}${date_to !== date_from ? ' to ' + date_to : ''}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; background: #fff; padding: 15mm 18mm; }
@media print { @page { size: A4 landscape; margin: 0; } body { padding: 12mm 15mm; } }
h1 { font-size: 16pt; margin-bottom: 2px; }
h2 { font-size: 11pt; color: #555; margin-bottom: 12px; font-weight: normal; }
.summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.stat { background: #f3f4f6; border-radius: 6px; padding: 8px 14px; min-width: 120px; }
.stat-label { font-size: 8pt; color: #6b7280; text-transform: uppercase; }
.stat-value { font-size: 13pt; font-weight: 700; color: #111; }
.stat-value.green { color: #16a34a; }
.stat-value.red   { color: #dc2626; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
</style>
</head><body>
<h1>${storeName} — Reconciliation Report</h1>
<h2>Period: ${date_from}${date_to !== date_from ? ' to ' + date_to : ''} &nbsp;|&nbsp; Printed: ${new Date().toLocaleString('en-KE')}</h2>

<div class="summary">
  <div class="stat"><div class="stat-label">Sales</div><div class="stat-value">${summary.sales_count ?? 0}</div></div>
  <div class="stat"><div class="stat-label">Total Revenue</div><div class="stat-value green">${fmt(summary.total_revenue)}</div></div>
  <div class="stat"><div class="stat-label">Discounts</div><div class="stat-value">${fmt(summary.total_discounts)}</div></div>
  <div class="stat"><div class="stat-label">Tax Collected</div><div class="stat-value">${fmt(summary.total_tax)}</div></div>
  <div class="stat"><div class="stat-label">Voided</div><div class="stat-value red">${summary.voided_count ?? 0} (${fmt(summary.void_amount)})</div></div>
  <div class="stat"><div class="stat-label">Overrides</div><div class="stat-value">${summary.override_count ?? 0}</div></div>
  <div class="stat"><div class="stat-label">Stock Moves</div><div class="stat-value">${summary.stock_move_count ?? 0}</div></div>
  <div class="stat"><div class="stat-label">Total Events</div><div class="stat-value">${summary.event_count ?? 0}</div></div>
</div>

<table>
  <thead>${headerRow}</thead>
  <tbody>${rows || '<tr><td colspan="7" style="padding:20px;text-align:center;color:#6b7280">No events in this period</td></tr>'}</tbody>
</table>
</body></html>`

  printDoc(`Reconciliation ${date_from}`, html)
}
