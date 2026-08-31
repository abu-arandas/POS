# Phase 2 Component Structure

Phase 2 decomposes the two largest application screens without changing their public route-level entry points. `Inventory.tsx` and `Settings.tsx` remain the stable screen components, while tab content, modal forms, and shared lifecycle concerns now live in focused modules.

## Inventory

```text
src/components/
├── Inventory.tsx                    # Screen state, actions, tab shell, modal orchestration
└── inventory/
    ├── Tabs.tsx                     # Products, categories, suppliers, purchase orders, stock log
    ├── ProductFormModal.tsx
    ├── CategoryFormModal.tsx
    ├── ReceiveStockModal.tsx
    ├── SupplierFormModal.tsx
    ├── PurchaseOrderFormModal.tsx
    └── index.ts
```

The tab modules are prop-driven and do not subscribe directly to Zustand stores. Inventory retains business rules such as duplicate-SKU validation, stock movement, purchase-order transitions, and cloud sync in the screen-level handlers. The modal modules own only controlled form markup and delegate validation and persistence to those handlers.

## Settings

```text
src/components/
├── Settings.tsx                     # Screen state, actions, tab shell, and orchestration
└── settings/
    ├── ProfilePanel.tsx
    ├── PrinterPanel.tsx
    ├── KitchenPrinterPanel.tsx
    ├── ScannerPanel.tsx
    ├── SupabasePanel.tsx
    ├── UsersPanel.tsx
    ├── DangerZonePanel.tsx
    ├── UserModal.tsx
    ├── usePrinterDiscovery.ts       # Shared async discovery lifecycle
    └── index.ts
```

The receipt-printer and kitchen-printer panels now share the `usePrinterDiscovery` lifecycle. The hook owns detection, serial pairing, network scanning, cancellation guards, and stale-network-result replacement. Each panel receives stable state and callbacks through explicit props.

## Shared modal frame

```text
src/components/shared/
└── ModalShell.tsx                   # Shared accessible animated dialog frame
```

`ModalShell` centralizes the modal backdrop, dialog role, `aria-modal`, title relationship, focus target, and entrance/exit animation. The extracted Inventory forms and Settings user modal retain their original IDs, labels, sizing classes, and accessibility refs while using the shared wrapper.

## Import policy

New screen code should import focused modules from `inventory`, `settings`, or `shared` rather than recreating large inline sections. Extracted components are intentionally prop-driven: store access and business actions remain at the screen boundary until a later phase extracts a domain-specific hook with dedicated tests.
