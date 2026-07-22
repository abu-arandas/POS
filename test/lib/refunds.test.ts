import { describe, it, expect } from 'vitest';
import { computeRefund, refundableQuantities } from '../../src/lib/refunds';
import { SaleTransaction } from '../../src/types';

// A sale: 2x Latte @4.50 + 1x Muffin @3.50 = 12.50 subtotal, 10% tax = 1.25,
// total 13.75. 12 points earned (1/$). No discount.
const baseTx: SaleTransaction = {
  id: 'TX-1',
  date: '2026-07-16T10:00:00.000Z',
  items: [
    { productId: 'latte', productName: 'Latte', price: 4.5, cost: 0.9, quantity: 2, total: 9 },
    { productId: 'muffin', productName: 'Muffin', price: 3.5, cost: 0.95, quantity: 1, total: 3.5 },
  ],
  subtotal: 12.5,
  discount: 0,
  discountType: 'none',
  discountValue: 0,
  tax: 1.25,
  total: 13.75,
  paymentMethod: 'card',
  customerId: 'c1',
  pointsEarned: 13,
  status: 'completed',
};

describe('refundableQuantities', () => {
  it('returns full quantities for an untouched sale', () => {
    expect(refundableQuantities(baseTx)).toEqual({ latte: 2, muffin: 1 });
  });
  it('subtracts already-refunded quantities', () => {
    const tx = { ...baseTx, refundedItems: [{ productId: 'latte', quantity: 1 }] };
    expect(refundableQuantities(tx)).toEqual({ latte: 1, muffin: 1 });
  });
});

describe('computeRefund', () => {
  it('refunds the full total when every line is selected', () => {
    const r = computeRefund(baseTx, { latte: 2, muffin: 1 }, 1)!;
    expect(r.refundAmount).toBe(13.75);
    expect(r.fullyRefunded).toBe(true);
    expect(r.status).toBe('refunded');
    expect(r.pointsReversal).toBe(-13); // all earned points removed
  });

  it('prorates tax into a partial refund', () => {
    // Refund 1 Latte (4.50 of 12.50 subtotal = 36%). 13.75 * 0.36 = 4.95.
    const r = computeRefund(baseTx, { latte: 1 }, 1)!;
    expect(r.refundAmount).toBeCloseTo(4.95, 2);
    expect(r.fullyRefunded).toBe(false);
    expect(r.status).toBe('partial');
    // 13 earned * 0.36 = 4.68 → rounds to 5 removed.
    expect(r.pointsReversal).toBe(-5);
    expect(r.refundedItems).toEqual([{ productId: 'latte', quantity: 1 }]);
  });

  it('accumulates across successive partial refunds and flips to refunded', () => {
    const first = computeRefund(baseTx, { latte: 2 }, 1)!;
    const afterFirst = {
      ...baseTx,
      status: first.status,
      refundedItems: first.refundedItems,
      refundedAmount: first.refundedAmount,
    };
    expect(afterFirst.status).toBe('partial');
    const second = computeRefund(afterFirst, { muffin: 1 }, 1)!;
    expect(second.fullyRefunded).toBe(true);
    expect(second.status).toBe('refunded');
    // Cumulative refunded amount ≈ the full total.
    expect(second.refundedAmount).toBeCloseTo(13.75, 2);
  });

  it('clamps a selection to what is still refundable', () => {
    const tx = {
      ...baseTx,
      refundedItems: [{ productId: 'latte', quantity: 2 }],
      status: 'partial' as const,
    };
    // Asking to refund 2 more lattes (none left) + the muffin → only the muffin.
    const r = computeRefund(tx, { latte: 2, muffin: 1 }, 1)!;
    expect(r.refundedItems.find((i) => i.productId === 'latte')?.quantity).toBe(2);
    expect(r.refundedItems.find((i) => i.productId === 'muffin')?.quantity).toBe(1);
    expect(r.fullyRefunded).toBe(true);
  });

  it('returns null when nothing refundable is selected', () => {
    expect(computeRefund(baseTx, {}, 1)).toBeNull();
    expect(computeRefund(baseTx, { latte: 0 }, 1)).toBeNull();
  });

  it('returns redeemed loyalty points only on a full refund', () => {
    // Sale paid partly with 100 loyalty points ($5 off). On full refund those
    // points come back (plus earned removed).
    const loyaltyTx: SaleTransaction = {
      ...baseTx,
      discountType: 'loyalty',
      discountValue: 100,
      discount: 5,
      pointsEarned: 8,
    };
    const full = computeRefund(loyaltyTx, { latte: 2, muffin: 1 }, 1)!;
    expect(full.pointsReversal).toBe(-8 + 100);
    // A partial refund does NOT return redeemed points (only removes earned share).
    const partial = computeRefund(loyaltyTx, { muffin: 1 }, 1)!;
    expect(partial.pointsReversal).toBeLessThan(0);
  });
});
