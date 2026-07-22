import { describe, it, expect } from 'vitest';
import { calculateOrderTotals, CheckoutItem } from '../../src/lib/pricing';

const settings = { taxRate: 10, loyaltyPointValue: 0.05 };

const item = (price: number, quantity = 1): CheckoutItem => ({
  productId: 'p1',
  productName: 'Item',
  price,
  cost: price / 2,
  quantity,
});

describe('calculateOrderTotals', () => {
  it('sums the subtotal and applies tax on it with no discount', () => {
    const r = calculateOrderTotals([item(10, 2), item(5)], 'none', 0, settings);
    expect(r.subtotal).toBe(25);
    expect(r.discountAmount).toBe(0);
    expect(r.taxAmount).toBe(2.5);
    expect(r.totalAmount).toBe(27.5);
  });

  it('returns all zeros for an empty cart', () => {
    const r = calculateOrderTotals([], 'none', 0, settings);
    expect(r.subtotal).toBe(0);
    expect(r.totalAmount).toBe(0);
  });

  it('applies a percentage discount before tax', () => {
    const r = calculateOrderTotals([item(100)], 'percentage', 10, settings);
    expect(r.discountAmount).toBe(10);
    expect(r.taxableAmount).toBe(90);
    expect(r.taxAmount).toBe(9);
    expect(r.totalAmount).toBe(99);
  });

  it('clamps percentage discounts to 100%', () => {
    const r = calculateOrderTotals([item(100)], 'percentage', 150, settings);
    expect(r.discountAmount).toBe(100);
    expect(r.totalAmount).toBe(0);
  });

  it('ignores negative percentage discounts', () => {
    const r = calculateOrderTotals([item(100)], 'percentage', -20, settings);
    expect(r.discountAmount).toBe(0);
    expect(r.totalAmount).toBe(110);
  });

  it('caps fixed discounts at the subtotal', () => {
    const r = calculateOrderTotals([item(20)], 'fixed', 50, settings);
    expect(r.discountAmount).toBe(20);
    expect(r.totalAmount).toBe(0);
  });

  it('ignores negative fixed discounts', () => {
    const r = calculateOrderTotals([item(20)], 'fixed', -5, settings);
    expect(r.discountAmount).toBe(0);
    expect(r.totalAmount).toBe(22);
  });

  it('converts loyalty points to currency at the configured rate', () => {
    // 100 points * $0.05 = $5 off
    const r = calculateOrderTotals([item(50)], 'loyalty', 100, settings);
    expect(r.discountAmount).toBe(5);
    expect(r.taxableAmount).toBe(45);
    expect(r.totalAmount).toBe(49.5);
  });

  it('caps a loyalty redemption at the subtotal', () => {
    // 9.99 subtotal, 200 points would be $10 — the recorded discount must not
    // exceed the order value.
    const r = calculateOrderTotals([item(9.99)], 'loyalty', 200, settings);
    expect(r.discountAmount).toBe(9.99);
    expect(r.taxableAmount).toBe(0);
    expect(r.totalAmount).toBe(0);
  });
});
