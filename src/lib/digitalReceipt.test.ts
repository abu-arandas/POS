import { describe, it, expect } from 'vitest';
import { receiptPlainText } from './digitalReceipt';
import { SaleTransaction, StoreSettings } from '../types';

const settings: StoreSettings = {
  storeName: 'Test Store',
  storeAddress: '1 Main St',
  storePhone: '555-0100',
  taxRate: 10,
  currency: '$',
  loyaltyPointsRate: 1,
  loyaltyPointValue: 0.05,
};
const tx: SaleTransaction = {
  id: 'TX-9',
  date: '2026-07-16T10:00:00.000Z',
  items: [{ productId: 'p', productName: 'Latte', price: 4.5, cost: 0.9, quantity: 2, total: 9 }],
  subtotal: 9,
  discount: 1,
  discountType: 'fixed',
  discountValue: 1,
  tax: 0.8,
  total: 8.8,
  paymentMethod: 'card',
  customerId: null,
  status: 'completed',
};

describe('receiptPlainText', () => {
  it('includes store, id, items and totals', () => {
    const txt = receiptPlainText(tx, settings);
    expect(txt).toContain('Test Store');
    expect(txt).toContain('Receipt: TX-9');
    expect(txt).toContain('2x Latte  $9.00');
    expect(txt).toContain('Discount: -$1.00');
    expect(txt).toContain('Total: $8.80');
    expect(txt).toContain('Paid via: CARD');
  });

  it('lists split-payment lines', () => {
    const split = {
      ...tx,
      payments: [
        { method: 'cash' as const, amount: 5 },
        { method: 'card' as const, amount: 3.8 },
      ],
    };
    const txt = receiptPlainText(split, settings);
    expect(txt).toContain('CASH: $5.00');
    expect(txt).toContain('CARD: $3.80');
  });

  it('shows a refunded amount when present', () => {
    expect(receiptPlainText({ ...tx, refundedAmount: 4.4 }, settings)).toContain('Refunded: $4.40');
  });
});
