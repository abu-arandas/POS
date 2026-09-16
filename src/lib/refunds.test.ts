import { describe, expect, it } from 'vitest';
import { computeRefund, refundableQuantities } from './refunds';
import type { OrderItem, SaleTransaction } from '../types';

const line = (overrides: Partial<OrderItem> = {}): OrderItem => ({
  productId: 'p1',
  productName: 'Widget',
  price: 10,
  cost: 4,
  quantity: 1,
  total: 10,
  ...overrides,
});

function sale(overrides: Partial<SaleTransaction> = {}): SaleTransaction {
  const items = overrides.items ?? [line()];
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  return {
    id: 'TX-1',
    date: '2026-01-01T12:00:00.000Z',
    items,
    subtotal,
    discount: 0,
    discountType: 'none',
    discountValue: 0,
    tax: 0,
    total: subtotal,
    paymentMethod: 'cash',
    customerId: null,
    status: 'completed',
    ...overrides,
  };
}

describe('refundableQuantities', () => {
  it('is the full quantity on an untouched sale', () => {
    expect(refundableQuantities(sale({ items: [line({ quantity: 3 })] }))).toEqual({ p1: 3 });
  });

  it('subtracts what has already come back', () => {
    const tx = sale({
      items: [line({ quantity: 3, total: 30 })],
      refundedItems: [{ productId: 'p1', quantity: 1 }],
    });
    expect(refundableQuantities(tx)).toEqual({ p1: 2 });
  });

  // Variants are separate identities: two sizes of one product are two lines.
  it('keys variants separately from their parent product', () => {
    const tx = sale({
      items: [
        line({ variantId: 'v-s', variantName: 'Small', quantity: 2, total: 20 }),
        line({ variantId: 'v-l', variantName: 'Large', quantity: 1 }),
      ],
      refundedItems: [{ productId: 'p1', variantId: 'v-s', quantity: 1 }],
    });
    expect(refundableQuantities(tx)).toEqual({ 'p1::v-s': 1, 'p1::v-l': 1 });
  });
});

describe('computeRefund', () => {
  it('returns null when the selection refunds nothing', () => {
    expect(computeRefund(sale(), {}, 1)).toBeNull();
    expect(computeRefund(sale(), { p1: 0 }, 1)).toBeNull();
  });

  it('prorates discount and tax so a full return gives back exactly the total', () => {
    const tx = sale({
      items: [line({ quantity: 2, total: 20 })],
      subtotal: 20,
      discount: 5,
      tax: 1.5,
      total: 16.5,
    });
    const result = computeRefund(tx, { p1: 2 }, 1);
    expect(result?.refundAmount).toBe(16.5);
    expect(result?.status).toBe('refunded');
    expect(result?.fullyRefunded).toBe(true);
  });

  it('sums piecewise returns to exactly the total, with no per-line drift', () => {
    const tx = sale({
      items: [line({ quantity: 3, total: 30 })],
      subtotal: 30,
      discount: 0,
      tax: 0,
      total: 10,
    });
    const first = computeRefund(tx, { p1: 1 }, 1);
    const afterFirst = {
      ...tx,
      refundedItems: first!.refundedItems,
      refundedAmount: first!.refundedAmount,
    };
    const second = computeRefund(afterFirst, { p1: 2 }, 1);
    expect(Number((first!.refundAmount + second!.refundAmount).toFixed(2))).toBe(10);
    expect(second?.refundedAmount).toBe(10);
    expect(second?.fullyRefunded).toBe(true);
  });

  it('clamps a request beyond what the line can still give back', () => {
    const tx = sale({ items: [line({ quantity: 2, total: 20 })], subtotal: 20, total: 20 });
    const result = computeRefund(tx, { p1: 99 }, 1);
    expect(result?.appliedItems).toEqual({ p1: 2 });
    expect(result?.refundAmount).toBe(20);
  });

  it('refuses to refund a line twice across successive partial returns', () => {
    const tx = sale({
      items: [line({ quantity: 2, total: 20 })],
      subtotal: 20,
      total: 20,
      refundedItems: [{ productId: 'p1', quantity: 2 }],
    });
    expect(computeRefund(tx, { p1: 1 }, 1)).toBeNull();
  });

  it('marks a partial return as partial', () => {
    const tx = sale({ items: [line({ quantity: 4, total: 40 })], subtotal: 40, total: 40 });
    const result = computeRefund(tx, { p1: 1 }, 1);
    expect(result?.status).toBe('partial');
    expect(result?.fullyRefunded).toBe(false);
    expect(result?.refundAmount).toBe(10);
  });

  describe('loyalty points', () => {
    it('moves nothing on a walk-in sale', () => {
      const tx = sale({ items: [line({ quantity: 1 })], customerId: null });
      expect(computeRefund(tx, { p1: 1 }, 1)?.pointsReversal).toBe(0);
    });

    it('reverses the earned points in proportion to what came back', () => {
      const tx = sale({
        items: [line({ quantity: 4, total: 40 })],
        subtotal: 40,
        total: 40,
        customerId: 'c1',
        pointsEarned: 40,
      });
      expect(computeRefund(tx, { p1: 1 }, 1)?.pointsReversal).toBe(-10);
    });

    it('returns redeemed points only on a full return', () => {
      const tx = sale({
        items: [line({ quantity: 2, total: 20 })],
        subtotal: 20,
        discount: 10,
        total: 10,
        customerId: 'c1',
        pointsEarned: 10,
        discountType: 'loyalty',
        discountValue: 200,
      });
      expect(computeRefund(tx, { p1: 1 }, 1, 0.05)?.pointsReversal).toBe(-5);
      // Full return: the 200 redeemed points come back, less the 10 earned.
      expect(computeRefund(tx, { p1: 2 }, 1, 0.05)?.pointsReversal).toBe(190);
    });

    it('never mints points from a sale that stored more than it could redeem', () => {
      // discountValue claims 10,000 points but the order only absorbed $10 of
      // them (200 at $0.05). Pre-clamp rows look exactly like this.
      const tx = sale({
        items: [line({ quantity: 1, total: 10 })],
        subtotal: 10,
        discount: 10,
        total: 0,
        customerId: 'c1',
        pointsEarned: 0,
        discountType: 'loyalty',
        discountValue: 10_000,
      });
      expect(computeRefund(tx, { p1: 1 }, 1, 0.05)?.pointsReversal).toBe(200);
    });
  });

  it('returns each variant against its own line', () => {
    const tx = sale({
      items: [
        line({ variantId: 'v-s', variantName: 'Small', quantity: 2, total: 20 }),
        line({ variantId: 'v-l', variantName: 'Large', quantity: 1, total: 10 }),
      ],
      subtotal: 30,
      total: 30,
    });
    const result = computeRefund(tx, { 'p1::v-s': 1 }, 1);
    expect(result?.appliedItems).toEqual({ 'p1::v-s': 1 });
    expect(result?.refundedItems).toEqual([{ productId: 'p1', variantId: 'v-s', quantity: 1 }]);
    expect(result?.fullyRefunded).toBe(false);
  });
});
