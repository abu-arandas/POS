# QA Test Harness

Automated Playwright suites used for the 2026-07-15 QA review (see [`../QA_REPORT.md`](../QA_REPORT.md)).

## Layout

- `helpers.mjs` — browser launch, PIN-pad login, dialog capture, PASS/FAIL recorder
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
node mock-supabase.mjs &              # only needed for test8*
node test5-lockscreen.mjs             # then the others in order
```

Notes:
- Suites share a persistent Chromium profile (`./profile-main`) so login state carries across suites; delete that folder for a fresh run.
- Checks labeled `FINDING:` are intentional bug detectors — they FAIL while the corresponding defect exists and PASS once fixed.
- Suites mutate local (IndexedDB) demo data: they complete sales, refund one, and add/remove QA records.
