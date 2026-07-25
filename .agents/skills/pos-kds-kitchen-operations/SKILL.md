---
name: pos-kds-kitchen-operations
description: Specification and runbook for Kitchen Display System (KDS), order routing by category/station, kitchen prep status lifecycle, and kitchen ESC/POS ticket printing in EA POS.
---

# EA POS — Kitchen Display System (KDS) & Order Routing

The Kitchen Operations module routes order items directly to kitchen display screens and thermal prep ticket printers as soon as an order is placed or updated.

## 📚 Detailed Sub-References

- **Kitchen Station Routing Algorithm & Prep Timer Specification**: [references/kds-workflow-spec.md](references/kds-workflow-spec.md)

---

## 👨‍🍳 Order Prep Lifecycle

```
[ New Sale / Order ] ---> Status: PENDING (Kitchen Screen Alert)
                                 |
                                 v
                          Status: PREPARING (Prep Timer Running)
                                 |
                                 v
                          Status: READY (Runner Notification)
                                 |
                                 v
                          Status: DELIVERED (Archived)
```

---

## 🍽️ Kitchen Routing Engine (`src/lib/kitchenRouting.ts`)

Items are routed to station displays or prep printers based on product categories:
- **Hot Kitchen**: Burgers, Mains, Appetizers, Grills
- **Cold Station / Salad**: Salads, Cold Starters, Desserts
- **Bar / Drinks**: Coffee, Beverages, Smoothies, Cocktails
