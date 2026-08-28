# EA POS (Point of Sale) 🏬

A modern, high-performance, cross-platform Point of Sale (POS) system built with **React 19**, **Vite**, **Tailwind CSS v4**, and packaged as a standalone Windows desktop application using **Electron**.

![EA POS Screenshot](https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&q=80&w=1200)

## ✨ Features

- **Premium UI/UX:** Built with Tailwind CSS v4, featuring glassmorphism, micro-animations, and a highly polished dark/light mode integration.
- **Full RTL & Arabic Support:** Built-in i18n localization. Seamlessly switch between English (LTR) and Arabic (RTL) across the entire application interface.
- **Register & Cart Management:** Smooth product checkout, cart updates, and manual/percentage/fixed discounts.
- **Barcode Scanning:** Hardware keyboard-wedge scanners add products by SKU straight into the cart.
- **Parked Orders:** Hold an in-progress cart (with its customer and discount) and resume it later.
- **Split Payments:** Settle one sale across multiple tenders (cash + card + mobile + gift) with live change.
- **Partial & Line-Item Refunds:** Return specific items/quantities; tax and loyalty points are prorated automatically, with a manager override for cashiers.
- **Shifts & Cash Drawer:** Open/close register shifts with a starting float and a reconciled Z-report (expected vs. counted cash).
- **Receipts, Your Way:** On-screen thermal receipts, **real ESC/POS printing** (Web Serial or a network TCP printer), plus **digital delivery** (share / email).
- **Drag & Drop Customization:** Rearrange products on the register screen using an intuitive drag-and-drop edit mode.
- **QR Menu Generator:** Automatically generate and print digital QR codes so customers can browse your menu on their phones.
- **Customer Loyalty System:** Link customers to transactions to award or deduct loyalty points directly at checkout.
- **Analytics Dashboard:** Date-range KPIs (today / 7d / 30d / all), revenue & profit trend, best-sellers, category and payment breakdowns, and a per-operator sales report — all exportable to CSV.
- **Inventory Depth:** Suppliers, a lightweight "receive stock" purchase-order flow, and a full stock-adjustment audit log.
- **Live Multi-Terminal Sync:** Optional Supabase cloud sync with realtime subscriptions, so a second register's changes appear automatically; cloud PIN login keeps staff accounts consistent across terminals.
- **Cross-Platform & Standalone:** Runs perfectly in the browser (via Vite) or as a native downloadable `.exe` via Electron without the standard browser toolbars.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) **v22.22.2 or newer** (the current locked
  dependency graph requires Node 22.22.2 or a newer supported major; CI builds on
  Node 22)
- `npm`

### Installation

1. Clone or download the repository.
2. Install the dependencies:
   ```bash
   npm install
   ```
   _Note for Windows users:_ If `npm install` fails due to local system security restrictions, run:
   ```powershell
   powershell -ExecutionPolicy Bypass -Command "npm install"
   ```

### Running Locally (Web)

To run the application in a standard web browser during development:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

### Running Locally (Electron Desktop App)

To run the application natively in an Electron desktop window during development:

```bash
npm run electron:dev
```

_Note: This will automatically spin up the Vite development server in the background and attach it to the Electron window._

## 📦 Building the Application

### Build for Windows (.exe)

You can package the application into a standalone Windows installer using `electron-builder`. This process compiles the React code and bundles it inside an optimized Chromium wrapper.

```bash
npm run electron:build
```

**Output Locations:**
Once completed successfully, your executables will be located in the `release/` folder inside the workspace:

- **Installer:** `release/EA-POS-Setup-1.0.0.exe` (Distribute this to install on Windows machines)
- **Standalone App:** `release/win-unpacked/EA POS.exe` (Portable version, run directly without installing)

_Troubleshooting: If you get an `EPERM` error during the build, ensure you do not have any File Explorer windows or terminals open inside the `release` folder, as Windows locks files while being viewed._

> **Code signing.** Without a certificate the installer is unsigned, which costs
> you three things: Chrome and Edge block or flag the download, Windows
> SmartScreen warns on first run, and the auto-updater refuses to install updates
> unattended (it stages them for an operator instead). Signing is the only fix —
> no build setting suppresses those warnings. Note that a `.pfx` file is no
> longer something a public CA will issue you; see
> [docs/windows-install.md](docs/windows-install.md) for the two paths that do
> work, and for how to verify a download in the meantime.

### Build for Web

If you only want to generate static web files for hosting on Vercel, Netlify, or an Nginx server:

```bash
npm run build
```

The static files will be located in the `dist/` directory.

> **Serve over HTTPS (or localhost).** The app prefers the browser's WebCrypto
> APIs, which only exist in secure contexts. Pure-JS fallbacks keep login and
> checkout working on a plain-`http://` LAN deploy, but HTTPS is still the
> recommended setup for anything beyond a trusted local network.

## 🔐 Staff Accounts

Production builds do not seed public staff credentials. On a new terminal, the
lock screen requires the operator to create the first administrator account and
choose a four-digit PIN before the application can be opened. Additional staff
accounts can then be created in **Settings → Users**.

Development builds retain three clearly marked demo accounts for local testing:
Admin (`1234`), Manager (`5555`), and Cashier (`0000`). Never reuse those PINs
for real operations.

PINs are stored as a versioned `PBKDF2-SHA-256` record with 600,000 iterations
and an account-bound salt. Existing legacy account hashes are accepted once and
upgraded automatically after a successful local sign-in. The PIN is still a
four-digit convenience credential, so keep RLS enabled, protect the device
account, and never reuse a terminal PIN as a password elsewhere.

> The development PINs above are fixtures only. Production terminals do not
> contain any shipped account and must be provisioned through the first-run
> administrator setup screen.

### Brute-force protection

A 4-digit PIN is only 10,000 combinations, so both PIN surfaces are throttled:
five wrong attempts, then an escalating cool-off (30s → 1m → 2m → 5m → 15m). A
streak is forgotten after 30 minutes of quiet, so an honest typo today doesn't
count against tomorrow.

- **On the terminal** — the lock screen and the manager-override prompt in the
  refund flow (`src/lib/pinThrottle.ts`). Counters persist to IndexedDB, so
  reloading the page doesn't reset the lockout.
- **In the cloud** — the `verify_login` RPC is callable by anyone holding the
  public anon key, so it applies the same ladder server-side and refuses to check
  the PIN at all while an account is locked out.

## ☁️ Cloud Sync (Supabase, optional)

The app runs fully offline by default (IndexedDB). To sync terminals through
[Supabase](https://supabase.com):

1. Create a Supabase project and run `scripts/schema.sql` in the SQL Editor
   (Dashboard → SQL Editor). The schema is **secure by default**: Row Level
   Security is enabled, so the public anon key alone cannot read or write.
2. Create a Supabase Auth "device" user (Authentication → Users) for the
   terminal to sign in with.
3. In the app, open **Settings → Supabase Sync**, enter the Project URL, anon
   key, and the device account's email/password, then **Test Connection**.
4. Optionally seed demo data first: copy `.env.example` to `.env`, fill in
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (the anon key cannot insert
   once RLS is on), and run `node scripts/seed.mjs`.

Upgrading an existing database? Re-run `scripts/schema.sql` — the whole script
is idempotent (policies are dropped before being recreated, and each table is
added to the `supabase_realtime` publication independently). It adds the newer
transaction columns (operator, points earned, refund authorizer, split payments,
partial refunds, shift id) and enables live sync, without touching existing data.

### Multi-store / super-admin (optional)

See [docs/super-admin-plan.md](docs/super-admin-plan.md) for the full design.

For a fleet of locations, run `scripts/multi-store-schema.sql` after
`scripts/schema.sql`. It adds the `stores` and `memberships` tables, stamps a
`store_id` on every synced row (backfilled to a single `store-default` store),
and creates the fleet RPCs. Single-store terminals are unaffected — the store
dimension stays advisory until you opt in.

To make it **enforced** — so the database, not the client, decides which store a
terminal can touch — run `scripts/multi-store-rls-enforce.sql`. Read its header
first: every row needs a non-null `store_id`, every terminal needs its Store ID
set in Settings, and every device account needs a membership row, or you will
lock terminals out of their own data. That script also drops the permissive
"staff full access" policies from `schema.sql`; without that they would `OR`
with the store-scoped policies and leave cross-store access wide open. Re-running
`schema.sql` later is safe — it detects the enforced setup and skips recreating
those blanket policies.

## 🧪 Tests

```bash
npm test
```

Unit tests (Vitest) cover the pricing engine, the HTML-escaping used for
printed receipts and the QR menu, the PBKDF2/SHA-256 authentication fallbacks,
cloud-sync failure modes, printer cleanup, and the major checkout and inventory
workflows.

They also cover the Electron main process's pure modules — IPC payload
validation, the auto-update policy, the Windows code-signing configuration, and
the LAN address selection behind the QR menu. Those live in their own `.cjs`
files precisely so they can be tested: CI otherwise only reaches `main.cjs`
through `node --check`, which is a parse and nothing more, and that gap is how a
`\d` typo once shipped that silently disabled the QR menu, network printing and
printer discovery in packaged builds.

End-to-end tests (Playwright) drive the real app in a browser — PIN login,
adding to the cart, card and cash checkout (with change), and role-based
navigation — to guard the critical checkout path:

```bash
npx playwright install   # one-time, downloads Chromium, Firefox and WebKit
npm run test:e2e
```

`npm run test:e2e` runs the suite against all three browsers, because
`playwright.config.ts` defines a project for each. Installing only Chromium
leaves the Firefox and WebKit projects failing with `Executable doesn't exist`,
which reads like a broken test rather than a missing browser. To iterate quickly
against one browser instead:

```bash
npm run test:e2e -- --project=chromium
```

The Playwright config boots the Vite dev server automatically; both suites run
in CI on every push and pull request.

## 🛠️ Tech Stack

- **Framework:** React 19 + Vite
- **Styling:** Tailwind CSS v4
- **State Management:** Zustand
- **Drag and Drop:** @dnd-kit
- **Localization:** i18next & react-i18next
- **Animations:** Motion (Framer Motion)
- **Icons:** Lucide React
- **Desktop Packaging:** Electron & electron-builder
- **Charting:** Recharts

## 📄 License

This project is for demonstration purposes. Use, modify, and distribute freely.
