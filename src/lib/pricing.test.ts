import { describe, expect, it } from 'vitest';
import { calculateOrderTotals, type CheckoutItem } from './pricing';

const line = (price: number, quantity: number): CheckoutItem => ({
  productId: 'p',
  productName: 'P',
  price,
  cost: 0,
  quantity,
});

const settings = (taxRate = 0, loyaltyPointValue = 0) => ({ taxRate, loyaltyPointValue });

describe('calculateOrderTotals', () => {
  it('rounds float noise out of the subtotal', () => {
    // 0.1 * 3 is 0.30000000000000004 in binary floating point.
    const totals = calculateOrderTotals([line(0.1, 3)], 'none', 0, settings());
    expect(totals.subtotal).toBe(0.3);
    expect(totals.totalAmount).toBe(0.3);
  });

  it('rounds the binary value, not the decimal one it was written as', () => {
    // 1.115 * 3 is 3.3449999999999998, so the cent rounding lands on 3.34 —
    // toFixed sees the number that is actually stored, not "1.115". Pinned
    // because it is the kind of half-cent an operator queries, and the answer
    // has to be the same one the receipt, the tax and the total agree on.
    expect(calculateOrderTotals([line(1.115, 3)], 'none', 0, settings()).subtotal).toBe(3.34);
  });

  it('sums several lines at their own quantities', () => {
    const totals = calculateOrderTotals([line(2.5, 4), line(1.25, 2)], 'none', 0, settings());
    expect(totals.subtotal).toBe(12.5);
  });

  it('applies tax to the discounted amount, not the subtotal', () => {
    const totals = calculateOrderTotals([line(100, 1)], 'fixed', 20, settings(10));
    expect(totals.discountAmount).toBe(20);
    expect(totals.taxableAmount).toBe(80);
    expect(totals.taxAmount).toBe(8);
    expect(totals.totalAmount).toBe(88);
  });

  it('caps a percentage discount at 100 so a typo cannot go negative', () => {
    const totals = calculateOrderTotals([line(50, 1)], 'percentage', 150, settings());
    expect(totals.discountAmount).toBe(50);
    expect(totals.totalAmount).toBe(0);
  });

  it('caps a fixed discount at the order value', () => {
    const totals = calculateOrderTotals([line(20, 1)], 'fixed', 40, settings());
    expect(totals.discountAmount).toBe(20);
    expect(totals.totalAmount).toBe(0);
  });

  it('rounds a fixed discount, so the persisted figures agree with each other', () => {
    const totals = calculateOrderTotals([line(10, 1)], 'fixed', 1.234, settings());
    expect(totals.discountAmount).toBe(1.23);
    expect(totals.taxableAmount).toBe(8.77);
  });

  it('values a loyalty discount at the configured rate and caps it', () => {
    expect(
      calculateOrderTotals([line(10, 1)], 'loyalty', 100, settings(0, 0.05)).discountAmount,
    ).toBe(5);
    expect(
      calculateOrderTotals([line(10, 1)], 'loyalty', 5000, settings(0, 0.05)).discountAmount,
    ).toBe(10);
  });

  // Every input is clamped, because these figures are persisted on a financial
  // record and a negative or NaN one poisons every comparison downstream.
  it.each([
    ['negative price', line(-5, 1)],
    ['negative quantity', line(5, -1)],
    ['NaN price', line(Number.NaN, 1)],
    ['Infinity price', line(Number.POSITIVE_INFINITY, 1)],
  ])('treats a %s as zero', (_label, hostile) => {
    const totals = calculateOrderTotals([hostile], 'none', 0, settings(10));
    expect(totals.subtotal).toBe(0);
    expect(totals.totalAmount).toBe(0);
  });

  it('clamps a negative tax rate to zero rather than refunding tax', () => {
    expect(calculateOrderTotals([line(10, 1)], 'none', 0, settings(-10)).taxAmount).toBe(0);
  });

  it('ignores a negative discount value', () => {
    expect(calculateOrderTotals([line(10, 1)], 'fixed', -5, settings()).discountAmount).toBe(0);
  });

  it('is zero for an empty cart', () => {
    const totals = calculateOrderTotals([], 'percentage', 50, settings(10));
    expect(totals).toEqual({
      subtotal: 0,
      discountAmount: 0,
      taxableAmount: 0,
      taxAmount: 0,
      totalAmount: 0,
    });
  });
});
