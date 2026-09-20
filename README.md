# EA POS

A point-of-sale system for a shop or a small restaurant. It runs in a browser and ships as a
standalone Windows desktop application.

Built with React 19, Vite, Tailwind CSS v4, Zustand and Electron. It works **offline first** —
every sale is committed locally before anything touches the network — with optional Supabase
sync when you want several terminals to agree.

---

## Contents

- [What it does](#what-it-does)
- [Getting started](#getting-started)
- [Building](#building)
- [Staff accounts and PINs](#staff-accounts-and-pins)
- [Cloud sync (optional)](#cloud-sync-optional)
- [Open tabs](#open-tabs)
- [Multi-store fleets](#multi-store-fleets)
- [Printing](#printing)
- [How the code is arranged](#how-the-code-is-arranged)
- [Invariants to keep](#invariants-to-keep)
- [Scripts](#scripts)
- [License](#license)

---

## What it does

**Selling**

- Register with cart, per-line and whole-sale discounts (percentage, fixed, loyalty points)
- Barcode scanning through a keyboard-wedge scanner, straight to a product or a variant
- Product variants — Size × Colour, Size × Flavour — where each combination is its own SKU,
  price and stock, and the product's stock is the sum of its variants'
- Item modifiers with required / multi-select rules and price deltas; two of the same product
  with different modifiers stay two cart lines
- Split payments across cash, card, mobile and gift, with live change
- Parked orders — hold a cart with its customer and discount, resume it later
- Open tabs — a table or a regular orders across several rounds and settles once at the end.
  Each round is kept separately (the kitchen has already been given it), and the bill merges
  them for display and settlement
- Partial and line-item refunds, with tax and loyalty points prorated, behind a manager override

**Running the shop**

- Shifts with an opening float and a reconciled Z-report (expected vs. counted cash)
- Petty cash pay-ins and pay-outs, carried into the Z-report
- Inventory with suppliers, a receive-stock purchase-order flow, and a stock-adjustment audit log
- Customer book with loyalty points awarded and redeemed at checkout
- Analytics: date-range KPIs, revenue and profit trend, best-sellers, category and payment
  breakdowns, per-operator sales — all exportable to CSV

**Restaurant**

- Kitchen display — sales raise live tickets routed to the station their category belongs to,
  with elapsed timers, item ticking, a bump ladder and a recall buffer. Tickets are only raised
  when kitchen stations are configured, so a retail counter raises none.
- Table management — a floor plan with occupied / bill-requested / reserved states, and
  "open this table on the register". Settling a table's tab releases the table.
- QR menu — generates and prints a QR code that serves the menu to a customer's phone over the LAN

**Terminal**

- English and Arabic throughout, including full RTL layout mirroring
- Customer-facing display — a second window mirroring the sale on the counter's other screen,
  driven over a `BroadcastChannel`, so it needs no network and no second install.
  Open it from **Settings → Profile → Customer-facing display**.
- Real ESC/POS receipt printing over Web Serial, a network TCP printer, or the Windows spooler;
  plus on-screen receipts and digital delivery by share or email
- Optional live sync across terminals with realtime subscriptions

---

## Getting started

**Prerequisites:** [Node.js](https://nodejs.org/) v22.22.2 or newer, and `npm`.

```bash
npm install
npm run dev
```

The app is then at `http://localhost:3000`.

To run it in a native Electron window instead — this starts Vite in the background and attaches
to it:

```bash
npm run electron:dev
```

> **Windows:** if `npm install` fails on local execution-policy restrictions, run
> `powershell -ExecutionPolicy Bypass -Command "npm install"`.

Development builds seed a demo catalogue and three clearly marked demo accounts. Production
builds seed neither.

---

## Building

### Web

```bash
npm run build     # static files in dist/
npm run perf:check   # asserts the bundle budget
```

`npm run portable` produces a single self-contained `portable/index.html` instead.

> **Serve over HTTPS, or over localhost.** The app prefers the browser's WebCrypto APIs, which
> only exist in a secure context. Pure-JS fallbacks keep login and checkout working on a plain
> `http://` LAN deployment, but HTTPS is the right setup for anything beyond a trusted local
> network.

### Windows desktop

```bash
npm run electron:build
```

- **Installer:** `release/EA-POS-Setup-<version>.exe`, versioned from `package.json`
- **Unpacked:** `release/win-unpacked/EA POS.exe`, runs without installing

If the build fails with `EPERM`, close any Explorer window or terminal sitting inside `release/` —
Windows locks files while they are being viewed.

#### Code signing

Without a certificate the installer is unsigned, and three things follow: browsers flag the
download, SmartScreen warns on first run, and the auto-updater will not install updates
unattended — it stages them for an operator instead. No build setting suppresses any of that.
Signing is the only fix.

A `.pfx` file is no longer something a public CA will issue; since June 2023 the CA/Browser
Forum requires code-signing keys to live on certified hardware. Two paths work, and the build
picks whichever the environment configures:

- **Azure Trusted Signing** — set `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`,
  `AZURE_CODE_SIGNING_ENDPOINT`, `AZURE_CODE_SIGNING_ACCOUNT_NAME`, `AZURE_CERT_PROFILE_NAME`
  and `WINDOWS_PUBLISHER_NAME`. No certificate file to hold.
- **An existing exportable certificate** — set `CSC_LINK` and `CSC_KEY_PASSWORD`.
  `WINDOWS_PUBLISHER_NAME` is optional here, because signtool reads the publisher off the
  certificate subject, which Azure cannot do.

Setting only part of either group **fails the build** rather than quietly producing an unsigned
installer. That logic is in `electron/windowsSigning.cjs`, and the Windows workflow resolves the
signing mode through the same module the build uses, so CI can never disagree with
electron-builder about whether a build is signed.

Until a release is signed, verify a download by hand: the workflow publishes `SHA256SUMS.txt`
beside the installer, so compare it against
`Get-FileHash .\EA-POS-Setup-<version>.exe -Algorithm SHA256`.

---

## Staff accounts and PINs

On a new terminal the lock screen requires the operator to create the first administrator
account and choose a four-digit PIN before the app will open. Further accounts are created in
**Settings → Users**. No production build ships an account.

Development builds keep three demo accounts for local testing — Admin `1234`, Manager `5555`,
Cashier `0000`. They are fixtures. Never reuse them for real operations.

PINs are stored as a versioned PBKDF2-SHA-256 record: 600,000 iterations, account-bound salt.
Legacy hashes are accepted once and upgraded after a successful local sign-in. A four-digit PIN
is a convenience credential, not a password — keep RLS on, protect the device account, and never
reuse a terminal PIN elsewhere.

### Brute-force protection

Four digits is 10,000 combinations, so both PIN surfaces are throttled: five wrong attempts, then
an escalating cool-off (30s → 1m → 2m → 5m → 15m). A streak is forgotten after 30 minutes of
quiet, so an honest typo today does not count against tomorrow.

- **On the terminal** — the lock screen and the manager-override prompt in the refund flow
  (`src/lib/pinThrottle.ts`). Counters persist to IndexedDB, so reloading does not clear a lockout.
- **In the cloud** — the `verify_login` RPC is callable by anyone holding the public anon key, so
  it applies the same ladder server-side and refuses to check the PIN at all while an account is
  locked out. Failures are counted per **caller and account**, not per account alone: staff names
  are visible on the lock screen, so a caller hammering one locks out only themselves while the
  shop's own terminal keeps signing in. A second, far more tolerant per-account counter
  (50 failures, 15-minute cool-off, cleared by any success) backstops guessing spread across
  many callers.

  The caller is derived from the headers PostgREST forwards, which is the only caller identity
  Postgres gets behind Supabase's pooler. It never authorizes anything — it only decides whose
  failures count against whose throttle — so spoofing it merely moves an attacker to a different
  bucket. A store under sustained abuse wants a real rate limit in front of Postgres (Supabase
  gateway limits, or an Edge Function around this RPC). Cloud login is a fallback in any case:
  PIN login keeps working offline against the locally persisted staff list.

---

## Cloud sync (optional)

The app runs fully offline by default on IndexedDB, with sync **off and unconfigured** — no URL,
no key and no device credentials ship in a build.

To sync terminals through [Supabase](https://supabase.com):

1. Create a project and run `src/db/schema.sql` in the SQL Editor. The schema is secure by
   default: Row Level Security is on, so the public anon key alone can neither read nor write.
2. Create a Supabase Auth "device" user for the terminal to sign in as.
3. In the app, open **Settings → Supabase Sync**, enter the project URL, anon key and the device
   account's email and password, then **Test Connection**.
4. Optionally seed demo data: copy `.env.example` to `.env`, set `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` (the anon key cannot insert once RLS is on), then run
   `node src/db/seed.mjs`.

### What linking does to local data

A terminal trades offline, so it always has a local database — a catalogue, a customer book,
sales rung up before the cloud existed. The first time it is linked to a Supabase project, that
database is **merged into the cloud and then replaced by the result**: anything queued is drained,
the whole local dataset is uploaded, and the merged copy is read back and adopted. From then on the
terminal holds what the cloud holds rather than a second database beside it.

The order is the point. The upload happens first, so the copy that replaces local data already
contains it — an offline sale, a product priced this morning, a customer signed up at the counter.
If the upload is refused, nothing local is touched and the merge is retried on the next link.

It runs **once per project**, recorded against the project URL (`cloudAdoptedFor`). Re-running it
on every boot would push this terminal's copy of a row back over a deletion made on another one.
Changing the Store ID does not re-run it either: that points the terminal at a different store
inside the same project, and re-uploading there would stamp this store's catalogue with the other
store's id. Ongoing convergence is realtime sync's job and the outbox's; **Push All to Cloud** and
**Pull From Cloud** remain available for doing either half by hand, and _Reset to defaults_ clears
the marker so the next link merges afresh.

Upgrading an existing database? Re-run `src/db/schema.sql`. The whole script is idempotent —
policies are dropped before being recreated, and each table joins the `supabase_realtime`
publication independently.

**Then run `src/db/verify-policies.sql`.** It changes nothing and asserts that the server actually
enforces what the scripts intend: that staff PIN hashes are unreadable by any client role, that
the anon key reaches no application data, that RLS is on everywhere, and — on a fleet — that no
blanket policy survived to `OR` its way past the store-scoped ones. Reading the scripts is not the
same as checking the database; grants and policies accumulate across versions, hand-run statements
and half-applied migrations.

> **Never commit credentials.** `DEFAULT_SUPABASE` in `src/stores/settingsStore.ts` is blank and
> sync is off by default, and it must stay that way. A build that carries a device password ships
> it to everyone holding the installer — the value lands in the renderer bundle — and keeping it
> out of IndexedDB via `partialize()` buys nothing if the bundle carries it. The seeding script
> reads `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_DEVICE_EMAIL` and
> `SUPABASE_DEVICE_PASSWORD` from the environment for the same reason.

### Offline writes and the outbox

Sales commit locally first and push afterwards, so the register keeps trading with the internet
down. Every cloud write is recorded in a durable IndexedDB outbox **before** it is attempted and
removed only once the server accepts it, then replayed in submission order — on reconnect, and on
a slow timer for the outages a browser never reports. Every queued operation is an upsert by
primary key or a delete by id, so replaying one twice is the same as replaying it once.

That is what offline-first has to mean for money: a failed push is a delay, not a lost sale.

**"Pull From Cloud" replaces local data with the server's copy.** So it drains the outbox first
and, if anything is still owed, says how many changes would be discarded before asking you to
confirm. It also means any field a mapper forgets is that field _deleted_ on every terminal —
adding a column to a synced type means touching the SQL, the row mapper, the pull mapper and the
catalog-push RPC in the same change.

---

## Open tabs

A tab is an account that stays open across several rounds and is settled once. Open one from the
cart (**Open tabs → Open a tab with N items**), add later rounds to it the same way, and settle it
when the table asks for the bill.

Three decisions are worth knowing about, because each has a consequence:

**Rounds are stored separately.** Merging them on arrival would be simpler and would destroy the
only record of what has already gone to the kitchen — so a second round can fire a ticket for the
second round alone rather than cooking the first one twice. The bill merges them for display, and
a line whose price changed between rounds deliberately stays separate rather than being averaged.

**Stock moves at settlement, not as rounds are added.** An open tab reserves nothing, which is the
same rule parked orders already follow. For a café that is right — the coffee is made and gone. For
a shop holding goods back it is a real limitation rather than an oversight: reserving stock across
an open tab needs a reservation that survives a crash and is released when a tab is discarded.

**A tab lives on the terminal it was opened on.** Like held orders and shifts, tabs are not
cloud-synced: nothing has been sold, no stock has moved and no money has changed hands, so
replicating one would put an in-progress bar tab on every till in the fleet and let a realtime pull
replace a round taken thirty seconds ago. The committed record is the _sale_ the tab settles into,
and that syncs like any other. Opening a tab at the bar and settling it at the till would need tabs
to be a synced entity with a merge story — two terminals adding a round at once is a merge, not a
last-write-wins upsert.

Settlement goes through `commitSale` unchanged, so stock validation, loyalty points, the KDS
ticket, the transaction record and the cloud push behave exactly as they do for a walk-in sale. The
tab is marked settled only _after_ the sale commits — a refused sale leaves the tab open, with the
bill intact.

---

## Multi-store fleets

Run `src/db/multi-store-schema.sql` after `schema.sql`. It adds `stores` and `memberships`, stamps
a `store_id` on every synced row (backfilled to a single `store-default`), and creates the fleet
RPCs. Single-store terminals are unaffected — the store dimension stays advisory until you opt in.

To make it **enforced**, so the database rather than the client decides which store a terminal can
touch, run `src/db/multi-store-rls-enforce.sql`. Read its header first: every row needs a non-null
`store_id`, every terminal needs its Store ID set in Settings, and every device account needs a
membership row — otherwise you will lock terminals out of their own data.

That script also drops the permissive "staff full access" policies from `schema.sql`; without that
they would `OR` with the store-scoped policies and leave cross-store access wide open. Re-running
`schema.sql` afterwards is safe: the enforcement script records the mode in a `pos_schema_state`
row that `schema.sql` reads, so it knows not to recreate those blanket policies.

---

## Printing

Receipts are built once as a backend-neutral `DocRow[]` model (`src/lib/printing/receiptDoc.ts`)
and then rendered three ways — ESC/POS text, a canvas raster, and HTML for the on-screen and
browser-print paths. The renderers may differ in _how_ they draw a block; they must not differ in
_whether_ they draw it.

Non-ASCII text forces the raster path, because the text path emits codepage bytes and cannot
render Arabic. A logo also forces it, since the text path has no image command at all.

Transports: Web Serial, a network TCP printer on port 9100, and the Windows spooler. The Windows
raw path is a small C# shim compiled at runtime by PowerShell, handed over as `-EncodedCommand`
rather than written to disk.

---

## How the code is arranged

```
src/
├── components/     screens, plus register/ inventory/ settings/ history/ shared/
├── stores/         Zustand stores, persisted to IndexedDB
├── services/       cross-store operations (sales, refunds)
├── lib/            pure logic — no DOM, no side effects
│   ├── printing/   receipt model, renderers, transports
│   ├── supabase/   per-table push and pull mappers
│   └── utils/      ids, dates, formatting, validation, DOM helpers
├── locales/{en,ar} 24 translation namespaces each
├── db/             SQL schema, RLS, fleet migration, verifier, seeder
├── data/           demo catalogue (development builds only)
└── build/          bundle-budget guard
electron/           main, preload, and four pure decision modules
```

The shape of it is one rule: **pure logic in `src/lib`, side effects at the edges.** Anything in
`lib/` is DOM-free and deterministic, which is what makes the money arithmetic — pricing, refund
proration, shift reconciliation — readable in isolation. Services own writes that span more than
one store; a service never raises a toast and never prints. Components decide presentation, and
nothing else.

State persists to IndexedDB through `src/lib/idbStorage.ts`, not localStorage, because a
terminal's catalogue and history outgrow the 5 MB localStorage quota.

---

## Invariants to keep

These were enforced by an automated suite that has since been removed. They still hold, and
nothing will now tell you when one breaks — so they are listed here rather than lost.

1. **Every `t('a.b')` resolves in English, has an Arabic counterpart, and is reachable.** A
   missing key does not fail loudly; i18next renders the key itself, so the UI shows
   `lockscreen.selectUser` where a sentence belongs. Never paper over this with an inline
   `t('key', 'Default')` fallback — that makes English look right while Arabic silently renders
   English.
2. **Every CSS class `index.css` defines is named somewhere reachable.** Dead classes accumulate
   fast, and a reader cannot tell which of two similar-looking classes the app actually uses.
3. **Adding a screen means four files.** The type system checks one of them. A screen missing from
   `NAV_ITEMS` is simply unreachable on desktop; one missing a switch case falls through to a
   routing error. Both are well-typed.
4. **A persisted Zustand store must name its storage.** Omit it and Zustand silently falls back to
   localStorage — a different, smaller, origin-shared quota. Use `idbStorage` and a `pos-*-storage`
   key.
5. **The SQL grants must never expose a PIN hash.** `pin` belongs in INSERT/UPDATE grants, because
   a PIN set on one terminal has to reach the others, but never in a SELECT grant.
6. **Adding a field to a synced type means touching every mapper.** A pull replaces local data, so
   a field the mapper drops is that field deleted everywhere.
7. **A calendar day is a local day.** `new Date().toISOString().slice(0, 10)` names the _UTC_ day:
   at UTC+3 it files the first hours of every night under yesterday. Use `localDateKey()` from
   `src/lib/utils/dates.ts`.
8. **Production code under `src/` carries zero `any`.**

Before opening a pull request:

```bash
npm run lint && npm run format:check && npm test && npm run build && npm run perf:check
```

CI runs exactly that on every pull request (the `verify` job), and a release
will not publish unless it passes.

### Tests

`npm test` runs Vitest over the pure modules — the money (`pricing`, `checkout`,
`refunds`, `payments`, `shiftReport`, `dashboardMetrics`), the catalogue
(`variants`), the lock-screen throttle (`pinThrottle`), the receipt renderers,
and the four dependency-free Electron modules (`validation`, `updatePolicy`,
`menuServer`, `windowsSigning`). `npm run test:watch` re-runs on save.

There is no DOM environment and no component rendering, deliberately. The split
this project already keeps — arithmetic in `src/lib/`, pixels in
`src/components/` — is what lets the suite finish in about two seconds, and a
module that needs a DOM to be tested is a module whose layout and arithmetic
have grown together.

Electron modules are CommonJS, so their tests sit beside them as `.mjs` (Vitest
cannot be `require`d) and are excluded from the packaged installer.

---

## Scripts

| Script                    | Does                                                 |
| ------------------------- | ---------------------------------------------------- |
| `dev`                     | Vite dev server on port 3000                         |
| `build`                   | Production build to `dist/`                          |
| `preview`                 | Serve the built output                               |
| `portable`                | Single-file build to `portable/index.html`           |
| `lint`                    | `tsc --noEmit && eslint .`                           |
| `test` / `test:watch`     | Vitest over the pure modules                         |
| `format` / `format:check` | Prettier                                             |
| `perf:check`              | Assert the initial JS and CSS gzip budgets           |
| `electron:dev`            | Vite + Electron together                             |
| `electron:build`          | Build the renderer and package the Windows installer |
| `clean`                   | Remove `dist/`                                       |

Bundle budgets: 200,000 gzip bytes of initial JavaScript, 50,000 of initial CSS. A failure should
prompt a fresh look at what entered the entry chunk, not a raised limit.

---

## Tech stack

React 19 · Vite 6 · TypeScript 5.8 (strict) · Tailwind CSS v4 · Zustand 5 · i18next ·
Motion · Recharts · @dnd-kit · Lucide · Supabase JS · Electron 43 · electron-builder

---

## License

This project is for demonstration purposes. Use, modify and distribute freely.
