# POS Hardware — Build Plan

## Tech Stack
- **Frontend:** React + Vite, full-screen kiosk mode
- **Backend:** Python / Flask, SQLite (local), PostgreSQL (cloud sync)
- **Hardware:** ESC/POS printer, HID barcode scanner, Stripe Terminal, cash drawer, USB scale

## Architecture
```
[ React UI ] <---> [ Local Flask API ] <---> [ SQLite ]
                          |
                          v
                   [ Sync Engine ] <---> [ PostgreSQL (cloud) ]
```

---

## Role Definitions (source of truth)

Every feature gating decision must follow this table.

| Role | Who they are | Home screen |
|---|---|---|
| **cashier** | Front-desk, operates POS terminal | Checkout |
| **inventory** | Warehouse / store keeper | Inventory |
| **purchasing** | Procurement officer | Purchase Orders |
| **supplier** | External vendor (limited portal) | Purchase Orders |
| **manager** | Store manager, approves & reports | Dashboard |
| **admin** | IT / owner, full system access | Dashboard |

### What each role sees

| Page / Feature | cashier | inventory | purchasing | supplier | manager | admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Checkout (POS)** | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Quotes** | ✅ create | ❌ | ❌ | ❌ | ✅ full | ✅ full |
| **Dashboard** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Products** | ❌ | ✅ full | 👁 view only | ❌ | ✅ full | ✅ full |
| **Inventory** | ❌ | ✅ full (no revenue) | 👁 qty/names only | ❌ | ✅ full | ✅ full |
| **Suppliers** | ❌ | ❌ | ✅ full | 👁 own profile | ✅ full | ✅ full |
| **Purchase Orders** | ❌ | 👁 view + receive | ✅ create/manage | 👁 own POs only | ✅ full + approve | ✅ full |
| **Returns** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Shifts** | 👁 own current | ❌ | ❌ | ❌ | ✅ full | ✅ full |
| **Customers** | ✅ basic lookup | ❌ | ❌ | ❌ | ✅ full | ✅ full |
| **Accounts** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Loyalty** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Reports — Sales/Revenue** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Reports — Cashier/Shift** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Reports — Inventory** | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Reports — Purchasing/PO** | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| **Terminals** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Cloud Sync** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Settings** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

### Data visibility rules
- **Revenue / sales totals / transaction amounts** → manager + admin ONLY
- **Prices (selling price)** → inventory + manager + admin (to manage catalog)
- **Cost prices / unit cost on POs** → purchasing + manager + admin
- **Stock quantities** → inventory + purchasing + manager + admin
- **Stock monetary value (KES)** → manager + admin ONLY
- **Customer personal data** → cashier (basic) + manager + admin
- **Staff / payroll data** → manager + admin ONLY

---

## Completed Phases

| Phase | Description | Status |
|---|---|---|
| 1 | Core POS: products, cart, sales, receipts | ✅ |
| 2 | Inventory management, stock adjustments | ✅ |
| 3 | Suppliers, purchase orders, receiving | ✅ |
| 4 | Dashboard, reports, store config, CSV export | ✅ |
| 5 | Cloud sync to PostgreSQL | ✅ |
| 6 | Customer deposit/prepaid accounts, M-Pesa | ✅ |
| 7 | Quotes / Proforma invoices | ✅ |
| 8 | RBAC: PIN login, role-filtered nav, theme toggle | ✅ |
| 9A | Two-step auth (dept PIN + personal PIN), audit log | ✅ |
| 9B | Role cleanup, manager-controlled shifts, daily reconciliation | ✅ |
| 9C | Manager auth card (sudo elevation), shift gate on POS | ✅ |
| 9D | Purchaser limits, PO approval workflow, supplier role, cart removal auth, Settings overhaul | ✅ |
| 10 | ESC/POS receipt printer (KES, M-Pesa ref, KRA PIN), cash drawer, reprint button | ✅ |
| 13 | POS UX (category filter, pagination, unit display, account balance, auto-refresh), inventory sort, accountability hardening | ✅ |
| 14 | Shift report filing system (auto-generate, print/file lifecycle, A4 print, shift-open gate) | ✅ |
| 15 | Professional printouts: POS receipt (80mm), quote/invoice, purchase order, shift report — all with store header + signature blocks | ✅ |
| 16 | Role logic & access control cleanup — nav/route guards, role-scoped Inventory, role-gated Reports tabs, read-only Products for purchasing, backend 403 enforcement on all sensitive endpoints | ✅ |
| 17 | Inventory operations & GRN system — StockMovement unified log, GoodsReceivedNote (auto on PO receive), DamageReport workflow (raise→approve→write-off), physical count sheet print, movement report print | ✅ |
| 18 | Role-gated reports with per-department A4 printouts — purchasing tab, inventory tab hides prices from inventory role, Print Report button per tab | ✅ |
| 19 | Tax Invoice & B2B Documents — KRA-compliant INV-YYYY-NNNN invoices, credit notes (CN-YYYY-NNNN) auto-generated on returns, invoice history on customer detail, Print Invoice on POS completion screen | ✅ |
| 20 | Returns & Refunds Workflow — manager approval gate for refunds above threshold, invoice/receipt lookup, Approve/Reject UI, Returns Report tab in Reports with A4 printout | ✅ |

---

## Remaining Phases

---

### Phase 16 — Role Logic & Access Control Cleanup ✅ COMPLETE

**Implemented:**
- `App.jsx`: NAV restructured by department; `cashier` sees Quotes; `purchasing` sees read-only Stock; `inventory` home → `/inventory`
- `Inventory.jsx`: purchasing gets read-only view (no price, no Adjust, no History tab); non-manager hides Stock Value stat card
- `Reports.jsx`: TABS array filtered by role; `inventory` auto-redirects to Inventory tab only; `load()` guarded to bail on inaccessible tabs
- `Products.jsx`: purchasing read-only (no Add/Edit/Disable buttons, no Price/Tax columns); fixed `$` currency bug
- Backend: `reports.py`, `inventory.py`, `products.py` all have role 403 guards on write/sensitive endpoints

---

### Phase 17 — Inventory Operations & GRN System ✅ COMPLETE

**Implemented:**

#### 17A — Goods Received Note (GRN)
- `GoodsReceivedNote` + `GRNItem` models (`goods_received_notes`, `grn_items` tables)
- Auto-generated in `receive_po()` whenever items are received — every partial or full receive creates a GRN
- Status flow: `draft → confirmed → signed_off`
- `routes/grn.py` blueprint: `GET /api/grns`, `GET /api/grns/<id>`, `POST /api/grns/<id>/confirm`, `POST /api/grns/<id>/sign-off`
- Inventory page "GRNs" tab: list with Confirm (inventory) and Sign Off (manager) actions
- **Printout:** `printGRN()` in `utils/print.js` — A4 with letterhead, supplier/PO info, items table with ordered vs received vs variance, total value, 3-party signature block

#### 17B — Stock Movement Log
- `StockMovement` model (`stock_movements` table): product, qty_before/change/after, movement_type, reference_type/id, user, timestamp
- Movement types: `sale`, `po_receipt`, `manual_add`, `manual_remove`, `damage`, `write_off`, `theft`, `count_correction`, `return`
- `adjust_stock()` writes both `StockAdjustment` (backward compat) and `StockMovement`
- `receive_po()` writes `StockMovement` per product received
- `GET /api/inventory/movements` — filterable by type, date range, product
- Inventory page "Movement Log" tab with type/date filters
- **Printout:** `printMovementReport()` — A4 with all movements, manager signature

#### 17C — Damage & Write-off Workflow
- `DamageReport` model (`damage_reports` table): raised by inventory, reviewed by manager
- Status: `raised → approved / rejected`; approval auto-reduces stock + writes `write_off` StockMovement
- API: `POST /api/inventory/damage-reports`, `GET /api/inventory/damage-reports`, `/approve`, `/reject`
- Inventory "Damage Reports" tab: raise from stock table, manager review modal with approve/reject
- **Printout:** `printDamageReport()` — A4 with product details, reason, reviewer notes, 2-party signature

#### 17D — Physical Count Sheet
- "Print Count Sheet" button on stock tab (filtered by current search)
- `printCountSheet()` — A4 with product name, barcode, category, unit, system qty, blank physical count column, initials column
- Header has date/counter/supervisor fields for manual completion

#### 17E — Stock Movement Report Printout
- "Print Report" button on Movement Log tab
- Respects active filters (type, date range) — prints exactly what's on screen

---

### Phase 18 — Role-gated Reports & Purchasing Report

**Goal:** Each department has their own printable report that shows only what they're authorised to see.

#### 18A — Inventory Report Tab
- Visible to: inventory + manager + admin
- Sections:
  - Stock summary: total products, low stock count, out-of-stock count (NO monetary value for inventory role)
  - Stock levels table: product, category, unit, qty, low-stock flag, last movement date
  - Recent adjustments: last 30 days, filterable by type
  - Damaged/write-offs: this period
- **Printout:** Inventory Status Report — A4, store header, date range, all sections above, manager signature

#### 18B — Purchasing / PO Report Tab
- Visible to: purchasing + manager + admin
- Sections:
  - PO summary: total POs this period, by status
  - PO list: PO number, supplier, items count, total cost, status, created by, date
  - Receiving summary: GRNs this period, variance (ordered vs received)
  - Supplier performance: on-time delivery rate (if tracking)
- **Printout:** Purchasing Report — A4, date range, all sections, manager sign-off block

#### 18C — Sales & Revenue Report (manager/admin)
- Existing sales/revenue analytics remain unchanged
- Add "Print Report" button: A4 summary with date range, revenue, top products, payment breakdown, manager signature
- Daily sales summary printout option

#### 18D — Cashier/Shift Report (manager/admin)
- Existing shift reports remain unchanged (Phase 14)
- Add: cashier performance summary printout (per period)

---

### Phase 19 — Tax Invoice & B2B Documents ✅ COMPLETE

**Implemented:**

#### 19A — Tax Invoice from Completed Sale
- `Invoice` model (`invoices` table): INV-YYYY-NNNN sequential numbering, linked to sale_id, customer details, items JSON snapshot, KRA PIN fields, payment_terms, status (issued/voided)
- `GET /api/sales/<id>/invoice` — fetch existing invoice for a sale
- `POST /api/sales/<id>/invoice` — idempotent create (returns existing if already issued)
- `GET /api/invoices` — list all (manager/admin)
- `GET /api/invoices/<id>` — single invoice
- `POST /api/invoices/<id>/void` — void invoice (manager/admin)
- `PaymentModal.jsx`: "Invoice (A4)" button on sale success screen — calls POST then opens `printTaxInvoice()`
- `printTaxInvoice()` in `utils/print.js`: full KRA-compliant A4 — seller name + PIN, buyer + KRA PIN, line items with VAT%, VAT summary table, totals, 3-party signature block

#### 19B — Customer Invoice History
- `GET /api/customers/<id>/invoices` — invoices per customer (manager/admin)
- `Customers.jsx`: detail modal now has "Invoices" tab (manager/admin only) listing all invoices with reprint button
- Fixed `$` currency bug in Customers.jsx → uses `fmt()` from CurrencyContext throughout

#### 19C — Credit Note
- `CreditNote` model (`credit_notes` table): CN-YYYY-NNNN, links to Invoice + Return + original Sale
- `routes/returns.py`: `create_return()` auto-generates credit note on every return — links to invoice if one exists for the original sale
- `GET /api/credit-notes` — list (manager/admin)
- `GET /api/credit-notes/<id>` — single
- `printCreditNote()` in `utils/print.js`: A4 credit note with original invoice reference, returned items, total credit, 2-party signature

---

### Phase 19 — Tax Invoice & B2B Documents (original spec)

**Goal:** Proper KRA-compliant invoicing for business customers.

#### 19A — Tax Invoice from Completed Sale
- "Print Invoice" button on sale completion screen (in addition to receipt)
- Tax invoice ≠ receipt: A4 format, sequential INV-YYYY-NNNN numbering
- KRA-compliant fields: seller name + PIN, buyer name + PIN (if provided), VAT breakdown per line item, invoice date, payment terms
- Saved as `Invoice` record linked to `sale_id`
- Backend: `GET /api/sales/<id>/invoice`, `POST /api/sales/<id>/invoice`

#### 19B — Customer Invoice History
- Manager can view/reprint all invoices per customer
- Invoice list on customer detail view
- Customer statement: outstanding invoices, payments, balance

#### 19C — Credit Note
- When a return is processed, auto-generate a Credit Note
- Credit note: references original invoice, lists returned items, credit amount
- **Printout:** A4 credit note with reference numbers and signatures

---

### Phase 20 — Returns & Refunds Workflow ✅ COMPLETE

**Implemented:**

#### 20A — Returns from Invoice/Sale + Approval Threshold
- `Return` model updated: added `approved_by_id/name`, `approved_at`, status expanded to `pending_approval | completed | rejected`
- `Store` model: new `returns_approval_threshold` field (default KES 5,000) — configurable via PUT /api/stores/config
- `create_return()`: if total > threshold and caller is not manager/admin → status = `pending_approval`; manager/admin callers skip approval
- `POST /api/returns/<id>/approve` — manager sets status = `completed`
- `POST /api/returns/<id>/reject` — manager sets status = `rejected`
- `GET /api/returns/pending` — manager shortcut; `GET /api/returns?status=X` filter
- `ReturnsPage.jsx`:
  - Status filter tabs (All / Pending / Completed / Rejected)
  - Pending approvals banner with quick "Review" link
  - Lookup by receipt number **or invoice number** (INV- prefix auto-detected)
  - Approve / Reject buttons on pending rows
  - "CN" button on every row to print the credit note
  - Post-submit alert when a return is sent for approval
  - Customer name shown in lookup confirmation

#### 20B — Returns Report
- `GET /api/reports/returns?date_from=&date_to=` — summary: total returns, total refunded, by_method, by_reason, by_status, top_products, full transactions list
- Reports.jsx: new "Returns" tab (manager/admin) with stat cards, by-method table, top returned products, full transaction table
- "Print Report" button → `printReturnsReport()` — A4 with store letterhead, summary stats, breakdown tables, manager signature

---

### Phase 20 — Returns & Refunds Workflow (original spec)

**Goal:** Proper controlled returns with documentation.

#### 20A — Returns from Invoice/Sale
- Returns currently accessible manager/admin only — correct
- Add: returns can be initiated from sale history view (look up invoice number)
- Manager approves any refund above configurable threshold (e.g. > KES 5,000)
- Returns always generate a credit note (Phase 19C)

#### 20B — Returns Report
- Returns summary: period, total refunds, by product, by reason
- **Printout:** Returns Report with manager signature

---

### Phase 21 — Customer Account Statements ✅ COMPLETE (2026-06-12)

**Goal:** B2B customers need a printed account statement.

#### 21A — Account Statement ✅
- `GET /api/accounts/<id>/statement?date_from=&date_to=` — computes opening balance (last txn before period), returns period transactions + closing balance
- `AccountDetail` modal: date range pickers (default: 1st of month → today), "Print Statement" button
- `printAccountStatement()` in `utils/print.js` — A4 with letterhead, period header, opening/closing balance summary box, full transactions table with color-coded amounts, closing balance footer row, 2-party signature block

#### 21B — Credit Limit Alerts ✅
- `GET /api/accounts/alerts` — returns accounts ≥90% used (near_limit) or ≥100% used (over_limit) of credit limit
- Alert banner at top of Accounts page when any account is over limit
- Per-row badges: "OVER LIMIT" (red) or "XX% USED" (yellow) in Credit Limit column
- Row background tinted red for over-limit accounts
- Alerts loaded in parallel with account list on page mount

#### Implementation files:
- `backend/routes/accounts.py` — added `/alerts` and `/<id>/statement` routes; added `datetime` import
- `frontend/src/api.js` — added `getAccountStatement`, `getAccountAlerts`
- `frontend/src/utils/print.js` — added `printAccountStatement`
- `frontend/src/pages/Accounts.jsx` — added imports, alerts state, banner, badges, AccountDetail date range + print; fixed missing `useCurrency()` in sub-components

---

### Phase 22 — Manager Dashboard: Pending Approvals & Alerts

**Goal:** Manager sees everything that needs their attention on login.

#### 22A — Pending Approvals Widget
- Damage/write-off requests awaiting approval
- POs above purchaser limit awaiting approval
- GRNs awaiting sign-off
- Large stock adjustments awaiting review
- Each item: who raised it, what, when, action button

#### 22B — Operational Alerts Widget
- Low stock items (below threshold) — count + link to inventory
- Overdue accounts (customers over credit limit or 30+ days outstanding)
- Unprinted / unfiled shift reports
- Last cloud sync time + status

#### 22C — Today's Summary Widget
- Today's sales total + transaction count (manager only)
- Cash in drawer (last shift reconciliation)
- Current open shift (who opened it, time)
- Pending POs

---

### Phase 23 — Supplier Portal Improvements

**Goal:** Suppliers have a clean, professional portal to manage their deliveries.

#### 23A — Supplier Data Isolation
- Backend: supplier role can ONLY see POs where `supplier_id` matches their staff record's `supplier_id`
- Currently partially enforced — confirm and harden

#### 23B — Supplier Delivery Note
- When supplier marks PO as "Dispatched", they can enter:
  - Delivery date (estimated)
  - Driver name / vehicle
  - Tracking reference
  - Line item quantities they are actually sending (may differ from PO)
- **Printout (Supplier):** Delivery Note / Packing List — what they are sending, for their records

#### 23C — Purchase Order Printout for Supplier
- "Send to Supplier" button on PO: opens print dialog
- Supplier-facing PO document: store contact, delivery address, items, required delivery date, PO terms
- Also generates a PO Acknowledgement for supplier to sign and return

---

### Phase 24 — Offline Sync Queue (original Phase 11)

**Goal:** POS continues to work without internet; syncs when reconnected.

- Queue sales, stock adjustments, account transactions in `OfflineQueue` table when backend unreachable
- Flush queue on reconnect with conflict resolution:
  - Sales: append-only, always replay
  - Stock: last-write-wins per product
  - Accounts: replay in chronological order
- UI indicator: "X items pending sync" badge in top header
- Offline mode banner: yellow bar warning cashier
- Sync log: manager can see sync history and any conflicts

---

### Phase 25 — Appointments & Services Module Cleanup

**Goal:** Clean up or complete the Services/Appointments pages that were scaffolded but never finished.

- Decide: keep (if the store offers installation/cutting services) or remove pages
- If kept: full booking workflow — create appointment, assign staff, status tracking, invoice on completion
- If not needed: remove from nav and codebase

---

### Phase 12 — Multi-Branch (Backlog)

_Not started. Deferred until all above phases are complete._

- Each branch: own local DB + backend instance
- All branches sync to central PostgreSQL cloud DB
- HQ dashboard: view all branches consolidated
- Stock transfer between branches (transfer note printout)
- Branch-specific staff, shifts, and reports

---

## Print Documents Inventory

Every document the system must be able to produce:

| Document | Who prints | Who signs | Format |
|---|---|---|---|
| POS Receipt | Cashier | — | 80mm thermal |
| Tax Invoice | Cashier / Manager | — | A4 |
| Credit Note | Manager | Manager | A4 |
| Proforma Invoice / Quote | Cashier / Manager | Prepared by + Customer + Manager | A4 |
| Purchase Order | Purchasing / Manager | Prepared by + Approved by + Received by | A4 |
| Goods Received Note (GRN) | Inventory / Purchasing | Received by + Verified by + Manager | A4 |
| Delivery Note / Packing List | Supplier | Supplier + Receiver | A4 |
| Damage / Write-off Report | Inventory | Raised by + Approved by (Manager) | A4 |
| Inventory Count Sheet | Manager / Inventory | Counter + Supervisor | A4 |
| Stock Movement Report | Inventory / Manager | Manager | A4 |
| Shift Daily Report | Manager | Cashier + Manager | A4 |
| Inventory Status Report | Inventory / Manager | Manager | A4 |
| Purchasing / PO Report | Purchasing / Manager | Manager | A4 |
| Sales & Revenue Report | Manager | Manager | A4 |
| Customer Account Statement | Manager | Manager | A4 |
| Returns Report | Manager | Manager | A4 |

---

## Known Gaps / Tech Debt

- Discount override at POS not gated behind manager auth (item removal + void are gated; inline discount is not)
- `Settings.jsx` role select still missing `purchasing` role description labels
- Receipt printing uses env vars as fallback — ensure `.env` is populated on deployment
- `python-escpos` and `pyserial` must be installed manually: `pip install python-escpos pyserial`
- Stripe Terminal requires `STRIPE_SECRET_KEY` in `.env`
- Phase 17: `StockMovement` only populated going forward — historical `StockAdjustment` records are not backfilled into the new table
- Phase 17: Damage report "Raise" button in Inventory only sets status to `raised`; manager must navigate to Inventory → Damage Reports tab to approve. Phase 22 (Dashboard Approvals) will surface pending items to the manager on login
- Phase 17: Count sheet has no session/reference number linking back to count corrections — future improvement
- Appointments/Services pages are scaffolded but unfinished — Phase 25

---

## Hardware BOM (per terminal)

| Item | Approx Cost (KES) |
|---|---|
| Thermal receipt printer (Epson TM-T88) | 30,000–50,000 |
| Barcode scanner (Honeywell 1250g) | 8,000–15,000 |
| Cash drawer (APG Vasario) | 8,000–15,000 |
| Touchscreen terminal (15") | 40,000–70,000 |
| Card reader (Stripe S700) | 35,000 |
| **Total per lane** | **~120,000–185,000** |

---

## Seed Credentials (dev)

| Name | Dept PIN | Personal PIN | Role |
|---|---|---|---|
| Admin | 0000 | 0000 | admin |
| Manager | 1111 | 1111 | manager |
| Cashier 1 | 2222 | 1234 | cashier |
| Cashier 2 | 2222 | 5678 | cashier |
| Inventory | 3333 | 3333 | inventory |
| Purchasing | 4444 | 4444 | purchasing |
