---
name: pos-inventory-supplies
description: Complete guide for inventory management, stock audit logs (StockAdjustment), purchase orders, supplier management, and low-stock alerting in EA POS.
---

# EA POS — Inventory & Supply Chain Management

The inventory engine handles product stock levels, low-stock threshold alerts, supplier contacts, purchase order (PO) workflows, and immutable stock audit logs.

## 📦 Stock Model & Thresholds (`src/types.ts`)

Each product includes stock management properties:

```typescript
export interface Product {
  id: string;
  name: string;
  price: number;
  cost: number;
  category: string;
  sku: string;
  stock: number;      // Current stock quantity
  minStock: number;   // Reorder trigger threshold
}
```

- **Low-Stock Alert**: Triggered when `stock <= minStock`. Visually badged in yellow/red on Register and Inventory screens.
- **Out of Stock**: Triggered when `stock <= 0`. Registers block additions unless stock override is configured.

---

## 📋 Stock Audit Log (`StockAdjustment`)

Every single stock modification (sale checkout, manual correction, waste markdown, PO receiving) records an entry in the immutable `StockAdjustment` audit log:

```typescript
export interface StockAdjustment {
  id: string;
  productId: string;
  productName: string;
  delta: number;             // Positive for additions (+), negative for deductions (-)
  newStock: number;          // Resulting stock level
  reason: 'received' | 'correction' | 'waste' | 'other';
  note?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  operatorName?: string | null;
  createdAt: string;
}
```

---

## 📑 Purchase Order (PO) Lifecycle (`src/lib/purchaseOrders.ts`)

Purchase Orders allow store managers to order inventory from suppliers and receive stock into the store.

```
[Draft] ---> [Ordered] ---> [Received] (Increments Stock & Logs Audit Entry)
   |             |
   v             v
[Cancelled]  [Cancelled]
```

### PO Execution Rules
1. **Snapshot Buy Cost**: `PurchaseOrderLine.unitCost` snapshots the cost price at order time. It does not auto-mutate the product's default unit cost unless confirmed.
2. **Stock Application**: Transitioning status to `received` updates product `stock` count (`stock += line.quantity`) and generates corresponding `StockAdjustment` entries.
