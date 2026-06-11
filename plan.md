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

### Phase 13 — POS UX, Inventory Order & Customer Account Refinements

#### 13A — POS Product Grid: Category Filter + Pagination
- Category filter tabs above product grid — cashier picks a category first instead of scrolling 20,000 items
- Paginated loading: 24 products per page, "Load more" button at bottom of grid
- Backend: `GET /api/products` should accept `category_id`, `limit`, `offset` params
- Auto-refresh product catalog every 2 minutes (silent, no spinner) so cashiers always see the latest prices/stock without reloading
- "Updated X min ago" timestamp shown in status bar

#### 13B — Unit-Aware Product Display
- Every product tile shows its sale unit: `/kg`, `/pcs`, `/bag`, `/box`, etc.
- Weight-based items (nails, wire, etc.) use `weight_unit` from the product record (already tracked)
- Piece-based items default to `/pc` when no unit is set
- Managers can set `weight_unit` on any product (not just weight-based ones) to express bags, boxes, rolls, etc.
- Weight entry modal already handles kg-based items — no change needed there

#### 13C — Inventory Listing Sort Order
- Stock list sorted: **in-stock items first** (sorted by `updated_at` desc so recently-updated products surface at top), **out-of-stock items pushed to bottom**
- Inventory page gains a search/filter input for the stock tab
- Goal: manager updating a product's price sees it bubble to the top immediately

#### 13D — Customer Account Integration at POS
- When cashier selects a customer (loyalty lookup), their linked account balance is **auto-fetched and displayed** in the customer panel
- Shows: balance, available credit (balance + credit_limit), "OWES" badge if negative
- "🏦 Account" payment button auto-populates the account search with the selected customer
- **Advance payment flow**: customer deposits funds to their account (via Accounts page), returns later to pick items — cashier selects customer, pays via Account, balance is deducted and recorded in account transaction history
- **Credit/debt flow**: customers with a premium account (credit_limit > 0) can take goods on credit; balance goes negative up to the credit limit; balance + credit_limit shown as "Available"
- Account charge recorded automatically when sale completes with payment_method = 'account'
- All of this already works end-to-end — Phase 13D improves the **cashier UX** to surface account info without requiring them to open the Accounts page

#### 13E — Manager → Cashier Real-Time Product Sync
- When a manager edits a product (price, stock, name, category) via the Products or Inventory page, the change persists in the DB immediately
- POS auto-refresh (13A) picks it up within 2 minutes with no action from the cashier
- No WebSocket needed — polling is sufficient for this use case
- Future: push notification via SSE if sub-minute latency is required (Phase 14 candidate)

---

## Known Gaps / Tech Debt
- Discount override at POS not yet gated behind manager auth (item removal is, void is, but inline line-item discount is not)
- `Settings.jsx` role select still missing `purchasing` role description labels
- Receipt printing uses env vars as fallback — ensure `.env` is populated on deployment
- `python-escpos` and `pyserial` must be installed manually: `pip install python-escpos pyserial`
- Stripe Terminal requires `STRIPE_SECRET_KEY` in `.env`
- Backend `GET /api/products` needs `limit`, `offset`, `category_id` query params added (required for Phase 13A pagination)

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
