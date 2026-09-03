# Performance and Quality Ledger

This ledger records the Phase 4 baseline and the guards that should be run before merging changes that affect the application shell or large screens. Measurements are taken from the local Ubuntu sandbox with the repository’s locked dependencies and should be compared using the same commands and conditions.

## Phase 4 baseline

| Signal                  |                                            Baseline | Command or source                      |
| ----------------------- | --------------------------------------------------: | -------------------------------------- |
| Unit test files         |                                          69 passing | `npm test`                             |
| Unit tests              |                                         664 passing | `npm test`                             |
| TypeScript and ESLint   | Passing; zero ESLint warnings after Phase 4 cleanup | `npm run lint`                         |
| Formatting              |                                             Passing | `npm run format:check`                 |
| Production build        |                                 6–7 seconds locally | `npm run build`                        |
| Initial JavaScript      |              436,340 raw bytes / 136,540 gzip bytes | `npm run build` + `npm run perf:check` |
| Initial CSS             |               113,788 raw bytes / 17,511 gzip bytes | `npm run build` + `npm run perf:check` |
| Instrumented statements |                                              59.07% | `npm run test:coverage`                |
| Instrumented branches   |                                              50.01% | `npm run test:coverage`                |
| Instrumented functions  |                                              50.80% | `npm run test:coverage`                |
| Instrumented lines      |                                              60.60% | `npm run test:coverage`                |

The initial JavaScript figure grew by 712 gzip bytes against the earlier
433,690/135,819 baseline. That is the services layer (`src/services/`) plus the
receipt logo path, and it buys a store logo that actually prints on a thermal
printer and a set of money operations callable without a DOM. It leaves 63,460
gzip bytes of headroom against the 200,000 budget.

Coverage is recorded as a baseline rather than raised to an artificial threshold in this phase because the current suite includes broad component coverage but also many hardware, cloud, and administrative branches that are intentionally integration-oriented. New business-logic hooks must still receive focused tests, and the full suite must remain green.

## Enforced initial bundle budgets

The `scripts/check-bundle-budget.mjs` guard measures the hashed Vite entry assets after a production build. The current budgets are:

| Artifact                 | Maximum gzip size |
| ------------------------ | ----------------: |
| Initial JavaScript entry |     200,000 bytes |
| Initial CSS entry        |      50,000 bytes |

The guard runs locally with `npm run perf:check` and in `.github/workflows/ci.yml` immediately after the production build. A budget failure should trigger a fresh bundle analysis rather than an arbitrary limit increase.

## Accessibility guard

`test/a11y/formLabels.test.tsx` checks the accessible-name algorithm for the initial screen states and for controls revealed in Settings, Inventory, Customers, and receipt-layout surfaces. Phase 4 adds coverage for Inventory category, supplier, and purchase-order editors. Modal close callbacks and label/control associations are treated as functional accessibility behavior, not cosmetic details.

## Measurement policy

Performance changes should record a before/after measurement from the same command, keep only improvements that exceed normal run-to-run noise, and revert neutral changes. The primary guard is the user-facing initial bundle budget; application behavior remains gated by TypeScript, lint, formatting, unit tests, accessibility tests, and production build success.
