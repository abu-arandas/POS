import { SaleTransaction, RefundedItem } from '../types';

// Remaining refundable quantity per product line (original minus already returned).
export function refundableQuantities(tx: SaleTransaction): Record<string, number> {
  const already: Record<string, number> = {};
  for (const r of tx.refundedItems ?? []) {
    already[r.productId] = (already[r.productId] ?? 0) + r.quantity;
  }
  const remaining: Record<string, number> = {};
  for (const item of tx.items) {
    remaining[item.productId] = Math.max(0, item.quantity - (already[item.productId] ?? 0));
  }
  return remaining;
}

export interface RefundComputation {
  refundAmount: number; // currency to return (prorated share of the total incl. tax & discount)
  pointsReversal: number; // delta to apply to the customer's points balance
  appliedItems: RefundedItem[]; // quantities returned by THIS refund (selection clamped to refundable)
  refundedItems: RefundedItem[]; // NEW cumulative refunded-items list to persist
  refundedAmount: number; // NEW cumulative refunded currency to persist
  fullyRefunded: boolean; // true once every line has been fully returned
  status: 'partial' | 'refunded';
}

// Computes the effect of returning `selection` (productId -> qty) from a sale.
// The refund is a proportional share of the *total* so discount and tax are
// prorated; a full return therefore refunds exactly the total. Earned points
// are reversed proportionally; redeemed loyalty points are returned only on a
// full refund (fractional point proration would be arbitrary).
export function computeRefund(
  tx: SaleTransaction,
  selection: Record<string, number>,
  loyaltyPointsRate: number,
): RefundComputation | null {
  const remaining = refundableQuantities(tx);
  // Clamp the selection to what's actually refundable.
  const clean: Record<string, number> = {};
  let refundLineSubtotal = 0;
  for (const item of tx.items) {
    const want = Math.max(0, Math.floor(selection[item.productId] ?? 0));
    const qty = Math.min(want, remaining[item.productId] ?? 0);
    if (qty > 0) {
      clean[item.productId] = qty;
      refundLineSubtotal += item.price * qty;
    }
  }
  if (refundLineSubtotal <= 0) return null; // nothing to refund

  const proportion = tx.subtotal > 0 ? refundLineSubtotal / tx.subtotal : 0;
  const refundAmount = Number((tx.total * proportion).toFixed(2));

  // Merge into cumulative refunded-items.
  const merged: Record<string, number> = {};
  for (const r of tx.refundedItems ?? [])
    merged[r.productId] = (merged[r.productId] ?? 0) + r.quantity;
  for (const [pid, qty] of Object.entries(clean)) merged[pid] = (merged[pid] ?? 0) + qty;
  const refundedItems: RefundedItem[] = Object.entries(merged).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));

  // Fully refunded once every original line is covered.
  const fullyRefunded = tx.items.every((item) => (merged[item.productId] ?? 0) >= item.quantity);

  const earned = tx.pointsEarned ?? Math.floor(tx.total * loyaltyPointsRate);
  let pointsReversal = -Math.round(earned * proportion);
  if (fullyRefunded && tx.discountType === 'loyalty') pointsReversal += tx.discountValue;

  const refundedAmount = Number(((tx.refundedAmount ?? 0) + refundAmount).toFixed(2));

  return {
    refundAmount,
    pointsReversal,
    appliedItems: Object.entries(clean).map(([productId, quantity]) => ({ productId, quantity })),
    refundedItems,
    refundedAmount,
    fullyRefunded,
    status: fullyRefunded ? 'refunded' : 'partial',
  };
}
