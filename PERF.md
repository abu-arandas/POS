# Performance and Quality Ledger

This ledger records the Phase 4 baseline and the guards that should be run before merging changes that affect the application shell or large screens. Measurements are taken from the local Ubuntu sandbox with the repository’s locked dependencies and should be compared using the same commands and conditions.

## Phase 4 baseline

| Signal                  |                                 Baseline | Command or source                      |
| ----------------------- | ---------------------------------------: | -------------------------------------- |
| Unit test files         |                               94 passing | `npm test`                             |
| Unit tests              |                             1118 passing | `npm test`                             |
| TypeScript and ESLint   | Passing; zero ESLint errors and warnings | `npm run lint`                         |
| Formatting              |                                  Passing | `npm run format:check`                 |
| Production build        |                      6–7 seconds locally | `npm run build`                        |
| Initial JavaScript      |   496,650 raw bytes / 155,926 gzip bytes | `npm run build` + `npm run perf:check` |
| Initial CSS             |    108,000 raw bytes / 16,408 gzip bytes | `npm run build` + `npm run perf:check` |
| Instrumented statements |                                   62.62% | `npm run test:coverage`                |
| Instrumented branches   |                                   53.73% | `npm run test:coverage`                |
| Instrumented functions  |                                   54.35% | `npm run test:coverage`                |
| Instrumented lines      |                                   64.04% | `npm run test:coverage`                |

The initial JavaScript figure grew by 19,386 gzip bytes against the earlier
436,340/136,540 baseline. That is the restaurant feature set — item modifiers,
the kitchen display, table management, petty cash and the customer-facing
display — together with the two locale namespaces they added. It leaves 44,074
gzip bytes of headroom against the 200,000 budget.

Initial CSS fell by 1,103 gzip bytes: 22 component classes and the five
`@keyframes` only they animated had gone dead again and were removed (see the
accessibility and dead-class guards below).

Coverage is recorded as a baseline rather than raised to an artificial threshold in this phase because the current suite includes broad component coverage but also many hardware, cloud, and administrative branches that are intentionally integration-oriented. New business-logic hooks must still receive focused tests, and the full suite must remain green.

## Enforced initial bundle budgets

The `src/build/check-bundle-budget.mjs` guard measures the hashed Vite entry assets after a production build. The current budgets are:

| Artifact                 | Maximum gzip size |
| ------------------------ | ----------------: |
| Initial JavaScript entry |     200,000 bytes |
| Initial CSS entry        |      50,000 bytes |

The guard runs locally with `npm run perf:check` and in `.github/workflows/ci.yml` immediately after the production build. A budget failure should trigger a fresh bundle analysis rather than an arbitrary limit increase.

## Accessibility guard

`test/a11y/formLabels.test.tsx` checks the accessible-name algorithm for the initial screen states and for controls revealed in Settings, Inventory, Customers, and receipt-layout surfaces. Phase 4 adds coverage for Inventory category, supplier, and purchase-order editors. Modal close callbacks and label/control associations are treated as functional accessibility behavior, not cosmetic details.

## Measurement policy

Performance changes should record a before/after measurement from the same command, keep only improvements that exceed normal run-to-run noise, and revert neutral changes. The primary guard is the user-facing initial bundle budget; application behavior remains gated by TypeScript, lint, formatting, unit tests, accessibility tests, and production build success.
