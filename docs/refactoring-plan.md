# EA POS — Refactoring Plan

_Written against `main` @ `8892704`, 2026-08-30. Every number below was measured
on that commit; the commands are in [Baseline](#1-baseline-measured)._

## 0. What this is

A staged plan to change the **shape** of EA POS without changing what it does.
The codebase is not in bad health — it typechecks strict, lints at
`--max-warnings 0`, formats clean, and 521 tests pass. The problem is narrower
and more specific: **the boundary between "pure domain logic" and "React screen"
was drawn once and then only half-applied.** Everything that made it into
`src/lib/` is small, documented and well tested. Everything that didn't is
sitting inside six enormous screen components where it is reachable only through
the DOM — which is exactly why component coverage is 46% while `lib/` is 68%.

Three consequences follow from that one root cause, and they are what this plan
is mostly about:

1. **Receipt layout is written three times** (rows model, HTML string, JSX) and
   the three can drift.
2. **Money is a float formatted at 145 call sites**, so rounding and currency
   presentation are decided ad hoc — including on RTL Arabic receipts.
3. **`stores/` and `lib/` import each other in a cycle**, which is why 57 kB
   gzip of Supabase client is preloaded on every terminal boot even though cloud
   sync ships disabled.

Everything else is downstream of those.

---

## 1. Baseline (measured)

```bash
npm ci
npm run lint          # tsc --noEmit && eslint .   → clean
npx eslint . --max-warnings 0                      → clean
npm run format:check                               → clean
npm run test:coverage                              → 521 passed
npm run build
```

| Metric                            |                       Value |
| --------------------------------- | --------------------------: |
| `src/**` (ts, tsx, css)           |                24,281 lines |
| `electron/**` (cjs)               |                 1,204 lines |
| `test/**` + `e2e/**`              |                 7,076 lines |
| Test files / tests / wall time    |      59 / 521 / **84.71 s** |
| Coverage — statements             | **56.58 %** (2,545 / 4,498) |
| Coverage — branches               | **47.84 %** (1,586 / 3,315) |
| Coverage — functions              |   **46.80 %** (593 / 1,267) |
| Coverage — lines                  | **58.07 %** (2,232 / 3,843) |
| &nbsp;&nbsp;└ `src/components/**` |               46.29 % stmts |
| &nbsp;&nbsp;└ `src/lib/**`        |               67.71 % stmts |
| &nbsp;&nbsp;└ `src/stores/**`     |               70.83 % stmts |

**Boot payload** — every chunk in `dist/index.html` as `<script>` or
`modulepreload`, i.e. fetched before first paint:

| Chunk       |           Raw |          Gzip | Needed at boot?                       |
| ----------- | ------------: | ------------: | ------------------------------------- |
| `index`     |        432.64 |        135.89 | yes                                   |
| `supabase`  |        219.90 |         57.42 | **no** — sync is off by default       |
| `index.css` |        113.79 |         17.82 | yes                                   |
| `motion`    |         96.80 |         32.00 | yes (`MotionConfig` is in `App.tsx`)  |
| `i18n`      |         59.09 |         19.92 | yes, but carries both languages       |
| `dnd`       |         49.22 |         16.46 | **no** — register drag-edit mode only |
| **Total**   | **971.44 kB** | **279.51 kB** |                                       |

`AreaChart` (108.48 kB gzip) is correctly isolated in the lazy Dashboard chunk.
Demo seed data (`src/data/seedData.ts`, 1,063 lines) is correctly tree-shaken
out of production — verified: 1 of 109 seed strings survives, and that one is a
coincidental match against an Arabic i18n value.

**Largest files**

| File                           | Lines |    Coverage (stmts) |
| ------------------------------ | ----: | ------------------: |
| `src/components/Settings.tsx`  | 2,144 |             27.16 % |
| `src/components/Inventory.tsx` | 2,051 |             56.76 % |
| `src/lib/i18n.ts`              | 1,620 |                   — |
| `src/components/History.tsx`   | 1,106 |             67.34 % |
| `src/data/seedData.ts`         | 1,063 |                   — |
| `src/components/Dashboard.tsx` |   969 |                0 %¹ |
| `src/index.css`                |   941 |                   — |
| `src/components/Register.tsx`  |   764 |             62.64 % |
| `electron/main.cjs`            |   684 | `node --check` only |

¹ Dashboard has no test file at all; the coverage report shows it uncovered.

---

## 2. What is already good — do not "fix" it

This matters as much as the findings, because a refactor that damages any of
these is a net loss.

- **The pure core is genuinely pure.** `pricing`, `checkout`, `refunds`,
  `payments`, `poReport`, `purchaseOrders`, `catalogPush`, `fleet`, `escpos`,
  `escposRaster`, `csv`, `access`, `concurrency` are DOM-free, documented, and
  sit at 94–100 % statement coverage. This is the model the rest of the code
  should be pulled toward, not something to redesign.
- **The comments explain _why_, not _what_.** `supabase.ts`'s keyset-pagination
  note, `realtimeSync.ts`'s generation-guard note, `settingsStore`'s
  `partialize` note, and `csv.ts`'s formula-injection note each record a real
  bug that was fixed. Preserve them verbatim when code moves.
- **Executable conventions.** `test/styles/deadClasses.test.ts` fails the build
  on unused CSS; `test/i18n/keyCoverage.test.ts` enforces en↔ar parity _and_
  key reachability; `test/a11y/formLabels.test.tsx` asserts real accessible
  names via `dom-accessibility-api`. These are the right kind of test and the
  plan extends the pattern rather than replacing it.
- **Electron is hardened deliberately.** Single-instance lock, context
  isolation, navigation allowlist with `file:`-escape checking, permission
  handler denying everything, `-EncodedCommand` instead of a temp `.ps1`,
  update installation gated on real signature verification. None of this is
  in scope for restructuring beyond moving whole functions between files.
- **Offline-first is a real constraint, not an accident.** IndexedDB
  persistence, the WebCrypto-optional hash path, and `shortId`'s
  `randomUUID`→`getRandomValues`→deterministic fallback exist because the app
  must work on a plain-`http://` LAN. Keep all three fallbacks.

---

## 3. Findings

### F1 — Domain logic never left the screen components

**Evidence.** `Inventory.tsx` holds 35 `useState`; `Settings.tsx` and
`Register.tsx` hold 22 each; `History.tsx` 13. `Dashboard.tsx` computes KPIs,
sales trend, top products, category share, payment mix and per-operator
breakdown in six inline `useMemo`s with no unit test anywhere.
`ShiftScreen.printReport` builds a whole Z-report HTML document inline
(≈35 lines of template string) inside the component, at 38.88 % coverage.

**Impact.** These are the calculations a shop owner reconciles their till
against, and they are only reachable through a rendered DOM. That is the entire
reason `components/` sits at 46 % while `lib/` sits at 68 %.

### F2 — Receipt content is authored three times

**Evidence.** `src/lib/receiptDoc.ts` says in its own docstring: _"The canvas,
HTML and ESC/POS renderers all consume this same shape."_ They do not.
`grep` confirms `receiptPrinter.ts` never imports `receiptDoc`:

- `receiptDoc.ts` → `DocRow[]` → consumed by `escpos.ts` and `receiptCanvas.ts`
- `receiptPrinter.ts:buildReceiptHtml` → independently built HTML string
- `components/register/ReceiptModal.tsx` → independently built JSX

All three re-implement the same `ReceiptToggles` matrix (18 boolean fields).

**Impact.** Adding a receipt field is three edits. A toggle honoured in one
renderer can be silently ignored in another, and no test can catch it because
`receiptDoc.test.ts` and `receiptLayout.test.ts` each test one path in
isolation. There are also **four** separate print-document builders in total —
`receiptPrinter.receiptDocHtml`, `productLabels.buildLabelSheetHtml`,
`ShiftScreen.printReport` (inline), and `electron/menu.html`.

### F3 — Money is a float, formatted 145 times

**Evidence.** 145 `.toFixed(2)` call sites across 28 files (`ShiftScreen` 24,
`Dashboard` 18, `receiptPrinter` 10, `History` 10 …). **Zero** uses of
`Intl.NumberFormat` anywhere in `src/`. Currency renders as string
concatenation: `{settings.currency}{n.toFixed(2)}`.

Line totals and the subtotal are rounded on independent paths —
`checkout.ts` rounds each `item.total`, `pricing.ts` rounds the summed subtotal
— so they can disagree. Reproducible:

```js
// two items at 0.125 each
lineTotals = [0.13, 0.13]  → sum 0.26
subtotal   = round2(0.25)  → 0.25   // receipt lines do not add up
```

**Impact.** Two distinct problems. (a) A receipt whose lines don't sum to its
subtotal is the single worst-looking bug a POS can print. (b) With full RTL
Arabic support in the product, a hand-concatenated `$12.34` puts the symbol on
the wrong side and uses Latin digits regardless of locale.

### F4 — `stores/` ↔ `lib/` is a dependency cycle, and it costs the boot bundle

**Evidence.** All 11 stores import from `lib/`, and 7 `lib/` modules import back
from `stores/` (`sync`, `supabase`, `realtimeSync`, `fleetClient`,
`notifications`, `dialogs`). The concrete cycle:

```
App.tsx → stores/productStore → lib/sync → lib/supabase
                                             ├→ @supabase/supabase-js  (219.9 kB)
                                             └→ stores/authStore        ⟲
```

`App.tsx` additionally imports `lib/realtimeSync` and `lib/fleetClient`
statically, so even breaking the store edge is not sufficient on its own.

**Impact.** `supabase-*.js` is `modulepreload`ed on every boot — 57.42 kB gzip,
**21 % of the boot payload** — for a feature that ships disabled and that most
single-terminal shops never turn on. `dnd` (16.46 kB gzip) rides along the same
way for a drag-to-reorder mode that is off by default. Together that is
**73.88 kB gzip, ~26 % of first paint**, spent on nothing.

### F5 — Realtime sync re-pulls whole tables

**Evidence.** `realtimeSync.ts` responds to every `postgres_changes` event by
debouncing 400 ms and then calling the corresponding `pullX()` — a keyset walk
of the **entire** table — followed by `setX()`, which _replaces_ local state.

**Impact.** One sale rung up on till B causes till A to download its complete
sale history. On a terminal trading for a year that is the whole ledger over the
wire, per sale, on every till. The `payload.new` / `payload.old` row is already
in hand and is being thrown away.

### F6 — A failed cloud push is dropped, not retried

**Evidence.** `syncToCloudIfEnabled` catches and `console.warn`s; `pushProducts`
et al. return `false` on error and that return value is discarded. There is no
outbox, queue, or retry anywhere in `src/lib/sync.ts` or `supabase.ts`.

**Impact.** A transient network blip at the moment of checkout means that
transaction never reaches the cloud until somebody manually opens
Settings → "Push All". Nothing surfaces this to the operator. This is the one
finding in the list that is a latent correctness gap rather than a shape
problem, and it should be fixed on its own merits regardless of the rest of the
plan.

### F7 — Zustand subscriptions are coarser than they need to be

**Evidence.** 21 whole-store subscriptions (`const { x } = useSettingsStore()`)
against 64 selector subscriptions. `App.tsx:54` subscribes to the entire
settings store; `History.tsx` subscribes whole to five stores;
`Sidebar.tsx` to three.

**Impact.** Editing a printer IP address in Settings re-renders the whole
application tree, because `App` is subscribed to every field of the settings
store.

### F8 — No UI primitive layer

**Evidence.** `Settings.tsx` contains 34 raw `<input>` and 31 raw `<button>`;
`Inventory.tsx` 18 and 39. The `glass-input` class is repeated 31 times in
`Settings.tsx` alone. Nine files hand-roll `role="dialog"` + `aria-modal`
markup around `useModalA11y` (28 occurrences). There is no
`src/components/ui/`. `CartPanel` takes **24 props**; `PaymentModal` takes 21.

**Impact.** `test/a11y/formLabels.test.tsx` exists precisely because every field
is wired by hand and any one of them can lose its label. The fix for that class
of bug is a `<Field>` that cannot be built wrong, not a test that checks 60 call
sites after the fact.

### F9 — `i18n.ts` is one 1,620-line module with both languages eager

**Evidence.** `const en` spans lines 5–803, `const ar` lines 804–1620, both
handed to `i18n.init({ resources: { en, ar } })`. Ships as a 19.92 kB gzip
preloaded chunk containing the language the terminal is not using.

### F10 — PIN hashing can block the UI thread

**Evidence.** `hashPinSaltedSync` runs 600,000 pure-JS PBKDF2-SHA-256
iterations synchronously. The async variant yields with `setTimeout(0)` every
2,000 iterations — 300 hops, each clamped to ~4 ms by the browser — so it costs
**≥1.2 s of wall clock before any compute**.

**Impact.** Only on the non-WebCrypto path, which is exactly the plain-`http://`
LAN deployment the README documents as supported. Every PIN entry on those
terminals pays it.

### F11 — Path aliases are configured but unused, and misconfigured in one place

**Evidence.** `tsconfig.json` and `vite.config.ts` both map `@/*` → `./src/*`.
Uses of `@/` in `src`, `test`, `e2e`: **0**. Relative `../` imports: **204**.
Meanwhile `vite.portable.config.ts` maps `@` to the **repository root**, not
`src`.

**Impact.** Every file move rewrites a fan of import paths, which makes the rest
of this plan more expensive than it needs to be. And the first person to use
`@/` will produce a portable build that resolves differently from the normal
one.

### F12 — Test shape leaves the money paths thinnest

**Evidence.** Zero-coverage components: `Sidebar`, `QRMenu`,
`NotificationCenter`, `ErrorBoundary`, `FleetView`, `AddCustomerModal`,
`Dashboard`. Low: `Settings` 27.16 %, `StoreAdmin` 25.56 %, `ShiftScreen`
38.88 %. In `lib/`: `receiptCanvas` 4.37 %, `fleetClient` 25.50 %,
`printerDiscovery` 27.90 %, `supabase` 39.90 %, `sync` 47.42 %,
`hardwarePrint` 52.30 %.

The Playwright suite is a single 91-line spec: login, add to cart, card and cash
checkout, role-based navigation. **Not covered end-to-end:** partial refunds and
the manager-override PIN, split payments, held orders, shift open/close and the
Z-report variance — i.e. every flow that moves money in a direction other than
"forward".

**Impact.** The e2e suite is the safety net this refactor leans on, and it does
not currently cover the paths most likely to break.

---

## 4. The plan

Ten phases. Phases 0 and 1 are prerequisites for everything else; after those,
2–9 are largely independent and can be reordered or dropped.

### Phase 0 — Guardrails first

**Goal:** make it impossible for a later phase to quietly regress behaviour or
coverage. Nothing here changes production code shape.

1. **Freeze coverage.** Add `coverage.thresholds` to `vitest.config.ts` at
   today's numbers (`statements: 56`, `branches: 47`, `functions: 46`,
   `lines: 58`) and run `test:coverage` in CI instead of `test`. Ratchet up as
   phases land; never down.
2. **Extend e2e to the money paths** (F12): partial refund with manager
   override, split payment across cash + card with change, hold and resume an
   order, shift open → sales → close with a counted-cash variance. This is the
   net for Phases 2–4 and it must exist before them.
3. **Characterization tests before extraction.** For each block about to move —
   Dashboard's six analytics memos, `ShiftScreen.printReport`, Inventory's PO
   and CSV paths — write tests against _current_ output first. Snapshot the
   Z-report HTML. These get deleted or rewritten once the logic lands in
   `core/`, but they are what proves the move was behaviour-neutral.
4. **Adopt `@/` (F11).** Fix `vite.portable.config.ts` to point at `src`, then
   codemod all 204 relative imports. One mechanical commit, reviewable by
   `git diff --stat`, and it makes every subsequent file move a no-op for
   importers.

**Exit:** CI enforces a coverage floor; e2e covers refunds/splits/shifts; every
import is `@/`-rooted.
**Risk:** low. **Estimate:** 3–5 days.

### Phase 1 — Draw the layer boundary and break the cycle

**Goal:** fix F4. This unblocks the bundle win and makes every later phase
cheaper.

1. **`src/core/`** — pure domain. No React, no DOM, no store imports. Move:
   `pricing`, `checkout`, `refunds`, `payments`, `money`, `quantity`,
   `shiftReport`, `poReport`, `purchaseOrders`, `catalogPush`, `fleet`,
   `fleetReport`, `receiptDoc`, `receiptFormat`, `escpos`, `escposRaster`,
   `barcode`, `csv`, `access`, `ids`, `hash`, `escapeHtml`, `imageUrl`,
   `kitchenRouting`, `storeForm`, `pinThrottle`, `concurrency`.
2. **`src/services/`** — side-effecting adapters. Move: `supabase`, `sync`,
   `realtimeSync`, `fleetClient`, `hardwarePrint`, `printerDiscovery`,
   `receiptPrinter`, `receiptCanvas`, `printWindow`, `productLabels`,
   `digitalReceipt`, `notifications`, `dialogs`, `idbStorage`.
3. **Enforce the boundary** with ESLint `no-restricted-imports` zones:
   `core/**` may not import `services/**`, `stores/**`, `components/**`, or
   `react`. A rule, not a convention — the repo already does this style of
   enforcement in `deadClasses.test.ts`.
4. **Invert store → sync.** Stores stop importing `services/sync` directly.
   Introduce a `syncBus` in `services/` that stores publish mutations to through
   an injected sink defaulting to a no-op; `sync` subscribes when enabled.
   Removes the `productStore → sync` and `supabase → authStore` edges.
5. **Make the cloud lazy.** `services/cloud/index.ts` exposes async wrappers
   that `await import('./supabaseClient')` on first use. `App.tsx` moves its
   `realtimeSync` / `fleetClient` imports inside the
   `syncEnabled && syncConnected` effect.
6. **Make dnd lazy.** `ProductGrid` loads `@dnd-kit` only when edit mode turns
   on; the read-only grid renders without it.
7. **Move the PBKDF2 fallback off the main thread (F10).** `core/hash.ts` keeps
   the pure implementation; add `services/crypto/hashWorker.ts` that runs it in
   a Web Worker, and have the non-WebCrypto path call that instead of the
   `setTimeout`-yielding loop. The synchronous `hashPinSaltedSync` stays for
   tests and for any caller that genuinely cannot await. Small and independent —
   split it out if Phase 1 is running long.

**Exit:** `dist/index.html` no longer preloads `supabase` or `dnd`; boot payload
drops from 279.51 kB to ≈206 kB gzip (**−26 %**); `madge --circular src` is
clean.
**Risk:** medium — touches every store and `App.tsx`. The e2e suite from
Phase 0 is the check. **Estimate:** 5–8 days.

### Phase 2 — One receipt document

**Goal:** fix F2. Highest structural value in the plan.

1. Promote `core/receipt/document.ts` (today's `receiptDoc.ts`) to the **only**
   place receipt layout is decided. Extend `DocRow` with what HTML and React
   need that ESC/POS didn't (an `image` row for the logo; a stable field id per
   row so renderers can style semantically).
2. Rewrite `services/print/html.ts` (`buildReceiptHtml`,
   `buildKitchenTicketHtml`) as a renderer _over_ `DocRow[]`.
3. Rewrite `ReceiptModal` as `<ReceiptDocView rows={…} />` — a React renderer
   over the same rows — and reuse it for `ReceiptSettingsPanel`'s live preview,
   which currently goes through `receiptPreviewDoc`.
4. Move `ShiftScreen.printReport` into `core/reports/shiftDoc.ts` returning
   `DocRow[]`, printed through the same HTML renderer. Do the same for
   `productLabels` where the row model fits.
5. **Add the test that makes divergence impossible:** for a matrix over
   `ReceiptToggles`, assert that `docStrings(rows)`, the HTML renderer's text
   content, and the React renderer's rendered text all contain the same set of
   field values.

**Exit:** exactly one receipt-layout implementation; ~400 lines of duplicated
layout deleted; the toggle matrix tested once instead of three times, partially.
**Risk:** medium — printed output is customer-facing. Golden-file tests per
renderer, plus a manual pass on a real 80 mm printer before merge.
**Estimate:** 5–7 days.

### Phase 3 — Money

**Goal:** fix F3. Split into a low-risk half and a scoped high-value half; do
3A unconditionally, 3B only for the core chain.

**3A — Centralize formatting (do this).**
Grow `core/money.ts` with `formatMoney(amount, { currency, locale })` built on
`Intl.NumberFormat`, plus `round2`. Replace all 145 display-side `.toFixed(2)`
sites. Add a guard test in the style of `deadClasses.test.ts`: `.toFixed(2)`
may not appear in `src/` outside `core/money.ts`. Fixes RTL symbol placement and
digit shaping as a side effect.
_Risk: low. Estimate: 2–3 days._

**3B — Minor-unit arithmetic in the core chain (scoped).**
Convert `pricing → checkout → refunds → shiftReport` to integer minor units
internally, with explicit converters at the persistence boundary so
`SaleTransaction` keeps its decimal fields and **no IndexedDB or Supabase
migration is needed**. Eliminates the lines-don't-sum-to-subtotal class of bug
shown in F3.
_Risk: medium-high — it is the only phase that can change a printed or persisted
number. Sequence it after Phase 2 so there is one receipt renderer to
re-verify, and gate it on the golden-receipt tests. Estimate: 4–6 days._

### Phase 4 — Decompose the screens

**Goal:** fix F1. Per screen: pull calculations into `core/`, pull state into a
`use*` hook, split tabs into files, leave the screen as a shell. Do them one at
a time, each its own PR.

| #   | Screen              | Split along                                                                      | Extract to `core/`                                                                                                                                          |
| --- | ------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | `Dashboard` (969)   | one file per chart card                                                          | `core/analytics/` — `kpis`, `salesTrend`, `topProducts`, `categoryShare`, `paymentMix`, `operatorBreakdown`                                                 |
| 4.2 | `Settings` (2,144)  | 7 tabs; boundaries already at lines 612 / 951 / 1295 / 1559 / 1679 / 1876 / 1955 | `useSettingsForm` per tab                                                                                                                                   |
| 4.3 | `Inventory` (2,051) | 5 tabs; boundaries at 578 / 888 / 958 / 1045 / 1179                              | `useProductFilters`, `usePurchaseOrderForm`                                                                                                                 |
| 4.4 | `Register` (764)    | —                                                                                | `useCart` (cart + discount + customer), `useTender` (method + split + cash). Collapses `CartPanel`'s 24 props and `PaymentModal`'s 21 to a context plus 3–4 |
| 4.5 | `History` (1,106)   | extract `RefundFlow` (the override-PIN state machine is 5 `useState`)            | `useTransactionFilters`                                                                                                                                     |

**Start with 4.1.** Dashboard is the biggest coverage win per hour — six pure
functions replacing six untested `useMemo`s — and it has no incoming
dependencies, so it is the safest place to prove the pattern.

**Exit:** no component over ~400 lines; `components/**` coverage above 70 %.
**Risk:** low-medium per screen, and it is bounded because each is a separate
PR. **Estimate:** 3–5 days per screen, 15–25 days total.

### Phase 5 — UI primitives

**Goal:** fix F8. Build `src/components/ui/`: `Modal` (wrapping `useModalA11y`
and emitting the `role`/`aria-modal`/`aria-labelledby`/`tabIndex` markup that is
currently hand-written 28 times), `Field`, `TextInput`, `NumberInput`, `Select`,
`Toggle`, `Button`, `Tabs`, `Toolbar`, `DataTable`, `EmptyState`.

**Migrate as part of Phase 4, not as a separate sweep** — each screen adopts the
primitives while it is already being decomposed. Then move the accessible-name
assertions from `formLabels.test.tsx` onto the primitives themselves and keep
the screen-level test as a smoke check.

**Risk:** low. **Estimate:** 3–4 days for the primitives; migration is absorbed
into Phase 4.

### Phase 6 — i18n

**Goal:** fix F9. Split into `src/locales/{en,ar}/<namespace>.json` mirroring
the existing key namespaces (`sidebar`, `register`, `history`, `inventory`,
`settings`, `fleet`, `catalogPush`, `receipt`, …). Lazy-load the inactive
language via i18next's backend. Rewrite `test/i18n/keyCoverage.test.ts` to read
the JSON files directly — **all three of its rules must survive** (every `t()`
resolves; every en key has an ar counterpart; every en key is reachable from
`src/`).

**Exit:** the boot i18n chunk carries one language.
**Risk:** low, but the coverage test is load-bearing — port it before splitting,
not after. **Estimate:** 2–3 days.

### Phase 7 — Sync correctness and scale

**Goal:** fix F5 and F6.

1. **Row-level realtime.** Apply `payload.new` / `payload.old` through a
   per-table reducer (upsert / delete) instead of re-pulling the table. Keep a
   full pull as a periodic reconciliation and as the manual "Pull From Cloud".
2. **Durable outbox.** Persist failed pushes to IndexedDB, drain on reconnect,
   and surface a "N changes pending" indicator. Sync stays best-effort and must
   still never block a sale — but a dropped write should be visible and
   eventually delivered.
3. **Raise `services/cloud` coverage past 70 %** with a fake Supabase client
   (`supabase.ts` 39.9 % → 70 %+, `sync.ts` 47.4 % → 70 %+,
   `fleetClient.ts` 25.5 % → 70 %+).

**Risk:** medium — this is live multi-terminal behaviour. Test against a real
Supabase project with two browser contexts before merge.
**Estimate:** 6–9 days.

### Phase 8 — Electron main process

**Goal:** `electron/main.cjs` is 684 lines mixing single-instance locking, the
Express menu server, three printer transports, window creation, the navigation
allowlist, the auto-updater, and temp-file cleanup — and CI reaches it only
through `node --check`, which is a parse and nothing more. The README already
names the bug that gap shipped.

Split into `electron/printing.cjs`, `electron/windows.cjs`,
`electron/updater.cjs` (joining the existing `menuServer`, `validation`,
`updatePolicy`, `windowsSigning`), leaving `main.cjs` as wiring only. Then unit
test the IPC handlers against a stubbed `ipcMain`.

**Risk:** low-medium — packaged-build behaviour is only verifiable on Windows.
Do a full `electron:build` and a manual print run before merge.
**Estimate:** 4–6 days.

### Phase 9 — Types and final layout

Split `src/types.ts` (323 lines, every domain) into `core/<domain>/types.ts`,
keeping `src/types.ts` as a re-export barrel so nothing breaks in one commit.

Target layout:

```
src/
  core/        pure domain — no React, no DOM, no stores   (ESLint-enforced)
  services/    adapters — supabase, printing, storage, notifications
  features/    one folder per screen: components + hooks + local types
  components/ui/   design-system primitives
  stores/      zustand state only
  locales/     en/*.json, ar/*.json
```

**Risk:** low. **Estimate:** 2–3 days.

---

## 5. Sequencing

```
Phase 0 (guardrails) ──┬─→ Phase 1 (layers, cycle, bundle)
                       │        │
                       │        ├─→ Phase 2 (one receipt doc) ─→ Phase 3B (minor units)
                       │        ├─→ Phase 3A (money formatting)
                       │        ├─→ Phase 7 (sync)
                       │        └─→ Phase 4 (screens) ←─ Phase 5 (ui primitives)
                       │                 │
                       │                 └─→ Phase 9 (types, layout)
                       └─→ Phase 6 (i18n)      Phase 8 (electron) — independent
```

**Recommended order if effort is limited.** Phases 0 and 1 are not optional —
everything else is cheaper and safer after them. Then, in value order:

1. **Phase 1's bundle win** — 26 % off first paint, mechanical, measurable.
2. **Phase 4.1 (Dashboard)** — biggest coverage gain per hour, zero incoming
   dependencies, proves the extraction pattern on a low-risk screen.
3. **Phase 2 (receipt)** — removes the most dangerous duplication in the app.
4. **Phase 3A (money formatting)** — small, and it fixes real RTL output.
5. **Phase 7.2 (outbox)** — the one item here that is a correctness gap rather
   than a shape problem; it deserves to be pulled forward if a terminal has ever
   lost a sale to a network blip.

Rough total for the full plan: **9–13 engineer-weeks**, dominated by Phase 4.

---

## 6. How each phase is verified

Every PR in this plan must keep all of these green — they are the existing gates
plus the two Phase 0 adds:

| Gate                            | Command                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| Strict typecheck                | `npm run lint`                                                  |
| Lint, zero warnings             | `npx eslint . --max-warnings 0`                                 |
| Formatting                      | `npm run format:check`                                          |
| Unit + component                | `npm test`                                                      |
| **Coverage floor** _(new)_      | `npm run test:coverage` with thresholds                         |
| End-to-end                      | `npm run test:e2e`                                              |
| Production build                | `npm run build`                                                 |
| **Boot-payload budget** _(new)_ | assert `dist/index.html` preloads no chunk outside an allowlist |
| Electron parse                  | `node --check electron/*.cjs`                                   |
| Dependency audit                | `npm audit --audit-level=high`                                  |

Phase-specific additions:

- **Phase 1:** `madge --circular src` clean; ESLint import-zone rule enforced.
- **Phase 2:** cross-renderer equivalence test over the `ReceiptToggles` matrix;
  manual print on real 80 mm hardware.
- **Phase 3:** `.toFixed(2)` grep guard; golden receipts re-verified.
- **Phase 6:** `keyCoverage.test.ts` ported with all three rules intact.
- **Phase 7:** two-terminal test against a live Supabase project.
- **Phase 8:** full `electron:build` plus a manual print run.

---

## 7. Explicit non-goals

Named so nobody spends time on them:

- **No router.** A `switch` over nine screens in `App.tsx` is the right size,
  and it keeps the packaged `file://` build trivial.
- **No state-library swap.** Zustand is fine; the finding is subscription
  granularity (F7), which is a convention plus a lint rule, not a migration.
- **No rewrite of the ESC/POS encoder, the barcode renderer, or `hash.ts`'s
  crypto.** They are correct, tested, and exist for documented hardware and
  plain-`http://` reasons.
- **No SQL schema restructuring.** `scripts/schema.sql`,
  `multi-store-schema.sql` and `multi-store-rls-enforce.sql` are idempotent and
  carefully documented; changing them is a separate project with its own
  migration risk.
- **No chasing `receiptCanvas.ts`'s 4 % coverage with canvas mocks.** It is a
  drawing routine; the _layout_ it draws is already covered through
  `receiptDoc`. Coverage there would be theatre.
- **No dependency upgrades as part of this work** — in particular the
  `electron-builder → got` chain, which `docs/security-and-performance.md`
  already dispositions. Refactor and upgrade should not share a PR.
- **No behaviour changes.** Except two, called out deliberately: the F6 outbox
  (Phase 7.2) and F3's line-sum correction (Phase 3B). Both are bug fixes, both
  are flagged, neither should be smuggled in with a move.

---

## 8. One-page summary

| #   | Finding                                                   | Evidence                                                                                 | Phase |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----- |
| F1  | Domain logic stuck in screens                             | Inventory 35 `useState`; Dashboard's 6 untested memos; `components/` 46 % vs `lib/` 68 % | 4     |
| F2  | Receipt layout written 3×                                 | `receiptPrinter` never imports `receiptDoc`; 4 print-doc builders                        | 2     |
| F3  | Float money, 145 format sites                             | 0 uses of `Intl`; lines can sum to 0.26 against a 0.25 subtotal                          | 3     |
| F4  | `stores` ↔ `lib` cycle                                    | 11 stores → lib, 7 lib → stores; 73.88 kB gzip wasted at boot                            | 1     |
| F5  | Realtime re-pulls whole tables                            | every change event → full keyset walk + `setX()`                                         | 7     |
| F6  | Failed pushes are dropped                                 | no retry/outbox; `console.warn` and discard                                              | 7     |
| F7  | Coarse store subscriptions                                | 21 whole-store vs 64 selector; `App` subscribes to all settings                          | 1, 4  |
| F8  | No UI primitives                                          | 34 raw inputs in Settings; 28 hand-rolled dialogs; `CartPanel` 24 props                  | 5     |
| F9  | Monolithic eager i18n                                     | 1,620 lines, both languages, 19.92 kB gzip preloaded                                     | 6     |
| F10 | PBKDF2 can block the UI                                   | 600 k iterations; ≥1.2 s of forced yields on the fallback path                           | 1     |
| F11 | `@/` configured, unused, and wrong in the portable config | 0 uses vs 204 relative imports                                                           | 0     |
| F12 | Money paths thinnest on tests                             | e2e misses refunds, splits, held orders, shifts                                          | 0     |
