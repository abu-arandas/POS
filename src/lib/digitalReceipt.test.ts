import { describe, it, expect } from 'vitest';
import { receiptPlainText, renderEmailTemplate, buildReceiptEmail } from './digitalReceipt';
import { SaleTransaction, StoreSettings, ReceiptEmailTemplate } from '../types';

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

describe('renderEmailTemplate', () => {
  it('fills every supported placeholder', () => {
    const out = renderEmailTemplate(
      'From {storeName}: receipt {receiptId} for {total}',
      tx,
      settings,
    );
    expect(out).toBe('From Test Store: receipt TX-9 for $8.80');
  });

  it('uses the customer name when the sale has one', () => {
    const out = renderEmailTemplate('Hi {customerName}', { ...tx, customerName: 'Eleanor' }, settings);
    expect(out).toBe('Hi Eleanor');
  });

  it('falls back to a generic greeting for walk-in sales', () => {
    expect(renderEmailTemplate('Hi {customerName}', tx, settings)).toBe('Hi there');
  });

  it('leaves unknown placeholders untouched so typos stay visible', () => {
    expect(renderEmailTemplate('{storeName} {bogusToken}', tx, settings)).toBe(
      'Test Store {bogusToken}',
    );
  });
});

describe('buildReceiptEmail', () => {
  const template: ReceiptEmailTemplate = {
    subject: 'Receipt {receiptId} — {storeName}',
    header: 'Hi {customerName}, thanks for shopping at {storeName}!',
    footer: 'See you soon — {storeName}',
  };

  it('renders subject and wraps the receipt with header and footer', () => {
    const { subject, body } = buildReceiptEmail(tx, settings, template);
    expect(subject).toBe('Receipt TX-9 — Test Store');
    const [head, ...rest] = body.split('\n\n');
    expect(head).toBe('Hi there, thanks for shopping at Test Store!');
    expect(body).toContain('Receipt: TX-9');
    expect(rest[rest.length - 1]).toBe('See you soon — Test Store');
  });

  it('omits empty header/footer sections instead of leaving blank gaps', () => {
    const { body } = buildReceiptEmail(tx, settings, { ...template, header: '', footer: '  ' });
    expect(body.startsWith('Test Store')).toBe(true);
    expect(body.endsWith('Thank you for your visit!')).toBe(true);
  });

  it('falls back to the bare receipt when no template is given', () => {
    const { subject, body } = buildReceiptEmail(tx, settings);
    expect(subject).toBe('Receipt TX-9 — Test Store');
    expect(body).toBe(receiptPlainText(tx, settings));
  });
});
