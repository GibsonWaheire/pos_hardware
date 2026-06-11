# POS Hardware — Build Plan

## Overview

A hardware-integrated, offline-capable Point of Sale system built for two primary verticals:
- **Salon / Service Business** (hardware upgrade of existing concept)
- **Retail Supermarket** (high-volume, scan-and-go)

Both share the same core engine. Vertical-specific features are modular layers on top.

---

## Tech Stack

### Frontend
- **React + Vite** (same as current salon POS)
- **Electron** wrapper for desktop/kiosk mode (offline-capable)
- Full-screen kiosk mode — no browser chrome
- Second display support (customer-facing screen)

### Backend
- **Python / Flask** (same as current)
- **SQLite** locally (offline-first)
- **PostgreSQL** on cloud (sync target)
- Offline sync queue — transactions stored locally, pushed when online

### Hardware Integration
- **ESC/POS** protocol — thermal receipt printer
- **HID barcode scanner** — acts as keyboard input
- **Stripe Terminal SDK** — physical card reader
- **Serial port** — cash drawer trigger via printer
- **Scale API** — USB/serial weighing scale (supermarket only)

---

## Architecture

```
[ Electron App ]
      |
      v
[ React UI ] <---> [ Local Flask API ] <---> [ SQLite (local) ]
                          |
                          v
                   [ Sync Engine ] <---> [ PostgreSQL (cloud) ]
                          |
                   [ Hardware Layer ]
                     - Receipt Printer (ESC/POS)
                     - Card Terminal (Stripe Terminal)
                     - Cash Drawer (serial)
                     - Barcode Scanner (HID)
                     - Weighing Scale (supermarket)
```

---

## Phase 1 — Core Engine (Both Verticals)

- [ ] Project scaffolding (Electron + React + Flask + SQLite)
- [ ] Product/SKU catalog (name, price, barcode, tax class, stock qty)
- [ ] Barcode scan → auto-add to cart
- [ ] Manual product search + add to cart
- [ ] Cart management (qty, remove, discount per item)
- [ ] Checkout flow (cash / card / split payment)
- [ ] Stripe Terminal SDK integration (physical card reader)
- [ ] Receipt printer integration (python-escpos / node-escpos)
- [ ] Cash drawer trigger on payment complete
- [ ] Basic sales recording + daily totals
- [ ] Offline mode — queue transactions in SQLite, sync later

---

## Phase 2 — Inventory & Operations

- [ ] Real-time stock depletion on each sale
- [ ] Low stock alerts + reorder points
- [ ] Supplier management
- [ ] Purchase orders (receive stock, update inventory)
- [ ] Product categories and tax classes
- [ ] Multi-rate tax engine (e.g. food 0%, non-food 16%)
- [ ] Returns & refunds flow
- [ ] End-of-day cash reconciliation (float in / float out / variance)
- [ ] Shift management (open/close register)
- [ ] Staff login per terminal

---

## Phase 3 — Supermarket-Specific

- [ ] Weight-based pricing (scale integration)
- [ ] PLU codes for produce (price lookup without barcode)
- [ ] Age verification flag on products (alcohol, tobacco)
- [ ] Loyalty card / points program
- [ ] Member pricing tiers
- [ ] Multi-lane support (multiple terminals sharing one DB)
- [ ] Void / no-sale tracking (manager override required)
- [ ] Price check mode (scan without adding to cart)

---

## Phase 4 — Salon-Specific (Hardware Upgrade)

- [ ] Appointment calendar retained from current system
- [ ] Service-based checkout (no barcode needed)
- [ ] Staff commission tracking per sale
- [ ] Tip capture at terminal (card reader prompt)
- [ ] Product retail sales alongside services
- [ ] Client history on customer display

---

## Phase 5 — Analytics & Multi-Store

- [ ] Dashboard: revenue, top products, hourly trends
- [ ] Sales reports by cashier, product, category, time period
- [ ] Inventory reports (stock value, turnover rate)
- [ ] Multi-store: each store has local DB, all sync to central cloud DB
- [ ] Cloud dashboard for owner (view all locations)
- [ ] Export reports (PDF, CSV)

---

## Hardware Bill of Materials (per terminal)

| Item | Example Model | Approx Cost |
|---|---|---|
| Thermal receipt printer | Epson TM-T88VI | $250–400 |
| Barcode scanner | Honeywell Voyager 1250g | $80–150 |
| Card terminal | Stripe Reader S700 | $299 |
| Cash drawer | APG Vasario 1416 | $80–150 |
| Touchscreen terminal | 15" POS terminal (Intel N-series) | $400–700 |
| Customer display | 10" secondary screen | $80–150 |
| **Total per lane** | | **~$1,200–1,750** |

---

## Key Differences: Salon vs. Supermarket

| Dimension | Salon | Supermarket |
|---|---|---|
| Transaction pace | 1 per 10–30 min | 1 per 1–3 min |
| Product type | Services | Physical SKUs (1,000s) |
| Barcode use | Minimal | Core workflow |
| Inventory depth | Basic | Full (suppliers, POs, reorder) |
| Tax complexity | Simple | Multi-rate |
| Staff tracking | Commission-based | Cashier assignment |
| Returns | Rare | Common |
| Scale needed | No | Yes (produce) |
| Loyalty program | Optional | Standard |
| Multi-lane | No | Yes |

---

## Directory Structure (Planned)

```
POS_hardware/
  plan.md
  backend/
    app.py
    models.py
    routes/
      sales.py
      products.py
      inventory.py
      payments.py
      staff.py
      reports.py
    hardware/
      printer.py       # ESC/POS receipt printing
      cash_drawer.py   # serial trigger
      scale.py         # weight input
    sync/
      offline_queue.py
      cloud_sync.py
    db.py              # SQLite local + PG remote
  frontend/
    src/
      pages/
        POS.jsx          # main checkout screen
        Products.jsx
        Inventory.jsx
        Reports.jsx
        Settings.jsx
      components/
        Cart.jsx
        CustomerDisplay.jsx
        PaymentModal.jsx
        ReceiptPreview.jsx
    electron/
      main.js          # Electron entry point
      kiosk.js         # fullscreen lockdown
  hardware_drivers/
    escpos/            # printer drivers
    stripe_terminal/   # card reader SDK
```

---

## Immediate Next Steps

1. Initialize the project (Electron + React + Vite + Flask)
2. Set up SQLite local DB with product and sales models
3. Build the core POS screen (cart + barcode input + checkout)
4. Integrate one hardware device at a time (start with printer)
5. Add Stripe Terminal once core flow works
6. Build offline sync after hardware is stable
