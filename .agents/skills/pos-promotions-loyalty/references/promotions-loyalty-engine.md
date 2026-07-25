# Promotions & Loyalty Engine Specification

This reference details the promotion evaluation algorithm, BOGO discount logic, volume tier discounting, loyalty points calculation, and store credit balance ledgers in EA POS.

## 🎁 1. Loyalty Points Math & Conversion

Store settings configure point parameters (`StoreSettings`):
- `loyaltyPointsRate`: Points earned per currency unit spent (e.g. 1 point per $1.00).
- `loyaltyPointValue`: Value in currency of 1 redeemed point (e.g. $0.05 per point).

### Formulas

$$\text{Points Granted} = \lfloor \text{Discounted Subtotal} \times \text{loyaltyPointsRate} \rfloor$$

$$\text{Maximum Redeemable Credit} = \text{Customer Points Balance} \times \text{loyaltyPointValue}$$

---

## 🏷️ 2. Promotion Engine Evaluation Order

When a sale checkout occurs, promotions are evaluated in the following sequence:

1. **Category Filter**: Filters active promotion rules to match cart items' categories.
2. **Min Subtotal Check**: Verifies if cart subtotal $\ge \text{rule.minSubtotal}$.
3. **BOGO Rule Evaluation**:
   - Buy $X$ units of Product $A$, Get $Y$ units of Product $B$ at $100\%$ discount.
4. **Volume Tiers**:
   - Buy 5-9 units $\to$ 10% off.
   - Buy 10+ units $\to$ 20% off.

---

## 💳 3. Store Credit Ledger

Store credit is tracked per customer (`Customer` entity):

```typescript
export interface CustomerLedgerEntry {
  id: string;
  customerId: string;
  type: 'deposit' | 'deduction' | 'refund_credit';
  amount: number;
  balanceAfter: number;
  referenceId?: string; // TX-10001 or Refund ID
  note?: string;
  createdAt: string;
}
```
