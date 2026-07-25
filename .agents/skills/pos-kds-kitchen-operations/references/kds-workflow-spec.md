# Kitchen Display System (KDS) & Order Routing Specification

This reference details the order routing algorithm, prep station filtering, KDS visual timer states, and ticket ESC/POS printing format in EA POS.

## 👨‍🍳 1. Prep Station Routing Algorithm (`src/lib/kitchenRouting.ts`)

Items added to an order are grouped by kitchen station tags:

```typescript
export type KitchenStation = 'hot_kitchen' | 'cold_prep' | 'bar_beverage' | 'bakery';

export function routeOrderItemsToStations(items: OrderItem[]): Record<KitchenStation, OrderItem[]> {
  const routing: Record<KitchenStation, OrderItem[]> = {
    hot_kitchen: [],
    cold_prep: [],
    bar_beverage: [],
    bakery: []
  };

  for (const item of items) {
    const station = getStationForCategory(item.category);
    routing[station].push(item);
  }

  return routing;
}
```

---

## ⏱️ 2. Prep Timer Visual Alert Thresholds

On the Kitchen Display screen, orders are sorted chronologically and display a live timer:

- 🟢 **Normal**: Elapsed time $< 8$ minutes. Green header badge.
- 🟡 **Warning**: Elapsed time $8 - 15$ minutes. Yellow pulsing header badge.
- 🔴 **Urgent / Late**: Elapsed time $> 15$ minutes. Red flashing header alert.

---

## 🖨️ 3. Kitchen ESC/POS Prep Ticket Layout

Thermal kitchen tickets use 80mm high-contrast formatting:

```
========================================
            *** KITCHEN TICKET ***
ORDER: #TX-10042        TYPE: DINE-IN
TABLE: T-04             TIME: 14:22:05
========================================

2x  BURGER SINGLE
    * NO ONIONS
    * EXTRA CHEESE

1x  FRIES LARGE

========================================
STATION: HOT KITCHEN
========================================
```
