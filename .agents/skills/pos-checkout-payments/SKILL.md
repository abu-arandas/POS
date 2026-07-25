---
name: pos-checkout-payments
description: Runbook and architectural guide for checkout workflow, pricing engine, multi-tender split payments, line-item partial refunds, discount calculations, and tender validation in EA POS.
---

# EA POS — Checkout & Payments Engine

The checkout engine manages cart calculations, tender authorization, receipt generation, stock deduction, and partial/full refund processing.

## 📚 Detailed Sub-References

- **Split Tender & Refund Calculation Formulas**: [references/split-tender-refund-matrix.md](references/split-tender-refund-matrix.md)

---

## 🧮 Pricing & Tax Pipeline (`src/lib/pricing.ts`)

All financial computations must pass through pure functions in `src/lib/pricing.ts` to ensure exact subtotal, discount, tax, and total consistency across checkout, receipts, and reports.

```typescript
import { calculateCartTotals } from '../lib/pricing';

const totals = calculateCartTotals(
  items,
  discountType,
  discountValue,
  taxRate,
  loyaltyPointsToUse,
  loyaltyPointValue
);
```

---

## 💳 Split Payments (`src/lib/payments.ts`)

A checkout can be settled via a single payment method or split across multiple tenders (e.g., cash + credit card + gift card).

- **Dominant Payment Method**: The payment method with the highest tender amount is recorded as `paymentMethod` on `SaleTransaction` for high-level grouping.
- **Tender Breakdown**: The complete breakdown is stored in `payments: Payment[]`.

---

## 🔄 Refund Pipeline (`src/lib/refunds.ts`)

EA POS supports both **full refunds** and **line-item partial refunds**.

1. **Quantity Limit**: Cannot return more units of an item than were originally purchased minus previously returned quantities.
2. **Prorated Tax & Discounts**: Line-item refunds recalculate tax and discount allocations proportionally.
3. **Manager Override**: Non-cashier role (Manager / Admin) authorization is required to perform refunds.
