# EA POS — Senior QA Review & End-to-End Test Report

- **Date:** 2026-07-15
- **Commit under test:** `0aec2b4` (branch `claude/project-qa-review-testing-ip1gjw`)
- **App:** React 19 + Vite 6 + Zustand (IndexedDB persistence) + Tailwind v4 + Electron wrapper
- **Cloud:** Supabase project **POS** (`rzpyauhymrwonjnkboqf`, ap-northeast-2) — schema + seed already applied
- **Method:** full code review → static QA (`tsc`, production build) → 11 automated Playwright/Chromium sessions against `npm run dev` (105 recorded checks) → cloud-sync verification (details in §5) → live-project validation via Supabase management API (SQL probes + security advisors)
- **Artifacts:** reusable test harness in [`qa/`](qa/), raw results in `qa/results/*.json`, screenshots in `qa/evidence/`

---

## 1. Executive summary

The core POS loop is **solid**: PIN auth with SHA-256 hashing, role-based access, cart/discount/tax math, checkout (card & cash with change), stock decrement, refunds with stock **and** loyalty-point reversal, CRUD for products/categories/customers, history filters/bulk actions, dashboard analytics, QR menu, English/Arabic RTL — all verified working in the browser.

The **cloud-sync layer is where the release risks live**. Two critical issues (public database access; seeded accounts that can never log in and can lock out a terminal after "Pull From Cloud") plus a sync-deletion gap that resurrects deleted records. All three were demonstrated live, with screenshots.

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| F1 | 🔴 Critical | RLS disabled on all 5 tables — anon key (shipped in the client) gives the public full read/write incl. PIN hashes | Supabase advisors: 5 × ERROR |
| F2 | 🔴 Critical | Seeder writes **plaintext PINs**; app compares **SHA-256 hashes** → cloud-seeded accounts can never log in; "Pull From Cloud" imports them and can lock out a fresh terminal | `qa/evidence/08-06-lockout.png` |
| F3 | 🟠 High | Deletes never sync for products/categories/customers/users → deleted records **resurrect** on Pull | `qa/evidence/08-04-resurrected.png` |
| F4 | 🟠 High | Tax is charged but **never itemized** — not in cart, register receipt, history panel, or printed receipt | `qa/evidence/06-03-receipt.png` |
| F5 | 🟠 High | Dark-mode toggle doesn't apply `.dark` until app reload; Settings/modals have no dark styles at all | `qa/evidence/08-01b-settings-darkmode.png` |
| F6 | 🟠 High | Every screen is mounted **twice** (mobile + desktop shells): duplicate DOM ids, two independent carts, doubled effects | measured: 2× `#register-root` etc. |

Fifteen further medium/low findings in §4.

---

## 2. What was verified working ✅

**Static:** `tsc --noEmit` clean · `vite build` succeeds (7.4 s).

**Auth & roles (suite 05):**
- 3 default profiles listed; wrong PIN shows shake/error and stays locked; Admin `1234`, Manager `5555`, Cashier `0000` all log in (hashes match).
- RBAC exact: Admin 7 nav items · Manager 6 (no Settings) · Cashier 2 (Register, Transactions). Lock/unlock cycle works.

**Register & checkout (suite 06):** — math cross-checked against `src/lib/pricing.ts`
- 2×Espresso + 1×Latte → subtotal **$11.00**; 8.5% tax → total **$11.94** ✓
- 10% discount → −$1.10, total **$10.74** ✓ (fixed-amount discount also exercised)
- Cart qty ±, per-item remove, clear-cart, stock-limit cap on qty.
- Cash flow: complete disabled until tendered ≥ total; quick-cash chips; $5.00 on $3.53 → change **$1.47** ✓ and printed on receipt.
- Loyalty: banner offers min(points, ceil(subtotal/pointValue)); 65 pts × $0.05 = $3.25 discount; points deducted 124→59 ✓.
- Receipt: correct id sequence (TX-1010x), items, subtotal/discount/total, method, tendered/change.
- Stock decremented exactly per sale (120 → 114 across 6 espresso units in 3 sales — re-verified in Inventory).

**Inventory / Customers / History / Dashboard / QR (suites 07x):**
- Product add/edit/delete (confirm guard), SKU autogen, low-stock & out-of-stock filters, sorting, footer counters.
- Category add; delete blocked while products are linked; allowed when empty.
- Customer add/edit (points editable only in edit — correct), delete with confirm; tiers (Silver/Gold/Platinum) render.
- **Refund (admin/manager):** confirm → status `Refunded`, stock restored (+1 verified), and **loyalty reversal works both ways** — refunding a loyalty-redemption sale returned the customer's 65 redeemed points (59→124, matches `History.processRefund` spec).
- **Refund (cashier):** manager-override modal enforced; cashier's own PIN rejected; manager PIN `5555` authorizes. `qa/evidence/07e-02-authorized.png`
- Bulk select + delete transactions (custom modal) works and pushes the delete to the cloud (the only entity that does — see F3).
- Dashboard: revenue/profit/sales/stock-warning KPIs, 7-day trend, best sellers, category donut all render with consistent numbers. `qa/evidence/07e-03-dashboard.png`
- QR Menu: QR SVG + copyable `http://<host>:3001` link (server itself is Electron-only by design).

**Settings & i18n (suite 08):**
- Store-name edit reflects in the sidebar immediately; tax-rate edit feeds pricing.
- Arabic: `<html dir="rtl">`, full sidebar/App translation. `qa/evidence/08-02-arabic-rtl.png`
- Supabase panel: Save Config / **Test Connection → Connected badge** / **Push All** (5 tables) / incremental **live sync on checkout** (sale + stock upserted within ~1 s) / **Pull From Cloud** replaces local data — all verified (see §5 for how).

---

## 3. Critical findings (fix before any real deployment)

### F1 — Database is publicly writable (RLS disabled everywhere) 🔴
`scripts/schema.sql` disables RLS on `user_accounts`, `categories`, `products`, `customers`, `transactions`. The live project's security advisors report **5 × ERROR-level** [`rls_disabled_in_public`](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public). The anon key ships inside the client bundle, so anyone can read/modify every row — sales history, customer PII, and staff PIN hashes (or plaintext PINs, per F2). The schema file already carries a warning banner; treat it as a release blocker, not a footnote.
**Fix:** adopt Supabase Auth; enable RLS with staff-scoped policies; never expose `user_accounts` to the anon role.

### F2 — Plaintext-PIN seed data vs hashed-PIN login → terminal lockout 🔴 *(demonstrated live)*
- `scripts/seed.mjs` and the embedded `SUPABASE_SCHEMA_SQL` (in `src/lib/supabase.ts`) insert PINs as plaintext (`'1234'`, …). The live cloud rows contain those plaintext PINs today.
- `Lockscreen.tsx` compares `user.pin === SHA256(entered)`, so a plaintext-PIN account **can never authenticate**.
- After **Pull From Cloud**, `setUsers(cloudUsers)` replaces local accounts. In our test the lockscreen then showed **6 profiles** (3 pulled plaintext + 3 pushed hashed); "Admin Manager" with its own PIN `1234` was rejected (`qa/evidence/08-06-lockout.png`, `08-05-six-profiles.png`). On a fresh terminal whose first action is Pull, **every account is unusable** — full lockout with no recovery UI (recovery requires clearing IndexedDB).
**Fix:** hash PINs in the seeder (SHA-256, same as `hashPin`), fix the embedded DDL's default-admin insert, and add a defensive check on pull (e.g., refuse/re-hash 4-digit pins, or never sync credentials at all).

### F3 — Deletions don't sync; records resurrect 🟠 *(demonstrated live)*
Only `transactions` has a cloud delete (`deleteTransactionsCloudIfEnabled`). `handleDeleteProduct` / `handleDeleteCategory` / `handleDeleteCustomer` (and user deletion) are local-only. Verified: deleted a product with live sync ON → zero DELETE request issued → product still in cloud → **Pull From Cloud brought it back locally** (`qa/evidence/08-04-resurrected.png`).
**Fix:** add per-entity cloud deletes (mirror the transactions path), or move to soft-deletes/tombstones.

### F4 — Tax charged but never disclosed 🟠
`calculateOrderTotals` adds tax (8.5% default) into the total, but **no tax line exists anywhere**: cart summary shows Subtotal/Discount/Total; the register receipt, History audit panel, and the printed receipt (`handlePrintReceipt`) all omit it (`grep -i tax` over the render code: 0 hits). Customers see $11.00 of goods and a $11.94 charge with no explanation; printed receipts without tax breakdown are a compliance problem in most jurisdictions. (The dashboard even says "Excl. tax" on profit — the data is there.)
**Fix:** add a TAX row to the cart summary and all three receipt surfaces.

### F5 — Dark mode is broken in two ways 🟠 *(demonstrated live)*
1. Tailwind is configured with `@custom-variant dark (&:is(.dark *))`, but the `.dark` class is only applied in `settingsStore.onRehydrateStorage` — i.e. **on app load**. `setDarkMode` never touches the DOM, so toggling changes only the mesh background and button label; every `dark:*` style waits for a reload (verified: `html.dark=false` after toggle, `true` after reload).
2. Even in real dark mode, **Settings** (whole screen), Inventory/Customer modals, and History side panels have no `dark:` classes — glaring white panels with near-invisible text (`qa/evidence/08-01b-settings-darkmode.png`).
**Fix:** apply/remove the class inside `setDarkMode`, and sweep the light-only components for `dark:` variants.

### F6 — Every screen is mounted twice 🟠
`App.tsx` renders `renderActiveScreen()` in **both** the mobile shell (`lg:hidden`) and desktop container (`hidden lg:flex`). Both instances live in the DOM simultaneously; CSS hides one. Measured: 2× `#register-root`, `#cart-section`, `#products-grid`, …
Consequences: invalid duplicate ids (breaks a11y/automation), doubled subscriptions/effects/rendering, and **two independent carts** — resize across the `lg` breakpoint mid-sale and the visible cart is empty (verified: the hidden shell's cart/clear button state diverged from the visible one).
**Fix:** render the active screen once and adapt layout with CSS, or gate the two shells on a matchMedia state so only one mounts.

---

## 4. Medium / low findings

| # | Sev | Finding & location |
|---|-----|--------------------|
| F7 | 🟡 | Receipt operator is hardcoded `Admin` (`Register.tsx` ~line 608) — cashier/manager sales are misattributed on receipts; no operator stored on the transaction at all (audit gap). |
| F8 | 🟡 | Transaction ids are `TX-{max+1}` computed from local history — two terminals sharing one cloud will mint the same id and **upsert-clobber each other's sales**. Use UUIDs (+ human-friendly receipt no. per terminal). |
| F9 | 🟡 | No user-management UI: `authStore.handleAddUser/UpdateUser/DeleteUser` are dead code; staff can only be changed by editing cloud rows. `PrinterConfig` similarly has types/defaults but no Settings UI (printing silently uses defaults). |
| F10 | 🟡 | Entity ids are random 3–4 digit suffixes (`prod-XXXX`, `cust-XXX`, `user-XXXX`) → realistic collision odds as data grows; a collision silently overwrites via upsert. |
| F11 | 🟡 | Product images are hot-linked Unsplash URLs with **no `onerror` fallback** (fallback only for empty string) — offline terminals (the Electron use case) show broken/blank tiles. Verified: blocked CDN → blank boxes, `qa/evidence/05-03-admin-register.png`. |
| F12 | 🟡 | Register screen has **no product search** (`Search` icon imported in `ProductGrid.tsx` but unused) — cashiers must eyeball the grid; Inventory has search, Register doesn't. |
| F13 | 🟡 | a11y: product cards always expose `aria-disabled="true"` + `aria-roledescription="sortable"` (dnd-kit attributes applied outside edit mode) — screen readers announce every product as a disabled sortable; keyboard purchase flow is effectively blocked. |
| F14 | 🟡 | Loyalty redemption can produce a **$0.00 "card" sale** with no minimum/no-payment guard (verified live). Decide if intended; if so, label it as a points-only sale rather than a card payment. |
| F15 | 🟡 | Default PINs are printed on the lockscreen (`lockscreen.defaultPins`) — fine for demo, must not ship. |
| F16 | 🔵 | i18n: sidebar label typo `'DarkMode'` (missing space). |
| F17 | 🔵 | Dashboard badge "LIVE METRICS SYNCED" is a static label — shows even with sync disabled/never configured. |
| F18 | 🔵 | Zero-price product renders `NaN%` margin in Inventory (`(price−cost)/price`), `qa/evidence/07-02-nan-margin.png`. |
| F19 | 🔵 | Low-stock "Only X left" badge on register tiles renders washed-out/unreadable (shimmer over amber), see `05-03` screenshot top-left tiles. |
| F20 | 🔵 | Low-stock badge count differs between desktop sidebar (excludes out-of-stock) and mobile menu (includes it) — `App.tsx` vs `Sidebar.tsx` predicates. |
| F21 | 🔵 | Perf: single 1.27 MB JS chunk (Vite warns) — code-split recharts/qrcode/dnd-kit; cart is component state, so an accidental refresh mid-sale silently drops the order (consider persisting the open cart). |

---

## 5. Cloud-sync verification — how it was tested

The QA sandbox's egress policy blocks browser traffic to `*.supabase.co` (proxy CONNECT 403), while the Supabase management API (MCP) remained available. So sync was verified in three layers:

1. **Live project (management API):** listed tables/rows, read `user_accounts` (confirming plaintext PINs = F2 root cause), ran the security advisors (F1), and executed an **equivalence probe** — inserted a transaction row shaped exactly like `pushTransactions()` output (JSONB items etc.) via SQL, read it back, then deleted it (net-zero). The live schema accepts the app's payloads.
2. **Full app sync stack (browser):** the app's Settings were pointed at a local **PostgREST-compatible test double** (`qa/mock-supabase.mjs`) seeded with the same rows `scripts/seed.mjs` puts in the real cloud. Everything the app does — `testSupabaseConnection`, Push All (5 upserts), pull-all (5 selects), incremental checkout sync, transaction deletes — ran through the real `@supabase/supabase-js` client against it; every request was captured to `qa/results/mock-log.json`. Push All, Connected badge, live sale sync (TX-10113 + stock 116→115 within ~1 s), the deletion gap (F3), resurrection-on-pull, and the PIN lockout (F2) were all observed through this path.
3. **Consistency:** cloud state after each step matched the app's local state exactly (stock, points, transaction count), including the subtle case where refunding a loyalty sale returned redeemed points.

On an unrestricted network the same suite runs against the real project URL unchanged.

---

## 6. Re-running the test suite

```bash
npm install && npm run dev          # app on :3000
cd qa && npm i playwright express   # harness deps (Chromium required)
node mock-supabase.mjs &            # only needed for the sync suite
node test5-lockscreen.mjs
node test6-register.mjs && node test6b-clear.mjs
node test7d-screens.mjs && node test7e-screens.mjs && node test7f-cleanup.mjs
node test8-settings-sync.mjs && node test8b-recovery.mjs
```
Each suite prints PASS/FAIL per check and writes `results-*.json` + screenshots to `shots/`. Checks labeled **FINDING** are intentional bug-detectors: they fail while the defect exists and start passing once it's fixed.

*Testing note: suites mutate local IndexedDB demo data (sales, a refund, one seeded demo customer was removed during a harness iteration). The final state was reconciled — 11 products, 3 hashed users, consistent stock — and the live Supabase project was left byte-identical to how it was found.*

## 7. Recommended fix order

1. F2 (hash seeded PINs — one-line change in seeder + embedded DDL) and F1 (RLS + auth) — before any shared deployment.
2. F3 (delete sync) + F8 (UUID transaction ids) — data integrity on multi-terminal setups.
3. F4 (tax line) — receipt compliance; trivial UI addition since values already exist.
4. F5 (dark-mode wiring + missing dark styles) and F6 (single-mount refactor).
5. F7/F9/F12 (operator attribution, user-management UI, register search) — operational quality-of-life.
6. Remaining cosmetic/i18n/perf items.
