# Phase 1 Refactor Structure

This document records the module boundaries introduced during Phase 1 of the EA POS refactor. The legacy entry points remain available as compatibility facades, while new application code should import from the focused modules described below.

## Translation catalogue

```text
src/
├── lib/
│   └── i18n.ts                 # i18next initialization and typed resources
├── locales/
│   ├── en/
│   │   ├── index.ts            # English aggregate resource
│   │   ├── common.ts
│   │   ├── sidebar.ts
│   │   ├── register.ts
│   │   ├── inventory.ts
│   │   ├── dashboard.ts
│   │   ├── settings.ts
│   │   ├── shift.ts
│   │   ├── fleet.ts
│   │   └── receipt.ts          # Receipt status strings
│   └── ar/                     # Arabic mirrors the English namespace layout
│       └── ...
```

The current catalogue uses all existing namespaces as individual files, including `receipt`, `receiptCfg`, `catalogPush`, `storeAdmin`, `fleetReport`, `errorBoundary`, `lockscreen`, `qrmenu`, `history`, `customers`, and `categories`. `src/lib/i18n.ts` remains the stable runtime entry point for existing consumers.

## Receipt generation and printing

```text
src/lib/
├── receipt/
│   ├── generator.ts            # Pure generation facade
│   ├── document.ts             # Complete HTML document and styles
│   ├── documents.ts            # Silent-print and preview document composition
│   ├── templates/
│   │   ├── customer.ts         # Customer receipt body
│   │   └── kitchen.ts          # Kitchen ticket body
│   ├── types.ts                # Receipt-specific public types
│   └── index.ts
├── print/
│   ├── system.ts               # System-printer orchestration
│   ├── types.ts                # PrintOutcome
│   ├── transport/
│   │   └── system.ts           # Browser/Electron print-window transport
│   └── index.ts
└── receiptPrinter.ts           # Backward-compatible facade
```

Receipt HTML generation has no dependency on the print-window transport. This makes the templates and complete documents independently testable and leaves room for serial, network, Windows spooler, and other transports to be added without changing receipt content generation.

## Supabase synchronization

```text
src/lib/
├── supabase/
│   ├── client.ts               # Client lifecycle, device sign-in, connection probe
│   ├── products.ts             # Product and category push/pull
│   ├── customers.ts            # Customer push/pull
│   ├── transactions.ts         # Transaction push/pull
│   ├── accounts.ts             # Login verification and account push/pull
│   ├── sync-utils.ts           # Store stamping, pagination, keyset cursors, deletes
│   └── index.ts                # Focused-module aggregate facade
└── supabase.ts                 # Backward-compatible facade
```

The original `src/lib/supabase.ts` import path remains valid. New code should import the smallest relevant module, such as `./supabase/products` or `./supabase/client`, to make dependencies explicit and avoid broad module imports.

## Semantic utilities

```text
src/lib/utils/
├── validation.ts               # Monetary and line-item quantity validation
├── formatting.ts               # Safe HTML interpolation and future formatting helpers
├── ids.ts                      # Runtime identifier generation
├── ui.ts                       # Imperative notifications and dialogs
├── dom.ts                      # DOM and print-window helpers
└── index.ts                    # Grouped utility facade
```

The former one-function modules—`money.ts`, `quantity.ts`, `escapeHtml.ts`, `notifications.ts`, `dialogs.ts`, `ids.ts`, and `printWindow.ts`—remain as deprecated re-export facades so existing tests and external consumers do not break during the migration.

## Import policy

New code should prefer focused modules over compatibility facades. Compatibility files should contain exports only and should not acquire new business logic. The i18n key-coverage test scans tracked and untracked application source while excluding locale catalogue files, which keeps the check useful during development of new locale modules.
