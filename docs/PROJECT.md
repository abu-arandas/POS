# EA POS — Complete Project Documentation

A full technical description of the EA POS codebase: what it is, how it is built, what
every module does, and the reasoning behind the decisions that are not obvious from the
code.

- **Package:** `ea-pos` v1.0.1 (private)
- **Repository:** [abu-arandas/POS](https://github.com/abu-arandas/POS)
- **Runtime:** Node ≥ 22.22.2, React 19, Vite 6, Electron 43
- **Scale:** ~289 files, ~34,000 lines of TS/TSX/CJS/MJS
- **License:** demonstration project; use, modify and distribute freely

---

## Table of contents

1. [What this project is](#1-what-this-project-is)
2. [Architecture at a glance](#2-architecture-at-a-glance)
3. [Repository layout](#3-repository-layout)
4. [Domain model (`src/types.ts`)](#4-domain-model-srctypests)
5. [State layer — Zustand stores](#5-state-layer--zustand-stores)
6. [Core library (`src/lib`)](#6-core-library-srclib)
7. [Printing subsystem](#7-printing-subsystem)
8. [Cloud sync (Supabase)](#8-cloud-sync-supabase)
9. [Multi-store / fleet (super-admin)](#9-multi-store--fleet-super-admin)
10. [UI layer — screens and components](#10-ui-layer--screens-and-components)
11. [Internationalisation](#11-internationalisation)
12. [Styling system](#12-styling-system)
13. [Electron desktop shell](#13-electron-desktop-shell)
14. [Database schema and SQL migrations](#14-database-schema-and-sql-migrations)
15. [Security model](#15-security-model)
16. [Build, packaging and release](#16-build-packaging-and-release)
17. [Testing](#17-testing)
18. [CI/CD](#18-cicd)
19. [Scripts and developer tooling](#19-scripts-and-developer-tooling)
20. [Performance budgets](#20-performance-budgets)
21. [Conventions and gotchas](#21-conventions-and-gotchas)
22. [Appendix — file index](#22-appendix--file-index)

---

## 1. What this project is

EA POS is an **offline-first point-of-sale terminal** for retail and café operations. It
runs in three shapes from one codebase:

| Target               | Command                                           | What you get                                                                               |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Web app              | `npm run dev` / `npm run build`                   | Static SPA on `http://localhost:3000`, deployable to any static host                       |
| Desktop app          | `npm run electron:dev` / `npm run electron:build` | Windows `.exe` installer with silent printing, LAN QR-menu server, auto-update             |
| Portable single file | `npm run portable`                                | One self-contained `index.html` in `portable/` that runs from a flash drive over `file://` |

The design centre is **offline correctness**. Every screen works with no network: the
catalog, customers, sales history, shifts, held orders and settings all persist to
IndexedDB via Zustand's `persist` middleware. Supabase cloud sync is strictly optional
and always best-effort — a sync failure is logged and swallowed, never allowed to block a
sale.

### Feature surface

- **Register & cart** — product grid with drag-and-drop reordering, category filter,
  quantity control, percentage/fixed/loyalty discounts.
- **Barcode scanning** — keyboard-wedge scanners detected by keystroke timing.
- **Parked (held) orders** — hold a cart with its customer and discount, resume later.
- **Split payments** — cash + card + mobile + gift on one sale, with live change.
- **Partial & line-item refunds** — prorated tax/discount/loyalty, manager PIN override.
- **Shifts & cash drawer** — opening float, Z-report reconciling counted vs expected cash.
- **Receipts** — on-screen preview, HTML/system print, real ESC/POS (Web Serial, network
  TCP 9100, Windows RAW spooler), raster bitmap fallback for non-Latin scripts, plus
  digital delivery by share sheet or pre-filled email.
- **Kitchen tickets** — per-station routing by product category, each station optionally
  bound to its own network or named OS printer.
- **QR digital menu** — an embedded Express server on the LAN serving a customer-facing
  menu page; customers scan a QR code from the terminal.
- **Inventory** — products, categories, suppliers, a purchase-order state machine, and a
  bounded stock-adjustment audit log; printable Code 128 shelf labels.
- **Customers & loyalty** — customer book, points earned/redeemed per sale.
- **Analytics dashboard** — date-range KPIs, revenue/profit trend, best-sellers, category
  and payment breakdowns, per-operator report, purchase-order spend, CSV export.
- **Multi-terminal live sync** — Supabase realtime subscriptions mirror another
  register's writes within ~400 ms.
- **Multi-store fleet console** — a super-admin board with live store presence,
  consolidated cross-store reporting, store & staff management, and central catalog push.
- **Full RTL + Arabic** — every string translated; receipts, canvases and print documents
  restate direction and font because they render in isolated documents.

---

## 2. Architecture at a glance

```
┌──────────────────────── Electron main process (Node) ─────────────────────────┐
│  main.cjs        window, IPC handlers, navigation lockdown, auto-updater      │
│  preload.cjs     contextBridge → window.electronAPI (the only renderer door)  │
│  validation.cjs  pure IPC payload validators (bounded, unit-tested)           │
│  menuServer.cjs  LAN address selection + rebind policy                        │
│  updatePolicy.cjs   whether an update may install unattended                  │
│  windowsSigning.cjs code-signing mode resolution (azure | signtool | none)    │
│  + express QR-menu server (rate-limited, customer-safe payload only)          │
└───────────────────────────────────▲───────────────────────────────────────────┘
                                    │ window.electronAPI (optional; undefined in a browser)
┌───────────────────────────────────┴─────── Renderer (React 19) ───────────────┐
│  App.tsx        shell, routing, role gating, realtime + heartbeat lifecycles  │
│                                                                               │
│  components/    screens (Register, Inventory, History, Customers, Dashboard,  │
│                 Settings, Shift, QRMenu, Fleet*) + prop-driven subcomponents  │
│        ▲                                                                      │
│  stores/        Zustand + persist(idb-keyval) — the single source of truth    │
│        ▲                                                                      │
│  lib/           pure domain logic (pricing, checkout, refunds, receipts,      │
│                 ESC/POS, reports, throttling, hashing) + I/O adapters         │
│        ▲                                                                      │
│  locales/       en + ar catalogues, one file per namespace                    │
└───────────────────────────────────▲───────────────────────────────────────────┘
                                    │ @supabase/supabase-js (optional)
┌───────────────────────────────────┴───────────── Supabase ────────────────────┐
│  tables   user_accounts, categories, products, customers, transactions        │
│           (+ stores, memberships, login_attempts)                             │
│  RPCs     verify_login, store_heartbeat, fleet_summary, fleet_daily,          │
│           set_membership, remove_membership, push_store_catalog               │
│  RLS      authenticated-only; optionally store-scoped and enforced            │
└───────────────────────────────────────────────────────────────────────────────┘
```

### The layering rule

The codebase enforces a hard separation that shows up everywhere:

> **Pure logic lives in `src/lib/*` and is DOM-free, deterministic and unit-tested.
> Side effects (stores, hardware, network, DOM) live at the edges.**

That is why `receiptDoc.ts` describes a receipt as an ordered list of rows with no idea
how it will be drawn, and three separate renderers (`escpos.ts`, `receiptCanvas.ts`, the
HTML templates) consume that same shape. It is why `pinThrottle.ts` takes `now` as an
argument. It is why the Electron main process's decision-making was extracted into four
`.cjs` modules — CI only reaches `main.cjs` through `node --check`, which is a parse and
nothing more, and that gap once shipped a `\d`-vs-`\\d` typo that silently disabled the
QR menu, network printing and printer discovery in packaged builds only.

---

## 3. Repository layout

```
POS/
├── src/
│   ├── App.tsx                  application shell, routing, role gate, sync lifecycles
│   ├── main.tsx                 React root, i18n bootstrap, ErrorBoundary, dark-first paint
│   ├── types.ts                 every domain interface (single file, no barrel)
│   ├── electron.d.ts            window.electronAPI typing + public menu payload shapes
│   ├── index.css                Tailwind v4 entry, @font-face, theme tokens, components
│   ├── assets/                  logo-mark.svg + 7 self-hosted woff2 faces
│   ├── data/seedData.ts         demo catalog (74 products, 31 categories, 4 customers)
│   ├── stores/                  11 Zustand stores
│   ├── lib/                     domain logic + I/O adapters (~60 modules)
│   ├── locales/{en,ar}/         20 translation namespaces each
│   └── components/              screens + register/ inventory/ settings/ history/ shared/
├── electron/                    main, preload, and 4 pure decision modules + menu.html
├── scripts/                     SQL schemas, seeder, icon/font generators, bundle budget
├── test/                        63 Vitest files (lib, stores, components, a11y, i18n, styles)
├── e2e/checkout.spec.ts         Playwright end-to-end suite
├── docs/                        refactor phase notes, security notes, this file
├── tools/raster-preview.html    dev harness for the thermal raster renderer
├── public/                      favicons
├── buildResources/              Electron app icons
└── .github/workflows/           ci.yml, build-windows.yml, sonarcloud.yml
```

---

## 4. Domain model (`src/types.ts`)

One file, no barrel, ~323 lines. Every interface carries a comment explaining _why_ the
field exists where that is not obvious.

### Catalog

| Type       | Notes                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Product`  | `id, name, price, cost, category, sku, stock, minStock, image`. `image` is a Tailwind class **or** a URL **or** a `data:image/svg+xml` thumbnail. |
| `Category` | `id, name, color` — `color` is a Tailwind class string.                                                                                           |

### Sales

| Type              | Notes                                                                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PaymentMethod`   | `'cash' \| 'card' \| 'mobile' \| 'gift' \| 'loyalty'`                                                                                                                                                                                                                                 |
| `OrderItem`       | Line snapshot: includes `cost` **at purchase time**, so profit reporting is historically accurate.                                                                                                                                                                                    |
| `Payment`         | One tender line. A single-method sale has one; a split sale has several.                                                                                                                                                                                                              |
| `RefundedItem`    | Cumulative quantity returned per product across one or more partial refunds.                                                                                                                                                                                                          |
| `SaleTransaction` | The full sale record. `paymentMethod` is the _dominant_ (largest) tender; `payments` is present only when `length > 1`. `pointsEarned` is stored so a refund reverses exactly what was earned even if the loyalty rate changed since. `status` is `completed \| partial \| refunded`. |

### Inventory operations

| Type                                    | Notes                                                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Supplier`                              | Terminal-local.                                                                                          |
| `PurchaseOrderLine`                     | `unitCost` is a deliberate snapshot of the agreed buy price, **not** a live reference to `product.cost`. |
| `PurchaseOrder` / `PurchaseOrderStatus` | `draft → ordered → received \| cancelled`; `received` and `cancelled` are terminal.                      |
| `StockAdjustment`                       | Audit entry: `delta`, `newStock`, `reason` (`received \| correction \| waste \| other`), who and when.   |
| `Shift`                                 | One physical drawer session: opening float → counted cash → variance. Terminal-local.                    |
| `HeldOrder` / `HeldOrderItem`           | A parked cart. Stock is re-validated from the live catalog on resume.                                    |

### Configuration

| Type                   | Notes                                                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StoreSettings`        | Identity, `taxRate`, `currency`, `loyaltyPointsRate` (points per currency unit), `loyaltyPointValue` (discount per point).                                                                                      |
| `ReceiptToggles`       | 18 booleans naming every block a receipt can print.                                                                                                                                                             |
| `ReceiptLayout`        | Header/footer text, font family + size, date/time token patterns, and the toggles. `fontSizePx` drives HTML; ESC/POS is a fixed-font device, so a larger size maps to emphasised/double-height headers instead. |
| `UserAccount`          | `role: admin \| manager \| cashier`; `pin` holds the **hash**, never the PIN.                                                                                                                                   |
| `PrinterConfig`        | `type: system \| serial \| bluetooth \| network \| windows`, paper size, IP, baud, `printerName`, barcode/footer/auto-print/kitchen-ticket flags.                                                               |
| `ScannerConfig`        | `enabled`, `minLength`, `maxInterKeyMs` — the keystroke-gap threshold that separates a scan from human typing.                                                                                                  |
| `KitchenStation`       | Name + routed `categoryIds`, plus optional `ipAddress` (wins) or `printerName`.                                                                                                                                 |
| `ReceiptEmailTemplate` | Single-brace placeholders (`{storeName}`, `{receiptId}`, `{date}`, `{total}`, `{customerName}`) chosen so they cannot collide with i18next's `{{…}}`.                                                           |
| `SupabaseConfig`       | URL, anon key, optional device account email/password, `enabled`, `status`.                                                                                                                                     |

### Fleet (multi-store)

`Role` (`superadmin \| admin \| manager \| cashier`), `Store`, `Membership`. These are
deliberately separate from `UserAccount`: **a super-admin is an org-level cloud
membership, not a terminal login.** Nothing in the single-store terminal flow depends on
them.

---

## 5. State layer — Zustand stores

Eleven stores in `src/stores/`. All persisted stores use `createJSONStorage(() =>
idbStorage)` — IndexedDB via `idb-keyval`, chosen because a terminal's catalog and
history outgrow the 5 MB `localStorage` quota.

| Store               | Key                       | Persisted          | Cloud-synced | Responsibility                              |
| ------------------- | ------------------------- | ------------------ | ------------ | ------------------------------------------- |
| `authStore`         | `pos-auth-storage`        | ✅ (users only)    | ✅           | Staff accounts + who is signed in           |
| `productStore`      | `pos-product-storage`     | ✅                 | ✅           | Products, categories, stock, ordering       |
| `customerStore`     | `pos-customer-storage`    | ✅                 | ✅           | Customer book + loyalty balances            |
| `transactionStore`  | `pos-transaction-storage` | ✅                 | ✅           | Sale history + refund patches               |
| `settingsStore`     | `pos-settings-storage`    | ✅ (minus secrets) | ✗            | Every per-terminal setting                  |
| `shiftStore`        | `pos-shift-storage`       | ✅                 | ✗            | Drawer sessions (one physical drawer)       |
| `supplyStore`       | `pos-supply-storage`      | ✅                 | ✗            | Suppliers, POs, stock audit log             |
| `heldOrderStore`    | `pos-held-order-storage`  | ✅                 | ✗            | Parked carts (not a committed record)       |
| `pinAttemptStore`   | `pos-pin-attempt-storage` | ✅                 | ✗            | Failed-PIN counters (survive reload)        |
| `notificationStore` | —                         | ✗                  | ✗            | Toast queue, capped at 5, auto-dismissed    |
| `dialogStore`       | —                         | ✗                  | ✗            | Confirm/prompt queue with promise resolvers |

### Notable store behaviours

**`authStore`** — `partialize` deliberately excludes `currentUser`: restarting the
terminal must always return to the lock screen. A `version: 1` migration strips
`currentUser` from blobs written before `partialize` existed, so an old install cannot
auto-unlock once more after upgrading. Development builds seed three fixture accounts
(Admin `1234`, Manager `5555`, Cashier `0000`) behind `import.meta.env.DEV`; production
builds ship **zero** accounts and require first-run administrator setup.

**`settingsStore`** — three subtleties worth knowing:

- `partialize` blanks `authEmail`/`authPassword` before serialisation. Device credentials
  are session secrets, held in memory for the session but never written to IndexedDB
  where any local page with storage access could read the cloud password.
- `merge` seeds `receiptLayout`/`kitchenLayout` for installs saved before configurable
  receipts existed, carrying the operator's existing footer message and barcode toggle
  onto the customer receipt so nothing silently changes on their printed output.
- `DEFAULT_SETTINGS` is exported so "Reset to defaults" restores what a fresh install of
  _this build_ starts with. It used to reset to `INITIAL_SETTINGS` — the demo fixture —
  so a production terminal that reset its settings came back branded "EA POS" with a
  Seattle address and an 8.5 % tax rate, and printed both onto its next receipt.

**`productStore.handleDeleteCategory`** returns `false` and refuses when any product still
references the category. The invariant lives at the state boundary, not just in the UI
button, so realtime callers and future screens cannot orphan products.

**`supplyStore`** — the adjustment log is capped with `.slice(0, 500)` so it cannot grow
without limit on a busy terminal. `setPurchaseOrderStatus` consults
`canTransition(PO_TRANSITIONS)` and returns `null` on an illegal move.

**`dialogStore`** — each queued request carries the promise `resolve` function, which is
what lets `askConfirmation` / `askText` read as ordinary `await`s while `DialogCenter`
renders translated, focus-managed, in-app dialogs in place of the browser's native
`confirm`/`prompt`.

---

## 6. Core library (`src/lib`)

### 6.1 Pricing and checkout

**`pricing.ts` — `calculateOrderTotals(items, discountType, discountValue, settings)`**
Every input is clamped: negative or non-finite prices, quantities and rates become zero,
a percentage discount is capped at 100, and every discount is capped at the subtotal. A
mistyped `150%` therefore cannot produce a negative total. Returns
`{ subtotal, discountAmount, taxableAmount, taxAmount, totalAmount }`.

**`checkout.ts` — `buildSaleTransaction(req): CheckoutOutcome`**
The authoritative sale boundary. It returns a failure outcome rather than throwing, so the
register can show the reason inline. The four rejections:

| Error                    | Meaning                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `invalid-quantity`       | A line quantity is not a positive safe integer. Checked **before** tenders or money data are assembled.                        |
| `split-incomplete`       | Split tenders do not cover the total.                                                                                          |
| `split-non-cash-overpay` | A card/mobile/gift tender exceeds the total — that would record phantom money with no way to return it. Only cash may overpay. |
| `insufficient-cash`      | Cash tendered is below a non-zero total.                                                                                       |

Two details that matter for correctness:

- A `$0` total settled entirely by redeemed points is recorded as a `loyalty` sale, not a
  `$0` card charge. Any _other_ `$0` total (a 100 % promo) keeps its chosen method.
- `discountValue` for a loyalty sale stores the **redeemable** point count derived from
  `discountAmount / loyaltyPointValue`, not the requested count. The request can exceed
  what the order absorbs; a refund reverses `tx.discountValue`, so storing the inflated
  request would hand back points that were never taken.

**`payments.ts` — `summarizeTenders(payments, total)`**
Reduces split tender lines to `{ paidTotal, cashTendered, cashChange, dominantMethod,
coversTotal }`. Change is derived from the whole overpayment but attributed to cash;
`cashTendered` excludes card/mobile/gift so the receipt's "cash paid" and the Z-report
drawer math stay correct. `coversTotal` uses a half-cent tolerance.

**`refunds.ts` — `refundableQuantities(tx)` and `computeRefund(...)`**
A refund is a _proportional share of the total_, so discount and tax are prorated and a
full return refunds exactly `tx.total`. The rounding strategy is the interesting part:
each **cumulative** boundary is rounded, not each increment on its own, so a piecewise
full return sums to exactly the total instead of drifting a cent per line; a
fully-quantity-covered return trues up to `tx.total` directly. Earned points are reversed
proportionally; redeemed loyalty points come back only on a full refund (fractional point
proration would be arbitrary), and the reversal is capped at what the points were
actually worth so historic rows written before the checkout clamp cannot mint points.
Points only move at all when `tx.customerId` is set — otherwise the `??` fallback would
invent an award nobody received.

**`shiftReport.ts` — `cashKept(tx)` and `summarizeShift(txs)`**
`cashKept` is net drawer contribution: cash tendered minus change, correct for both
single-cash and split sales; card/mobile/gift contribute nothing. `summarizeShift`
returns counts, gross (net of refunds), per-method breakdowns, cash refunds, and
`expectedCash(openingFloat)` as a closure over the tallies.

**`poReport.ts` — `buildPoReport(orders, days?)`**
Received vs outstanding value, counts by status, and per-supplier spend sorted by
received value. Cancelled orders are excluded from money totals but still counted. The
optional window filters on the _activity_ timestamp appropriate to each status.

**`purchaseOrders.ts`** — `PO_TRANSITIONS`, `canTransition`, `poTotal`, `poUnitCount`, and
`normalizePoLines`, which drops empty/invalid lines and merges duplicates of the same
product using a weighted-average unit cost, so the merged line's total value equals the
sum of the originals instead of silently discarding all but the last cost.

### 6.2 Authentication and throttling

**`hash.ts`** — a self-contained SHA-256 and HMAC-SHA-256 implementation plus PBKDF2.

- **v2 hash format:** `v2$600000$<salt hex>$<derived hex>` — the version, iteration count
  and salt travel _inside_ the hash string, so raising `PBKDF2_ITERATIONS` later leaves
  existing hashes verifiable.
- The salt is derived deterministically from the account id (`ea-pos-pin-salt:<userId>`
  → SHA-256 → first 16 bytes). A stable account-derived salt is required because the cloud
  RPC receives a _derived hash_, not a raw PIN. The 600,000-iteration work factor still
  defeats cheap brute force and prevents one precomputed table serving all accounts.
- `hashPinSalted` prefers WebCrypto (`crypto.subtle.deriveBits`) and falls back to the
  pure-JS path — which yields to the event loop every 2,000 iterations so a plain-`http://`
  LAN deploy does not freeze the UI. `hashPinSaltedSync` is the fully synchronous variant.
- `hashPin` and `hashPinSaltedLegacy` (unsalted SHA-256 over `userId:pin`) remain **only**
  to recognise a v1 hash so it can be upgraded in place after one successful sign-in.

**`pinThrottle.ts`** — pure, DOM-free brute-force protection. Five free attempts
(`FREE_ATTEMPTS`), then an escalating cool-off ladder of 30 s → 1 m → 2 m → 5 m → 15 m
(`LOCKOUT_LADDER_MS`), and a streak forgotten after 30 minutes of quiet
(`STREAK_RESET_MS`). The reset window must stay comfortably longer than the last rung —
if they were equal, sitting out the longest lockout would also expire the streak, handing
an attacker a fresh set of free attempts and pinning them to the cheapest rung forever.
`lockoutStatus`, `recordFailure`, `clearFailures` and `formatRemaining` are all pure; the
caller owns storage (`pinAttemptStore`) and supplies `now`.

**`access.ts`** — `SCREEN_ROLES` is the single source of truth for which roles may open
which screen, read by the sidebar, the mobile menu and the App-level render guard so they
can never disagree.

| Screen                                  | admin | manager | cashier |
| --------------------------------------- | :---: | :-----: | :-----: |
| register, history, shift                |  ✅   |   ✅    |   ✅    |
| dashboard, inventory, customers, qrmenu |  ✅   |   ✅    |    —    |
| settings, fleet                         |  ✅   |    —    |    —    |

`fleet` is additionally gated on a resolved super-admin cloud membership; it is listed as
admin-only here so the type stays exhaustive and a non-admin can never reach it even if
the extra gate were bypassed.

### 6.3 Utilities

`src/lib/utils/` holds the semantic utility modules, with the former one-function modules
kept as **deprecated re-export facades** so existing imports do not break:

| Module                | Exports                                    | Deprecated facade                |
| --------------------- | ------------------------------------------ | -------------------------------- |
| `utils/validation.ts` | `nonNegative`, `isPositiveIntegerQuantity` | `money.ts`, `quantity.ts`        |
| `utils/formatting.ts` | `escapeHtml`                               | `escapeHtml.ts`                  |
| `utils/ids.ts`        | `shortId`                                  | `ids.ts`                         |
| `utils/ui.ts`         | `notify`, `askConfirmation`, `askText`     | `notifications.ts`, `dialogs.ts` |
| `utils/dom.ts`        | `openDetachedPrintWindow`                  | `printWindow.ts`                 |

**`utils/ids.ts`** prefers `crypto.randomUUID`, then `crypto.getRandomValues`, and only
then a compatibility fallback of timestamp + 64-bit monotonic counter. That counter is
stored on `globalThis` rather than module scope: bundlers and mixed ESM/CJS consumers can
load two copies of a module, and a module-local counter in each copy could repeat IDs.
POS identifiers are database keys, not authentication tokens — the fallback is explicitly
non-security-sensitive.

**`utils/dom.ts`** nulls `window.opener` on the new print window before any generated HTML
is written, wrapped in try/catch because some embedded browsers expose `opener` read-only.

**`concurrency.ts` — `mapWithLimit(items, limit, fn)`** runs at most `limit` promises in
flight, preserving input order. It bounds fan-out (the downside of a bare
`Promise.all(items.map(…))`) while still overlapping requests. Used by the catalog push.

**`imageUrl.ts` — `safeImageUrl(value)`** reduces an untrusted product image to something
safe for an `<img src>`. Only `http(s)`, same-origin absolute paths and image data URLs
survive; `javascript:`, `data:text/html`, unknown schemes and values over 4096 chars are
rejected. SVG data URLs **are** allowed, deliberately: the app generates its own product
thumbnails that way (`productThumb` in `seedData.ts`), a browser loads SVG referenced from
`<img>` in a restricted mode where scripts do not execute, and rejecting it blanked all 74
seeded thumbnails.

**`csv.ts`** — `neutralizeFormula` prefixes a leading `= + - @ \t \r` with an apostrophe so
a product name like `=HYPERLINK(...)` displays as text instead of executing in the
recipient's spreadsheet. `toCsv` is RFC-4180. `downloadCsv` prepends a UTF-8 BOM.

**`barcode.ts`** — a pure Code 128 (code set B) encoder: `code128BValues` (start, data,
checksum, stop), `code128Modules` (flattened bar/space run lengths) and `code128Svg`
(self-contained SVG with `shape-rendering="crispEdges"`). Used by the HTML receipt, the
canvas raster renderer and the product-label sheet; thermal printers get the native
`GS k` barcode command instead.

**`useModalA11y(open, onClose)`** — the dialog accessibility hook: traps Tab focus inside
the card, closes on Escape, focuses `[data-autofocus]` (or the first focusable) on open,
and restores focus to the previously focused element on close. The keydown listener is
registered in the **capture** phase so the trap wins over app-level shortcuts, and
`onClose` is held in a ref so the trap effect does not re-run on every render.

**`useBarcodeScanner({ onScan, enabled, minLength, maxInterKeyMs })`** — wedge scanners
"type" a code far faster than a person and finish with Enter. The hook buffers only
fast-arriving printable characters (a gap above `maxInterKeyMs` restarts the buffer) and,
on Enter, treats a sufficiently long burst as a scan. Input is ignored while an editable
field is focused, so search and PIN entry are safe.

**`idbStorage.ts`** — the `StateStorage` adapter mapping Zustand's persist API onto
`idb-keyval`'s `get`/`set`/`del`.

**`digitalReceipt.ts`** — `receiptPlainText` (pure), `shareReceipt` (Web Share API,
falling back to clipboard, returning `shared | copied | error` so the UI confirms
accurately; a user-cancelled share throws `AbortError` and is treated as a no-op),
`renderEmailTemplate` (leaves unknown `{tokens}` in place so a typo is visible),
`buildReceiptEmail` and `emailReceipt` (opens a `mailto:` with subject and body).

**`productLabels.ts`** — printable shelf labels / price tags: `buildLabelHtml`,
`buildLabelSheetHtml` (a CSS grid of 1–6 columns with `page-break-inside: avoid`) and
`printProductLabels`, returning `printed | popup-blocked | empty`.

---

## 7. Printing subsystem

This is the largest and most carefully layered part of the codebase. Five transports, two
document kinds, three renderers, and one shared description of what a receipt _is_.

### 7.1 The shared document model — `receiptDoc.ts`

A backend-neutral description of a printed receipt: an ordered `DocRow[]`, each row saying
what to show and how to emphasise it, with no idea how it will be drawn.

```ts
type RowStyle = 'normal' | 'bold' | 'muted' | 'title' | 'large';

type DocRow =
  | { kind: 'center'; text: string; style?: RowStyle }
  | { kind: 'pair'; label: string; value: string; style?: RowStyle; boxed?: boolean }
  | { kind: 'line'; text: string; style?: RowStyle }
  | { kind: 'divider' }
  | { kind: 'barcode'; value: string };
```

`buildReceiptDoc(tx, settings, printerConfig, layout?)` and `buildKitchenDoc(tx, settings,
stationName?, layout?)` produce these; `docStrings(rows)` flattens every visible text run
for the `needsRaster` check. Because the ESC/POS text path and the canvas raster path both
consume this list, a layout toggle or a label change lands on both without being written
twice. `pair` rows are direction-aware — the canvas renderer flips leading/trailing edges
for an RTL receipt — and `boxed` draws a ruled border, used for the total, which is what a
customer actually looks for and what needs to survive faded thermal paper.

### 7.2 Layout resolution — `receiptFormat.ts`

Pure helpers with no DOM:

- `formatDateTime(date, pattern)` — a token formatter for `yyyy yy MM M dd d HH H hh h mm
m ss s a`. Longer tokens are matched first so `yyyy-MM-dd` and `h:mm a` resolve
  correctly; unknown characters pass through as literal separators.
- `DATE_FORMATS`, `TIME_FORMATS`, `RECEIPT_FONTS` — the preset lists the settings UI offers.
- **`safeFontFamily(fontFamily)`** — the receipt document interpolates the font name
  straight into a `<style>` block, and one render target is a same-origin
  `window.open()` print window. A stored value containing `</style><script>` would
  execute with the app's origin. The UI only ever offers `RECEIPT_FONTS`, but the value is
  persisted in IndexedDB and arrives as plain text, so it is re-checked against the
  whitelist **at render time** rather than trusted.
- `allTogglesOn()`, `defaultReceiptLayout()`, `defaultKitchenLayout()`,
  `legacyLayout(printerConfig)`, `resolveCustomerLayout(...)`, `resolveKitchenLayout(...)`.
  `legacyLayout` reproduces the pre-settings output exactly for a store that never
  customised a layout.

### 7.3 HTML rendering — `src/lib/receipt/`

```
receipt/
├── document.ts             receiptDocHtml() — the standalone doc, styles + body
├── templates/customer.ts   buildReceiptHtml()
├── templates/kitchen.ts    buildKitchenTicketHtml()
├── documents.ts            receiptsPrintDoc / kitchenPrintDoc / receiptPreviewDoc
├── generator.ts            re-export facade
├── types.ts                ReceiptDocumentKind
└── index.ts
```

`receiptDocHtml` is where the RTL work lives. The receipt renders in its own document — a
print window, an Electron `data:` URL, or the settings preview iframe — so it inherits
nothing from the app: not the `<html dir>`, not the bundled Cairo face. Both are restated,
plus three CSS rules that exist for specific bidi failures:

- `.flex-row > span { unicode-bidi: isolate }` — without it an amount like `8.80 د.أ` next
  to an Arabic label reorders across the whole line and the figures land in the wrong column.
- `.ltr { direction: ltr; unicode-bidi: isolate }` — isolation alone leaves `8:15 PM`
  rendering as `PM 8:15`.
- `.divider + .divider { display: none }` and the first/last-child rules collapse the
  dividers around a section hidden by layout toggles, so an empty block never leaves a
  double rule or a stray edge line.

For RTL the whitelisted font only leads if it actually carries Arabic (`Arial`, `Tahoma`);
`monospace` and `Courier New` yield to `'Segoe UI', Tahoma, Arial, sans-serif`, because
their Arabic is barely legible at receipt size.

### 7.4 ESC/POS text encoding — `escpos.ts`

A minimal, pure, transport-independent command encoder. `EscPosBuilder` wraps the raw byte
sequences: `init` (`ESC @`), `align`, `bold`, `doubleHeight`, `feed`, `cut` (`GS V 0`),
`drawerKick` (`ESC p 0 25 250`), and `barcode128` (`GS h`/`GS w`/`GS H`/`GS k 73`, with the
`{B` code-set-B prefix and the human-readable line printed by the printer itself). The
`divider(width)` method collapses consecutive calls for the same reason the CSS does.

`renderDoc(rows, width, builder)` walks the shared `DocRow[]`; `twoCol` pads label/value to
32 characters (58 mm) or 48 (80 mm). `encodeReceipt` appends feed/cut and, when
`openDrawer` is set, the drawer pulse. `encodeKitchenTicket` never kicks the drawer.

**The limitation that drives the next section:** `text()` emits one byte per character and
replaces everything above `0x7F` with `?`. Arabic, accented Latin and `£` cannot survive
it.

### 7.5 Raster bitmap fallback — `escposRaster.ts` + `receiptCanvas.ts`

Sending the receipt as a **bitmap** sidesteps the codepage problem entirely: the platform
text engine shapes Arabic into its positional forms, applies the lam-alef ligature and
orders a mixed Arabic/Latin line, and the printer just prints dots. It works on any
ESC/POS printer regardless of codepage support, and every other command — including the
drawer pulse — stays available.

`escposRaster.ts` is the pure half:

- `RASTER_WIDTH` — 384 dots (58 mm) / 576 dots (80 mm), the standard head widths.
- `packRaster(rgba, width, height, threshold = 128)` — 1 bpp, MSB-first, 8 px per byte, the
  layout `GS v 0` expects. Transparent pixels are treated as paper, not ink — canvas starts
  transparent, so without that an unpainted receipt would come out solid black. Luma is
  Rec. 601.
- `rasterCommands(packed, width, height)` — wraps rows in `GS v 0` commands split into
  128-row bands. The command allows up to 65,535, but printers have finite input buffers
  and many firmwares drop or garble a single huge raster; bands print contiguously with no
  visible seam.
- `needsRaster(strings)` — true when any string carries a codepoint above `0x7F`. Pure-ASCII
  receipts keep the text path, which is far smaller on the wire and faster to print.

`receiptCanvas.ts` is the DOM half. Two passes are required: wrapping depends on font
metrics and the canvas height depends on how many lines each row wraps to, and _resizing a
canvas clears it_, so measurement cannot be folded into drawing. Details worth knowing:

- `wrapText` is a greedy word wrap. `fillText`'s `maxWidth` argument does **not** wrap or
  clip — it scales glyphs horizontally, so a long product name printed noticeably narrower
  than everything around it. A single word longer than the line (a SKU, a URL) is broken by
  character.
- Type sizes are in dots at 203 dpi: `muted` 19, `normal`/`bold` 24, `large` 32, `title` 46
  (the store name — the one thing read from across a counter).
- `ctx.direction` sets the base direction so `fillText` resolves bidi correctly; the
  barcode's human-readable line is forced back to LTR because it is a receipt id.
- Barcode module width is the largest whole number of dots that still fits the roll, so the
  bars land on exact dot boundaries and stay scannable.
- `ensureReceiptFont()` awaits the bundled Cairo face before drawing, so the first receipt
  of a session does not silently fall back to a system font. It resolves either way — a
  fallback receipt beats no receipt.

`tools/raster-preview.html` is a dev harness that renders a sample Arabic receipt through
the real canvas renderer and hands back the ESC/POS bytes, so thermal output can be
inspected without a printer.

### 7.6 Transport dispatch — `hardwarePrint.ts`

The router. `printReceipt(tx, settings, printerConfig, openDrawer, layout)` returns a
`HardwarePrintOutcome`: `printed | popup-blocked | unsupported | no-device | error`, so the
caller can tell an absent device from a blocked popup and message the operator accordingly.

| `printerConfig.type` | Path                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `windows`            | Raster-if-needed → ESC/POS bytes → `electronAPI.printRaw` → Windows spooler RAW datatype. Silent; carries the drawer pulse. |
| `system`             | `electronAPI.printHtml` (silent, no dialog) in Electron; falls back to the browser print window.                            |
| `serial`             | Web Serial: `requestPort` → `open({ baudRate })` → write → release lock → close. Cleanup failures downgrade the outcome.    |
| `network`            | `electronAPI.printEscpos` → raw TCP to port 9100.                                                                           |
| `bluetooth`          | Not implemented (device-specific pairing) → `unsupported`.                                                                  |

`printKitchenTicket` mirrors this but never kicks the drawer, and honours two per-station
overrides: a station pinned to a named OS printer goes through the RAW spooler whatever the
terminal's own transport is, and a station with its own network printer always goes over
the network. `ipAddress` wins when both are set.

`printKitchenTickets(...)` routes a sale across stations and returns the **worst** outcome
seen. `openCashDrawer(printerConfig)` sends only the kick pulse (a no-op on the `system`
HTML path, which cannot kick a drawer).

### 7.7 Kitchen routing — `kitchenRouting.ts`

`routeKitchenTickets(tx, stations, categoryOf)` splits a sale's items by product category.
Two rules carry real history:

- **A station with an empty category list is a catch-all** that takes every item. This is
  the "I have one kitchen printer" case, and it is exactly what the settings screen
  produces when an operator adds a station from a detected printer. Treating empty as
  "matches nothing" made such a station silently inert: every item fell through to the
  unrouted ticket, which carries no `ipAddress`, so tickets printed on the terminal's
  default transport while the station's own printer sat idle — configured-looking and
  doing nothing.
- Items matching no station are still collected under a synthetic `unrouted` ticket so
  nothing silently disappears.

Assigning one category to several stations intentionally fans an item out to each (an expo
copy). Only tickets with at least one item are returned, in the given station order.

### 7.8 Print window transport — `src/lib/print/`

`print/transport/system.ts` opens the detached window and writes the document;
`print/system.ts` composes receipts (joined by `<div class="page-break">`) or a kitchen
ticket; `print/types.ts` defines `PrintOutcome = 'printed' | 'popup-blocked' | 'esc-pos'`.
`receiptPrinter.ts` remains as a deprecated facade preserving the original import path.

### 7.9 Printer discovery — `printerDiscovery.ts`

`DetectedPrinter { id, name, kind: 'system' | 'serial' | 'network', detail?, isDefault?,
ipAddress? }`.

- `listSystemPrinters()` — via `electronAPI.listPrinters`; `[]` in a browser.
- `listGrantedSerialPorts()` — Web Serial ports already granted to this origin, named by
  USB VID:PID where available. Does not prompt.
- `detectPrinters()` — both of the above in parallel.
- `scanNetworkPrinters()` — desktop only; the main process probes the local /24 for open
  TCP 9100 and each hit carries its IP for one-click configuration.
- `requestSerialPort()` — prompts for a new device; must run inside a user gesture.

---

## 8. Cloud sync (Supabase)

Optional, off by default, and never allowed to block a sale.

### 8.1 Module layout

```
lib/supabase/
├── client.ts        getSupabaseClient, signInDevice, testSupabaseConnection
├── products.ts      pushProducts / pullProducts / pushCategories / pullCategories
├── customers.ts     pushCustomers / pullCustomers
├── transactions.ts  pushTransactions / pullTransactions
├── accounts.ts      verifyLoginCloud / pushUserAccounts / pullUserAccounts
├── sync-utils.ts    stampStoreId, fetchAllPages, keyset, deleteRowsSupabase
└── index.ts         aggregate facade (lib/supabase.ts re-exports it)
```

### 8.2 Client lifecycle — `client.ts`

`getSupabaseClient(url, anonKey)` memoises one client per URL/key pair and creates it with
`auth: { persistSession: false }`.

`signInDevice(client, email, password)` — the cached `authedEmail` is a **hint, not proof**:
it records who we signed in as, never whether that session is still good. Nothing clears it
when a session expires, the account is signed out, or the password changes, so on its own
it would keep reporting success while every RLS-protected request failed. supabase-js
usually refreshes the token and makes the cache honest — but this is an offline-first POS,
and a terminal offline long enough for refresh to fail is exactly the case that matters. So
the session is confirmed with `client.auth.getSession()` before the cache is trusted. That
call is not purely local: it reads the stored session and, near expiry, awaits a token
refresh. The hot path costs a storage read; the network comes into it exactly when the old
code would have returned a false success, and a successful refresh avoids
`signInWithPassword` entirely.

`testSupabaseConnection` probes `categories`, **not** `user_accounts_public`: `schema.sql`
REVOKEs that view from `anon`, so a terminal running without a device account (the
anonymous mode `signInDevice` explicitly allows) got a hard permission error and was told
its credentials were wrong. `categories` is only RLS-filtered, so an unauthorised caller
gets an empty result rather than an error — which still distinguishes a bad URL/key from a
working project.

### 8.3 Paging — `sync-utils.ts`

A pull used to be one unbounded `.select('*')`. Two things go wrong: PostgREST caps rows
per response (`max-rows`) and a cap **silently truncates** — the client cannot tell a capped
response from a complete one, and because "Pull From Cloud" _replaces_ local data, a
terminal would overwrite the rest of its catalogue with a partial one. And a terminal
trading for a year has a history too large to want in one response.

So pulls walk the table in pages of `PULL_PAGE_SIZE = 1000` — **keyset-paged by primary
key, not by offset**. `.range(from, to)` counts from the start of the result on each
request, so anything inserted or deleted before a later page shifts every offset after it:
a sale rung up mid-pull slides a row across the page boundary and it is fetched twice or
missed entirely. Pulls are not short and the register is writing the whole time, so that
window is wide open in normal use — and because the result then _replaces_ local state, a
dropped row is not a stale read, it is data destroyed. `keyset(query, afterId, limit)`
applies `.order('id').limit(n).gt('id', afterId)`; `fetchAllPages` stops on an **empty**
page, not a short one, because a short page is exactly what a server-side row cap looks
like.

`deleteRowsSupabase` chunks ids at `DELETE_CHUNK_SIZE = 500` because PostgREST puts an `in`
filter in the query string, and "Delete All Transactions" on a busy terminal built a URL
past what proxies accept. A chunked delete is not one transaction, so every remaining chunk
is still attempted after a failure — the local rows are gone either way, and each chunk
that lands is a row that will not resurrect on the next pull. It returns `false` if any
chunk failed, which callers must not read as "nothing was deleted".

`stampStoreId(records, storeId)` adds `store_id` to outgoing records when a store scope is
configured, and is a no-op in single-store mode.

### 8.4 Orchestration — `sync.ts`

| Function                                                    | Purpose                                                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `syncToCloudIfEnabled(prods?, cats?, custs?, txs?, accts?)` | Incremental upsert — only non-empty lists are sent. Failures are logged and swallowed.          |
| `cloudLogin(name, pinHash)`                                 | Lock-screen fallback via `verify_login`, so a PIN changed on another terminal still works here. |
| `testCloudConnection(url, key)`                             | Sign in + lightweight query.                                                                    |
| `pushAllToCloud(url, key, snapshot)`                        | Manual "Push All"; true only if every table succeeded.                                          |
| `pullAllFromCloud(url, key)`                                | Manual "Pull From Cloud"; per-table `null` on failure.                                          |
| `delete*CloudIfEnabled(ids)`                                | Five wrappers over `deleteFromCloudIfEnabled`.                                                  |

A rejected delete raises a **visible** toast rather than being swallowed: the local rows are
already gone, so if the cloud copy survives the next pull silently brings them back and the
operator has no idea why.

`ensureDeviceSession` runs before every read/write, so sync works once RLS is enabled.

### 8.5 Realtime — `realtimeSync.ts`

Subscribes to Postgres changes on the five synced tables and, on any change, debounces
400 ms and **re-pulls the affected table** — which uniformly handles inserts, updates and
deletes without duplicating row-mapping logic. Local setters do not trigger a push, so
there is no echo loop.

The teardown is the subtle part, and the comments in the file are explicit about why:

- Debounce timers are **module-level**, not local to `startRealtimeSync`. When they were
  local, stopping only unsubscribed the channel: a refresh already inside its 400 ms window
  still fired, still pulled through the captured client, and still wrote into the local
  stores afterwards.
- Clearing timers is not enough — a callback already past `clearTimeout` is awaiting its
  pull and will still write when it resolves. So each subscription carries a **generation**
  counter, and a pull whose generation is stale by the time it resolves is discarded.
- `myGeneration` is captured **before the first await**. `stopRealtimeSync()` has just
  bumped the counter, so the value read there belongs to this start and no other. Reading
  it after awaiting would pick up whatever a concurrent stop or start had moved it to, and
  the check would then always pass — the opposite of its purpose.
- Each branch resolves its pull into the _write it would perform_ rather than performing
  it, so the staleness check sits between the await and the store — the one window
  `clearTimeout` cannot close.
- `storeId` is re-read per pull and re-checked after, because the store scope can change
  without restarting sync (App only restarts it when the connection changes), and a
  generation check alone would let the previous store's rows land in the newly selected one.

---

## 9. Multi-store / fleet (super-admin)

Built in four phases, all additive. A single-store terminal is unaffected: with sync off,
no client, or no store scope, every fleet function no-ops (returns `null`/`[]`).

| Phase | Feature                   | Pure module      | I/O module       | Screen               |
| ----- | ------------------------- | ---------------- | ---------------- | -------------------- |
| 1     | Live store presence board | `fleet.ts`       | `fleetClient.ts` | `FleetBoard.tsx`     |
| 2     | Consolidated reporting    | `fleetReport.ts` | `fleetClient.ts` | `FleetDashboard.tsx` |
| 3     | Store & staff management  | `storeForm.ts`   | `fleetClient.ts` | `StoreAdmin.tsx`     |
| 4     | Central catalog push      | `catalogPush.ts` | `fleetClient.ts` | `CatalogPush.tsx`    |

**`fleet.ts`** — `storeStatus(lastSeenAt, now)` classifies a heartbeat as `online` (≤ 2 min),
`stale` (≤ 15 min) or `offline`; a missing or unparseable timestamp is always offline.
`summarizeFleet(rows)` attaches presence, sums revenue/orders, counts online stores, and
sorts online-first then by revenue descending so the busiest live stores surface at the top.

**`fleetReport.ts`** — `fleetTotals` (revenue, orders, average order, store count, active
count), `rankStores` (revenue desc with a name tiebreak for stability, each with its share
of total revenue), `buildDailySeries(rows, storeId?)` folding `(store, day)` buckets into
one ascending day-keyed series, optionally drilled into a single store.

**`fleetClient.ts`** — every Supabase-facing fleet call, each defensive:
`sendStoreHeartbeat`, `fetchSuperadminOrg` (a missing `memberships` table just means "not a
super-admin here", not an error), `fetchFleetSummary`, `fetchFleetDaily`, `listStores`,
`upsertStore`, `setStoreStatus`, `listMemberships`, `setMembership`, `removeMembership`,
`fetchStoreProducts`, `fetchStoreCategories`, `pushStoreCatalog`, and the
`startFleetHeartbeat` / `stopFleetHeartbeat` 60-second loop.

Two writes go through RPCs rather than direct table calls, and for the same reason:

- **`set_membership`** — the client must not delete-then-insert over two HTTP requests; an
  interrupted reassignment would remove the user's only membership.
- **`push_store_catalog`** — pushing a catalog as two requests (categories then products)
  meant a category upsert that succeeded followed by a product upsert that failed left the
  target store holding categories whose products never arrived, and the caller saw only
  `false` with no way to tell "nothing was written" from "half of it was". One transaction
  makes `false` mean nothing was written.

**`storeForm.ts`** — `validateStoreForm` / `isStoreFormValid` (name required, ≤ 80 chars;
timezone and currency required, currency ≤ 4 chars), `ASSIGNABLE_ROLES` (`superadmin` is
org-wide and never handed out per store), `slugifyStoreId(name, existingIds)` (URL-safe,
NFKD-normalised, falls back to `store`, appends `-2`, `-3` … on collision), and
`normalizeStoreForm`.

**`catalogPush.ts`** — pure planning, with five safety properties stated in its header:

1. Ids are store-scoped, so a "copy" into another store is a **new row with a new id**.
2. Matching is by **business key** — SKU if present, else normalised name — never by
   internal id.
3. Category references are remapped from source ids to the target's own category ids,
   matched by name and created on demand.
4. **Stock is never pushed** — inventory is per-store, and new products land at 0.
5. The plan only **adds** products/categories and **updates** prices (and optionally
   metadata). It never deletes, so a push cannot wipe a store's catalog.

`planCatalogPush(source, target, options, genId)` returns the exact rows to upsert plus a
summary (`categoriesAdded`, `productsAdded`, `pricesUpdated`, `metadataUpdated`,
`unchanged`) that the UI shows for confirmation. `genId` is injected so tests can pass a
deterministic generator. The screen is preview-first: nothing is written until the operator
reviews the diff, and targets are pushed with `mapWithLimit(..., 5, ...)`.

---

## 10. UI layer — screens and components

### 10.1 Shell — `App.tsx`

Owns: theme class application, language + `document.documentElement.dir`, the realtime-sync
effect, the fleet heartbeat + super-admin resolution effect, the memoised QR-menu IPC
payload, and the role gate.

The role gate is **doubled deliberately**. An effect resets navigation when the signed-in
role cannot view the current screen, _and_ `activeScreen` is guarded again at render time —
because effects run after paint, so relying on the effect alone would flash one frame of a
prohibited screen.

The QR-menu payload is memoised in three pieces (`menuProducts`, `menuCategories`,
`menuSettings`) so changes to unrelated settings — printer, scanner, tax — do not trigger a
redundant IPC update. The projection is customer-safe by construction: no `cost`, no stock
counts, no other settings cross into the LAN-exposed server.

Every screen except `Register` and `Lockscreen` is `React.lazy`-loaded, so recharts,
qrcode.react and the fleet console stay out of the initial bundle.

### 10.2 Screens

| Screen          | File                           | Responsibility                                                                                    |
| --------------- | ------------------------------ | ------------------------------------------------------------------------------------------------- |
| **Lockscreen**  | `Lockscreen.tsx`               | Staff picker + PIN pad, first-run administrator setup, lockout countdown, hardware-keyboard entry |
| **Register**    | `Register.tsx`                 | Product grid, cart, held orders, checkout → payment → receipt, barcode scanning, printing         |
| **Inventory**   | `Inventory.tsx` + `inventory/` | Products, categories, suppliers, purchase orders, stock log, label printing                       |
| **History**     | `History.tsx` + `history/`     | Search/filter sales, reprint, bulk print/delete, full and partial refunds                         |
| **Customers**   | `Customers.tsx`                | Customer book, per-customer stats and transaction list                                            |
| **Dashboard**   | `Dashboard.tsx`                | KPIs, trends, best-sellers, category/payment/operator breakdowns, PO spend, CSV export            |
| **ShiftScreen** | `ShiftScreen.tsx`              | Open/close drawer, live Z-report, printable report                                                |
| **QRMenu**      | `QRMenu.tsx`                   | LAN menu server address, QR code, copy/print                                                      |
| **Settings**    | `Settings.tsx` + `settings/`   | Seven tabs: profile, printer, kitchen printer, scanner, Supabase, users, danger zone              |
| **FleetView**   | `FleetView.tsx`                | Tab container for the four super-admin surfaces                                                   |

### 10.3 Screen details worth knowing

**Lockscreen.** The PIN check runs a four-step ladder: v2 salted hash → legacy v1 hash
(which, on a match, is upgraded in place) → cloud `verify_login` with the v2 hash → cloud
with the legacy hash. On a cloud match it keeps the **local id**: the cloud row may carry a
different one (the same person created on another terminal), and taking it silently broke
two things — `users.map` matched nothing so the PIN upgrade was never persisted, and the
salted hash just computed is salted with the local id, so storing it against a different id
would make it unverifiable next login. The throttle is keyed to the local id too. `active`
is re-checked against the live user list rather than the captured selection, because cloud
sync can deactivate an account while this screen sits open on it.

**Register.** Checkout is one `useCallback` that: builds the transaction via
`buildSaleTransaction`, decrements stock on the **live** product records (the cart holds
snapshots from add-to-cart time; writing those back would silently revert any price/name/
stock edit made while the sale was open), applies the loyalty delta, persists, fires
best-effort cloud sync, opens the receipt modal, clears the cart, and dispatches printing.
The receipt modal auto-closes after 3 s **only once the transport confirms success** — a
failed print keeps the receipt visible so the operator can retry. Kitchen-ticket category
lookups build a `Map` first, turning O(N²) into O(N) + O(1).

`useRegisterCart(settings)` owns cart lines, customer selection, discount state, loyalty
points, derived checkout items, totals, cash suggestions (exact, then the next 5/10/20/50,
then 100, capped at five options) and cash change. All cart mutations are functional
updates and respect stock caps.

**History.** `useHistoryFilters` owns search, date (`all | today | yesterday | 7days`),
status and payment-method filters plus newest-first sorting and localised day grouping.
Refunds run a two-step flow (select quantities → confirm), and a cashier must supply a
manager/admin PIN. That override accepts **any** manager or admin PIN, making it the widest
PIN surface in the app, so it is throttled like the lock screen — keyed to
`__manager_override__` rather than an account, since the guesser has not named one. Refunds
re-read the transaction from the store before computing, so a stale modal cannot double-refund.

**Dashboard.** A POS terminal is routinely left running past midnight, so "today" cannot be
captured once at mount — that pins every KPI to the day the screen was opened. A one-minute
tick re-checks the calendar day and only re-renders when it actually turns over; every
date-relative memo derives from that `todayStart`, so the windows genuinely slide.

**ShiftScreen.** The Z-report print path passes **raw** values to its `row()` helper, which
escapes both arguments. Passing pre-escaped text would double-escape and print a store
named "Ben & Co" as "Ben &amp;amp; Co".

**QRMenu.** `running` starts `true` so the browser build — which has no Electron menu server
and never calls `getMenuInfo` — does not show a permanent warning.

### 10.4 Shared components

- **`ErrorBoundary`** — catches render errors and shows a recoverable fallback. On a POS
  terminal, a white screen mid-sale is the worst possible failure mode.
- **`NotificationCenter`** — renders the toast queue with `aria-live="polite"` and
  `role="alert"` for errors.
- **`DialogCenter`** — renders the head of the dialog queue and resolves its promise.
- **`ModalShell`** — the shared accessible animated dialog frame: backdrop, `role="dialog"`,
  `aria-modal`, title relationship, focus target, enter/exit animation.
- **`Logo`** — the Arandas mark inlined so it renders with no network/asset fetch. Gradients
  use `userSpaceOnUse` because an `objectBoundingBox` gradient renders nothing on a shape
  whose bbox has zero height (the horizontal crossbar), and gradient ids are namespaced with
  `useId` so several logos on one page do not collide.
- **`BarcodeSvg`** — inline Code 128 SVG, inline rather than an `<img>` so it prints crisply
  and needs no network fetch.
- **`ProductGrid`** — memoised sortable cards, `@dnd-kit` drag-to-reorder in edit mode.
- **`CartPanel`** — line editing, discount entry, loyalty redemption, checkout/hold buttons.
- **`ReceiptSettingsPanel`** — the layout editor shared by the customer-receipt and
  kitchen-ticket settings, with a live preview rendered in an isolated iframe.

### 10.5 Component decomposition (refactor phases 1–3)

Recorded in `docs/refactor-phase-{1,2,3}-structure.md`. The consistent boundary rule:
**reusable UI and pure derivations move into focused modules; store writes and
hardware/network effects stay in the orchestration component.**

- Phase 1 split the i18n catalogue, the receipt/print pipeline, the Supabase client and the
  semantic utilities, leaving compatibility facades behind.
- Phase 2 decomposed `Inventory.tsx` and `Settings.tsx` into prop-driven tab and panel
  modules that do **not** subscribe to Zustand directly, and introduced `ModalShell` and
  `usePrinterDiscovery`.
- Phase 3 extracted `useRegisterCart` and `useHistoryFilters`.

**`usePrinterDiscovery(activeTab, autoScanPrinters)`** owns detection, serial pairing,
network scanning, cancellation guards, and stale-result replacement: a late result is
ignored after the printer tab is left, and network results replace only earlier network
hits so repeated scans cannot accumulate stale entries.

---

## 11. Internationalisation

- **Engine:** i18next + react-i18next, initialised in `src/lib/i18n.ts` with `lng: 'en'`,
  `fallbackLng: 'en'` and `interpolation.escapeValue: false` (React escapes already).
- **Languages:** English and Arabic, complete parity.
- **Structure:** 20 namespace files per locale, aggregated by `locales/{en,ar}/index.ts`.

| Namespace   | ~keys | Namespace     | ~keys |
| ----------- | ----: | ------------- | ----: |
| settings    |   153 | fleet         |    19 |
| inventory   |   116 | fleetReport   |    15 |
| register    |    88 | sidebar       |    14 |
| history     |    74 | qrmenu        |     7 |
| dashboard   |    55 | common        |     5 |
| storeAdmin  |    37 | receipt       |     5 |
| customers   |    35 | categories    |     4 |
| receiptCfg  |    31 | errorBoundary |     3 |
| shift       |    25 | print         |     3 |
| catalogPush |    24 | lockscreen    |    19 |

**RTL** is applied by `App.tsx`, which sets `document.documentElement.dir` and toggles
`.font-arabic` (Cairo). The layout uses logical properties (`ps-`, `pe-`, `border-s-`) so it
mirrors without per-direction overrides.

**`test/i18n/keyCoverage.test.ts` enforces three rules:**

1. every `t('a.b')` in `src/` resolves in English,
2. every English key has an Arabic counterpart,
3. every English key is reachable from `src/` at all.

A missing key does not fail loudly — i18next renders the key itself, so the UI silently
shows `lockscreen.selectUser` where a sentence belongs. That is exactly how three raw keys
once reached the lock screen, the first screen an operator ever sees. Rule 3 stops a key the
app no longer asks for from sitting in the catalogue forever waiting to be re-translated.
The file list comes from `git ls-files src` plus untracked files rather than a
`src/**/*.tsx` glob — that glob requires at least one directory and silently skipped the
four files sitting directly in `src/`, `App.tsx` among them.

---

## 12. Styling system

Tailwind CSS v4 via `@tailwindcss/vite`, with `src/index.css` (941 lines) as the single
entry.

- **Fonts** — seven self-hosted `.woff2` faces (Inter, JetBrains Mono, Cairo × latin,
  latin-ext, arabic) declared with `@font-face`. Self-hosting matters: this is an
  offline-first POS that commonly runs on a café LAN with no internet, so an `@import` from
  `fonts.googleapis.com` is a render-blocking request that fails on every launch — and it
  sends a request to a third party from a payment terminal. Arabic suffered most: Cairo is
  the only face behind `.font-arabic`, with no local fallback.
- **Dark mode** — `@custom-variant dark (&:is(.dark *))`. `main.tsx` adds `.dark` before
  first paint so semantic tokens resolve to their dark values immediately; the settings
  store's `onRehydrateStorage` removes it if a light preference was saved.
- **Tokens** — `:root` and `.dark` blocks define the semantic palette (`--color-emerald`,
  `--border-strong`, surface/text tokens) consumed by the component classes.
- **Component classes** — `.app-panel`, `.app-canvas`, `.glass`, `.glass-input`, `.badge-*`,
  `.modal-card`, `.pay-method-btn` with its `.active-{cash,card,mobile,gift}` modifiers,
  `.receipt-paper`, `.field-shell`, `.input-shell`, `.btn-*`, `.toggle-pill`, `.chip-*`.
- **Motion** — hand-written keyframes (`float-slow`, `fade-up`, `bounce-in`, three orb
  drifts) plus `@media (prefers-reduced-motion: reduce)`. React animation goes through
  `<MotionConfig reducedMotion="user">`.

**`test/styles/deadClasses.test.ts`** asserts that every class the stylesheet defines is
named somewhere the app can reach. The stylesheet had accumulated 38 component classes
nothing rendered any more — gradient text, neon borders, a skeleton loader, a whole
z-report table — plus the 19 `@keyframes` only they animated: ~5 KB shipped to every
terminal, and worse, a reader could not tell which of two similar-looking classes the app
actually used. The test parses only selector preludes (scanning the whole file would collect
`woff2` from a `@font-face` URL) and strips comments repeatedly, because one pass can splice
neighbouring delimiters into a fresh surviving comment.

---

## 13. Electron desktop shell

### 13.1 `main.cjs`

**Single instance.** `app.requestSingleInstanceLock()` with a top-level `return` (legal in a
function-wrapped CommonJS module body). Two instances would fight over the menu server's
port, and `cleanupTempFiles()` deletes every `eapos-*.bin` at startup — including a sibling
instance's in-flight print job. `second-instance` focuses the existing window.

**QR menu server.** Express on port 3001, walking forward up to 10 ports when taken (an
unhandled async `listen` error would otherwise crash the app). Rate-limited to 120
requests/minute. Serves `GET /api/menu` (JSON) and `GET /` (`menu.html`, fully
self-contained — no CDN scripts or fonts, because the normal deployment has no internet).

Two hard-won behaviours:

- **`menuServerReady`** is a promise `get-menu-info` awaits. `listen()` is asynchronous, so
  without something to await, a call during startup — or during the port-retry walk, or the
  moment after a rebind — would report the fallback port while nothing was bound there, and
  the QR code would be generated for an endpoint that does not exist. The reply carries
  `running` so a server that gave up is distinguishable from one that is listening; the
  previous `serverPort ?? 3001` produced a confident QR code either way.
- **`ensureMenuServerAddress()`** rebinds when the machine's address drifts. A DHCP renewal
  or a move from wifi to ethernet leaves the server listening on an address the machine no
  longer has, while the QR code is drawn from the current one — so the code resolves to
  nowhere and the menu silently stops working.

**IPC handlers.** Every one validates its payload through `validation.cjs` first:

| Channel                                | Behaviour                                                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get-menu-info`                        | Rebind check → await readiness → `{ ip, port, running }`                                                                                                                  |
| `update-menu-data`                     | `isSafeMenuData` + a 5 MB serialised ceiling                                                                                                                              |
| `list-printers`                        | `webContents.getPrintersAsync()`                                                                                                                                          |
| `scan-network-printers`                | Probes the terminal's own private /24 on TCP 9100 only, in batches of 32, timeout clamped to 100–2000 ms. Deliberately **never** a general-purpose network scanner.       |
| `print-escpos`                         | `isValidPrinterPayload` (private IPv4, port exactly 9100, valid bytes) → raw TCP with a 5 s timeout                                                                       |
| `print-html`                           | Renders in a throwaway window with **no preload, no Node, sandboxed, and `javascript: false`** — a receipt is static markup and never needs script — then prints silently |
| `print-raw`                            | Windows-only spooler RAW path (below)                                                                                                                                     |
| `check-for-updates` / `install-update` | Auto-updater, gated by the update policy                                                                                                                                  |

**The Windows RAW print path.** A PowerShell script `Add-Type`s a small C# class that
P/Invokes `winspool.drv` (`OpenPrinter`, `StartDocPrinter` with `pDataType = "RAW"`,
`WritePrinter`, …), bypassing the driver so ESC/POS — receipt text, barcode and the
cash-drawer pulse — reaches a USB thermal printer unmodified, silently. The script is handed
to PowerShell via **`-EncodedCommand`** rather than written to a `.ps1` and executed by
path: the packaged app runs `asInvoker`, so anything that could win the race between writing
that file and spawning it would still be unsafe code execution, and there is no longer a
script file to swap. The printer name and byte payload are embedded as single-quoted
PowerShell literals, so nothing reaches a command line where argument parsing could
reinterpret it. The receipt bytes still need a file (a multi-kilobyte base64 command-line
literal is fragile), but that file is only ever **read** — swapping it changes what gets
printed, not what runs — and it is unlinked in a `finally`.

**Navigation lockdown.** The renderer shows operator-supplied content (a store logo URL,
product image URLs, receipt text), so a stray or hostile link must never steer the app
window or spawn a second window that inherits the preload bridge.

- `will-navigate` → anything not internal is prevented and handed to `shell.openExternal`.
- `isInternal(url)` accepts the Vite dev origins and, for `file:`, **only paths under
  `APP_ROOT`**. The previous blanket allow meant `file:///etc/passwd` — or a UNC path on
  Windows, which would also hit the network — counted as in-app.
- `setWindowOpenHandler` allows `about:blank` (the app writes print documents into blank
  windows) but strips the preload bridge and sandboxes them. Verified against Electron 43
  that this keeps `document.write` and the inline `onload="window.print()"` working —
  sandbox disables Node integration, not scripting or same-origin access.
- `setPermissionRequestHandler` denies **everything**: no camera, mic or geolocation.

### 13.2 `preload.cjs`

A minimal, explicit `contextBridge` surface — `getMenuInfo`, `updateMenuData`, `printEscpos`,
`printHtml`, `printRaw`, `listPrinters`, `scanNetworkPrinters`, `onMenuServerError`,
`checkForUpdates`, `installUpdate`, `onUpdateAvailable`, `onUpdateDownloaded`. Subscriptions
return their own unsubscribe function. `contextIsolation` stays on so a compromised renderer
cannot reach Node/Electron internals. `src/electron.d.ts` types the whole surface as
optional, so browser builds compile with `window.electronAPI === undefined`.

### 13.3 `validation.cjs`

Pure validators for the privileged IPC surface, extracted precisely because `main.cjs` is
only reached by `node --check`. The header names the bug that motivated it: `isIPv4` shipped
with `\\d` inside a regex literal — an escaped backslash followed by a literal `d`, not a
digit class — so the pattern matched only `"0"`. Every real address was rejected: the QR
menu server bound loopback and advertised `localhost`, network ESC/POS printing refused
every payload, and the subnet scan bailed at its own guard. All three failed silently, in
packaged builds only.

Bounds: 5 MB total payload, 5,000 records per array, 512-char labels, 512 KB images, 1 MB
raw print bytes. `isIPv4` rejects leading zeros so only one spelling of an address passes;
`isPrivateIPv4` restricts to RFC 1918. `isSafeMenuData` runs cheap gates first (shape,
array-ness, counts), then walks the payload carrying a **running byte budget** — per-field
bounds alone still admit 5,000 records × half a megabyte of image data, which `main.cjs`
would only reject after `JSON.stringify` had already built the whole string. A JS string's
`length` is never greater than its UTF-8 byte length, so blowing the budget in characters
proves it blows in bytes.

The two image bounds exist because the fields are not alike: everything on a menu except
pictures is a label, and a 16 KB "name" is an attack — but images arrive as data URLs from
`FileReader.readAsDataURL`, and an ordinary uploaded logo clears 16 KB easily.

### 13.4 `menuServer.cjs`

`selectLocalIp(interfaces)` takes the interface map as an argument so selection can be tested
off-device. Preference order: a named **physical** adapter with a private IPv4 → any
non-virtual adapter with one → `localhost`. `VIRTUAL_ADAPTER_HINTS` excludes veth, VMware,
VirtualBox, Hyper-V, Docker, Tailscale, ZeroTier, Hamachi, WireGuard, tun/tap, VPN, loopback
and Bluetooth. `PHYSICAL_ADAPTER_PATTERNS` are **anchored** — the test used to be
`name.includes('en')`, satisfied by any name containing those two letters anywhere,
"OpenVPN" among them, so a terminal on a VPN advertised its VPN address as the menu host and
every customer on the shop's wifi got nothing.

`pickListenHost` maps `localhost` → `127.0.0.1` (express needs an address, not a name).
`shouldRebindMenuServer` returns false when the current host is `localhost` but the bound one
is not — that is a transient state (cable out, wifi dropped), and tearing the server down to
bind loopback would be worse than waiting.

### 13.5 `updatePolicy.cjs`

electron-updater only actually verifies an update's code signature when a `publisherName`
is baked into `app-update.yml`. In `NsisUpdater#verifySignature`, a null publisher name
returns null, which the caller reads as "no problem" — and the downloaded installer is run.
`win.verifyUpdateCodeSignature` defaulting to true does **not** change that.

So an unsigned build with `autoDownload` + `quitAndInstall` gives anyone who can serve a
release artifact silent code execution. The app runs `asInvoker`, but the NSIS installer is
`perMachine` and Windows elevates it — so running an unverified one hands elevated execution
to whoever served the file.

| `signatureVerified` / `isPackaged` | autoDownload | autoInstallOnAppQuit | installSilently | reason                         |
| ---------------------------------- | :----------: | :------------------: | :-------------: | ------------------------------ |
| not packaged                       |      ✗       |          ✗           |        ✗        | `dev-build`                    |
| packaged, unverified               |      ✅      |          ✗           |        ✗        | `unverified-no-publisher-name` |
| packaged, verified                 |      ✅      |          ✅          |       ✅        | `signature-verified`           |

An unverified build still **downloads**, so the operator is told an update exists, but
nothing is executed on its own. `hasPublisherName` parses both scalar and YAML-list forms
and rejects commented-out, empty, `null`, `~` and `[]` values.

### 13.6 `windowsSigning.cjs`

Resolves the signing mode from the environment alone. The two paths are mutually exclusive
in electron-builder — setting both `signtoolOptions` and `azureSignOptions` is a
configuration error, which is why this lives in `electron-builder.config.cjs` rather than a
static `build` block in `package.json`.

| Mode       | Variables                                                                                                                                                                          | Notes                                                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `azure`    | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_CODE_SIGNING_ENDPOINT`, `AZURE_CODE_SIGNING_ACCOUNT_NAME`, `AZURE_CERT_PROFILE_NAME`, `WINDOWS_PUBLISHER_NAME` | The path that works with a certificate bought today                                                                                                                                               |
| `signtool` | `CSC_LINK`, `CSC_KEY_PASSWORD` (+ optional publisher name)                                                                                                                         | Only usable with an existing exportable certificate — since June 2023 the CA/Browser Forum requires code-signing keys on certified hardware, so public CAs no longer issue exportable `.pfx` keys |
| `none`     | —                                                                                                                                                                                  | Unsigned                                                                                                                                                                                          |

A **half-configured** setup throws rather than quietly producing an unsigned build: one
mistyped secret name would otherwise ship an unsigned installer that looks exactly like a
successful signed one. `WINDOWS_PUBLISHER_NAME` is _required_ with Azure because
app-builder-lib's `WindowsSignAzureManager` returns null for the publisher name, and without
it `app-update.yml` ships without one — so `updatePolicy.cjs` downgrades a properly signed
build to operator-confirmed updates with nothing explaining why. signtool derives it from
the certificate subject on its own.

On the unsigned path `publisherName` is deliberately **not** carried over even when the
variable is set: an unsigned build claiming a publisher would re-enable unattended updates
with nothing actually checking who built the installer.

---

## 14. Database schema and SQL migrations

Three scripts, run in order. Each is idempotent and safe to re-run — re-running is the
documented upgrade path.

### 14.1 `scripts/schema.sql` — base, secure by default

**Tables:** `user_accounts`, `categories`, `products`, `customers`, `transactions`,
`login_attempts`.

**Indexes:** `idx_transactions_date`, `idx_products_category`. Postgres creates an index for
a PRIMARY KEY and a UNIQUE constraint and for nothing else — notably **not** for a foreign
key. `products.category REFERENCES categories(id) ON DELETE SET NULL` means every category
delete had to scan `products`, and deleting a category is a normal operator action.

**`verify_login(p_name, p_pin_hash)`** — `SECURITY DEFINER` with a pinned `search_path`, so
it can validate credentials while RLS hides `user_accounts` from clients. It returns only
non-secret fields; the PIN hash never leaves the database. It is granted to `anon`, so
anyone holding the public key that ships in the client bundle can call it — and a 4-digit
PIN is only 10,000 combinations. It therefore mirrors `pinThrottle.ts` server-side:

- `SELECT … FOR UPDATE` serialises concurrent guesses. Without the lock, N parallel calls
  all read the same `failures` and all write back the same +1, so a scripted attacker firing
  concurrently burns far more than five attempts per rung and the ladder never bites.
- Inside a cool-off it returns without looking at the PIN, so a locked-out account leaks
  nothing about which guesses are close.
- Before writing a failure it **prunes** stale rows. The name is caller-supplied and
  arbitrary, and a row is only ever deleted when that exact name later logs in successfully
  — so every distinct name anyone ever fails against would leave a row behind for good.
  The prune uses `FOR UPDATE SKIP LOCKED` with a `LIMIT`: this transaction already holds a
  lock on its own row, so two concurrent logins whose rows are both stale would each block
  trying to delete the other's and **deadlock**, which Postgres resolves by aborting one —
  turning a routine login into an error.

The known trade-off is documented in the file: because a failure is recorded for whatever
name was supplied, someone holding the anon key can deliberately lock a named account out of
_cloud_ login. It degrades rather than denies — PIN login continues offline against the
locally persisted users, which is the normal path — and the lockout self-clears.

**`user_accounts_public`** — a `security_invoker` view projecting the non-secret columns.
`user_accounts` itself is REVOKEd from `anon`/`authenticated` and re-granted per column.

Both the view and the grants are built inside a `DO` block that detects whether `store_id`
exists, because re-running this file on a fleet deployment broke twice over:
`CREATE OR REPLACE VIEW` cannot drop a column, so replacing the six-column view with a
five-column one raised _"cannot drop columns from view"_ — and since the SQL editor runs the
file as one transaction, the whole re-run rolled back, including the `ALTER TABLE … ADD
COLUMN` statements that are the entire point of re-running it.

**RLS.** Enabled on all five tables, granted only to `authenticated`. The public `anon` key
therefore cannot read or write any row on its own — a terminal must establish an
authenticated device session first. The blanket `USING (TRUE)` staff policies are created
inside a guard that detects the enforced multi-store setup (by looking for the
`products_read` policy) and skips them: Postgres ORs permissive policies together, so a
blanket policy would silently reopen cross-store access and make the store-scoped policies
meaningless.

**Realtime.** Each `ALTER PUBLICATION … ADD TABLE` gets its own exception block. With a
single block around all five, the first already-published table aborts the block and the
remaining tables are silently skipped, leaving live sync half-configured.

**No default account is inserted.** Production terminals create their first administrator
through the lock-screen setup flow.

### 14.2 `scripts/multi-store-schema.sql` — additive store dimension

Adds `stores` and `memberships`, stamps a nullable `store_id` on all five synced tables,
backfills everything to a single `store-default` store, and replaces `verify_login` with a
three-argument form (the third has a default, so existing two-argument callers keep working;
the old two-argument routine is **dropped** so it cannot be used to bypass store isolation).

The membership uniqueness constraint is a unique **index** on `(user_id, org_id,
COALESCE(store_id, '__org__'))`, not a primary key — a PK constraint accepts only bare column
names, so the `COALESCE` expression would be invalid there.

**Access predicates.** `is_superadmin(org)` and `has_store_access(store)` are
`SECURITY DEFINER` with `SET search_path = public`. A definer function that inherits the
caller's `search_path` is the classic Postgres privilege-escalation vector: anyone able to
create objects in a schema that sorts earlier can shadow `memberships` or `stores` and make
the predicate return TRUE. These two functions **are** the multi-store authorization
boundary.

**Policies** all name `TO authenticated`. A policy with no `TO` clause defaults to `TO
PUBLIC`, which includes `anon`. The predicates resolve `auth.uid()` (NULL for anon) so anon
is already refused on the merits, but the role clause is the cheap outer guard.

**RPCs:** `set_membership` / `remove_membership` (atomic, `SECURITY INVOKER` so the existing
policy remains the gate), `push_store_catalog`, `store_heartbeat`, `fleet_summary`,
`fleet_daily`.

`push_store_catalog` refuses a cross-store id collision outright rather than resolving it.
`categories.id` and `products.id` are globally unique — `store_id` is a plain column, not
part of the key — so an upsert keyed on id alone reaches across store boundaries: a payload
carrying an id that already belongs to another store would update that store's row, and
writing `store_id` in the `DO UPDATE` would move it wholesale. Moving a category is the
worse half, because products left behind keep a category reference pointing into a different
store. `planCatalogPush` never produces such a payload, but this is an authenticated RPC and
its callers are not the only thing that can reach it.

`fleet_daily` buckets days with `date_trunc('day', t.date AT TIME ZONE s.timezone)` so each
store's "day" matches its local books.

### 14.3 `scripts/multi-store-rls-enforce.sql` — opt-in enforcement

Turns the store dimension from advisory into **enforced**. Its header lists three
preconditions and warns that running it early will lock terminals out of their own data:

1. `multi-store-schema.sql` applied.
2. Every row in every table has a non-null `store_id` (a `DO` block **refuses to proceed**
   otherwise, naming the count).
3. Every terminal has its Store ID configured, and every device account has a membership row.

It then sets `store_id NOT NULL`, drops the blanket policies (mandatory — leaving a
`USING (TRUE)` policy in place means the store-scoped policies have no effect whatsoever),
and creates per-table `_read`/`_insert`/`_update`/`_delete` policies gated on
`has_store_access(store_id)`. A commented rollback block at the bottom restores the blanket
policies — and it restores them _before_ dropping the scoped ones, because doing it the
other way round would lock every terminal out rather than opening access back up.

---

## 15. Security model

### Authentication

- PINs are stored as versioned PBKDF2-SHA-256 (600,000 iterations, account-bound salt),
  never plaintext. Legacy hashes are accepted once and upgraded after a successful sign-in.
- Brute-force protection on **both** PIN surfaces (lock screen, manager override) and
  **both sides** (client `pinThrottle.ts`, server `verify_login`). Client counters persist
  to IndexedDB, so reloading the page does not reset the lockout.
- A four-digit PIN is a convenience credential. The README is explicit: keep RLS enabled,
  protect the device account, and never reuse a terminal PIN elsewhere.
- Production builds ship no accounts; first-run administrator setup is mandatory.

### Authorization

- Client: `SCREEN_ROLES` + a doubled render/effect gate.
- Server: RLS granted only to `authenticated`; optionally store-scoped and enforced.
- The fleet console's client guards are convenience; the database is the real boundary.

### Secrets handling

- Supabase device credentials are held in memory only, never serialised to IndexedDB.
- `.env*` is gitignored except `.env.example`; the seeder reads the service-role key from
  the environment and the file warns it is server-side only.
- CI secrets are consumed only by the signing steps.

### Injection defences

| Surface                                   | Defence                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| Receipt / kitchen / label / Z-report HTML | `escapeHtml` on every dynamic value                                |
| Receipt font in a `<style>` block         | `safeFontFamily` whitelist re-checked at render time               |
| Product image URLs                        | `safeImageUrl` scheme/length allowlist                             |
| CSV export                                | `neutralizeFormula`                                                |
| PowerShell RAW print                      | `-EncodedCommand` + single-quoted literals; no script file on disk |
| Electron IPC                              | `validation.cjs` bounded validators on every channel               |
| Menu payload                              | Customer-safe projection + shape validation + byte budget          |

### Electron hardening

`contextIsolation: true`, `nodeIntegration: false`, minimal preload bridge, navigation
lockdown scoped to `APP_ROOT`, sandboxed script-free print windows, all permission requests
denied, single-instance lock, network scanning confined to the terminal's own RFC 1918 /24
and port 9100 only.

### Supply chain

- `npm audit --audit-level=high` runs in CI after install.
- `overrides` pins `http-cache-semantics@4.2.0`. `docs/security-and-performance.md` records
  the disposition: the advisory (GHSA-8x6c-cv3v-vp6g) is **withdrawn** upstream, the chain is
  development-only (`electron-builder → app-builder-lib → @electron/get → got`), and forcing
  a major toolchain rewrite for a withdrawn advisory is not warranted. Re-audit when the
  Electron builder chain is intentionally upgraded.
- Unsigned releases are published as GitHub **pre-releases** so electron-updater does not
  offer them to installed terminals, and always with a `SHA256SUMS.txt`.

### Known, documented trade-offs

- Cloud login lockout can be induced by anyone holding the anon key (degrades to offline
  login; rotate the key if abused).
- Bluetooth ESC/POS is not implemented.
- `id`-keyed upserts are guarded by `push_store_catalog`, not by the key itself.

---

## 16. Build, packaging and release

### Scripts (`package.json`)

| Script                    | Command                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| `dev`                     | `vite --port=3000 --host=0.0.0.0`                                     |
| `build`                   | `vite build` → `dist/`                                                |
| `preview`                 | `vite preview`                                                        |
| `portable`                | `vite build --config vite.portable.config.ts` → `portable/index.html` |
| `lint`                    | `tsc --noEmit && eslint .`                                            |
| `format` / `format:check` | Prettier                                                              |
| `test` / `test:coverage`  | Vitest                                                                |
| `test:e2e`                | Playwright                                                            |
| `perf:check`              | `node scripts/check-bundle-budget.mjs`                                |
| `electron:dev`            | `concurrently` Vite + Electron with `wait-on`                         |
| `electron:build`          | `vite build && electron-builder --config electron-builder.config.cjs` |
| `clean`                   | `rm -rf dist`                                                         |

### Vite configuration

`vite.config.ts` uses `base: './'` (required for Electron's `file://` loading) and manual
chunks peeling `motion`, `@supabase/supabase-js`, i18next and `@dnd-kit` out of the entry
chunk so they cache independently. recharts is deliberately _not_ listed — it rides along in
the lazily-loaded Dashboard chunk. HMR and file watching can be disabled with
`DISABLE_HMR=true` to prevent flicker during agent edits.

`vite.portable.config.ts` adds `vite-plugin-singlefile` and inlines everything
(`assetsInlineLimit: 100_000_000`, `cssCodeSplit: false`, `inlineDynamicImports: true`) so
there are no external fetches a `file://` origin would block.

### TypeScript

`strict: true` plus `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`,
`noUnusedParameters`, `noImplicitOverride`, `forceConsistentCasingInFileNames`,
`isolatedModules`, `moduleDetection: 'force'`. Path alias `@/* → ./src/*`. `noEmit` — Vite
transpiles.

### ESLint (flat config)

Four scoped blocks: TS/TSX with react-hooks and react-refresh; `electron/**/*.cjs` (which
had been excluded entirely, leaving the most privileged code in the project — IPC handlers,
the PowerShell spawn, the navigation lockdown, the auto-updater — checked by nothing but a
syntax pass); Node-context configs and e2e; and `test/**` with `no-explicit-any` off,
because tests mock large third-party surfaces. **Production code under `src/` carries zero
`any`.** CI runs `eslint . --max-warnings 0`.

### electron-builder

`appId: com.eapos.app`, `productName: EA POS`, artifact `EA-POS-Setup-${version}.exe`,
output `release/`, GitHub publish provider. NSIS: not one-click, per-machine, elevation
allowed, directory selectable, desktop + start-menu shortcuts. `requestedExecutionLevel:
asInvoker`, `verifyUpdateCodeSignature: true`. The config logs one line naming the signing
path taken, so an unsigned build is never mistaken for a signed one in CI output.

---

## 17. Testing

### Unit and component — Vitest

63 files under `test/`, mirroring `src/`. Environment `jsdom`; `test/setup.ts` loads
`fake-indexeddb/auto` (stores persist through idb-keyval), `@testing-library/jest-dom`,
real i18n so `t()` returns English strings, an explicit `cleanup()` (auto-cleanup only
registers itself with vitest globals enabled, which they are not), and stubs
`offsetWidth`/`offsetHeight` to 1 because jsdom has no layout engine and `useModalA11y`
filters focusables by them.

Coverage (v8) includes `src/lib/**`, `src/stores/**` and `src/components/**`. The Vitest
`include` is scoped to `test/**` so it can never collect a Playwright spec, whose `test()`
and `expect()` come from a different runner.

| Area                              | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/lib/`                       | 48 files — pricing, checkout, refunds, payments, shift/PO/fleet reports, ESC/POS text + raster, receipt doc/format/layout/printer, hardware print, printer discovery, kitchen routing, barcode, CSV, digital receipts, product labels, purchase orders, hashing, PIN throttle, access, validation, ids, concurrency, image URLs, modal a11y, barcode scanner, sync, realtime sync, Supabase client/paging/store-stamping/device sign-in, fleet client, catalog push, store form, and the Electron pure modules (`menuServer`, `updatePolicy`, `validation`, `windowsSigning`) |
| `test/stores/`                    | product, shift, supply, dialog                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `test/components/`                | Register, CartPanel, History, Inventory, Lockscreen, plus the two extracted hooks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `test/a11y/formLabels.test.tsx`   | Accessible-name algorithm for initial screens and controls revealed in Settings, Inventory, Customers and receipt-layout surfaces                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `test/i18n/keyCoverage.test.ts`   | The three catalogue rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `test/styles/deadClasses.test.ts` | Every defined CSS class is reachable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

The Electron pure modules exist in their own `.cjs` files **precisely so they can be
tested** — CI otherwise only reaches `main.cjs` through `node --check`.

### End-to-end — Playwright

`e2e/checkout.spec.ts` drives the real app across Chromium, Firefox and WebKit: PIN login,
adding to the cart, card checkout, cash checkout with change, and role-based navigation. The
config boots the Vite dev server automatically, retries twice in CI, records a trace on
first retry and a screenshot on failure.

Note that `npm run test:e2e` runs all three projects. Installing only Chromium leaves the
other two failing with _"Executable doesn't exist"_, which reads like a broken test rather
than a missing browser — iterate with `npm run test:e2e -- --project=chromium`.

---

## 18. CI/CD

### `ci.yml` — on push to main and every PR

`checks` job (Node 22, 20-minute timeout): `npm ci` → `npm audit --audit-level=high` →
`tsc --noEmit && eslint` → `eslint . --max-warnings 0` → `prettier --check` → Vitest →
`vite build` → bundle budget → `node --check` on all six Electron/seed files → a config
smoke test asserting the unsigned path claims **no** publisher and the appId is unchanged.

`e2e` job (30-minute timeout): installs all three browser engines and runs Playwright,
uploading the HTML report as an artifact with 7-day retention.

Concurrency cancels superseded **pull-request** runs only — a run on `main` is the record
for that commit and is left to finish.

### `build-windows.yml` — on push to main, PRs, and manual dispatch

Runs on `windows-latest`. Resolves the signing mode **through the same module the build
uses**, so CI can never disagree with electron-builder about whether a build is signed.
Builds the renderer, packages with electron-builder, verifies the Authenticode signature
when signing was configured (a hard failure — a build that failed to sign must not reach a
Release looking signed), generates `SHA256SUMS.txt` for the installer _and_ `latest.yml`
(missing `latest.yml` fails the job, because installed terminals would never discover the
release), and uploads everything as an artifact.

`publish-release` tags with the **application version** derived from the installer filename,
not the run number — that is what electron-updater compares. It refuses to overwrite an
existing tag, telling you to bump `package.json`. Signed builds become normal releases;
unsigned ones become **pre-releases** with a prominent warning, so electron-updater does not
offer them to installed terminals. The workflow is deliberately input-free: build provenance
only holds if the output cannot be steered by run parameters.

### `sonarcloud.yml` — opt-in, no-op until configured

Started as GitHub's starter template committed unchanged, which failed on every push for
four reasons at once: empty scanner arguments, no `SONAR_TOKEN`, no checkout step (so even a
configured run would have scanned an empty directory), and a permissions block missing
`contents: read`. It now resolves configuration in a step (the secrets context is not
available in a job-level `if`) and emits a notice instead of a failure when unconfigured.
The scanner action is pinned to a commit. Coverage is not reported because
`vitest.config.ts` declares only text reporters — the header documents exactly how to wire
lcov up.

---

## 19. Scripts and developer tooling

| Script                                | Purpose                                                                                                                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/schema.sql`                  | Base Supabase DDL, RLS, `verify_login`, realtime publication                                                                                                                                                                                                       |
| `scripts/multi-store-schema.sql`      | Additive store dimension, fleet RPCs, access predicates                                                                                                                                                                                                            |
| `scripts/multi-store-rls-enforce.sql` | Opt-in store-scoped RLS enforcement (+ rollback)                                                                                                                                                                                                                   |
| `scripts/seed.mjs`                    | Seeds a Supabase project with a demo catalog. Needs `SUPABASE_SERVICE_ROLE_KEY` (the anon key cannot insert once RLS is on). Reproduces the app's PBKDF2 hash format with `node:crypto`. Its catalogue is deliberately **not** the same as `src/data/seedData.ts`. |
| `scripts/check-bundle-budget.mjs`     | Gzips the hashed Vite entry assets and fails past budget                                                                                                                                                                                                           |
| `scripts/generate-icons.mjs`          | Regenerates every raster icon from `src/assets/logo-mark.svg` (needs one-off `sharp` + `png-to-ico`, not project deps)                                                                                                                                             |
| `scripts/fetch-fonts.mjs`             | Re-downloads the self-hosted woff2 faces and prints the `@font-face` block. Only the subsets the app renders, and only upright faces — exactly one label in the UI is italic, so the browser synthesises an oblique instead of shipping another 221 KB.            |
| `tools/raster-preview.html`           | Dev harness for the thermal raster renderer; not part of the bundle                                                                                                                                                                                                |

`src/data/seedData.ts` holds the development fixture: 31 categories and 74 products with
Arabic names (a café menu), 4 demo customers, and `INITIAL_SETTINGS`. `productThumb` builds a
self-contained SVG thumbnail — a category-tinted gradient behind the product's emoji — as a
data URI, using `encodeURIComponent` rather than base64 to stay UTF-8-safe for the emoji
glyph. That keeps the demo catalog polished fully offline with no image host and no binary
assets in the repo. All of it is gated behind `import.meta.env.DEV || MODE === 'test'`.

---

## 20. Performance budgets

Enforced by `scripts/check-bundle-budget.mjs`, run locally with `npm run perf:check` and in
CI immediately after the production build.

| Artifact                 |      Max gzip |
| ------------------------ | ------------: |
| Initial JavaScript entry | 200,000 bytes |
| Initial CSS entry        |  50,000 bytes |

`PERF.md` records the Phase 4 baseline: 61 test files / 527 tests passing, zero ESLint
warnings, a 6–7 second production build, 433,690 raw / 135,819 gzip initial JS, 113,788 raw /
17,511 gzip initial CSS, and instrumented coverage of 56.82 % statements, 47.40 % branches,
47.03 % functions, 58.19 % lines. Coverage is recorded as a baseline rather than raised to an
artificial threshold, because the suite includes broad component coverage alongside many
hardware, cloud and administrative branches that are intentionally integration-oriented.

Strategies in use: route-level code splitting, lazy register dialogs (parked orders,
payment, add-customer, receipt — emitted as four on-demand chunks), manual vendor chunks,
memoised IPC payloads, `Map`-based lookups replacing O(N²) scans, `React.memo` on grid cards,
and self-hosted subset fonts.

A budget failure should trigger a fresh bundle analysis, not an arbitrary limit increase.

---

## 21. Conventions and gotchas

### Code conventions

- **Prettier:** semicolons, single quotes, 2-space tabs, 100-column width, trailing commas
  everywhere. CI enforces it — the repo carried a `.prettierrc` that nothing checked, and 52
  files had drifted.
- **Comments explain _why_, not _what_.** The codebase is unusually heavily commented, and
  the comments carry real history — a bug that shipped, a race that was closed, a trade-off
  that was accepted. Preserve them when refactoring.
- **Deprecated facades** (`money.ts`, `quantity.ts`, `ids.ts`, `escapeHtml.ts`,
  `dialogs.ts`, `notifications.ts`, `printWindow.ts`, `receiptPrinter.ts`, `supabase.ts`)
  contain exports only and must not acquire business logic. New code imports the focused
  module.
- **Prop-driven subcomponents.** Extracted panels and tabs do not subscribe to Zustand; the
  screen owns store access and business actions.

### Gotchas

1. **Cart snapshots are stale by design.** The cart holds product snapshots from
   add-to-cart time. Always re-read `useProductStore.getState().products` before writing
   stock back.
2. **Refunds re-read the transaction** from the store before computing, so a stale modal
   cannot double-refund.
3. **`stopRealtimeSync` must be called on teardown** — the generation counter is what makes
   in-flight pulls safe to discard.
4. **`window.electronAPI` is always optional.** Every call site uses `?.` and has a browser
   fallback.
5. **Receipt documents inherit nothing.** They render in isolated documents, so direction,
   language and font must be restated by `receiptDocHtml` / `renderReceiptRaster`.
6. **Non-ASCII forces the raster path.** Any codepoint above `0x7F` anywhere on the receipt
   sends the whole thing as a bitmap.
7. **A short pull page is not the end of the table** — it is what a server-side row cap looks
   like. Stop on an empty page.
8. **Never create a blanket `USING (TRUE)` policy** once store-scoped RLS is enforced.
   Postgres ORs permissive policies together.
9. **`node --check` is a parse, not a test.** Logic that matters belongs in a `.cjs` module
   with unit tests, not inline in `main.cjs`.
10. **A dev fixture is not a production default.** `DEFAULT_SETTINGS` and `DEFAULT_USERS` are
    environment-gated for exactly this reason.

### Adding things

| To add…             | Touch                                                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A screen            | `access.ts` (`ScreenId` + `SCREEN_ROLES`), `App.tsx` (lazy import, switch, mobile menu), `Sidebar.tsx` (`NAV_ITEMS`), `locales/{en,ar}/sidebar.ts`                                              |
| A receipt field     | `types.ts` (`ReceiptToggles`), `receiptFormat.ts` (`allTogglesOn` + defaults), `receiptDoc.ts` (both builders), `receipt/templates/*`, `ReceiptSettingsPanel.tsx` (`TOGGLE_KEYS`), both locales |
| A synced table      | `supabase/<entity>.ts` (push + pull with `keyset`/`fetchAllPages`/`stampStoreId`), `sync.ts`, `realtimeSync.ts` (`SYNCED_TABLES`), `sync-utils.ts` (`SyncTable`), all three SQL scripts         |
| A printer transport | `types.ts` (`PrinterConfig['type']`), `hardwarePrint.ts` (both dispatchers + `openCashDrawer`), `printerDiscovery.ts`, `settings/PrinterPanel.tsx`, possibly an IPC channel + validator         |
| A translated string | Both `locales/en/<ns>.ts` and `locales/ar/<ns>.ts` — the coverage test fails otherwise                                                                                                          |

---

## 22. Appendix — file index

### `src/lib` (~60 modules)

| Module                                           | Purpose                                             |
| ------------------------------------------------ | --------------------------------------------------- |
| `access.ts`                                      | Screen/role matrix                                  |
| `barcode.ts`                                     | Pure Code 128 encoder + SVG                         |
| `catalogPush.ts`                                 | Cross-store catalog diff planning                   |
| `checkout.ts`                                    | Sale assembly + tender validation                   |
| `concurrency.ts`                                 | Bounded-parallelism map                             |
| `csv.ts`                                         | RFC-4180 CSV + formula neutralisation + download    |
| `digitalReceipt.ts`                              | Plain-text receipt, share, email templates          |
| `escpos.ts`                                      | ESC/POS text encoder                                |
| `escposRaster.ts`                                | 1bpp packing + `GS v 0` bands + `needsRaster`       |
| `fleet.ts` / `fleetClient.ts` / `fleetReport.ts` | Fleet pure logic / RPCs / reporting                 |
| `hardwarePrint.ts`                               | Transport dispatch                                  |
| `hash.ts`                                        | SHA-256, HMAC, PBKDF2, versioned PIN hashes         |
| `i18n.ts`                                        | i18next init                                        |
| `idbStorage.ts`                                  | Zustand ↔ idb-keyval adapter                        |
| `imageUrl.ts`                                    | Image URL sanitiser                                 |
| `kitchenRouting.ts`                              | Category → station routing                          |
| `payments.ts`                                    | Tender summarisation                                |
| `pinThrottle.ts`                                 | Lockout ladder                                      |
| `poReport.ts` / `purchaseOrders.ts`              | PO reporting / state machine                        |
| `pricing.ts`                                     | Order totals                                        |
| `print/*`                                        | System print-window transport                       |
| `printerDiscovery.ts`                            | OS/serial/network printer detection                 |
| `productLabels.ts`                               | Shelf-label sheets                                  |
| `realtimeSync.ts`                                | Realtime subscription + generation-guarded teardown |
| `receipt/*`                                      | HTML receipt documents                              |
| `receiptCanvas.ts`                               | Canvas raster renderer                              |
| `receiptDoc.ts`                                  | Renderer-independent document model                 |
| `receiptFormat.ts`                               | Layout defaults, token formatter, font whitelist    |
| `refunds.ts`                                     | Refund computation                                  |
| `shiftReport.ts`                                 | Z-report tallies                                    |
| `storeForm.ts`                                   | Store form validation + slugs                       |
| `supabase/*`                                     | Cloud client, paging, per-table push/pull           |
| `sync.ts`                                        | Sync orchestration                                  |
| `useBarcodeScanner.ts`                           | Wedge-scanner hook                                  |
| `useModalA11y.ts`                                | Dialog focus trap                                   |
| `utils/*`                                        | validation, formatting, ids, ui, dom                |

### `src/components` (43 files)

Screens: `App` (in `src/`), `Register`, `Inventory`, `History`, `Customers`, `Dashboard`,
`Settings`, `ShiftScreen`, `QRMenu`, `Lockscreen`, `FleetView`, `FleetBoard`,
`FleetDashboard`, `StoreAdmin`, `CatalogPush`.

Shell: `Sidebar`, `ErrorBoundary`, `NotificationCenter`, `DialogCenter`, `Logo`,
`BarcodeSvg`, `ProductGrid`, `CartPanel`, `ReceiptSettingsPanel`, `shared/ModalShell`.

Subdirectories: `register/` (4 modals + `useRegisterCart`), `inventory/` (5 modals + `Tabs` +
barrel), `settings/` (7 panels + `UserModal` + `usePrinterDiscovery` + barrel), `history/`
(`useHistoryFilters`).

### Related documents

| File                                 | Contents                                                       |
| ------------------------------------ | -------------------------------------------------------------- |
| `README.md`                          | User-facing setup, features, cloud sync, signing, tests        |
| `PERF.md`                            | Performance/quality ledger and enforced budgets                |
| `docs/refactor-phase-1-structure.md` | i18n, receipt/print, Supabase, utils module boundaries         |
| `docs/refactor-phase-2-structure.md` | Inventory/Settings decomposition, `ModalShell`                 |
| `docs/refactor-phase-3-structure.md` | `useRegisterCart` / `useHistoryFilters` boundaries             |
| `docs/security-and-performance.md`   | Security-report disposition, dependency advisory, perf changes |
| `docs/PROJECT.md`                    | This document                                                  |
