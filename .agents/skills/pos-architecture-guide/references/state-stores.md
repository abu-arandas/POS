# EA POS — Zustand Stores Reference Guide

EA POS manages application state via 8 modular, decoupled Zustand stores located in `src/stores/`. Each store persists to local IndexedDB via `idb-keyval`.

## 📦 Store Summary Table

| Store File | Responsibilities | Key State Properties | Key Actions |
| :--- | :--- | :--- | :--- |
| `authStore.ts` | Active operator session & permissions | `user`, `role`, `pin`, `isAuthenticated` | `login(pin)`, `logout()`, `updatePin(newPin)` |
| `productStore.ts` | Product catalog & category definitions | `products`, `categories`, `activeCategory` | `addProduct()`, `updateStock()`, `reorderProducts()` |
| `customerStore.ts` | Customer directory & loyalty balances | `customers` | `addCustomer()`, `updatePoints()`, `updateCustomer()` |
| `transactionStore.ts` | Completed sales history & refunds | `transactions` | `addTransaction()`, `refundTransaction()`, `getSalesSummary()` |
| `shiftStore.ts` | Cash drawer register sessions | `activeShift`, `shiftHistory` | `openShift()`, `closeShift()`, `getShiftSummary()` |
| `settingsStore.ts` | Terminal config, tax, currency & receipt layout | `settings`, `receiptToggles` | `updateSettings()`, `updateReceiptToggles()` |
| `supplyStore.ts` | Suppliers, Purchase Orders & stock audit log | `suppliers`, `purchaseOrders`, `stockAdjustments` | `createPO()`, `receivePO()`, `logAdjustment()` |
| `heldOrderStore.ts` | Parked cart orders / restaurant tables | `heldOrders` | `holdOrder()`, `resumeOrder()`, `removeOrder()` |

---

## 🔄 State Persistence Architecture

Stores use asynchronous hydration from IndexedDB on startup:

```typescript
import { create } from 'zustand';
import { get, set } from 'idb-keyval';

export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  isLoading: true,

  // Load from IndexedDB on initialization
  init: async () => {
    const saved = await get<Product[]>('ea_pos_products');
    if (saved) set({ products: saved, isLoading: false });
  },

  // Mutate state & persist
  setProducts: (products) => {
    set({ products });
    set('ea_pos_products', products);
  }
}));
```

---

## 🔒 Authorization & Access Control (`src/lib/access.ts`)

Store functions enforce role-based permissions (`admin`, `manager`, `cashier`):

- **Admin**: Full access (settings, user PIN management, stock adjustments, supplier management, fleet push).
- **Manager**: Sales reports, shift closing, stock receiving, partial/full refund authorization, catalog updates.
- **Cashier**: Sales register, cart parking, customer addition, shift opening.
