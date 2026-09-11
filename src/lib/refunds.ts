import { SaleTransaction, RefundedItem } from '../types';
import { orderItemKey, parseLineKey, refundedItemKey } from './variants';

/**
 * Remaining refundable quantity per sold line (original minus already returned).
 *
 * Keyed by product AND variant, like everything else that treats a line as an
 * identity. A sale of two smalls and one large is three units of one product
 * and two distinct lines; keying by product alone would let a return of "two"
 * come back against whichever line the map happened to hold, restock the wrong
 * size, and — once both lines were folded into one entry — report a sale as
 * fully refunded while one of its lines had never been returned at all.
 *
 * For a plain product the key IS the product id, which is why sales, refund
 * rows and held orders written before variants existed keep working unchanged.
 */
export function refundableQuantities(tx: SaleTransaction): Record<string, number> {
  const already: Record<string, number> = {};
  for (const r of tx.refundedItems ?? []) {
    const key = refundedItemKey(r);
    already[key] = (already[key] ?? 0) + r.quantity;
  }
  const remaining: Record<string, number> = {};
  for (const item of tx.items) {
    const key = orderItemKey(item);
    remaining[key] = Math.max(0, item.quantity - (already[key] ?? 0));
  }
  return remaining;
}

/**
 * The full effect of a refund: what to pay back now, and the cumulative
 * refund state to persist on the transaction.
 */
export interface RefundComputation {
  refundAmount: number; // currency to return (prorated share of the total incl. tax & discount)
  pointsReversal: number; // delta to apply to the customer's points balance
  refundedItems: RefundedItem[]; // NEW cumulative refunded-items list to persist
  refundedAmount: number; // NEW cumulative refunded currency to persist
  fullyRefunded: boolean; // true once every line has been fully returned
  status: 'partial' | 'refunded';
  appliedItems: Record<string, number>; // The exact clamped quantities refunded in this operation, by line key
}

/**
 * Clamps a requested return to what the sale can still give back: never more
 * than a line's remaining quantity, never a fraction, never negative. Returns
 * the accepted quantities and their subtotal at the original line prices.
 */
function clampToRefundable(
  tx: SaleTransaction,
  remaining: Record<string, number>,
  selection: Record<string, number>,
): { accepted: Record<string, number>; lineSubtotal: number } {
  const accepted: Record<string, number> = {};
  let lineSubtotal = 0;
  for (const item of tx.items) {
    const key = orderItemKey(item);
    const want = Math.max(0, Math.floor(selection[key] ?? 0));
    const qty = Math.min(want, remaining[key] ?? 0);
    if (qty > 0) {
      accepted[key] = qty;
      lineSubtotal += item.price * qty;
    }
  }
  return { accepted, lineSubtotal };
}

/**
 * This return folded into everything already returned, as a line key -> total
 * quantity map. That cumulative view is what decides whether the sale is now
 * fully refunded, and what gets persisted on the transaction.
 */
function mergeReturnedQuantities(
  tx: SaleTransaction,
  accepted: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const r of tx.refundedItems ?? []) {
    const key = refundedItemKey(r);
    merged[key] = (merged[key] ?? 0) + r.quantity;
  }
  for (const [key, qty] of Object.entries(accepted)) merged[key] = (merged[key] ?? 0) + qty;
  return merged;
}

/**
 * Points to move on the customer's balance: the earned points this return
 * reverses, plus — on a full return of a loyalty-paid sale — the redeemed
 * points given back.
 *
 * Like the currency, it is computed as the delta between two cumulative
 * figures rather than on this return alone, so repeated partial refunds cannot
 * drift a point at a time.
 */
function computePointsReversal(
  tx: SaleTransaction,
  priorRefundedSubtotal: number,
  refundLineSubtotal: number,
  fullyRefunded: boolean,
  loyaltyPointsRate: number,
  loyaltyPointValue?: number,
): number {
  // Points only ever move on a sale with a linked customer. A walk-in has no
  // balance to adjust, and buildSaleTransaction leaves pointsEarned undefined
  // for one — so without this gate the `??` fallback below invents an award
  // nobody received, and the refund screen offers to reverse it. The caller
  // already refuses to apply points without a customerId; deriving 0 here keeps
  // the number it *displays* honest too.
  if (!tx.customerId) return 0;

  const earned = tx.pointsEarned ?? Math.floor(tx.total * loyaltyPointsRate);
  const share = (subtotal: number) =>
    tx.subtotal > 0 ? Math.round(earned * (subtotal / tx.subtotal)) : 0;
  const priorPoints = share(priorRefundedSubtotal);
  const cumulativePoints = fullyRefunded
    ? earned
    : share(priorRefundedSubtotal + refundLineSubtotal);
  let pointsReversal = -(cumulativePoints - priorPoints);

  if (fullyRefunded && tx.discountType === 'loyalty') {
    // Return only what the redeemed points were actually worth. Sales written
    // before checkout clamped this stored the *requested* point count, which can
    // exceed the redemption the order could absorb — crediting that back would
    // mint points. Deriving from tx.discount caps the reversal for those rows.
    const redeemable =
      loyaltyPointValue && loyaltyPointValue > 0
        ? Math.round(tx.discount / loyaltyPointValue)
        : tx.discountValue;
    pointsReversal += Math.min(tx.discountValue, redeemable);
  }
  return pointsReversal;
}

/**
 * Computes the effect of returning `selection` (line key -> qty) from a sale.
 * The refund is a proportional share of the *total* so discount and tax are
 * prorated; a full return therefore refunds exactly the total. Earned points
 * are reversed proportionally; redeemed loyalty points are returned only on a
 * full refund (fractional point proration would be arbitrary).
 */
export function computeRefund(
  tx: SaleTransaction,
  selection: Record<string, number>,
  loyaltyPointsRate: number,
  loyaltyPointValue?: number,
): RefundComputation | null {
  const remaining = refundableQuantities(tx);
  const { accepted: clean, lineSubtotal: refundLineSubtotal } = clampToRefundable(
    tx,
    remaining,
    selection,
  );
  if (refundLineSubtotal <= 0) return null; // nothing to refund

  const merged = mergeReturnedQuantities(tx, clean);
  const refundedItems: RefundedItem[] = Object.entries(merged).map(([key, quantity]) => {
    const { productId, variantId } = parseLineKey(key);
    return variantId ? { productId, variantId, quantity } : { productId, quantity };
  });

  // Fully refunded once every original line is covered.
  const fullyRefunded = tx.items.every(
    (item) => (merged[orderItemKey(item)] ?? 0) >= item.quantity,
  );

  // Refund currency as the delta between the prorated total for everything
  // refunded so far (this op included) and the prorated total already refunded.
  // Rounding at each *cumulative* boundary — not each increment on its own —
  // keeps a piecewise full return summing to exactly tx.total instead of
  // drifting a cent per line. A full return (by quantity) trues up to the total
  // directly, so it is also immune to any rounding in the stored subtotal.
  const prorate = (lineSubtotal: number) => {
    if (tx.subtotal <= 0) return 0;
    return Number((tx.total * (lineSubtotal / tx.subtotal)).toFixed(2));
  };
  const priorRefundedSubtotal = tx.items.reduce(
    (sum, item) =>
      sum + item.price * (item.quantity - (remaining[orderItemKey(item)] ?? item.quantity)),
    0,
  );
  const cumulativeBefore = prorate(priorRefundedSubtotal);
  const cumulativeAfter = fullyRefunded
    ? tx.total
    : prorate(priorRefundedSubtotal + refundLineSubtotal);
  const refundAmount = Number((cumulativeAfter - cumulativeBefore).toFixed(2));

  const pointsReversal = computePointsReversal(
    tx,
    priorRefundedSubtotal,
    refundLineSubtotal,
    fullyRefunded,
    loyaltyPointsRate,
    loyaltyPointValue,
  );

  // Persist the cumulative prorated figure. It is self-correcting: a row that
  // was missing refundedAmount, or drifted by earlier rounding, still lands on
  // exactly tx.total once every line has been returned.
  const refundedAmount = cumulativeAfter;

  return {
    refundAmount,
    pointsReversal,
    refundedItems,
    refundedAmount,
    fullyRefunded,
    status: fullyRefunded ? 'refunded' : 'partial',
    appliedItems: clean,
  };
}
