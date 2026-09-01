# Phase 3 Component and Hook Structure

Phase 3 moves reusable business logic out of the Register and History screen bodies while keeping both screen entry points and child-component contracts stable.

## Register cart boundary

```text
src/components/
├── Register.tsx                       # Store orchestration, checkout, printing, and modal state
└── register/
    └── useRegisterCart.ts             # Cart mutations, discount state, totals, and cash math
```

`useRegisterCart` owns cart lines, selected customer state, discount inputs, loyalty points, promo visibility, derived checkout items, pricing totals, cash suggestions, cash change, and functional-update cart mutations. Register retains barcode scanning, held orders, checkout completion, payment-modal state, printing, cloud synchronization, and customer creation because those behaviors cross store and hardware boundaries.

## History filtering boundary

```text
src/components/
├── History.tsx                        # Refunds, bulk actions, exports, printing, and modal state
└── history/
    └── useHistoryFilters.ts           # Search, date/status/payment filters, sorting, and grouping
```

`useHistoryFilters` owns filter state and derives the active transaction, newest-first filtered list, and localized date groups. Refund authorization, stock and loyalty updates, deletion, CSV export, and hardware printing remain in the screen because they are side-effecting workflows rather than pure view filtering.

## Shared interaction patterns

The shared `src/components/shared/ModalShell.tsx` introduced in Phase 2 remains the common accessible animated dialog frame. Phase 3 follows the same boundary rule: reusable UI and pure derivations move into focused modules, while store writes and hardware/network effects stay in the orchestration component until they receive dedicated domain services and tests.

## Testing conventions

Focused hook tests live beside the screen-level component tests. `registerCart.test.tsx` covers functional cart updates, stock caps, totals, cash change, discounts, and reset behavior. `historyFilters.test.tsx` covers sorting, selection derivation, combined filters, and grouping. Full application tests remain the final compatibility gate.
