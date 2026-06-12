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
