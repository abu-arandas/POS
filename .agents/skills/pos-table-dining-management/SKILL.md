---
name: pos-table-dining-management
description: Architectural specification for restaurant table management, interactive floorplan visualizer, table order binding (HeldOrders), guest seating, and bill splitting by table.
---

# EA POS — Restaurant Table & Floorplan Management

The Table Management engine powers cafe and restaurant workflows, allowing staff to manage table floorplans, seat guest parties, park active orders per table, move/merge tables, and split checks.

## 📚 Detailed Sub-References

- **Table Floorplan Data Schema & State Transition Specification**: [references/table-dining-spec.md](references/table-dining-spec.md)

---

## 🪑 Table Model & States

```typescript
export type TableStatus = 'available' | 'occupied' | 'reserved' | 'billed' | 'dirty';

export interface DiningTable {
  id: string;
  number: string;        // e.g. "T-01" or "Table 12"
  section: string;       // e.g. "Main Dining", "Patio", "VIP Lounge"
  capacity: number;      // Seat count
  status: TableStatus;
  currentOrderId?: string | null;
  guestCount?: number;
  assignedWaitstaff?: string;
}
```

---

## 🛒 Table-to-Cart Integration (`src/stores/heldOrderStore.ts`)

1. **Seating Party**: Selecting an Available table opens the Register with `HeldOrder.label` set to table number (e.g. `Table 4`).
2. **Updating Table Order**: Staff can add items, send KDS tickets, and park order back to table at any point.
3. **Closing Table**: Final checkout clears held order, marks table `dirty` or `available`, and issues customer receipt.
