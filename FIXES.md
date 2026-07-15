# EA POS — Fixes Applied (QA follow-up)

Follow-up to [`QA_REPORT.md`](QA_REPORT.md). Branch `claude/project-qa-review-testing-ip1gjw`.
All changes typecheck (`tsc --noEmit`) and build (`vite build`) clean, and were verified
in the browser with `qa/verify-fixes.mjs` (20/20 checks green).

## Critical

- **F1 — Public database (RLS off).** Left as a deployment decision (enabling RLS without
  policies would break the anon-key app), but hardened around it: see F2. The canonical
  `scripts/schema.sql` already documents the secure path (Supabase Auth + RLS policies).
  The live project still needs RLS + auth before any real deployment.
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

## Deferred (need a product decision — not changed)

- **F8** transaction IDs (`TX-{max+1}`) can collide across terminals sharing one cloud →
  needs a UUID/per-terminal scheme (changes the user-facing receipt number).
- **F9** no user-management or printer-config UI (the store actions/types exist but are
  unused).
- **F10** short random entity IDs; **F14** loyalty can produce a $0.00 "card" sale;
  **F15** default PINs printed on the lockscreen (demo only); **F19** low-stock tile badge
  contrast; **F21** single 1.27 MB JS chunk (code-split).

## Verification

`qa/verify-fixes.mjs` drives the running app and asserts each fix (tax lines, immediate
dark-mode toggle, single mount, operator attribution, delete-sync via the mock cloud,
search, margin guard, etc.). The original `qa/test5–8` suites document the pre-fix
findings at commit `0aec2b4`; some of their `FINDING:` checks intentionally invert once
the corresponding bug is fixed.
