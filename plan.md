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
| **receiving** | Receiver bay — receives goods, creates GRNs, raises damage reports | Purchase Orders |
| **manager** | Store manager, approves & reports | Dashboard |
| **admin** | IT / owner, full system access | Dashboard |

### What each role sees

| Page / Feature | cashier | inventory | purchasing | supplier | receiving | manager | admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Checkout (POS)** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Quotes** | ✅ create | ❌ | ❌ | ❌ | ❌ | ✅ full | ✅ full |
| **Dashboard** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Products** | ❌ | ✅ full | 👁 view only | ❌ | ❌ | ✅ full | ✅ full |
| **Inventory** | ❌ | ✅ full (no revenue) | 👁 qty/names only | ❌ | 👁 stock qty only | ✅ full | ✅ full |
| **Suppliers** | ❌ | ❌ | ✅ full | 👁 own profile | ❌ | ✅ full | ✅ full |
| **Purchase Orders** | ❌ | 👁 view | ✅ create/manage | 👁 own POs only | ✅ view + receive | ✅ full + approve | ✅ full |
| **GRNs / Damage Reports** | ❌ | ✅ create/view | ❌ | ❌ | ✅ create/view | ✅ approve/reject | ✅ full |
| **Returns** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Shifts** | 👁 own current | ❌ | ❌ | ❌ | ❌ | ✅ full | ✅ full |
| **Customers** | ✅ basic lookup | ❌ | ❌ | ❌ | ❌ | ✅ full | ✅ full |
| **Accounts** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Loyalty** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Reports — Sales/Revenue** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Reports — Cashier/Shift** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Reports — Inventory** | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Reports — Purchasing/PO** | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Terminals** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Cloud Sync** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Settings** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

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
| 21 | Customer Account Statements — A4 print, period filter, opening/closing balance; Credit Limit Alerts — banner + per-row badges | ✅ |
| 22 | Manager Dashboard — pending approvals widget, operational alerts (unfiled shifts, over-limit accounts, sync status), current shift widget | ✅ |
| 23 | Supplier Portal — data isolation enforcement, delivery note with dispatch details, PO-for-supplier printout with acknowledgement page | ✅ |
| 24 | Offline Sync Queue — localStorage queue, auto-flush on reconnect, offline banner, pending badge, CloudSync queue tab | ✅ |
| 25 | Appointments & Services — currency fix, invoice-on-completion, nav wiring | ✅ |
| 26 | Loyalty — wire earnPoints after every sale, dynamic redemption rate from config, KES currency fixes | ✅ |
| 27 | Sale History & Receipt Date Fix — immutable created_at on reprints, cashier history panel with reprint | ✅ |
| 28 | Operational Settings — Business Rules in Settings (returns threshold, VAT rate, low stock), role descriptions, per-item discount auth gate, Products pre-fill from store defaults | ✅ |
| 29 | POS Terminal Overhaul — 3-panel layout (category sidebar + product tile grid + cart), F3/`/` search shortcut, out-of-stock overlays, low-stock badges, CategorySidebar wired in, browse products by category | ✅ |
| 31 | Product Images & Rich Catalog — image upload/delete API (JPEG/PNG/WebP 2MB), static proxy, thumbnail in table, reorder_point/reorder_qty fields + below-reorder API, barcode label print (58mm + A4 30-up, JsBarcode CODE128) | ✅ |
| 32 | Hold Sale / Parked Transactions — up to 3 localStorage slots, 2-hour auto-expire, Hold button + note modal, Parked(N) badge, Retrieve modal with age/expiry display, Discard | ✅ |
| 30 | Security Hardening — bcrypt PIN hashing, Flask-Limiter rate limiting, login lockout, session idle timeout + lock screen, HTTPS/secure cookies, input validation (validate_str/validate_positive/validate_email), audit log completeness across inventory/customers/products, remove hardcoded PINs | ✅ |
| 39 | Shift Reconciliation Gate — mandatory per-tender reconciliation before close, cashier 403 on close, manager reconciliation modal in Reports, Print & Close / Close Without Printing, Shift History table with variance columns, A4 printShiftReconciliation | ✅ |
| 40 | UI/UX Pass — IdleScreen customer-facing attract mode (60s welcome + 30s product slides), scan flash enlarged to 280px customer-visible card, PaymentModal 2-panel wide layout with method tiles + split tender table | ✅ |
| 36 | Google Sheets Export — nightly push (APScheduler 23:45), 5 tabs, service account JSON auth, Settings UI, Push Now button | ✅ |
| 37 | eTIMS / KRA Integration — eTIMS API client, auto-submit on invoice create, sandbox mode, QR code on printed invoices, Settings eTIMS tab, pending/retry endpoints | ✅ |
| 41 | Comprehensive Audit Logging Foundation — log_action on every sale, void, no-sale, override, stock adjustment; reconciliation API endpoint combining all event sources; printReconciliation A4 landscape report | ✅ (partial — AuditLog.jsx page **TODO**) |
| 42 | ESC/POS printer dev mode + per-client DB config — PRINTER_TYPE=none default (silent), printer_config JSON on Store, Settings printer UI (type/host/port/serial/USB), POST /hardware/test-printer, receiving role in Settings | ✅ |
| 43 | Thermal receipt preview on payment + extended history filter — two-column success screen with paper-slip receipt preview, print status dot, date-range history filter (cashier max 4 days / manager unlimited) | ✅ |
| 44 | Shift-Sale link + manager-as-cashier + cashier End Shift — shift_id set on every sale (was always NULL); manager/admin open POS directly (no second manager needed); manager self-approves overrides/voids/discounts without PIN dialog; cashier "End Shift" submits cash count → pending_close → manager reviews and closes; 500 error on shift close fixed (try/catch around report gen); pending_close banner in Shifts page | ✅ |

---

## Remaining / Backlog

| # | Feature | Status |
|---|---|---|
| 45 | AuditLog.jsx page — full audit trail UI (Phase 41 foundation done, page not built) | ✅ Done — page already built; DB migration fixed 500 on shift close |
| 51 | Dashboard Polish — today hero card, shift status at top, tender breakdown, alert strip, auto-refresh, date header | ✅ |
| 46 | Inventory KES bug — Inventory.jsx price column still shows $ sign | ✅ Already fixed — all values use fmt() from useCurrency() |
| 47 | Cash drawer via printer RJ-11 — currently uses separate serial port; should send kick through printer connection | TODO |
| 48 | Card terminal (Stripe) — requires STRIPE_SECRET_KEY; stub in place | TODO |
| 49 | Cashier shift self-close option — optional setting `allow_cashier_self_close` so cashier can fully close without manager in simple deployments | ✅ |
| 52 | End-of-day checklist — guided EOD workflow for manager: auto-checks shift/reports/approvals/sync/stock, manual confirmations, logs audit event | ✅ |
| 53 | Pagination across all list views — reusable Pagination component (prev/next/page numbers), applied to 11 pages; Suppliers converted to expandable table; Admin nav: Checkout removed | ✅ |
| 54 | Shift close improvements — pending_close shifts now visible to manager (cashier banner, pre-filled cash count); Print Report and Close Shift separated into independent buttons; `hasPrinted` state tracks if report was printed before close | ✅ |
| 55 | Log decluttering — `prune_old_logs()` runs on every shift close: auth events pruned after 7 days, all other audit/stock events after 90 days | ✅ |
| 56 | Reorder alerts in Purchase Orders — purchasing role sees reorder widget at top of PO page grouped by supplier with one-click "Create PO" pre-fill | ✅ |
| 57 | Product images on POS — tile grid (with images) when browsing by category; small thumbnails in search list; scan flash already had images | ✅ |
| 58 | Staff Management + Receiver Dashboard — StaffManagement.jsx (CRUD, PIN reset, deactivate/unlock, activity log); ReceiverDashboard.jsx (home for receiving role: pending POs, GRNs, damage reports); Shift History merged into Cashier tab in Reports; sidebar reorganised with section dividers | ✅ |
| 59 | Sales analytics charts — Charts.jsx reusable SVG components (LineChart, BarChart, DonutChart, HorizontalBars); Sales tab: revenue trend, payment donut, transactions/day bar, top products bars; Category tab: revenue bars + share donut; Cashier tab: horizontal bars | ✅ |
| 60 | Barcode label printing — printBarcodeLabels() multi-product/qty/format; LabelPrintModal (format picker, per-product qty, sheet estimate); Products batch select + per-row Label button; auto-offered on PO receive | ✅ |
| 61 | Session UX & anti-theft hardening (2025-06-15) — two-phase shift close (close → print separately); staff protection (manager blocked from editing/deactivating admin accounts); admin Open Shift button removed; fix 500 on shift close (missing DB columns); fix Pending/Filed/Refresh filters in Cashier & Shifts tab; Audit Log moved from sidebar into Reports as a tab; sidebar spacing/overflow fixed | ✅ |
| 62 | Antitheft alerts on printed shift report — red-bordered Alerts box before Section 1: voided sales table, removed-items table, qty-adjustment table, high-override-% flag. Clean shifts show green "No flags" confirmation | ✅ |
| 63 | **TOMORROW — Sidebar compression steps 3–6** — EOD tab inside Dashboard; Accounts + Loyalty tabs inside Customers; Terminals + Cloud Sync tabs inside Settings. Each sub-page accepts `embedded` prop to hide its page-header. Remove 5 nav items (EOD, Accounts, Loyalty, Terminals, Cloud) from NAV array. Routes stay for URL-addressability. | TODO |
| 64 | **TOMORROW — Void & override reason capture** — (A) Every override (REMOVE_ITEM / ADJUST_QTY) must include a reason before manager authorises: add `reason` field to `ManagerAuthModal` when `overridePayload` is set; add `reason` column to `OverrideApproval` model + `_ensure_columns()`; store in `/overrides/approve` and `/overrides/self-approve`. (B) Voids of completed sales: currently `voidSaleWithPin` exists in api.js but is never called from UI — add a Void Sale button in Reports → Sales History rows (status=completed) → modal: reason text input + manager PIN → call `voidSaleWithPin`. (C) Show reason on printed shift report in the Antitheft Alerts section (already has `d.reason` slot to fill) and in AuditLog event detail. | TODO |

---

## Phase Detail

---

### Phase 39 — Shift Reconciliation Gate (Mandatory Close Flow) ✅ COMPLETE

**Implemented:**
- `App.jsx`: removed `manager` from Checkout nav + route guard — only `cashier` + `admin` see Checkout
- `POS.jsx`: removed daily totals from cashier footer; removed `getDailyTotals` call
- `IdleCheckout.jsx`: removed "Today's Sales" slide from idle carousel — only store name, time/date, tips, branding
- `Shifts.jsx`: removed Close Shift button; replaced with "Reconcile & Close" that navigates to Reports; added per-tender variance columns to shift table; KES currency via `useCurrency`
- `backend/models.py`: Shift — 13 new Phase 39 columns (actual/variance per tender, reconciled_by, closed_without_print, admin_bypass); OverrideApproval — value_impact, shift_id, unit_price; ShiftReport — closed_without_print, has_discrepancy
- `backend/routes/shifts.py`: new `GET /<id>/reconciliation` endpoint (manager/admin) — computes expected per tender, refunds, overrides, transaction list; `POST /<id>/close` — cashier 403, reconciliation_submitted required, admin_bypass path, stores per-tender actuals + variances; `_generate_shift_report` updated to Phase 39 content JSON shape (tenders, overrides, transactions)
- `backend/init_db.py`: 19 new column migrations for shifts, override_approvals, shift_reports
- `frontend/src/api.js`: new `getShiftReconciliation(id)` export
- `Reports.jsx`: renamed tab "Shift Reports" → "Shift History"; active shift banner with "Reconcile & Close Shift" button; full reconciliation modal (expected vs actual per tender, live variance, Balanced/SHORT/OVER labels, collapsible overrides table, collapsible transaction breakdown, notes); Print & Close / Close Without Printing flows; Shift History table shows Cash Var., M-Pesa Var., override count, computed status (FILED/CLOSED/DISCREPANCY/OVERDUE)
- `utils/print.js`: new `printShiftReconciliation(report)` — A4 portrait with header, meta, overall status, Section 1 (tender reconciliation), Section 2 (override summary), Section 3 (transaction summary), signature block; reuses Phase 39 content JSON

---

### Phase 39 — Shift Reconciliation Gate (Mandatory Close Flow) [SPEC]

**Goal:** Shift close is impossible without a full tender reconciliation. Managers reconcile in Reports; cashiers never close shifts. Admin retains checkout access and can bypass reconciliation (logged).

**Builds on (read first):**
- `Shift` model — `opening_float`, `expected_cash`, `variance`, `status` (currently `open` → `closed`; extend lifecycle)
- `Sale` model — `payment_method` (`cash` | `card` | `mpesa` | `split` | `account`), `status` (`completed` | `voided` | `refunded`), `cash_tendered`, `mpesa_ref`, `shift_id`
- `Return` model — `refund_method` (`cash` | `card` | `store_credit`), `total_refund`, `status` (`completed` only counts), linked via `original_sale_id` → sale in shift window
- `OverrideApproval` model — `action` (`ADJUST_QTY` | `REMOVE_COMMITTED_ITEM`), `original_qty`, `new_qty`, `item_name`, `cashier_id`, `manager_name`, `created_at`, `sale_id`
- `ShiftReport` model — immutable `content` JSON, lifecycle `GENERATED → PRINTED → FILED`, `filed_by_*`, `print_count`
- Existing routes: `POST /api/shifts/<id>/close` (auto-generates report), `GET/POST /api/shift-reports/*` (print/file)

**Supersedes:** Phase 14 cash-only close flow. Phase 14 filing gate (must FILED before next shift open) remains — reconciliation is the new mandatory step _before_ close.

---

#### 39A — Remove Checkout from Manager Dashboard

- `App.jsx`: remove `manager` from Checkout nav entry — only `cashier` + `admin` see Checkout
- Remove any Checkout/POS import or route from manager-only views (Dashboard, Reports, Shifts)
- `HOME_BY_ROLE.manager` stays `/dashboard` — manager never lands on POS
- **Idle/attract screen** (`POS.jsx` / `IdleScreen.jsx`): remove sales-total / today's revenue widget from idle background
- Idle screen shows only: store name, time/date, tips carousel, branding/promo slides
- Today's sales stats live exclusively in **Reports → Shift History** — not on the POS idle screen
- Admin keeps full Checkout access unchanged

---

#### 39B — Reconciliation Flow on Shift Close

**Location:** Reports section (manager terminal only).  
**Entry point:** "Close Shift" button inside the active shift view (`Reports.jsx` Shifts tab or dedicated reconciliation modal — not on POS).

The shift **cannot close** without completing reconciliation. No bypass except admin (admin bypass logged to audit).

##### Step 1 — System calculates expected totals

When manager clicks **Close Shift**, `GET /api/shifts/:id/reconciliation` computes and returns expected figures from shift window (`shift.opened_at` → now):

For each tender type with activity:

| Tender | Expected formula |
|---|---|
| **CASH** | `opening_float` + Σ cash sales (`status=completed`, `payment_method=cash`) + Σ cash portion of split sales (`cash_tendered`) − Σ cash refunds (`Return.status=completed`, `refund_method=cash`, original sale in shift) |
| **M-PESA** | Σ M-Pesa sales (`status=completed`, `payment_method=mpesa`, `mpesa_ref` present) − Σ M-Pesa refunds (if refund_method supports mpesa; else 0) |
| **CARD** | Σ card sales (`payment_method=card`) + card portion of split (`card_amount`) − Σ card refunds |
| **OTHER** | account / store_credit / cheque if applicable — same pattern |

**TOTAL EXPECTED REVENUE** = sum across all tender types (completed sales only).

From `OverrideApproval` for this shift window + cashier:

| Metric | Source |
|---|---|
| `override_count` | count of override records |
| `voided_value` | sum of line value removed via `REMOVE_COMMITTED_ITEM` (or `REMOVE_ITEM` after rename) |
| `adjusted_items` | count of `ADJUST_QTY` overrides |
| `override_total_value` | sum of absolute value impact per override |

M-Pesa UI note: *"M-Pesa totals are verifiable against Daraja / phone statement."*

##### Step 2 — Manager entry screen

Two-column reconciliation form:

| Left (read-only) | Right (manager input) |
|---|---|
| Expected cash | Cash counted in drawer [KES] |
| Expected M-Pesa | M-Pesa confirmed from phone/statement [KES] |
| Expected card/other | Other tender counted [KES] |

Inline variance per tender (updates as manager types):

```
variance = actual − expected
  = 0  → "Balanced ✓" (green)
  < 0  → "SHORT by KES X" (red)
  > 0  → "OVER by KES X" (amber)
```

Overall banner:
- All balanced → green **"Ready to close"**
- Any variance → red **"Discrepancies found — review before closing"**
- Manager **may still close** with variance — shift must end — variance permanently recorded

##### Step 3 — Overrides summary (collapsible)

Table of every manager card override today:

| Time | Cashier | Action | Item | Old qty | New qty | Value impact |

Action types (normalize naming in `OverrideApproval.action`):
- `REMOVE_ITEM` (rename from `REMOVE_COMMITTED_ITEM`)
- `ADJUST_QTY`
- `SHIFT_OPEN`
- `VOID`

Value impact = KES difference the override caused (negative for removals).

Summary row: total override value impact.

Flag if `override_total_value / total_expected_revenue > 0.05`:
> "Override activity is X% of today's sales — review recommended"

##### Step 4 — Transaction breakdown (collapsible)

Full transaction list grouped by tender:

| Time | Receipt no. | Items count | Tender | Amount |

Subtotal per tender group. Audit trail for manager review (round numbers, receipt gaps, etc.).

##### Step 5 — Close and generate report

Buttons:
- **[Print & Close Shift]** — primary
- **[Close Without Printing]** — secondary; confirm dialog; logs `closed_without_print`

**Print & Close Shift flow:**
1. `POST /api/shifts/:id/close` with `reconciliation_submitted: true` + actual counts → creates `ShiftReport` (`status=GENERATED`) with full immutable JSON snapshot
2. `window.print()` on clean A4 layout (`printShiftReconciliation()` in `utils/print.js`)
3. After print dialog: prompt *"Confirm hardcopy printed and filed?"*
4. On confirm: report `status → FILED`, shift `status → closed`, redirect to Reports → Shift History

**Close Without Printing flow:**
1. Confirm: *"Closing without printing means no hardcopy. This will be flagged in the admin report. Continue?"*
2. Shift closes; report stays `GENERATED`; `closed_without_print: true` on report content + shift record
3. Visible flag in admin Shift History

---

#### 39C — Shift History Page (Reports)

Rename/extend existing **Reports → Shift Reports** tab to **Shift History**.

List all closed shifts for this store:

| Date | Cashier | Open | Close | Total sales | Cash var. | M-Pesa var. | Override count | Status |

**Status column (computed display):**
| Status | Condition |
|---|---|
| **FILED** (green) | report `status=FILED` |
| **CLOSED** (amber) | closed with `closed_without_print=true` |
| **DISCREPANCY** (red) | any non-zero tender variance (even if filed) |
| **OVERDUE** (red) | shift still `open` past midnight local time |

Row click → expand full reconciliation report inline (same layout as print view, read-only).

Filter bar: date range, cashier, status.

**Visibility:**
| Role | Sees |
|---|---|
| Admin | all shifts (all stores when multi-store) |
| Manager | own store's shifts — full reconciliation |
| Cashier | own shifts only — transaction list + total only; **no variance figures** |

---

#### 39D — Print Layout (A4)

Single A4 page (page 2 if transaction list long). `@media print` CSS.

**Header:**
```
Store name + logo | "Daily Shift Reconciliation"
Report ID: SR-[YYYYMMDD]-[shift_id padded 4]
Cashier: [name] | Manager: [name] | Date: [date]
Shift: [open_time] → [close_time]
```

**Section 1 — Tender reconciliation:**

| Tender | Expected | Actual (counted) | Variance | Status |

Bold variance column; highlight non-zero variances.

**Section 2 — Override summary:**
Total overrides: N | Total value impacted: KES X  
Table: Time | Action | Item | Value impact

**Section 3 — Transaction summary:**
Total transactions: N  
Per tender: Cash [n txns / KES x] | M-Pesa [n txns / KES x] | …

**Footer — signature block:**
```
Cashier: _____________ Signature: _____________ Date: _____
Manager: _____________ Signature: _____________ Date: _____
"This report was generated by [POS name] and constitutes an official record of shift activity."
```

Print hint in UI: *"Print in portrait, A4, no margins"*

```css
@page { size: A4 portrait; margin: 18mm; }
```

---

#### 39E — Server-Side Enforcement

| Route | Method | Guard | Behaviour |
|---|---|---|---|
| `/api/shifts/:id/reconciliation` | GET | manager, admin | Returns expected + override + transaction preview |
| `/api/shifts/:id/close` | POST | manager, admin | Requires `reconciliation_submitted: true` in body else **400** `"Reconciliation required before closing shift"` |
| `/api/shifts/:id/close` | POST | cashier | **403** always |
| `/api/shifts/:id/close` | POST | admin + `admin_bypass: true` | Allows close without reconciliation; audit log entry required |
| `/api/shift-reports/:id` | PUT/PATCH | — | **404/405** — content is write-once after GENERATED |
| `/api/shift-reports` | GET | role-scoped | Cashier sees redacted content (no variance) |

---

#### 39F — New / Changed Schema

**`shifts` table — new columns:**

| Column | Type | Notes |
|---|---|---|
| `actual_cash` | Float | manager counted |
| `actual_mpesa` | Float | manager confirmed |
| `actual_card` | Float | manager confirmed |
| `actual_other` | Float | other tenders |
| `variance_cash` | Float | actual − expected |
| `variance_mpesa` | Float | |
| `variance_card` | Float | |
| `variance_other` | Float | |
| `reconciled_by_id` | Integer FK staff | manager who closed |
| `reconciled_by_name` | String | |
| `reconciled_at` | DateTime | |
| `closed_without_print` | Boolean default false | |
| `admin_bypass` | Boolean default false | admin skipped reconciliation |
| `status` values | | `open` → `pending_reconciliation` → `closed` (drop bare `closed` without reconciliation path) |

**`override_approvals` table — new columns:**

| Column | Type | Notes |
|---|---|---|
| `value_impact` | Float | KES impact at time of override |
| `shift_id` | Integer FK | denormalised for fast shift queries |
| `unit_price` | Float | snapshot for value calc |

Rename action `REMOVE_COMMITTED_ITEM` → `REMOVE_ITEM` (migrate existing rows).

**`shift_reports` table — new columns:**

| Column | Type | Notes |
|---|---|---|
| `closed_without_print` | Boolean | mirrors shift flag |
| `has_discrepancy` | Boolean | any non-zero variance |
| `report_number` prefix | | `SR-YYYYMMDD-NNNN` (keep `RPT-*` for backward compat on old rows) |

**`returns` table — optional:**

| Column | Type | Notes |
|---|---|---|
| `shift_id` | Integer FK | denormalised at refund time for shift window queries |

---

#### 39G — Reconciliation Content JSON Shape

Stored in `ShiftReport.content` (immutable after creation). Example:

```json
{
  "report_id": "SR-20260611-0003",
  "generated_at": "2026-06-11T18:45:00Z",
  "store": { "name": "...", "address": "...", "kra_pin": "..." },
  "shift": {
    "id": 3,
    "cashier_id": 3,
    "cashier_name": "Cashier 1",
    "opened_at": "2026-06-11T08:00:00Z",
    "closed_at": "2026-06-11T18:45:00Z",
    "opening_float": 5000.00
  },
  "reconciled_by": { "id": 2, "name": "Manager", "role": "manager" },
  "closed_without_print": false,
  "admin_bypass": false,
  "overall_status": "DISCREPANCY",
  "tenders": [
    {
      "tender": "cash",
      "expected": 42500.00,
      "actual": 42080.00,
      "variance": -420.00,
      "status": "SHORT",
      "formula_notes": "opening_float + cash_sales + split_cash − cash_refunds"
    },
    {
      "tender": "mpesa",
      "expected": 18300.00,
      "actual": 18300.00,
      "variance": 0,
      "status": "BALANCED",
      "daraja_note": "Verifiable against M-Pesa statement"
    },
    {
      "tender": "card",
      "expected": 6200.00,
      "actual": 6200.00,
      "variance": 0,
      "status": "BALANCED"
    }
  ],
  "total_expected_revenue": 67000.00,
  "total_actual_revenue": 66580.00,
  "total_variance": -420.00,
  "overrides": {
    "count": 4,
    "voided_value": 850.00,
    "adjusted_items": 2,
    "total_value_impact": 1250.00,
    "pct_of_sales": 1.86,
    "flagged": false,
    "details": [
      {
        "time": "2026-06-11T10:22:00Z",
        "cashier_name": "Cashier 1",
        "manager_name": "Manager",
        "action": "REMOVE_ITEM",
        "item_name": "Cement 50kg",
        "original_qty": 2,
        "new_qty": 0,
        "value_impact": -850.00
      }
    ]
  },
  "transactions": {
    "total_count": 47,
    "by_tender": {
      "cash":   { "count": 28, "total": 37500.00 },
      "mpesa":  { "count": 15, "total": 18300.00 },
      "card":   { "count": 4,  "total": 6200.00 }
    },
    "list": [
      {
        "time": "2026-06-11T08:15:00Z",
        "receipt_number": "RCP-20260611-0001",
        "items_count": 3,
        "tender": "cash",
        "amount": 2450.00,
        "status": "completed"
      }
    ]
  },
  "refunds": {
    "cash": 0.00,
    "card": 0.00,
    "mpesa": 0.00
  },
  "notes": ""
}
```

Cashier-redacted view omits: `tenders[].expected`, `tenders[].variance`, `total_variance`, `overall_status`, variance columns.

---

#### 39H — Variance Calculation Rules (server-side only)

All expected totals use **`Sale.status = 'completed'`** only. Exclude:
- `voided` sales
- `refunded` sales (original sale status becomes `refunded` — excluded from revenue)
- Pending / incomplete M-Pesa (no `mpesa_ref` or status ≠ completed)

**Cash expected:**
```
opening_float
+ SUM(sale.total WHERE payment_method='cash' AND status='completed')
+ SUM(sale.cash_tendered WHERE payment_method='split' AND status='completed')
− SUM(return.total_refund WHERE refund_method='cash' AND status='completed'
      AND original_sale.shift_id = this_shift)
```

**M-Pesa expected:**
```
SUM(sale.total WHERE payment_method='mpesa' AND status='completed' AND mpesa_ref IS NOT NULL)
− SUM(mpesa refunds in shift window)
```

**Card / other:** same pattern per `payment_method`.

**Override value impact:**
- `REMOVE_ITEM`: `−(original_qty × unit_price)` (use snapshotted `unit_price` on override record)
- `ADJUST_QTY`: `(new_qty − original_qty) × unit_price`

Variance per tender: `actual_counted − expected` (computed server-side; frontend displays only).

---

#### 39I — Implementation Files

| Area | Files |
|---|---|
| Backend models | `backend/models.py` — Shift, OverrideApproval, ShiftReport, Return columns |
| Backend routes | `backend/routes/shifts.py` — reconciliation GET, close POST guards; `backend/routes/shift_reports.py` — Shift History list with filters |
| Backend init | `backend/init_db.py` — column migrations |
| Frontend Reports | `frontend/src/pages/Reports.jsx` — Shift History tab, reconciliation modal, close flow |
| Frontend Shifts | `frontend/src/pages/Shifts.jsx` — remove close from cashier; link to Reports reconciliation |
| Frontend App | `frontend/src/App.jsx` — remove manager from Checkout nav |
| Frontend POS | `frontend/src/pages/POS.jsx` — idle screen: remove sales stats widget |
| Frontend print | `frontend/src/utils/print.js` — `printShiftReconciliation()` A4 layout |
| Frontend API | `frontend/src/api.js` — `getShiftReconciliation`, updated `closeShift` |

---

#### 39J — Post-Implementation Checklist (for developer handoff)

After building, confirm and document:

1. **Reconciliation content JSON shape** — matches §39G above; stored write-once in `ShiftReport.content`
2. **New shift fields** — §39F `actual_*`, `variance_*`, `reconciled_by_*`, `closed_without_print`, `admin_bypass`
3. **API routes + guards** — §39E table; cashier 403 on close; admin bypass audited
4. **Variance uses completed only** — §39H; voided/refunded/pending excluded; refunds subtracted by tender

---

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
| Shift Daily Report / Reconciliation | Manager | Cashier + Manager | A4 |
| Inventory Status Report | Inventory / Manager | Manager | A4 |
| Purchasing / PO Report | Purchasing / Manager | Manager | A4 |
| Sales & Revenue Report | Manager | Manager | A4 |
| Customer Account Statement | Manager | Manager | A4 |
| Returns Report | Manager | Manager | A4 |

---

## Known Gaps / Tech Debt

- ~~Discount override at POS not gated behind manager auth~~ — fixed Phase 28
- ~~`Settings.jsx` role select missing role descriptions~~ — fixed Phase 28
- Receipt printing uses env vars as fallback — ensure `.env` is populated on deployment
- `python-escpos` and `pyserial` must be installed manually: `pip install python-escpos pyserial`
- Stripe Terminal requires `STRIPE_SECRET_KEY` in `.env`
- Phase 17: `StockMovement` only populated going forward — historical `StockAdjustment` records not backfilled
- Phase 17: Count sheet has no session/reference number linking back to count corrections
- **CRITICAL — PIN storage:** Staff PINs stored as plain text in DB. Must be hashed (bcrypt) — Phase 30
- **CRITICAL — No rate limiting:** `/api/auth/login` and `/api/auth/department` have no brute-force protection — Phase 30
- **CRITICAL — Unauthenticated card routes:** `POST /api/auth/generate-card/<id>` and `revoke-card` require no session — Phase 30
- **CRITICAL — Default PINs in source code:** `0000`, `1111`, `2222` etc. hardcoded in `auth.py` — Phase 30
- **CRITICAL — No session idle timeout:** A logged-in cashier session never expires on inactivity — Phase 30
- No product images on POS tiles — Phase 29
- No Hold Sale / parked transactions — Phase 32
- No reorder point / auto-PO suggestions — Phase 33 ✅ done
- No bulk CSV product import — Phase 34
- **Manager has Checkout nav** — remove in Phase 39A (managers do not sell)
- **Shift close is cash-only** — no multi-tender reconciliation gate — Phase 39
- **POS receipt — supplier details:** B2B buyer KRA PIN on receipt (low priority — tax invoice covers it)

---

---

### Phase 29 — POS Terminal Overhaul (Supermarket Look & Feel) ✅ COMPLETE

**Implemented:**
- 29A: 3-panel layout — `180px category sidebar | flex-1 product panel | 380px cart` via CSS grid; responsive ≤1199px collapses sidebar to horizontal pill tabs above product panel
- 29B: Unified search bar autofocused on shift open; F3 or `/` global shortcut focuses search from anywhere; barcode scan into same input
- 29C: Product tile grid in middle panel (browse mode, no query) — image tiles min 140px, out-of-stock greyed overlay, low-stock yellow dot badge; list view used for search results
- 29D: Full-screen `IdleScreen` after 90s (already existed); `IdleCheckout` carousel in cart column when empty (existing)
- 29F: Reprint buttons always visible at bottom of cart column after each completed sale
- Fixed stale `loadDailyTotals()` call in `handleSaleComplete` (function was removed in Phase 39 but call remained)
- `CategorySidebar` component (already existed) wired into POS: fetches categories on shift open, filters browse products by `category_id`
- `selectedCategory` resets search query when switching categories

**Goal:** The POS terminal must look and feel like a real supermarket checkout — not a dashboard. Fast, touch-friendly, visually rich, with a clear product browse area and a professional cart/receipt panel.

#### 29A — Layout Redesign
- **3-panel layout** (wide screen): `[Category sidebar 180px] | [Product grid flex-1] | [Cart + checkout 380px]`
- On tablet (< 1200px): collapse to 2-panel (products left, cart right) with category as horizontal pill tabs above grid
- Cart panel always fixed on the right — never scrolls away
- Receipt/print buttons always visible at the bottom of the cart panel (not hidden in History modal)

#### 29B — Product Search Overhaul
- **Unified search bar** (top of product panel, large, autofocused on shift open)
- Searches simultaneously: product name, barcode, PLU code, supplier SKU
- Live results as you type (debounced 200ms)
- Barcode scan directly into the same search input — no separate BarcodeInput component
- "No results" state with a "Not found — manual entry?" link
- Keyboard shortcut: `F3` or `/` focuses search from anywhere on the page

#### 29C — Product Tiles with Images
- Tiles show product image (if uploaded) — fallback to colored icon by category
- Tile layout: image top half, name + price bottom half
- Touch target: minimum 120×140px tile
- Out-of-stock tiles shown greyed with "Out of Stock" overlay (still tappable → shows alert)
- Low-stock badge (yellow dot) on tile corner

#### 29D — Idle / Attract Screen
- After 90 seconds of no cashier activity (no mouse/touch/keyboard), POS enters idle mode
- Full-screen slide show: store logo, promotional images, tips carousel, branding slides
- Shows: store name, current time/date — **no sales totals or revenue stats** (those live in Reports → Shift History only — see Phase 39A)
- Promotions managed from Settings (upload up to 5 images + caption)
- Any keypress, tap, or barcode scan instantly exits idle mode
- Idle screen doubles as customer-facing display if screen is visible to customer

#### 29E — Numeric Keypad & Quick Actions
- Each cart item has a tap-to-edit qty field — tapping opens an on-screen numeric keypad
- Keypad supports: `0–9`, `×` (multiply for bulk entry), `⌫` (backspace), `Enter` (confirm)
- Quick action buttons on cart panel: `Hold Sale`, `Void All`, `Price Check`
- `Hold Sale` parks the current cart (up to 3 slots) — see Phase 32

#### 29F — Receipt Print on Right Panel
- **ESC/POS "Print Receipt"** button always visible at the bottom of the cart panel
- Triggers after payment is complete — no need to open History modal
- Also: re-print last receipt button (single click, no modal)
- Browser fallback "Print (A4/80mm)" button next to ESC/POS button

#### Implementation files:
- `frontend/src/pages/POS.jsx` — full layout rebuild, unified search, idle timer, quick actions
- `frontend/src/components/Cart.jsx` — inline qty keypad, print buttons at bottom
- `frontend/src/components/ProductGrid.jsx` — new component: image tiles, out-of-stock overlay
- `frontend/src/components/CategorySidebar.jsx` — new component: vertical category list with icons
- `frontend/src/components/IdleScreen.jsx` — new component: attract loop
- `frontend/src/pages/Settings.jsx` — add Promotions section (upload + manage idle screen slides)
- `backend/routes/stores.py` — `GET/POST /api/stores/promotions` for idle screen images
- `backend/models.py` — `StorePromotion` model (image_path, caption, sort_order, is_active)

---

### Phase 30 — Security Hardening (CRITICAL) ✅ COMPLETE

**Implemented:**
- 30A: bcrypt PIN hashing with on-the-fly migration (`auth_utils.py`, `auth.py`, `staff.py`)
- 30B: Flask-Limiter rate limiting on auth endpoints; login lockout (`login_attempts` + `locked_until` on Staff, 5-attempt threshold, 30-min lock); `POST /api/staff/<id>/unlock`
- 30C: `get_current_user()` guard on generate-card/revoke-card; admin role required
- 30D: `useIdleTimeout` hook + `LockScreen` component in `App.jsx`; PIN re-entry resumes session without full logout
- 30E: `SESSION_COOKIE_SECURE=True`, `HSTS` header, startup warning if default SECRET_KEY
- 30F: `validate_str`/`validate_positive`/`validate_email` applied in `inventory.py` (adjust_stock reason/product_id), `customers.py` (name/phone/email on create+update)
- 30G: No hardcoded fallback PINs in `auth.py`
- 30H: `log_action()` added to `inventory.py` (stock_adjust, damage approve/reject), `customers.py` (create, update — with credit_limit before/after); `products.py` already had full coverage

**Goal:** Bring the app to production-grade security before any live deployment. Several critical vulnerabilities exist that must be fixed.

#### 30A — PIN Hashing (CRITICAL)
- **Problem:** `personal_pin` and `pin` fields stored as plain text in SQLite. A DB dump exposes all staff PINs.
- **Fix:** Hash all PINs with `bcrypt` on write; verify with `bcrypt.checkpw()` on login
- Migration: on next successful login, detect unhashed PIN (no `$2b$` prefix) → hash and save
- New staff PINs always hashed at creation
- Manager card codes remain as UUID hex (already opaque)
- Files: `backend/routes/auth.py`, `backend/routes/staff.py`, `backend/models.py`

#### 30B — Rate Limiting & Brute Force Protection (CRITICAL)
- Install `Flask-Limiter` (`pip install flask-limiter`)
- Limits:
  - `POST /api/auth/department` — 10 requests/minute per IP
  - `POST /api/auth/login` — 5 requests/minute per IP
  - `POST /api/auth/authorize` — 10 requests/minute per IP
  - All other write endpoints — 120 requests/minute per IP
  - All read endpoints — 300 requests/minute per IP
- Failed login counter: `login_attempts` (Integer) + `locked_until` (DateTime) on `Staff` model
- After 5 consecutive failures → `locked_until = now + 30 minutes`
- Login endpoint checks `locked_until` before attempting PIN match
- Successful login resets `login_attempts = 0`
- Manager can unlock a staff account via `POST /api/staff/<id>/unlock`
- Lockout info returned to frontend: "Account locked. Try again in X minutes."
- Files: `backend/app.py` (limiter setup), `backend/routes/auth.py`, `backend/models.py`

#### 30C — Fix Unauthenticated Admin Routes (CRITICAL)
- **Problem:** `POST /api/auth/generate-card/<id>` and `POST /api/auth/revoke-card/<id>` require NO session — anyone on the network can call them.
- **Fix:** Add `get_current_user()` guard requiring admin role on both routes
- Same fix for any other admin-only routes missing auth checks
- Audit all blueprints for missing `get_current_user()` calls on write endpoints
- Files: `backend/routes/auth.py`, all route blueprints

#### 30D — Session Idle Timeout (Frontend)
- **Problem:** A logged-in cashier session never expires — an unattended terminal is a security risk.
- **Fix:** `useIdleTimeout` React hook — detects inactivity (mouse, keyboard, touch)
- After configurable timeout (default: 10 minutes, set in Settings → Security):
  - Screen blurs / locks with "Session locked — enter PIN to resume"
  - PIN re-entry resumes session without full logout (session still valid on backend)
  - Full logout after 30 minutes idle
- Idle timeout stored in `Store` model: `session_timeout_minutes` (default 10)
- Files: `frontend/src/hooks/useIdleTimeout.js` (new), `frontend/src/App.jsx`, `backend/models.py`, `backend/routes/stores.py`

#### 30E — HTTPS & Secure Cookie Enforcement
- When `FLASK_ENV=production`:
  - `SESSION_COOKIE_SECURE = True` (HTTPS-only cookies)
  - `SESSION_COOKIE_HTTPONLY = True` (already set)
  - `SESSION_COOKIE_SAMESITE = 'Strict'` (upgrade from Lax)
  - Add `HSTS` header: `Strict-Transport-Security: max-age=31536000`
- Startup warning if `SECRET_KEY` is the default dev string
- Startup warning if `FLASK_ENV != production` in live mode
- Files: `backend/app.py`

#### 30F — Input Validation & Sanitization
- Max length validation on all text inputs (name ≤ 200, PIN ≤ 10, barcode ≤ 50, etc.)
- Strip HTML tags from all string inputs (prevent stored XSS)
- Reject negative prices, quantities, and rates at API level (not just frontend)
- Validate email format on staff/customer creation
- Centralized `validate_str(val, max_len)` helper in `auth_utils.py`
- Files: `backend/auth_utils.py`, all route blueprints

#### 30G — Remove Hardcoded Default PINs
- **Problem:** Default PINs (`0000`, `1111`, `2222`, etc.) are hardcoded in `auth.py`. If the seed script is never run, these become permanent backdoors.
- **Fix:** Move defaults to `seed.py` only — `auth.py` must not contain any fallback PINs
- On first startup with empty DB: force admin to create a real PIN before any access is granted
- Files: `backend/routes/auth.py`, `backend/seed.py`

#### 30H — Audit Log Completeness
- Ensure every write operation (create/update/delete) on sensitive models logs to the audit table
- Currently missing: product price changes, stock adjustments, customer credit limit changes
- Add `log_action()` calls where missing
- `GET /api/audit` pagination: default limit 100, max 500
- Files: `backend/routes/products.py`, `backend/routes/inventory.py`, `backend/routes/customers.py`

---

### Phase 31 — Product Images & Rich Catalog ✅ COMPLETE

**Implemented:**
- 31A: `POST /api/products/<id>/image` multipart upload (JPEG/PNG/WebP, max 2MB) → saves to `backend/static/product_images/`; `DELETE /api/products/<id>/image`; Vite dev proxy for `/static` so images load at `localhost:5173/static/...`; Products.jsx: image thumbnail in table + upload/replace/remove in edit modal
- 31B: `reorder_point` + `reorder_qty` on Product model; `GET /api/products/below-reorder`; DB migrations added to init_db.py; Products.jsx: "Reorder When Below" + "Suggested Reorder Qty" fields in edit modal; reorder status column in product table (red when stock ≤ reorder point)
- 31C: `printBarcodeLabel(product, format)` in utils/print.js; format='label' (58mm single) or 'a4' (30-up Avery); uses JsBarcode@3.11.6 from CDN in print window; CODE128 barcode SVG + product name + price; "Label" button per product row in Products.jsx; `jsbarcode` npm package installed

**Goal:** Products have images shown on POS tiles and in the product list. Supports barcode label printing.

#### 31A — Product Image Upload
- `image_url` field on `Product` model
- `POST /api/products/<id>/image` — multipart file upload; saves to `backend/static/product_images/`; returns URL
- `DELETE /api/products/<id>/image` — remove image
- `GET /api/products/<id>` returns `image_url` (relative path served as static)
- Max file size: 2MB; accepted types: JPEG, PNG, WebP
- `Products.jsx`: image upload button on edit modal; thumbnail preview
- Files: `backend/routes/products.py`, `backend/models.py`, `frontend/src/pages/Products.jsx`

#### 31B — Reorder Point per Product
- `reorder_point` (Integer, default 0) and `reorder_qty` (Integer, default 0) fields on `Product`
- Shown in product edit modal: "Reorder When Below" + "Suggested Order Qty"
- `GET /api/products/below-reorder` — returns all active products where `stock_qty <= reorder_point` and `reorder_point > 0`
- Dashboard widget (Phase 33) uses this endpoint
- Files: `backend/models.py`, `backend/routes/products.py`, `frontend/src/pages/Products.jsx`

#### 31C — Barcode Label Printing
- "Print Label" button per product in `Products.jsx`
- Two formats selectable: **58mm single label** (name, barcode, price) or **A4 sheet** (30-up Avery-style)
- `printBarcodeLabel(product, format)` in `utils/print.js`
- Barcode rendered as SVG Code128 (use `JsBarcode` library)
- Files: `frontend/src/utils/print.js`, `frontend/src/pages/Products.jsx`

---

### Phase 32 — Hold Sale / Parked Transactions ✅ COMPLETE

**Implemented:**
- `frontend/src/utils/parkedSales.js` — localStorage helper: `parkSale`, `getParkedSales`, `retrieveSale`, `discardSale`; auto-expire after 2 hours; up to 3 named slots (`pos_parked_1..3`)
- POS.jsx: "Hold" button in bill header (when cart non-empty) → note prompt modal → `parkSale()` → clears cart
- "Parked (N)" button in bill header + in the reprint row (amber, visible whenever parked count > 0, even with empty cart)
- Retrieve modal: shows all parked slots with note, item count, total, customer name, age + expiry countdown; Retrieve replaces current cart (warns if non-empty); Discard removes slot permanently
- `parkedSales` state initialised from localStorage on mount; refreshed after every park/retrieve/discard

**Goal:** Cashier can park the current sale (e.g. customer forgot wallet) and start a new one.

#### What to build:
- "Hold Sale" button on POS cart panel (always visible when cart is not empty)
- Tapping Hold Sale: prompt for an optional hold note → stores cart + customer + note in `localStorage` under a slot key
- Up to **3 parked slots** at any time
- "Parked (N)" badge on a "Retrieve" button in the POS status bar
- Retrieve modal: shows all parked sales (note, item count, total, time parked) — tap to restore
- Restoring a parked sale: replaces current cart (warn if current cart is non-empty)
- Parked sales auto-expire after 2 hours (cleared on retrieve or expiry)
- Parked sales survive page reload (localStorage)
- Files: `frontend/src/pages/POS.jsx`, `frontend/src/utils/parkedSales.js` (new helper)

---

### Phase 33 — Reorder Points & Auto-PO Suggestions ✅ COMPLETE

**Goal:** When products fall below their reorder point, the system surfaces this to the manager and can suggest or draft a Purchase Order.

#### What was built:
- `GET /api/products/below-reorder` — products where `stock_qty <= reorder_point > 0`
- `supplier_id` + `supplier_name` fields added to Product model + migration; Products.jsx form has Supplier dropdown
- **Dashboard widget** (`ReorderWidget` in `ManagerPanel`): grouped by supplier, shows stock/reorder/suggest qty, "Create Draft PO" button
- **Inventory.jsx**: "Reorder" tab showing same data, grouped by supplier with "Create Draft PO"
- **PurchaseOrders.jsx**: reads `location.state.draft` on mount to pre-fill create modal with supplier + items
- Files: `backend/models.py`, `backend/init_db.py`, `backend/routes/products.py`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Inventory.jsx`, `frontend/src/pages/PurchaseOrders.jsx`, `frontend/src/pages/Products.jsx`

---

### Phase 34 — Bulk CSV Product Import / Export ✅ COMPLETE

**Goal:** Import hundreds of products at once from a spreadsheet — critical for initial store setup and price updates.

#### 34A — CSV Export ✅
- "Export CSV" button (manager/admin) → `GET /api/products/export-csv` → downloads `products.csv` (UTF-8 BOM for Excel)
- Columns: name, barcode, plu_code, price, tax_rate, tax_class, stock_qty, low_stock_threshold, reorder_point, reorder_qty, category, supplier, is_active

#### 34B — CSV Import ✅
- "Import CSV" button (admin only) → modal with 3-step flow
- Step 1: Download template (`GET /api/products/import-template`) + Choose CSV file
- Step 2: Preview table — parsed rows with action (create/update), errors listed above table
- Step 3: Commit → `POST /api/products/import?preview=0` — upsert by barcode/PLU, returns `{ created, updated }`
- Files: `backend/routes/products.py`, `frontend/src/pages/Products.jsx`, `frontend/src/api.js`

---

### Phase 35 — SMS & Email Notifications ✅ COMPLETE

**Goal:** Key business events trigger notifications to the right person without them having to log in.

#### What was built:
- `Notification` model: `event_type`, `channel`, `recipient`, `recipient_name`, `message`, `status` (sent/failed), `error`, `created_at`
- `Store.notification_config` — JSON blob column storing AT credentials, SMTP config, per-event toggles
- `backend/notifications.py`: `send_sms()` (Africa's Talking), `send_email()` (SMTP/TLS), `notify()` (dispatches + logs)
- `GET /api/notifications/log` — manager/admin view recent 50 notifications
- `POST /api/notifications/test` — admin can test SMS or email to any address; logged to Notification table
- Settings page (admin only): AT username/API key/sender ID, SMTP host/port/user/password/from address, per-event toggle table (7 events × channel + recipient), Test Delivery panel, recent notification log
- `pip install africastalking` required for SMS; email uses stdlib `smtplib` (no extra package)
- Files: `backend/notifications.py`, `backend/routes/notifications.py`, `backend/models.py`, `backend/routes/stores.py`, `backend/app.py`, `backend/init_db.py`, `frontend/src/api.js`, `frontend/src/pages/Settings.jsx`

---

### Phase 36 — Google Sheets Report Export

**Goal:** Owner and accountant can view key business data in Google Sheets on their phone, without needing POS access. One-way push only — no sync back.

#### What gets pushed (nightly, auto-scheduled):
| Sheet tab | Data |
|---|---|
| Daily Sales | Date, transactions, revenue, by payment method, avg basket |
| Stock Levels | Product, category, qty, reorder flag, last movement date |
| Shift Reports | Cashier, date, opening float, closing float, discrepancy |
| Top Products | Weekly top 20 by quantity and revenue |
| Accounts | Customer name, balance, credit limit, last transaction |

#### Implementation:
- Google Sheets API v4 + OAuth2 service account (JSON key file)
- `pip install google-api-python-client google-auth`
- `backend/sheets_export.py` — `push_daily_report(app)` function
- Scheduled via `apscheduler` — runs at 23:45 every night
- Settings page: Google Sheets tab — paste spreadsheet URL, upload service account JSON, enable/disable per-tab, "Push Now" test button
- Data is **append-only** — new row per day/shift; never overwrites existing rows
- Files: `backend/sheets_export.py` (new), `backend/routes/stores.py`, `frontend/src/pages/Settings.jsx`

---

### Phase 37 — eTIMS / KRA Integration (Kenya Compliance)

**Goal:** Kenya Revenue Authority requires eTIMS (Electronic Tax Invoice Management System) compliance. All tax invoices must be submitted electronically and carry a KRA QR code.

#### What to build:
- **eTIMS API client** (`backend/etims.py`): sign and submit invoice data to KRA sandbox/production
- Every `Invoice` record gets: `etims_status` (pending/submitted/error), `etims_cu_invoice_number`, `etims_qr_code`
- `POST /api/invoices/<id>/submit-etims` — submit to KRA, store response
- Auto-submit on invoice creation (if eTIMS is enabled in settings)
- QR code printed on all tax invoices and receipts (contains CU invoice number + hash)
- Settings: eTIMS tab — API credentials, sandbox vs production toggle, VSCU/OSCU device serial
- Fallback: if eTIMS is unreachable, invoice is saved locally with `etims_status=pending` and retried on next sync
- Files: `backend/etims.py` (new), `backend/models.py`, `backend/routes/invoices.py`, `frontend/src/pages/Settings.jsx`, `frontend/src/utils/print.js`

> **Note:** KRA eTIMS is mandatory for VAT-registered businesses in Kenya as of 2024. Prioritize this before going live.

---

### Phase 41 — Comprehensive Audit & Reconciliation (PRIORITY — IN PROGRESS)

**Goal:** Every action by every user is logged, viewable, and printable. Managers can produce a full day report showing every transaction, override, stock change, and login — for accountability and cash reconciliation.

#### What's done (committed):
- `backend/routes/sales.py`: `log_action` on every sale creation (with full item list) and every void
- `backend/routes/voids.py`: `log_action` on `void_sale` and `no_sale` (manager-authorized)
- `backend/routes/inventory.py`: fixed `extra=` → `details=` bug in log_action calls
- `backend/routes/audit.py`: `/api/audit/reconciliation` — unified endpoint merging audit_logs + full sales with items + void_logs + override_approvals + stock_movements, sorted by time, with summary stats
- `frontend/src/api.js`: `getReconciliation(params)` export
- `frontend/src/utils/print.js`: `printReconciliation(data, store)` — A4 landscape with summary tiles + full event table

#### AuditLog.jsx — DONE ✅
Built and embedded inside Reports as the "Audit" tab. Full event table, date range, filter tabs, summary bar, print reconciliation button. Removed from sidebar (was nav item, now tab).

#### Session 2025-06-15 additions (committed):
- Two-phase shift close: close shift first, print report separately
- Staff protection: manager blocked from editing admin accounts in StaffManagement.jsx
- Admin role: Open Shift button hidden everywhere
- 500 fix on shift close: `stores.printer_config` + `sales.etims_*` columns added to `_ensure_columns()`
- Cashier & Shifts filter fix: always fetch all reports, client-side filter with correct DB status values (GENERATED/PRINTED/FILED)
- Antitheft alerts section added to `printShiftReconciliation()` in `utils/print.js` — see Phase 62

#### Next: Phases 63 + 64 (see Remaining/Backlog table)

---

### Phase 38 — Multi-Branch Support (Phase 12)

_Deferred — implement after all single-branch phases are complete._

- Each branch: own local DB + backend instance
- All branches sync to central PostgreSQL cloud DB
- HQ dashboard: consolidated view across all branches
- Stock transfer between branches (transfer note printout)
- Branch-specific staff, shifts, and reports

---

## Recommended Implementation Order

| Priority | Phase | Reason |
|---|---|---|
| **IMMEDIATE** | 30 — Security Hardening | Plain-text PINs + no rate limiting = critical risk before any live use |
| **HIGH** | 39 — Shift Reconciliation Gate | Mandatory close flow — cash control + audit trail before live operations |
| **HIGH** | 29 — POS Terminal Overhaul | Core UX improvement — cashier productivity + customer experience |
| **HIGH** | 37 — eTIMS / KRA | Legal compliance — mandatory for VAT-registered businesses |
| **HIGH** | 31 — Product Images | Speeds up cashier product identification |
| **MEDIUM** | 32 — Hold Sale | Daily operational need |
| **MEDIUM** | 33 — Reorder Points | Reduces stockouts, automates purchasing workflow |
| **MEDIUM** | 35 — SMS Notifications | Reduces manager's need to check the system manually |
| **LOWER** | 34 — CSV Import | One-time setup utility, manual entry works for now |
| **LOWER** | 36 — Google Sheets Export | Nice-to-have for accountant visibility |
| **DEFERRED** | 38 — Multi-Branch | Only needed once first branch is running smoothly |

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
