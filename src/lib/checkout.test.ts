import { describe, it, expect } from 'vitest';
import { buildSaleTransaction, CheckoutInput } from './checkout';

// $25 cart: 2x10 + 1x5. 10% tax on the (undiscounted) subtotal → total 27.50.
const base: CheckoutInput = {
  id: 'TX-TEST',
  date: '2026-07-18T10:00:00.000Z',
  items: [
    { productId: 'a', productName: 'A', price: 10, cost: 4, quantity: 2 },
    { productId: 'b', productName: 'B', price: 5, cost: 2, quantity: 1 },
  ],
  totals: { subtotal: 25, discountAmount: 0, taxAmount: 2.5, totalAmount: 27.5 },
  discountType: 'none',
  discountValue: 0,
  payment: { mode: 'single', method: 'card', cashPaid: 0 },
  customer: null,
  operator: { id: 'u-1', name: 'Admin' },
  shiftId: 'shift-1',
  settings: { loyaltyPointsRate: 1, loyaltyPointValue: 0.05 },
};

const ok = (input: CheckoutInput) => {
  const r = buildSaleTransaction(input);
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.transaction;
};

describe('buildSaleTransaction — single tender', () => {
  it('assembles a card sale with per-line totals and metadata', () => {
    const tx = ok(base);
    expect(tx.paymentMethod).toBe('card');
    expect(tx.items.map((i) => i.total)).toEqual([20, 5]);
    expect(tx.cashPaid).toBeUndefined();
    expect(tx.cashChange).toBeUndefined();
    expect(tx.payments).toBeUndefined();
    expect(tx.pointsEarned).toBeUndefined(); // no customer linked
    expect(tx.operatorName).toBe('Admin');
    expect(tx.shiftId).toBe('shift-1');
    expect(tx.status).toBe('completed');
  });

  it('rejects insufficient cash and accepts exact/over tender with change', () => {
    const cash = (cashPaid: number) => ({
      ...base,
      payment: { mode: 'single', method: 'cash', cashPaid } as const,
    });
    expect(buildSaleTransaction(cash(20))).toEqual({ ok: false, error: 'insufficient-cash' });
    const tx = ok(cash(30));
    expect(tx.paymentMethod).toBe('cash');
    expect(tx.cashPaid).toBe(30);
    expect(tx.cashChange).toBe(2.5);
  });

  it('treats a fully points-covered $0 sale as a loyalty redemption needing no cash', () => {
    const tx = ok({
      ...base,
      totals: { subtotal: 25, discountAmount: 25, taxAmount: 0, totalAmount: 0 },
      discountType: 'loyalty',
      discountValue: 500,
      payment: { mode: 'single', method: 'cash', cashPaid: 0 },
      customer: { id: 'c1', name: 'Sam' },
    });
    expect(tx.paymentMethod).toBe('loyalty');
    expect(tx.discountValue).toBe(500); // 25 / 0.05 — fully used
  });

  it('keeps the chosen method for a $0 non-loyalty sale (100% promo)', () => {
    const tx = ok({
      ...base,
      totals: { subtotal: 25, discountAmount: 25, taxAmount: 0, totalAmount: 0 },
      discountType: 'percentage',
      discountValue: 100,
    });
    expect(tx.paymentMethod).toBe('card');
  });

  it('earns floor(total × rate) points only when a customer is linked', () => {
    const tx = ok({ ...base, customer: { id: 'c1', name: 'Sam' } });
    expect(tx.pointsEarned).toBe(27); // floor(27.50 × 1)
    expect(tx.customerId).toBe('c1');
  });

  it('clamps a stale loyalty selection to the points actually redeemed', () => {
    // 200 points selected ($10) but the cart shrank: only $5 was discounted.
    const tx = ok({
      ...base,
      totals: { subtotal: 5, discountAmount: 5, taxAmount: 0, totalAmount: 0 },
      discountType: 'loyalty',
      discountValue: 200,
      customer: { id: 'c1', name: 'Sam' },
    });
    expect(tx.discountValue).toBe(100); // ceil(5 / 0.05)
  });
});

describe('buildSaleTransaction — split tenders', () => {
  it('rejects tenders that do not cover the total', () => {
    const r = buildSaleTransaction({
      ...base,
      payment: { mode: 'split', payments: [{ method: 'card', amount: 10 }] },
    });
    expect(r).toEqual({ ok: false, error: 'split-incomplete' });
  });

  it('rejects non-cash overpayment (change can only be given for cash)', () => {
    const r = buildSaleTransaction({
      ...base,
      payment: {
        mode: 'split',
        payments: [
          { method: 'card', amount: 30 },
          { method: 'mobile', amount: 5 },
        ],
      },
    });
    expect(r).toEqual({ ok: false, error: 'split-overpay-noncash' });
  });

  it('records the breakdown, dominant method, and cash change for a valid split', () => {
    const tx = ok({
      ...base,
      payment: {
        mode: 'split',
        payments: [
          { method: 'card', amount: 20 },
          { method: 'cash', amount: 10 },
        ],
      },
    });
    expect(tx.paymentMethod).toBe('card'); // largest tender
    expect(tx.payments).toHaveLength(2);
    expect(tx.cashPaid).toBe(10);
    expect(tx.cashChange).toBe(2.5); // 30 paid − 27.50
  });

  it('collapses a single-line split into a plain sale (no payments array)', () => {
    const tx = ok({
      ...base,
      payment: {
        mode: 'split',
        payments: [
          { method: 'cash', amount: 30 },
          { method: 'card', amount: 0 }, // blank line, filtered out
        ],
      },
    });
    expect(tx.payments).toBeUndefined();
    expect(tx.paymentMethod).toBe('cash');
    expect(tx.cashChange).toBe(2.5);
  });
});
