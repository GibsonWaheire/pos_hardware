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

## Completed

| Phase | Description |
|---|---|
| 1 | Core POS: products, cart, sales, receipts |
| 2 | Inventory management, stock adjustments |
| 3 | Suppliers, purchase orders, receiving |
| 4 | Dashboard, reports, store config, CSV export |
| 5 | Cloud sync to PostgreSQL |
| 6 | Customer deposit/prepaid accounts, M-Pesa |
| 7 | Quotes / Proforma invoices |
| 8 | RBAC: PIN login, role-filtered nav, theme toggle |
| 9A | Two-step auth (dept PIN + personal PIN), audit log |
| 9B | Role cleanup, manager-controlled shifts, daily reconciliation |
| 9C | Manager auth card (sudo elevation), shift gate on POS |
| 9D | Purchaser limits, PO approval workflow, supplier role, cart removal auth, Settings overhaul |
| 10 | ESC/POS receipt printer (KES, M-Pesa ref, KRA PIN), cash drawer, reprint button |
| 13 | POS UX (category filter, pagination, unit display, account balance, auto-refresh), inventory sort, accountability hardening (server-side identity on all write routes) |
| 14 | Shift report filing system (auto-generate on close, print/file lifecycle, A4 PDF view, shift-open gate) |

---

## Remaining

### Phase 11 — Offline-First Sync Queue
- Queue sales/stock changes in localStorage when backend unreachable
- Flush queue on reconnect (already partially scaffolded in `localStore.js` + `OfflineQueue` model)
- Conflict resolution: last-write-wins for stock, append-only for sales
- UI indicator: "X items pending sync" badge in header

### Phase 12 — Multi-Branch (Backlog)
- Each branch has its own local DB + backend
- All sync to central PostgreSQL cloud DB
- Manager cloud dashboard: view all branches
- Stock transfer between branches

### Phase 13 — POS UX, Inventory Order & Customer Account Refinements ✅ COMPLETE

#### 13A — POS Product Grid: Category Filter + Pagination ✅
- Category filter pill tabs; cashier must pick a category or search (no "All" to prevent loading 20k items)
- 24 products per page, "Load more" appends next page
- `GET /api/products` accepts `category_id`, `limit`, `offset`
- Silent auto-refresh every 2 min; "Updated X min ago" status bar

#### 13B — Unit-Aware Product Display ✅
- Tiles show `/kg`, `/pc`, `/bag` etc. based on `weight_unit`

#### 13C — Inventory Sort Order ✅
- In-stock items first (by `updated_at` desc), out-of-stock last
- Search input on stock tab (name or barcode)

#### 13D — Customer Account at POS ✅
- Balance + available credit auto-loaded when loyalty customer selected
- "OWES" badge if negative balance

#### 13E — Manager → Cashier Product Sync ✅
- Auto-refresh every 2 min ensures cashiers see latest prices without reload

#### 13F — Accountability Hardening ✅
- All 6 write-heavy routes now resolve identity from Flask session (`get_current_user()`)
- Removed manual cashier name fields from Inventory adjust, Accounts deposit/adjust
- Every sale, adjustment, void, return, shift, and deposit is server-side linked to the authenticated user

---

### Phase 14 — Shift Report Filing System ✅ COMPLETE

**Models added:**
- `ShiftReport` — immutable snapshot generated on shift close (store, shift, cash reconciliation, sales by payment method, voids/overrides)
- `ReportPrintEvent` — every print recorded with who printed and copy number

**Status lifecycle:** `GENERATED → PRINTED → FILED`

**Backend (`/api/shift-reports`):**
- `GET /` — list reports (filterable by status/type)
- `GET /pending` — unfiled reports (manager/admin)
- `GET /<id>` — single report
- `POST /<id>/print` — records print event, advances to PRINTED; roles: manager, admin, inventory, purchasing
- `POST /<id>/file` — marks FILED with signed note; roles: manager, admin only

**Auto-generate on close:** `shifts.py` close route creates a `ShiftReport` snapshot after committing the shift close. Snapshot is immutable — never updated.

**Shift-open gate:** `shifts.py` open route blocks if the last closed shift has a report in `GENERATED` or `PRINTED` status (must be FILED first). Only triggers if the shift had a report generated (old shifts without reports are not blocked).

**Frontend (Reports.jsx — "Shift Reports" tab):**
- Status filter: All / Pending / Filed
- Table: report number, shift #, period, cashier, revenue, status badge, filed-by
- Print button → records print event via API → opens browser print dialog
- File button (manager/admin) → confirm modal with optional sign-off note
- Warning if report hasn't been printed before filing

**A4 print layout:**
- Store header (name, address, phone, tax/PIN number)
- Report number + generation timestamp
- `REPRINT — COPY N` watermark if print_count > 1
- Shift details (cashier, opened/closed)
- Cash reconciliation table (opening float, cash sales, expected, closing count, variance — variance coloured red/green)
- Sales summary (transactions, total revenue, cash/card/M-Pesa/split breakdown, tax, discounts)
- Overrides & exceptions (void count + amount, no-sale events)
- Dual signature lines: Cashier + Manager with date fields
- Footer: generated by, filed by

---

## Known Gaps / Tech Debt
- Discount override at POS not yet gated behind manager auth (item removal and void are gated, inline line-item discount is not)
- `Settings.jsx` role select still missing `purchasing` role description labels
- Receipt printing uses env vars as fallback — ensure `.env` is populated on deployment
- `python-escpos` and `pyserial` must be installed manually: `pip install python-escpos pyserial`
- Stripe Terminal requires `STRIPE_SECRET_KEY` in `.env`
- `Inventory.jsx` and `Reports.jsx` (old analytics tabs) still show `$` for some prices — should be `KES`
- No weekly/inventory periodic report generation yet (Phase 14 only implements SHIFT_DAILY; INVENTORY and WEEKLY_SUMMARY endpoints are stubs for future)

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
