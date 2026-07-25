---
name: pos-promotions-loyalty
description: Guide for customer loyalty points lifecycle, promotion rule engines (BOGO, volume tiers, coupon codes), store credit balance, and marketing rewards in EA POS.
---

# EA POS — Promotions & Customer Loyalty System

The Promotions & Loyalty engine awards reward points, validates promotional coupons, handles volume tier discounts, and tracks customer store credit.

## 📚 Detailed Sub-References

- **Promotions Engine Algorithm & Loyalty Math Specification**: [references/promotions-loyalty-engine.md](references/promotions-loyalty-engine.md)

---

## 🎁 Customer Loyalty Points Lifecycle (`src/stores/customerStore.ts`)

```
[ Customer Selected at Checkout ]
               |
               v
    [ Total Spent: $100 ]
               |
               v (loyaltyPointsRate: 1 pt per $1)
    [ Award 100 Loyalty Points ]
               |
               v (loyaltyPointValue: $0.05 per pt)
    [ Future Redeemable Credit: $5.00 ]
```

---

## 🏷️ Promotion Engine (`PromotionRule`)

Supports advanced deal logic:
- **BOGO Deals**: Buy X Get Y Free.
- **Volume Discounts**: Tiered quantity pricing.
- **Coupon Codes**: Fixed amount or percentage coupons.
