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

- [Node.js](https://nodejs.org/) (v18+ recommended)
- `npm`

### Installation

1. Clone or download the repository.
2. Install the dependencies:
   ```bash
   npm install
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

- **Installer:** `release/EA POS Setup 1.0.0.exe` (Distribute this to install on Windows machines)
- **Standalone App:** `release/win-unpacked/EA POS.exe` (Portable version, run directly without installing)

_Troubleshooting: If you get an `EPERM` error during the build, ensure you do not have any File Explorer windows or terminals open inside the `release` folder, as Windows locks files while being viewed._

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

## 🔐 Default Logins

A fresh install seeds three staff accounts — **change these PINs immediately**
(Settings → Users) before using the app with real data, since they are public
in this repository:

| Account | Role    | PIN    |
| ------- | ------- | ------ |
| Admin   | admin   | `1234` |
| Manager | manager | `5555` |
| Cashier | cashier | `0000` |

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

Upgrading an existing database? Re-run `scripts/schema.sql` — its idempotent
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` block adds the newer transaction
columns (operator, points earned, refund authorizer, split payments, partial
refunds, shift id) and the `supabase_realtime` publication for live sync,
without touching existing data.

## 🧪 Tests

```bash
npm test
```

Unit tests (Vitest) cover the pricing engine, the HTML-escaping used for
printed receipts and the QR menu, and the SHA-256 fallback used on insecure
origins.

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
