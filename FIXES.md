# EA POS — Fixes Applied (QA follow-up)

Follow-up to [`QA_REPORT.md`](QA_REPORT.md). Branch `claude/project-qa-review-testing-ip1gjw`.
All changes typecheck (`tsc --noEmit`) and build (`vite build`) clean, and were verified
in the browser with `qa/verify-fixes.mjs` (20/20 checks green).

## Critical

- **F1 — Public database (RLS off). ADDRESSED (secure schema shipped + verified).**
  `scripts/schema.sql` (and the embedded DDL in `src/lib/supabase.ts`) are now **secure by
  default**: RLS enabled on all tables, access granted only to the `authenticated` role, and
  a `SECURITY DEFINER` `verify_login(name, pin_hash)` RPC that validates the PIN server-side
  and returns only non-secret fields — so PIN hashes are never exposed to clients. A local
  DEMO block (disable RLS) is included but clearly marked unsafe.
  - **Verified on the live project** (real tables untouched): `verify_login` returns the
    admin for the correct hash and nothing for a wrong one; a throwaway probe table proved
    `anon` is fully blocked (0 rows) while `authenticated` reads (1) and the definer RPC
    bypasses RLS for login (1). The `verify_login` function was added to the live DB
    (additive/safe); the real tables' RLS was **not** flipped, because doing so without the
    authenticated client deployed would break the current app's sync.
  - **App hardening:** Pull From Cloud now refuses to overwrite a local table with an empty
    result (`data.x?.length`), so an RLS-blocked or failed pull can no longer wipe the
    catalog or delete every staff account and lock the terminal out.
  - **Cutover (product decision):** to go live, deploy a build that signs the terminal in
    with a Supabase Auth device account (`supabase.auth.signInWithPassword`) before syncing,
    then run the secure `schema.sql`. Until then the live DB stays open by design so the
    current anon-key build keeps working.
- **F2 — Plaintext-PIN lockout. FIXED.**
  - `scripts/seed.mjs` now stores `hashPin(pin)` (SHA-256) instead of plaintext.
  - The embedded DDL in `src/lib/supabase.ts` inserts the hashed default-admin PIN.
  - `pullUserAccounts` re-hashes any non-hash PIN on the way in, so even legacy
    plaintext cloud rows become usable instead of locking the terminal out.
  - The **live cloud project's** three `user_accounts` rows were updated in place from
    plaintext to their SHA-256 hashes (non-destructive; the accounts now log in).

## High

- **F3 — Deletes now sync. FIXED.** Added `deleteRowsSupabase` + `delete*CloudIfEnabled`
  wrappers; product/category/customer deletes now propagate to the cloud (mirroring the
  existing transaction delete), so deletions no longer resurrect on Pull.
- **F4 — Tax itemized. FIXED.** A Tax line now appears in the cart summary, the register
  receipt, the History audit panel, and the printed thermal receipt.
- **F5 — Dark mode. FIXED.** `setDarkMode` toggles the `.dark` class immediately (was
  applied only on reload); the Settings screen got the missing `dark:` styles so panels
  and inputs are readable in dark mode.
- **F6 — Single mount. FIXED.** `App.tsx` renders the active screen once inside a shared
  shell (mobile top bar shown only on small screens). No more duplicate element IDs and
  no more two independent carts across the `lg` breakpoint.
- **F7 — Operator attribution. FIXED.** The logged-in staff member is recorded on each
  sale (`operatorId`/`operatorName`) and shown on all receipts instead of a hardcoded
  "Admin". Kept local-only (not added to the cloud push/pull contract) so sync is
  unaffected.

## Medium / Low

- **F12 — Register search. FIXED.** Added a product search box (name/SKU) to the register.
- **F13 — Card a11y. FIXED.** dnd-kit `attributes`/`listeners` (and their
  `aria-disabled`) are only applied in edit mode, so browsing products is no longer
  announced as a disabled sortable.
- **F11 — Image fallback. FIXED.** Product images fall back to the ☕ glyph on load error
  (matters for offline/Electron terminals with blocked image CDNs).
- **F16 — "DarkMode" typo. FIXED** → "Dark Mode".
- **F17 — Dashboard sync badge. FIXED.** Now shows "LIVE METRICS SYNCED" only when cloud
  sync is enabled and connected; otherwise "LOCAL DATA ONLY".
- **F18 — NaN% margin. FIXED.** Zero-price products show `0%` margin.
- **F20 — Low-stock badge mismatch. FIXED.** The mobile and desktop nav badges now use the
  same definition (in-stock items at/below threshold).

## Admin UIs

- **F9 — User management + printer config. FIXED.** Settings gained a **Users** tab (list,
  add, edit, delete staff; role + active toggle; PINs hashed via `hashPin`, so a new user
  can log in immediately — verified end-to-end) and a **Printer** tab exposing every
  `PrinterConfig` field. User CRUD syncs to the cloud (add/update via `syncToCloudIfEnabled`,
  delete via `deleteUsersCloudIfEnabled`). Guards prevent deleting the signed-in account or
  the last active admin, and reject non-4-digit PINs.

## Data integrity & security follow-ups

- **F8 — Transaction ID collisions. FIXED.** Receipt IDs are now `TX-<8 hex>` from
  `crypto.randomUUID()` instead of `TX-{max+1}`, so two terminals sharing one cloud no
  longer mint the same ID and upsert-clobber each other's sales.
- **F14 — $0.00 "card" sale. FIXED.** A sale fully covered by loyalty points is recorded
  with payment method `loyalty` (added to the type + History icon) instead of a misleading
  $0 card charge.
- **F15 — Default PINs on the lockscreen. FIXED.** The hint is wrapped in
  `import.meta.env.DEV`, so it shows during development but is dead-code-eliminated from
  production bundles (verified: the string is absent from `dist/`).

## Performance & polish

- **F10 — Collision-safe entity IDs. FIXED.** Products/customers/categories/users now use
  `crypto.randomUUID()`-based suffixes instead of 2–4 digit random numbers.
- **F19 — Low-stock badge contrast. FIXED.** The "Only X left" tile badge is now solid
  amber with dark text (no shimmer/opacity wash) for readability.
- **F21 — Bundle code-split. FIXED.** Non-default screens are `React.lazy`-loaded and large
  vendors (`recharts` via the Dashboard chunk, plus `motion`/`supabase`/`i18n`/`dnd`) are
  split out — the entry chunk dropped from **751 kB → 332 kB** and the >500 kB build
  warning is gone.

## Deferred (need a product decision — not changed)

- **F1 live-RLS cutover** (needs the auth-enabled client deployed first — see F1 above).

## Verification

`qa/verify-fixes.mjs` drives the running app and asserts each fix (tax lines, immediate
dark-mode toggle, single mount, operator attribution, delete-sync via the mock cloud,
search, margin guard, etc.). The original `qa/test5–8` suites document the pre-fix
findings at commit `0aec2b4`; some of their `FINDING:` checks intentionally invert once
the corresponding bug is fixed.
