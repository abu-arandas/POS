# Restaurant Table & Floorplan Management Specification

This reference details table data structures, state machine transitions, party seating workflows, check splitting algorithms, and table order binding in EA POS.

## 🪑 1. Table Data Structures & Floorplan Grid

```typescript
export interface TableSection {
  id: string;
  name: string;        // e.g. "Main Dining Room", "Patio Terrace", "Bar Counter"
}

export interface DiningTable {
  id: string;
  number: string;      // e.g. "T-01", "Patio 4"
  sectionId: string;
  capacity: number;    // Maximum seat capacity
  status: 'available' | 'occupied' | 'reserved' | 'billed' | 'dirty';
  gridX: number;       // Visual floorplan X coordinate (grid units)
  gridY: number;       // Visual floorplan Y coordinate (grid units)
  heldOrderId?: string | null; // Bound parked order ID
  seatedAt?: string | null;    // ISO timestamp when party was seated
}
```

---

## 🔄 2. Table State Transition Diagram

```
                 [ Seated ]
  (Available) -------------> (Occupied)
      ^                          |
      |                          v [ Print Bill ]
      |                      (Billed)
      |                          |
      |                          v [ Complete Payment ]
  [ Cleaned ]                (Dirty)
  (Dirty) <----------------------'
```

---

## ✂️ 3. Bill Splitting Algorithms

EA POS supports 3 dining check split methods:

1. **Split Evenly**: Divides total payable balance by number of dining guests ($N$).
2. **Split by Item**: Guests select specific cart line items to pay separately.
3. **Partial Custom Amount**: Tender a custom payment towards table balance while leaving remaining amount active on table.
