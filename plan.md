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

### Phase 22 — Manager Dashboard: Pending Approvals & Alerts ✅ COMPLETE (2026-06-12)

**Goal:** Manager sees everything that needs their attention on login.

#### 22A — Pending Approvals Widget ✅
- Returns with `status='pending_approval'`
- POs with `status='pending_approval'`
- GRNs with `status='confirmed'` (awaiting sign-off)
- DamageReports with `status='raised'` or `'pending_approval'`
- Each row: ref number, amount/product, raised-by, time-ago, "Review" button linking to relevant page
- Collapsible per-type sections with count badges

#### 22B — Operational Alerts Widget ✅
- Unprinted shift reports (print_count=0) — count with link to Reports
- Unfiled shift reports (filed_at=NULL) — count
- Accounts over credit limit — count + per-account detail (name, balance vs limit)
- Last cloud sync time + status (green/red), error message if failed

#### 22C — Current Shift Widget ✅
- Current open shift: cashier name, time open, opening float
- "No shift currently open" state

#### Implementation files:
- `backend/routes/dashboard.py` — added `GET /api/dashboard/manager` (manager/admin only); added imports for Return, GoodsReceivedNote, DamageReport, Shift, ShiftReport, SyncLog, get_current_user
- `frontend/src/api.js` — added `getManagerDashboard`
- `frontend/src/pages/Dashboard.jsx` — added `useAuth`, parallel load of manager data, `ManagerPanel` component with `ApprovalSection` and `AlertRow` helpers; manager panel only renders for manager/admin roles

---

### Phase 23 — Supplier Portal Improvements ✅ COMPLETE (2026-06-12)

**Goal:** Suppliers have a clean, professional portal to manage their deliveries.

#### 23A — Supplier Data Isolation ✅ (already enforced, confirmed)
- `list_pos()`: supplier role filters `PurchaseOrder.supplier_id == staff.supplier_id`
- `get_po()`: 403 if supplier's linked `supplier_id` doesn't match PO
- Create/receive/cancel/mark-ordered: all return 403 for supplier role
- Confirm/mark-dispatched: verify supplier_id match before allowing

#### 23B — Supplier Delivery Note ✅
- `mark-dispatched` endpoint extended to accept: `delivery_date`, `driver_name`, `vehicle_ref`, `tracking_ref`, per-item `qty_dispatched`
- Stored in new `dispatched_at`, `dispatched_by_name`, `dispatch_details` (JSON) columns on `purchase_orders`
- Schema columns added via `_ensure_columns()` startup helper in `app.py` (SQLite ALTER TABLE with try/except)
- Dispatch modal in PurchaseOrders.jsx: 4 delivery fields + per-item dispatch qty inputs
- After confirming dispatch, user offered to print delivery note
- "Delivery Note" button appears on any PO that has been dispatched
- `printDeliveryNote(po, store)` in `utils/print.js`: A4 with dispatch header (date/driver/vehicle/tracking), items table with ordered vs dispatched quantities and variance column, 2-party signature block

#### 23C — Purchase Order Printout for Supplier ✅
- "Send to Supplier" button on ordered POs (purchasing/manager/admin only)
- `printPOForSupplier(po, store)` in `utils/print.js`: two-page A4 document —
  - Page 1: buyer details, supplier details, items table with qty+price+total, T&C block (5 standard terms), 2-party authorisation signatures
  - Page 2 (page-break-before:always): PO Acknowledgement form — supplier fills in estimated delivery date, signs, stamps, returns to buyer

#### Implementation files:
- `backend/models.py` — added `dispatched_at`, `dispatched_by_name`, `dispatch_details` to PurchaseOrder; updated `to_dict()`
- `backend/app.py` — added `_ensure_columns()` startup schema upgrade helper
- `backend/routes/purchase_orders.py` — extended `mark-dispatched` to accept + store dispatch details JSON
- `frontend/src/api.js` — `markPODispatched(id, data)` now passes dispatch body
- `frontend/src/utils/print.js` — added `printDeliveryNote()`, `printPOForSupplier()`
- `frontend/src/pages/PurchaseOrders.jsx` — added `dispatchData`/`dispatchForm` state, `openDispatch()`/`handleDispatch()`, `handleSendToSupplier()`, dispatch modal, "Send to Supplier" + "Delivery Note" buttons

---

### Phase 24 — Offline Sync Queue (original Phase 11) ✅ COMPLETE (2026-06-12)

**Goal:** POS continues to work without internet; syncs when reconnected.

#### What was built:
- `frontend/src/offlineQueue.js` — localStorage queue: `enqueue`, `getQueue`, `getPendingCount`, `markSynced`, `markError`, `resetErrors`, `clearAll`
- `frontend/src/offlineSync.js` — `flushQueue()` replays pending items to backend (raw axios, avoids circular dep); `checkBackendReachable()` pings `/api/health`
- `frontend/src/context/OnlineStatusContext.jsx` — `OnlineStatusProvider` + `useOnlineStatus()` hook; polls backend every 30s; auto-flushes queue when backend comes back; exposes `isBackendUp`, `pendingCount`, `syncResult`
- **Queued operations**: `createSale` (→ `POST /sales`), `depositToAccount` (→ `POST /accounts/:id/deposit`), `adjustAccount` (→ `POST /accounts/:id/adjust`) — all use `withLocalAndQueue()` helper
- **UI — offline banner**: yellow full-width bar when backend unreachable, shows queued count
- **UI — sync toast**: green bar when back online + items successfully replayed
- **UI — pending badge**: sidebar + header show "X pending" when queue has items
- **CloudSync.jsx** — new "Offline Queue" tab: table of all queued items (type, status, details, error), Flush Now button, Retry Errors, Clear All; fixed `$` → KES in fmt()

#### Known limitations:
- Account balance on replay: if the same account had other transactions while offline, the backend recomputes the running balance correctly from the DB — no drift on the server side. The local display may differ until a page refresh.
- Stock adjustments are NOT queued (only sales are, which already include stock deduction on localStore). Write-offs and manual adjustments require online connectivity.

---

### Phase 25 — Appointments & Services Module Cleanup ✅ COMPLETE (2026-06-12)

**Goal:** Clean up or complete the Services/Appointments pages that were scaffolded but never finished.

#### What was built:
- Both pages kept (hardware store offers cutting/installation services)
- Fixed `$` → KES currency in Services.jsx and Appointments.jsx using `useCurrency()` hook
- Appointments.jsx: added Invoice on Completion — creates a POS sale from appointment services, prints tax invoice; "Invoice" button shown only when `status === 'completed'`
- App.jsx: added Services (manager/admin) and Appointments (cashier/manager/admin) nav links and routes

---

### Phase 26 — Loyalty Programme: Wire Earn/Redeem + Currency Fixes ✅ COMPLETE (2026-06-12)

**Goal:** Loyalty points are actually credited after each sale; fix all `$` currency bugs in loyalty-related pages.

#### 26A — Wire earnPoints after sale ✅
- `PaymentModal.jsx`: after `handleSaleSuccess`, if customer is attached, silently calls `earnPoints({ customer_id, sale_id, sale_total })`
- Success screen shows "X points earned — new balance: Y pts"

#### 26B — Dynamic redemption rate ✅
- `POS.jsx`: loads `getLoyaltyConfig()` on shift open; uses `config.cents_per_point / 100` as KES-per-point multiplier instead of hardcoded `0.01`
- Config controlled by `LOYALTY_POINTS_PER_DOLLAR` and `LOYALTY_CENTS_PER_POINT` env vars on backend

#### 26C — Currency fixes ✅
- `Loyalty.jsx`: fix `$1 spent` → `KES` labels; fix redemption rate display using KES
- `Terminals.jsx`: add `useCurrency()` hook; fix `-$X` → `−fmt(X)` on voided amount stat card
- `backend/routes/loyalty.py`: fix `$` in notes/return strings → KES

#### Implementation files:
- `backend/routes/loyalty.py` — updated notes strings to say KES
- `frontend/src/pages/Loyalty.jsx` — KES labels in config card
- `frontend/src/pages/Terminals.jsx` — useCurrency, fmt voided_amount
- `frontend/src/pages/POS.jsx` — load loyalty config, dynamic pointsRedeemAmt
- `frontend/src/components/PaymentModal.jsx` — call earnPoints after sale, show points earned on success

---

### Phase 27 — Sale History & Receipt Date Fix ✅ COMPLETE (2026-06-12)

**Goal:** Cashier can look up and reprint any sale from today's shift; receipt date always reflects the original transaction time, not the print time.

#### 27A — Immutable receipt date ✅
- `utils/print.js`: new `printSaleReceipt(sale, store)` function — uses `sale.created_at` for the date line, never `new Date()`; handles all payment methods, loyalty discount, items from sale dict
- `PaymentModal.jsx`: `printBrowserReceipt()` now calls `printSaleReceipt(completedSale, store)` — fixes the date bug on both fresh prints and reprints from success screen
- Removes ~45 lines of duplicated receipt HTML from PaymentModal

#### 27B — Cashier sale history panel ✅
- "History" button added to POS status bar (next to Price Check)
- Loads today's sales for the current cashier (`GET /api/sales?cashier_id=X&date_from=today&limit=50`)
- Modal table: time, receipt#, customer, total (with VOID badge), payment method
- Per-row: ESC (ESC/POS printer reprint) + Print (browser window reprint) buttons
- Voided sales shown at 50% opacity with buttons disabled

#### Implementation files:
- `frontend/src/utils/print.js` — added `printSaleReceipt(sale, store)`
- `frontend/src/components/PaymentModal.jsx` — replaced inline receipt HTML with `printSaleReceipt`; removed unused `printDoc`, `RECEIPT_CSS` imports
- `frontend/src/pages/POS.jsx` — added `getSales`, `getStoreConfig`, `printReceipt`, `printSaleReceipt` imports; added history state + `openHistory`, `handleHistoryEscReprint`, `handleHistoryBrowserReprint` functions; added History button + modal

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
- **POS receipt — supplier details on receipt:** For B2B/trade sales, include buyer's KRA PIN and address on the receipt where applicable (currently only on the full tax invoice). Low priority — the tax invoice covers this for formal transactions.

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
