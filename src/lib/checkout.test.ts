import { describe, it, expect } from 'vitest';
import { buildSaleTransaction, CheckoutRequest } from './checkout';

const mockSettings = {
  storeName: 'Test Store',
  storeAddress: '',
  storePhone: '',
  currency: '$',
  taxRate: 0.1,
  loyaltyPointsRate: 1, // 1 point per $1
  loyaltyPointValue: 0.05, // 20 points = $1
};

const baseReq: CheckoutRequest = {
  cartItems: [
    {
      productId: 'p1',
      productName: 'Item 1',
      price: 10,
      cost: 5,
      quantity: 2,
    },
  ],
  subtotal: 20,
  discountType: 'none',
  discountValue: 0,
  discountAmount: 0,
  taxAmount: 2,
  totalAmount: 22,

  paymentMethod: 'cash',
  splitMode: false,
  splitPayments: [],
  cashPaidText: '30',
  cashChangeDue: 8,

  selectedCustomerId: 'cust-1',
  activeCustomerName: 'Test Customer',
  currentUser: { id: 'u-1', name: 'Admin', role: 'admin', pin: '', active: true, createdAt: '' },
  currentShiftId: 'shift-1',

  settings: mockSettings,
};

describe('buildSaleTransaction', () => {
  it('builds a successful cash transaction', () => {
    const res = buildSaleTransaction(baseReq);
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.transaction.total).toBe(22);
    expect(res.transaction.paymentMethod).toBe('cash');
    expect(res.transaction.cashPaid).toBe(30);
    expect(res.transaction.cashChange).toBe(8);
    expect(res.pointsDelta).toBe(22); // 22 total * 1 pt/$
  });

  it('rejects insufficient cash', () => {
    const res = buildSaleTransaction({ ...baseReq, cashPaidText: '20' });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toBe('insufficient-cash');
  });

  it('clamps loyalty deduction to the actual discount', () => {
    // Applied $10 loyalty discount, so we expect 200 points deducted, plus the points earned on the new total.
    // Let's say subtotal is 20, discount is 10, tax is 1 (on $10), total is 11.
    const res = buildSaleTransaction({
      ...baseReq,
      discountType: 'loyalty',
      discountValue: 500, // User typed 500 points
      discountAmount: 10, // Pricing logic clamped it to $10
      totalAmount: 11,
    });
    expect(res.success).toBe(true);
    if (!res.success) return;
    
    // Earned: 11 * 1 = 11 pts.
    // Redeemed: $10 / $0.05 = 200 pts.
    // Net: 11 - 200 = -189
    expect(res.pointsDelta).toBe(-189);
  });

  it('rejects split payment with non-cash overpay', () => {
    const res = buildSaleTransaction({
      ...baseReq,
      splitMode: true,
      splitPayments: [
        { method: 'card', amount: 15 },
        { method: 'mobile', amount: 10 },
      ],
      totalAmount: 22,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toBe('split-non-cash-overpay');
  });

  it('allows split payment with cash overpay (for change)', () => {
    const res = buildSaleTransaction({
      ...baseReq,
      splitMode: true,
      splitPayments: [
        { method: 'card', amount: 15 },
        { method: 'cash', amount: 10 },
      ],
      totalAmount: 22,
    });
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.transaction.paymentMethod).toBe('card'); // Dominant method
    expect(res.transaction.cashPaid).toBe(10);
    expect(res.transaction.cashChange).toBe(3); // 25 paid - 22 total = 3 change
  });

  it('sets paymentMethod to loyalty if sale is fully covered by points', () => {
    const res = buildSaleTransaction({
      ...baseReq,
      totalAmount: 0,
      discountType: 'loyalty',
    });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.transaction.paymentMethod).toBe('loyalty');
  });

  it('keeps original paymentMethod if sale is fully covered by promo', () => {
    const res = buildSaleTransaction({
      ...baseReq,
      totalAmount: 0,
      discountType: 'percentage', // e.g. 100% off promo
      paymentMethod: 'card', // chosen by cashier before promo applied
    });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.transaction.paymentMethod).toBe('card');
  });
});
