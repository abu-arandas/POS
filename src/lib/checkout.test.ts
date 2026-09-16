import { describe, expect, it } from 'vitest';
import { buildSaleTransaction, type CheckoutRequest } from './checkout';
import type { OrderItem, StoreSettings } from '../types';

const SETTINGS: StoreSettings = {
  storeName: 'Test',
  storeAddress: '',
  storePhone: '',
  taxRate: 0,
  currency: '$',
  loyaltyPointsRate: 1,
  loyaltyPointValue: 0.05,
};

const cartLine = (overrides: Partial<Omit<OrderItem, 'total'>> = {}): Omit<OrderItem, 'total'> => ({
  productId: 'p1',
  productName: 'Widget',
  price: 10,
  cost: 4,
  quantity: 1,
  ...overrides,
});

function request(overrides: Partial<CheckoutRequest> = {}): CheckoutRequest {
  return {
    cartItems: [cartLine()],
    discountType: 'none',
    discountValue: 0,
    paymentMethod: 'cash',
    splitMode: false,
    splitPayments: [],
    cashPaidText: '10',
    selectedCustomerId: null,
    activeCustomerName: null,
    currentUser: null,
    currentShiftId: null,
    settings: SETTINGS,
    ...overrides,
  };
}

/** Unwraps a successful outcome, failing loudly rather than returning undefined. */
function ok(result: ReturnType<typeof buildSaleTransaction>) {
  if (!result.success) throw new Error(`expected success, got ${result.error}`);
  return result;
}

describe('buildSaleTransaction', () => {
  it('recomputes the money from the cart rather than trusting a caller', () => {
    const { transaction } = ok(buildSaleTransaction(request()));
    expect(transaction.subtotal).toBe(10);
    expect(transaction.total).toBe(10);
    expect(transaction.items[0].total).toBe(10);
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('refuses a %s line quantity', (_label, quantity) => {
    const result = buildSaleTransaction(request({ cartItems: [cartLine({ quantity })] }));
    expect(result).toEqual({ success: false, error: 'invalid-quantity' });
  });

  describe('cash tendering', () => {
    it('refuses cash that does not cover the total', () => {
      expect(buildSaleTransaction(request({ cashPaidText: '5' }))).toEqual({
        success: false,
        error: 'insufficient-cash',
      });
    });

    it('derives change from the recomputed total', () => {
      const { transaction } = ok(buildSaleTransaction(request({ cashPaidText: '50' })));
      expect(transaction.cashPaid).toBe(50);
      expect(transaction.cashChange).toBe(40);
    });

    it.each([
      ['negative', '-5'],
      ['Infinity', 'Infinity'],
    ])('refuses a %s tender outright', (_label, cashPaidText) => {
      expect(buildSaleTransaction(request({ cashPaidText }))).toEqual({
        success: false,
        error: 'insufficient-cash',
      });
    });

    it('lets a fully discounted sale complete with nothing tendered', () => {
      const { transaction } = ok(
        buildSaleTransaction(
          request({ discountType: 'percentage', discountValue: 100, cashPaidText: '' }),
        ),
      );
      expect(transaction.total).toBe(0);
      expect(transaction.cashChange).toBe(0);
    });
  });

  describe('split tendering', () => {
    it('refuses a split that does not cover the total', () => {
      const result = buildSaleTransaction(
        request({ splitMode: true, splitPayments: [{ method: 'card', amount: 4 }] }),
      );
      expect(result).toEqual({ success: false, error: 'split-incomplete' });
    });

    it('refuses a non-cash overpayment, which would record money it cannot return', () => {
      const result = buildSaleTransaction(
        request({ splitMode: true, splitPayments: [{ method: 'card', amount: 25 }] }),
      );
      expect(result).toEqual({ success: false, error: 'split-non-cash-overpay' });
    });

    it('lets cash overpay and takes the change back', () => {
      const { transaction } = ok(
        buildSaleTransaction(
          request({
            splitMode: true,
            splitPayments: [
              { method: 'card', amount: 5 },
              { method: 'cash', amount: 10 },
            ],
          }),
        ),
      );
      expect(transaction.payments).toHaveLength(2);
      expect(transaction.cashPaid).toBe(10);
      expect(transaction.cashChange).toBe(5);
      expect(transaction.paymentMethod).toBe('cash'); // largest tender
    });

    it('drops the breakdown when only one tender line survives', () => {
      const { transaction } = ok(
        buildSaleTransaction(
          request({
            splitMode: true,
            splitPayments: [
              { method: 'card', amount: 10 },
              { method: 'cash', amount: 0 },
            ],
          }),
        ),
      );
      expect(transaction.payments).toBeUndefined();
      expect(transaction.paymentMethod).toBe('card');
    });
  });

  describe('what gets persisted', () => {
    it('stores the discount actually applied, not the one requested', () => {
      const { transaction } = ok(
        buildSaleTransaction(request({ discountType: 'percentage', discountValue: 150 })),
      );
      expect(transaction.discountValue).toBe(100);
      expect(transaction.discount).toBe(10);
    });

    it('stores the point count a loyalty discount really redeemed', () => {
      // 10,000 points would be worth $500; the $10 order can only absorb 200.
      const { transaction, pointsDelta } = ok(
        buildSaleTransaction(
          request({
            discountType: 'loyalty',
            discountValue: 10_000,
            selectedCustomerId: 'c1',
            cashPaidText: '0',
          }),
        ),
      );
      expect(transaction.discount).toBe(10);
      expect(transaction.discountValue).toBe(200);
      expect(pointsDelta).toBe(-200);
    });

    it('records a points-covered sale as a loyalty redemption, not a $0 card charge', () => {
      const { transaction } = ok(
        buildSaleTransaction(
          request({
            paymentMethod: 'card',
            discountType: 'loyalty',
            discountValue: 200,
            selectedCustomerId: 'c1',
          }),
        ),
      );
      expect(transaction.total).toBe(0);
      expect(transaction.paymentMethod).toBe('loyalty');
    });

    it('stores the clamped tax rate the sale was actually charged at', () => {
      const { transaction } = ok(
        buildSaleTransaction(
          request({ settings: { ...SETTINGS, taxRate: Number.NaN }, cashPaidText: '10' }),
        ),
      );
      expect(transaction.taxRate).toBe(0);
      expect(transaction.tax).toBe(0);
    });

    it('awards no points to a walk-in', () => {
      const { transaction, pointsDelta } = ok(buildSaleTransaction(request()));
      expect(transaction.pointsEarned).toBeUndefined();
      expect(pointsDelta).toBe(0);
    });

    it('never awards NaN points from a broken rate', () => {
      const { transaction } = ok(
        buildSaleTransaction(
          request({
            selectedCustomerId: 'c1',
            settings: { ...SETTINGS, loyaltyPointsRate: Number.NaN },
          }),
        ),
      );
      expect(transaction.pointsEarned).toBe(0);
    });

    it('gives every sale a distinct id', () => {
      const a = ok(buildSaleTransaction(request())).transaction.id;
      const b = ok(buildSaleTransaction(request())).transaction.id;
      expect(a).not.toBe(b);
      expect(a.startsWith('TX-')).toBe(true);
    });
  });
});
