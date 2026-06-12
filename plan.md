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

---

## Remaining Phases

---

### Phase 16 — Role Logic & Access Control Cleanup

**Goal:** Every role sees exactly what they need, nothing more.

#### 16A — Nav & Route Guards
- Fix `App.jsx` NAV array to match role table above
- `inventory` removed from Reports route (gains new scoped Reports page)
- `purchasing` removed from Inventory route (gains read-only stock view)
- `cashier` added to Quotes route (they create proformas at counter)
- Add `inventory` home → `/inventory`; keep `purchasing` home → `/purchase-orders`
- Backend: all report endpoints enforce role check — `GET /api/reports/sales` blocked for inventory/purchasing

#### 16B — Inventory Page: Role-scoped View
- `inventory` sees: stock levels, adjustments tab, movement log — NO "Stock Value (KES)" stat card
- `purchasing` sees: read-only stock level table (qty + name only, no prices, no value) — just enough to know what to order
- `manager/admin` sees: everything including stock value

#### 16C — Reports Page: Role-gated Tabs
- Tab visibility controlled by role:
  - **Sales Analytics** → manager + admin only
  - **Cashier Performance** → manager + admin only
  - **Product Performance** → manager + admin only
  - **Category Analysis** → manager + admin only
  - **Inventory Report** → inventory + manager + admin
  - **Purchasing / PO Report** → purchasing + manager + admin
  - **Shift Reports** → manager + admin only
- First visible tab auto-selected on load per role
- Backend: role-check on each report endpoint

#### 16D — Products Page: Read-only for Purchasing
- `purchasing` can see product list (name, category, unit) — needed to create POs
- `purchasing` cannot add, edit, delete, or see selling price
- Backend: `POST/PUT/DELETE /api/products` blocked for purchasing role

#### 16E — Purchasing: No Revenue Data Anywhere
- Remove revenue columns from any page purchasing can access
- `GET /api/purchase-orders` already does not return revenue — confirm
- `GET /api/inventory/overview` hides `total_stock_value` for purchasing role

---

### Phase 17 — Inventory Operations & GRN System

**Goal:** Professional warehouse operations — every stock movement has a paper trail.

#### 17A — Goods Received Note (GRN)
- Auto-generate `GoodsReceivedNote` record when PO is marked fully/partially received
- GRN fields: grn_number, po_id, received_by, received_at, items (product, qty_ordered, qty_received, unit_cost), notes, status (draft → confirmed → signed_off)
- GRN sign-off requires manager approval
- **Printout:** A4 GRN document — PO ref, supplier, date, items table (ordered vs received, variance), receiving notes, signature blocks: Received by (inventory) + Verified by (purchasing) + Approved by (manager)

#### 17B — Stock Movement Log
- Unified `StockMovement` table replacing fragmented adjustment tracking
- Movement types: `sale`, `po_receipt`, `manual_add`, `manual_remove`, `damage`, `write_off`, `theft`, `count_correction`, `transfer_in`, `transfer_out`
- Every movement: product, qty_before, qty_change, qty_after, type, reference (sale_id / po_id / adjustment_id), user, timestamp
- Inventory page "Movements" tab: filterable by product, type, date range
- **Printout:** Stock Movement Report — filterable, shows all movements with running balance

#### 17C — Damage & Write-off Workflow
- Inventory staff can raise a Damage Report: product, qty, reason, photos (optional), estimated value
- Status: `raised → pending_approval → approved / rejected`
- Approved damage → automatically reduces stock + creates `write_off` movement
- Rejected → no stock change, reason recorded
- **Printout:** Damage/Write-off Report — product, qty, reason, value, raised by, approved by, signature blocks

#### 17D — Physical Count Sheet
- Manager or inventory generates a "Count Sheet" for a category or all products
- Printout: blank A4 sheet with product name, barcode, unit, current system qty (optional — or blank for blind count), space for physical count entry + initials
- After count, discrepancies entered as `count_correction` adjustments
- Count sheet reference number links adjustments to the count session

#### 17E — Stock Adjustment Report Printout
- Existing adjustment list → add "Print Report" button
- A4 printout: date range, all adjustments (product, type, qty change, reason, user), total movements, signature block

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

### Phase 19 — Tax Invoice & B2B Documents

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

### Phase 20 — Returns & Refunds Workflow

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

### Phase 21 — Customer Account Statements

**Goal:** B2B customers need a printed account statement.

#### 21A — Account Statement
- Statement: customer name, account number, period, opening balance, all transactions (deposits, charges, adjustments), closing balance
- **Printout:** A4 customer statement — professional format, manager signature, suitable for sending to customer

#### 21B — Credit Limit Alerts
- Alert badge on Accounts page when customer is within 10% of credit limit
- Manager notification on login if any account has exceeded credit limit

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
- No `StockMovement` unified table yet — Phase 17B adds this
- GRN auto-generation on PO receive not yet implemented — Phase 17A
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
