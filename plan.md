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

## Phase 9C — Role Cleanup, Shift Control & Daily Reconciliation

### 1. Role Nav Cleanup

**Problem:** Cashiers currently see Quotes and Shifts, which they don't need. Other roles see Checkout, which they should never access. Quotes should be owned by management, not the counter.

**New nav assignments:**

| Page | Cashier | Inventory | Purchasing | Manager | Admin |
|---|---|---|---|---|---|
| Checkout (POS) | YES | NO | NO | YES | YES |
| Dashboard | NO | NO | NO | YES | YES |
| Quotes | NO | NO | NO | YES | YES |
| Products | NO | YES | NO | YES | YES |
| Inventory | NO | YES | YES | YES | YES |
| Suppliers | NO | NO | YES | YES | YES |
| Purchase Orders | NO | NO | YES | YES | YES |
| Returns | NO | NO | NO | YES | YES |
| Shifts | NO | NO | NO | YES | YES |
| Customers | YES | NO | NO | YES | YES |
| Accounts | NO | NO | NO | YES | YES |
| Loyalty | NO | NO | NO | YES | YES |
| Terminals | NO | NO | NO | YES | YES |
| Reports | NO | YES | YES | YES | YES |
| Cloud Sync | NO | NO | NO | NO | YES |
| Settings | NO | NO | NO | YES | YES |

**Cashier sees only:** Checkout, Customers
**Quotes generated by:** Manager and Admin only (proforma for bulk/credit customers)

---

### 2. Shift Control — Manager Opens, Cashier Works

**Current problem:** Cashier can open their own shift, which means they start with no accountability. Management has no control over when a till is opened or what float was put in.

**New flow:**

```
[ Manager logs in ]
  → Goes to Shifts page
  → Selects cashier name
  → Enters opening float amount (cash placed in till)
  → Enters manager authorisation code (their personal PIN acts as the key)
  → Shift is OPENED for that cashier
  → Manager logs out

[ Cashier logs in ]
  → System detects an open shift assigned to them
  → They are taken directly to Checkout — no shift UI needed
  → If NO open shift exists for them → screen shows "Your shift has not been opened. Contact your manager." (cannot access POS)

[ End of day ]
  → Cashier does NOT close the shift — they just log out
  → Manager logs in → Shifts → sees open shifts → proceeds to reconciliation
```

**Why this is better:**
- Manager physically controls float deployment
- Cashier cannot start selling without manager authorisation
- Creates a clear chain of custody for cash

**Shift model additions:**
- `opened_by_id` / `opened_by_name` — which manager opened it
- `shift_code` — optional unique code manager can set per shift (alternative to PIN)
- Status: `pending_open` → `open` → `pending_reconciliation` → `reconciled`

---

### 3. Daily Reconciliation Workflow

**What reconciliation means:**
The manager compares two things at end of day:
1. **System total** — sum of all sales recorded during the shift (from the POS)
2. **Physical cash** — actual cash the cashier hands over to the manager

If they match → reconcile and close.
If they don't → manager records the discrepancy reason, optionally edits inventory, then reconciles.

**Reconciliation steps (Manager UI):**

```
Step 1 — Review shift summary
  - Shift: Cashier Sarah | Opened 08:00 | 47 transactions
  - Sales breakdown:
      Cash sales:    KES 45,200
      M-Pesa sales:  KES 12,800
      Account sales: KES 8,000
      Total:         KES 66,000
  - Opening float:   KES 5,000
  - Expected cash in till: KES 50,200 (cash sales + opening float)

Step 2 — Enter actual cash counted
  Manager physically counts cash and enters: KES 49,800

Step 3 — System shows variance
  Variance: -KES 400 (SHORT)
  Manager must enter reason: [ text field ]
  Options: "Cashier error", "Till discrepancy", "Approved discount", "Other"

Step 4 — Review individual sales (optional drill-down)
  - Manager can expand any sale to see items
  - Can flag a specific sale as erroneous
  - Can void a flagged sale with reason (triggers inventory correction)

Step 5 — Inventory corrections
  If items were wrongly sold or returned:
  - Manager adjusts stock directly from reconciliation screen
  - Each adjustment is stamped with "Reconciliation correction by [Manager Name]"

Step 6 — Confirm & close
  - Manager clicks "Reconcile & Close Shift"
  - Shift status → "reconciled"
  - A reconciliation record is permanently saved:
      { shift_id, cashier, manager, expected_cash, actual_cash, variance,
        variance_reason, reconciled_at, corrections: [...] }
  - Appears in Reports → Reconciliation History
```

**What "removed from inventory" means:**
Sales are already deducting stock at point of sale. Reconciliation does NOT re-deduct stock. Instead:
- During reconciliation, if a sale is flagged as an error (e.g. wrong item scanned), the manager can:
  - Void that sale → stock is **restored**
  - Mark it as "quantity error" → manager manually adjusts stock with reason

---

### 4. Data Model Changes

**Shift model — new fields:**
```
opened_by_id    INTEGER   -- manager who opened the shift
opened_by_name  VARCHAR
shift_code      VARCHAR   -- optional unique code set by manager
status          VARCHAR   -- open | pending_reconciliation | reconciled | voided
```

**New ShiftReconciliation model:**
```
shift_reconciliations
  id
  shift_id              FK → shifts
  cashier_id / name
  manager_id / name     who reconciled
  expected_cash         sum of cash sales + opening float
  actual_cash           physical cash counted
  variance              actual - expected
  variance_reason       text
  mpesa_total           sum of M-Pesa sales (cross-check with M-Pesa statement)
  account_total         sum of account-charged sales
  status                pending | reconciled
  notes
  reconciled_at
  corrections           JSON array of stock adjustments made during reconciliation
```

---

### 5. Implementation Order

1. **Nav cleanup** — Update NAV roles in App.jsx (30 min)
2. **Shift model** — Add `opened_by_*`, `shift_code`, update status values + migration (20 min)
3. **ShiftReconciliation model** — New table (20 min)
4. **Backend: shift open endpoint** — Require manager auth, create shift for named cashier (30 min)
5. **Backend: reconciliation endpoint** — POST /shifts/:id/reconcile with full payload (45 min)
6. **Frontend: Shifts page overhaul** — Manager opens shifts for cashiers, sees all open shifts (1 hr)
7. **Frontend: Reconciliation screen** — Step-by-step wizard: summary → cash count → variance → corrections → confirm (2 hr)
8. **Frontend: Cashier gate** — On login, check for open shift; block POS if none (30 min)
9. **Reports: Reconciliation history tab** (30 min)

---

## Phase 9D — Manager Authorization Card (Sudo-Style Elevation)

### Problem

Manager PIN approval requires the manager to be physically at the terminal. If the manager is off-site, in a meeting, or stuck in traffic, the business stops: no shift opens, no voids, no override discounts. A single person becomes a hard bottleneck for every transaction that needs approval.

### Solution: The Authorization Card

The manager carries (or leaves) a physical card with a unique printed code — barcode, QR code, or NFC tag. Scanning the card grants one scoped permission for one action, then the authorization evaporates. The cashier's session never changes hands.

**This is identical to `sudo` on Linux:**
- You stay logged in as yourself
- You borrow elevated permission for exactly one command
- The permission expires the instant the command completes (or after 30 seconds if unused)
- The audit log records both who did it and who authorized it

---

### Authorization Flows

#### Shift opening
```
Cashier logs in → system detects no open shift
→ Screen: "No shift open. Scan manager card to open shift."
→ Cashier scans card (or enters manager PIN as fallback)
→ Cashier types opening float amount
→ Shift opens, logged as:
    performed_by: Cashier Sarah
    authorized_by: Manager John (via card)
    auth_method: card
```

#### Item removal from cart
```
Cashier taps "Remove item"
→ Modal: "Manager authorization required — Remove: Steel Bar Y12 × 2 (KES 2,500)"
→ Timer: 30 seconds
→ Cashier scans card  ← scanner is already on the desk
→ Item removed from cart
→ Cart unchanged otherwise, session unchanged
→ Audit: removed by Cashier Sarah, authorized by Manager John via card
```

#### Discount override (above threshold)
```
Cashier enters 25% discount (threshold is 10%)
→ Modal: "Manager authorization required — Discount: 25% on KES 12,000"
→ Card scan or PIN
→ Discount applied
→ Audit: applied by Cashier Sarah, authorized by Manager John
```

#### Sale void
```
Cashier taps void on completed sale
→ Modal: "Manager authorization required — Void: Receipt RCP-20260611-0042 (KES 3,200)"
→ Card or PIN
→ Void applied, stock restored
```

#### Return/refund
```
Same pattern — card or PIN required
```

---

### The Card is a Convenience Layer, Not a Replacement

| Situation | What happens |
|---|---|
| Card available, scanned | Instant authorization, no manager present needed |
| Card unavailable | Modal shows "Use PIN instead" — manager types PIN manually |
| Both unavailable | Manager must physically log in to authorize — unchanged from today |
| Card lost/stolen | Admin deactivates card in Settings → Staff. Generate new one. |
| Multiple managers | Each manager has their own card. Any valid manager card works. |

The card never logs anyone in. It is purely a credential token for one action.

---

### How the Card Works Technically

**Card code format:** UUID-style unique string (e.g. `MGR-7f3a9c2b-4d1e-41f8-b2a0-9e6c5d8f1234`)

**Storage:** `staff.auth_card_code` — unique, nullable, hashed or stored plaintext (local SQLite, so plaintext is acceptable — hash if deploying to cloud)

**Physical card:** Manager goes to Settings → Staff → their profile → clicks "Generate Card" → system shows the code as a printable QR code and barcode. Print, laminate, done.

**Scanner reads card:** The USB barcode scanner is already a keyboard wedge — it types the code into whatever input field is focused. The authorization modal auto-focuses the card input field the moment it opens. Cashier holds card to scanner → code typed instantly → authorization granted.

**30-second timeout:** Visual countdown ring in the modal. If no scan or PIN entered, modal closes and the action is cancelled. Prevents leaving an open authorization prompt unattended.

---

### Audit Log — Full Picture

Every authorized action writes:

```
{
  action:              'remove_cart_item',
  entity_type:         'cart_item',
  entity_name:         'Steel Bar Y12 × 2',

  performed_by_id:     3,
  performed_by_name:   'Cashier Sarah',
  performed_by_role:   'cashier',

  authorized_by_id:    2,
  authorized_by_name:  'Manager John',
  authorized_by_role:  'manager',
  auth_method:         'card',   -- or 'pin' or 'manager_login'

  details:             { qty: 2, unit_price: 1250, line_total: 2500 },
  created_at:          '2026-06-11T14:32:07'
}
```

The cashier is always the **performer**. The manager is always the **authorizer**. These are two separate identity fields — never conflated.

---

### Actions That Require Authorization

Configurable thresholds stored in Settings. Defaults:

| Action | Requires auth? | Threshold |
|---|---|---|
| Remove item from cart | Always | — |
| Item discount > X% | Yes | 10% (configurable) |
| Cart-level discount > X% | Yes | 5% (configurable) |
| Price override at POS | Always | — |
| Void completed sale | Always | — |
| Process return/refund | Always | — |
| Open shift | Always (card or PIN) | — |
| Apply account payment | No (by design — cashier can charge accounts) | — |

---

### Data Model Changes

**Staff model — one new field:**
```
auth_card_code  VARCHAR(100)  UNIQUE, NULLABLE
```

**AuditLog model — new fields:**
```
authorized_by_id    INTEGER
authorized_by_name  VARCHAR(100)
authorized_by_role  VARCHAR(20)
auth_method         VARCHAR(20)   -- 'card' | 'pin' | 'manager_login' | 'self'
```

**Shift model — new fields (from Phase 9C):**
```
opened_by_id    INTEGER
opened_by_name  VARCHAR(100)
auth_method     VARCHAR(20)
```

---

### Backend Changes

**New endpoint: `POST /api/auth/authorize`**
```
Body: { card_code? | pin?, action, context? }
Returns: {
  authorized: true,
  authorizer: { id, name, role },
  token: 'one-time-use-string',
  expires_at: ISO timestamp (+30s)
}
```
The token is a short-lived string stored in memory (or a DB table `auth_tokens`). Routes that need elevation check for a valid, unexpired, unused token. Token is marked used after first consumption.

**Updated endpoints that accept a token:**
- `DELETE /api/cart/items/:id` — remove item (accepts auth token)
- `POST /api/sales/:id/void` — void sale
- `POST /api/shifts/open` — open shift for cashier
- `POST /api/returns` — process return

---

### Frontend Changes

**`ManagerAuthModal` (replaces current `ManagerPinModal`):**
- Two tabs: "Scan Card" | "Enter PIN"
- Card tab: auto-focused barcode input (scanner types here), 30-second countdown ring
- PIN tab: 4-digit PIN pad (existing ManagerPinModal logic)
- On success: calls `onConfirm(authorizer)` with the manager's identity
- Does NOT change session, does NOT navigate anywhere

**Usage pattern (same everywhere):**
```jsx
{showAuth && (
  <ManagerAuthModal
    title="Remove item from cart"
    context="Steel Bar Y12 × 2 — KES 2,500"
    requiredRole="manager"
    onConfirm={(authorizer) => removeItem(itemId, authorizer)}
    onClose={() => setShowAuth(false)}
  />
)}
```

**Cashier gate on POS page:**
- On mount, check for open shift assigned to this cashier
- If none: show "No shift open" screen with card scan prompt
- If found: proceed normally to POS

---

### Card Generation (Settings → Staff)

- Staff edit page gets a "Generate Authorization Card" button (manager/admin only)
- Click → backend generates UUID card code → returns QR + barcode display
- Print dialog opens with a printable card layout: store name, staff name, role, QR code, barcode, expiry (optional)
- "Revoke Card" button — clears `auth_card_code`, existing card immediately stops working

---

### Implementation Order

1. **Staff model** — add `auth_card_code` + migration (15 min)
2. **AuditLog model** — add `authorized_by_*` + `auth_method` fields + migration (15 min)
3. **Backend** — `POST /api/auth/authorize` endpoint, auth token table, token verification (45 min)
4. **Backend** — Card generation endpoint `POST /api/staff/:id/generate-card` (20 min)
5. **Frontend** — `ManagerAuthModal` with card tab + PIN tab + countdown timer (1 hr)
6. **Frontend** — Wire ManagerAuthModal into: POS item removal, POS discount override, sale void, return, shift open (1 hr)
7. **Frontend** — Cashier gate on POS (no shift = card prompt to open one) (30 min)
8. **Frontend** — Card generation UI in Settings → Staff (30 min)
9. **Shift model** — `opened_by_*` + `auth_method` fields (15 min)
10. **Reports** — Show `authorized_by` column in audit log (15 min)

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
