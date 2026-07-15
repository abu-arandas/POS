# QA Test Harness

Automated Playwright suites used for the 2026-07-15 QA review (see [`../QA_REPORT.md`](../QA_REPORT.md))
and the follow-up fixes (see [`../FIXES.md`](../FIXES.md)).

## Layout

- `helpers.mjs` — browser launch, PIN-pad login, dialog capture, PASS/FAIL recorder
- `verify-fixes.mjs` — **post-fix** suite: asserts each fix from `FIXES.md` works
  (hashed PINs, tax lines, immediate dark-mode toggle, single mount, operator
  attribution, delete-sync, register search, margin guard, …). Run against the fixed app.
- `test5-lockscreen.mjs` … `test8b-recovery.mjs` — **pre-fix** suites that captured the
  original findings at commit `0aec2b4`. Their `FINDING:` checks are written to flip: some
  fail while a bug exists (and now pass), some passed while the bug existed (and now fail
  by design). Use `verify-fixes.mjs` to validate the current state.
- `test5-lockscreen.mjs` — auth, wrong-PIN, role-based nav (Admin/Manager/Cashier)
- `test6-register.mjs`, `test6b-clear.mjs` — cart, discount/tax math, card/cash/loyalty checkout, receipts
- `test7d-screens.mjs`, `test7e-screens.mjs`, `test7f-cleanup.mjs` — inventory/customers CRUD, refunds (+manager override), bulk delete, dashboard, QR menu
- `test8-settings-sync.mjs`, `test8b-recovery.mjs` — settings, dark mode, RTL, Supabase config/push/pull/live sync, PIN-lockout demo
- `mock-supabase.mjs` — PostgREST-compatible test double on `127.0.0.1:54321` (used because the QA sandbox blocked egress to `*.supabase.co`; on an open network point the suite at your real project URL and set `SUPABASE_ANON_KEY`)
- `results/` — raw check output per suite + captured sync request log
- `evidence/` — screenshots referenced by the report

## Running

```bash
# from the repo root
npm install && npm run dev            # app on http://localhost:3000

cd qa
npm init -y && npm i playwright express
node mock-supabase.mjs &              # needed for delete-sync (verify-fixes) and test8*

node verify-fixes.mjs                 # post-fix verification (recommended)
# or replay the original findings:
node test5-lockscreen.mjs             # then the others in order
```

Notes:
- `verify-fixes.mjs` uses its own fresh Chromium profile (`./profile-verify`); the original
  suites share `./profile-main`. Delete those folders for a clean run.
- `mock-supabase.mjs` seeds `user_accounts` by parsing `../scripts/seed.mjs`, so it reflects
  the current (hashed-PIN) seeder.
- Suites mutate local (IndexedDB) demo data: they complete sales, refund one, and add/remove QA records.
