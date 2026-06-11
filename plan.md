# POS Hardware — Build Plan

---

## Tech Stack

### Frontend
- React + Vite
- Full-screen kiosk mode (no browser chrome)
- Second display support (customer-facing screen) — future

### Backend
- Python / Flask
- SQLite locally (offline-first)
- PostgreSQL on cloud (sync target)

### Hardware Integration
- ESC/POS protocol — thermal receipt printer
- HID barcode scanner — acts as keyboard input
- Stripe Terminal SDK — physical card reader
- Serial port — cash drawer trigger via printer
- Scale API — USB/serial weighing scale

---

## Architecture

```
[ React UI ] <---> [ Local Flask API ] <---> [ SQLite (local) ]
                          |
                          v
                   [ Sync Engine ] <---> [ PostgreSQL (cloud) ]
```

---

## Completed Phases

| Phase | Description | Status |
|---|---|---|
| 1 | Core POS: products, cart, sales, receipts | Done |
| 2 | Inventory management, stock adjustments | Done |
| 3 | Suppliers, purchase orders | Done |
| 4 | Salon mode | Removed (hardware-only) |
| 5 | Dashboard, extended reports, store config, CSV export | Done |
| 6 | Cloud sync to PostgreSQL | Done |
| 7 | Customer deposit/prepaid accounts, M-Pesa payment | Done |
| 8 | Quotes / Proforma invoices | Done |

---

## Phase 9 — Role-Based Access Control (RBAC) + Theme Toggle

### 9A: Staff Roles (Hardware Store Context)

Four operational roles mapped to real hardware store jobs:

| Role | Who | What they do |
|---|---|---|
| `cashier` | Counter staff | Walk-in sales, quotes, customer lookup |
| `inventory` | Stock clerk | Product catalogue, stock levels, adjustments |
| `purchasing` | Procurement | Suppliers, purchase orders, receiving goods |
| `manager` | Branch manager | Full visibility + approval authority |
| `admin` | System owner | Same as manager + staff management, cloud sync |

---

### 9B: Access Matrix

#### Cashier
**Nav visible:** Checkout, Quotes, Customers, Shifts

| Feature | Access |
|---|---|
| Process sales (cash, M-Pesa, card, account, split) | Full |
| Create and print quotes / proforma invoices | Full |
| Customer lookup and creation | Full |
| Open / close own shift | Full |
| Apply discount up to configured threshold (e.g. 10%) | Full |
| Void a completed sale | Locked — requires manager PIN override |
| Discount above threshold | Locked — requires manager PIN override |
| Edit product price at POS | Locked |
| Financial reports, accounts, revenue data | No access |

---

#### Inventory Manager
**Nav visible:** Products, Inventory, Reports (inventory tab), Dashboard

| Feature | Access |
|---|---|
| Add, edit, deactivate products | Full |
| Stock adjustments (receive, write-off, correction) | Full |
| View stock levels and low-stock alerts | Full |
| Inventory movement reports | Full |
| Change product selling price | Flagged for manager approval |
| Checkout / POS | No access |
| Revenue or financial reports | No access |
| Suppliers / purchase orders | No access |

---

#### Purchase Manager
**Nav visible:** Suppliers, Purchase Orders, Inventory (receive POs only), Reports (purchase tab)

| Feature | Access |
|---|---|
| Supplier CRUD (contacts, payment terms, lead times) | Full |
| Create and track purchase orders | Full |
| Receive goods against a PO (triggers stock update) | Full |
| Purchase history and supplier reports | Full |
| Approve POs above configured amount | Locked — requires manager PIN |
| Edit product catalogue or prices | No access |
| Checkout / POS | No access |
| Customer accounts or financial reports | No access |

---

#### Manager / Admin
**Nav visible:** Everything

Everything the above roles can do, plus:

| Feature |
|---|
| Full financial reports: revenue, cashier performance, category breakdown, CSV export |
| Void sales with reason logging |
| Override discounts at checkout |
| Manage staff (add, change PIN, change role, deactivate) |
| Customer accounts (deposit, adjust, set credit limits) |
| Loyalty tier configuration |
| Store settings (name, tax, receipt header/footer) |
| Terminals management |
| Returns approval |
| Cloud sync (admin only) |

**Manager default home:** Dashboard (not the POS checkout). Can navigate to the POS to assist a cashier without losing their own context.

---

### 9C: Login Flow

1. App starts → full-screen PIN login screen (replaces app layout)
   - Shows store name
   - 4-digit PIN pad (touch or keyboard)
   - Staff name dropdown (for teams with potential PIN collisions)
2. PIN verified against `POST /api/auth/login` → returns `{ staff: { id, name, role } }`
3. Staff object stored in `AuthContext` (React context) + `sessionStorage`
4. App renders with role-filtered nav and routes
5. Session timeout: 8 hours idle → auto-logout back to PIN screen
6. Manager PIN override: sensitive actions (void, big discount) show an inline PIN prompt — any `manager` or `admin` PIN unlocks without a full logout

---

### 9D: Backend Changes

**New endpoint: `POST /api/auth/login`**
```
Body:    { pin, staff_id? }
Returns: { staff: { id, name, role, is_active } }
Sets:    Flask session cookie (staff_id, role)
```

**New endpoint: `GET /api/auth/me`**
```
Returns: current logged-in staff from session, or 401
```

**New endpoint: `POST /api/auth/logout`**
```
Clears session cookie
```

**Staff model role values (updated from old salon roles):**
```
cashier | inventory | purchasing | manager | admin
```

**Seed staff in init_db.py (if table empty):**
```
Admin        PIN 0000   role: admin
Manager      PIN 1111   role: manager
Cashier 1    PIN 2222   role: cashier
Inventory    PIN 3333   role: inventory
Purchasing   PIN 4444   role: purchasing
```

**Route-level protection (optional — local single-device deployment):**
- Mutation endpoints for void, account adjust, staff management check session role
- Read endpoints remain open

---

### 9E: Frontend Changes

**New files:**
```
src/context/AuthContext.jsx      — user state, login(), logout(), hasRole()
src/context/ThemeContext.jsx     — theme state, toggleTheme(), persists to localStorage
src/pages/Login.jsx              — PIN pad login screen
src/components/ManagerPinModal.jsx  — inline manager PIN override
```

**Modified files:**
```
src/App.jsx       — wrap in AuthProvider + ThemeProvider; filter NAV by role; gate with Login
src/index.css     — add light theme CSS variables under [data-theme="light"]
src/api.js        — add login(), logout(), getMe() exports
```

**Nav visibility map:**
```js
const NAV_ROLES = {
  '/':                ['cashier', 'manager', 'admin'],
  '/dashboard':       ['manager', 'admin'],
  '/quotes':          ['cashier', 'manager', 'admin'],
  '/products':        ['inventory', 'manager', 'admin'],
  '/inventory':       ['inventory', 'purchasing', 'manager', 'admin'],
  '/suppliers':       ['purchasing', 'manager', 'admin'],
  '/purchase-orders': ['purchasing', 'manager', 'admin'],
  '/returns':         ['manager', 'admin'],
  '/shifts':          ['cashier', 'manager', 'admin'],
  '/customers':       ['cashier', 'manager', 'admin'],
  '/accounts':        ['manager', 'admin'],
  '/loyalty':         ['manager', 'admin'],
  '/terminals':       ['manager', 'admin'],
  '/reports':         ['inventory', 'purchasing', 'manager', 'admin'],
  '/cloud-sync':      ['admin'],
  '/settings':        ['manager', 'admin'],
}
```

**Default landing page by role:**
```js
const HOME = {
  cashier:    '/',
  inventory:  '/products',
  purchasing: '/suppliers',
  manager:    '/dashboard',
  admin:      '/dashboard',
}
```

---

### 9F: Theme Toggle

**Mechanism:** CSS custom properties on `<html data-theme="light">`.

**Light theme (clean, professional — suited for hardware store daytime use):**
```css
[data-theme="light"] {
  --bg:        #f4f5f7;
  --surface:   #ffffff;
  --surface2:  #eef0f5;
  --border:    #d1d5e0;
  --text:      #1a1d27;
  --text-muted:#6b7280;
  /* accent, success, warning, danger unchanged */
}
```

**Toggle:** Sun/moon icon button at the bottom of the sidebar. Preference saved to `localStorage('pos_hw_theme')`. Default: dark.

---

### 9G: Implementation Order

1. **Backend** — `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` (30 min)
2. **Backend** — Update Staff roles in model + `init_db.py` seed data (15 min)
3. **Frontend** — `AuthContext` + `Login.jsx` PIN pad (1 hr)
4. **Frontend** — `App.jsx` role filtering + route protection + default redirects (30 min)
5. **Frontend** — `ThemeContext` + CSS light theme + sidebar toggle button (30 min)
6. **Frontend** — `ManagerPinModal` inline override (30 min)
7. **Frontend** — Per-page feature flags (hide/lock actions per role) (1 hr)
8. **localStore** — Offline PIN login against seeded staff (15 min)

---

## Phase 9B — Two-Step Auth, User Signatures & Audit Trail

### Problem Statement

Current single-PIN login identifies a department but not a specific person. If Cashier Sarah and Cashier John share PIN 2222, there is no way to know who processed which sale, which product was added by whom, or which stock adjustment was made by which inventory clerk.

Needed:
1. **Two-step login** — Step 1 unlocks the department. Step 2 identifies the individual.
2. **User signature** — Every create/update action permanently records who did it.
3. **Audit log** — A searchable, exportable history of all significant actions.

---

### Two-Step Login Flow

```
[ App opens ]
      |
      v
[ Step 1: Department code screen ]
  Cashier dept  → 2222
  Inventory     → 3333
  Purchasing    → 4444
  Manager       → 1111
  Admin         → 0000
      |
      v
[ Step 2: Personal PIN screen ]
  "Cashier Department — enter your personal PIN"
  Each person has their own unique 4-digit personal_pin
      |
      v
[ Logged in as Sarah · Cashier ]
```

**Staff model — two new fields:**
- `department_pin` — shared code for the whole department (e.g., 2222 for all cashiers). Configurable in Settings.
- `personal_pin` — unique per individual. Replaces the old single `pin`.

**Department PIN is role-scoped.** All staff with `role='cashier'` share the same department PIN. Their personal PINs are what distinguish them from each other.

---

### User Signature — Fields on Key Tables

Every mutation stamps the current user permanently on the record.

| Table | Signature fields added |
|---|---|
| `products` | `created_by_id`, `created_by_name`, `created_by_role`, `updated_by_id`, `updated_by_name`, `updated_at` |
| `stock_adjustments` | `created_by_id`, `created_by_name`, `created_by_role` |
| `purchase_orders` | `created_by_id`, `created_by_name`, `created_by_role` |
| `sales` | `cashier_role` (cashier_id/name already exist) |
| `quotes` | `created_by_id`, `created_by_name`, `created_by_role` |
| `account_transactions` | `created_by_id`, `created_by_name`, `created_by_role` |

**How it appears in the UI:**
- Product: "Added by Jane · Inventory  on 10 Jun 2026 · Last edited by John · Manager"
- Purchase order: "Created by Mike · Purchasing"
- Sale receipt: "Served by Sarah · Cashier"
- Stock adjustment: "By Jane · Inventory — received from supplier"

---

### Audit Log Table

```
audit_logs
  id, user_id, user_name, user_role
  action        (create | update | delete | login | logout | void | deposit | receive_po)
  entity_type   (product | sale | purchase_order | stock_adjustment | quote | account | staff)
  entity_id, entity_name
  details       (JSON — before/after values for updates)
  created_at
```

**Events logged:** product CRUD, price changes, stock adjustments, PO create/receive, sale complete, sale void, account deposit/adjust, quote create/convert, staff create/edit, login, logout.

---

### Audit Report

New tab in Reports page:
- Filter by date range, user, action type, entity type
- Table: timestamp | user | role | action | entity | details
- Export CSV

---

### Implementation Order

1. Backend: Add `department_pin` + `personal_pin` to Staff model + migration
2. Backend: Update `/api/auth/login` for two-step flow
3. Backend: Create `AuditLog` model + `log_action()` helper
4. Backend: Add signature fields to Product, PurchaseOrder, StockAdjustment, Quote
5. Backend: Stamp all mutation routes with current user + call log_action()
6. Frontend: Update Login.jsx for two-step UI
7. Frontend: Show signatures on product cards, PO details, stock adjustments
8. Frontend: Add Audit Log tab to Reports page
9. localStore: Update lsLogin for two-step, add lsGetAuditLog

---

## Phase 10 — Barcode Scanner + Receipt Printer (Backlog)

- USB HID barcode scanner (keyboard wedge — already works with the barcode input field)
- ESC/POS thermal receipt printing via backend Python `python-escpos`
- Cash drawer trigger (serial via printer)
- Receipt template: store name, KRA PIN, items, totals, payment method, M-Pesa ref

---

## Phase 11 — Offline-First Sync Queue (Backlog)

- Queue sales/stock changes in localStorage when backend is unreachable
- Flush queue to backend when connection restored
- Conflict resolution: last-write-wins for stock, append-only for sales

---

## Phase 12 — Multi-Branch (Backlog)

- Each branch has its own local DB + backend
- All sync to a central PostgreSQL cloud DB
- Manager cloud dashboard: view all branches
- Stock transfer between branches

---

## Hardware Bill of Materials (per terminal)

| Item | Example | Approx Cost (KES) |
|---|---|---|
| Thermal receipt printer | Epson TM-T88VI | 30,000–50,000 |
| Barcode scanner | Honeywell 1250g | 8,000–15,000 |
| Cash drawer | APG Vasario 1416 | 8,000–15,000 |
| Touchscreen terminal | 15" POS terminal | 40,000–70,000 |
| Card reader | Stripe S700 | 35,000 |
| **Total per lane** | | **~120,000–185,000** |
