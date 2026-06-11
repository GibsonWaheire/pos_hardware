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

---

## Known Gaps / Tech Debt
- Discount override at POS not yet gated behind manager auth (item removal is, void is, but inline line-item discount is not)
- `Settings.jsx` role select still missing `purchasing` role description labels
- Receipt printing uses env vars as fallback — ensure `.env` is populated on deployment
- `python-escpos` and `pyserial` must be installed manually: `pip install python-escpos pyserial`
- Stripe Terminal requires `STRIPE_SECRET_KEY` in `.env`

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
