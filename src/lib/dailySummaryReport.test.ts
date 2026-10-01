import { describe, expect, it } from 'vitest';
import { generateDailySummaryText } from './dailySummaryReport';
import type { SaleTransaction, Shift } from '../types';

const shift: Shift = {
  id: 'sh-1',
  openedAt: '2026-01-01T08:00:00.000Z',
  openedBy: 'Tester',
  openingFloat: 100,
};

function cashSale(overrides: Partial<SaleTransaction> = {}): SaleTransaction {
  return {
    id: 'TX-1',
    date: '2026-01-01T12:00:00.000Z',
    items: [],
    subtotal: 10,
    discount: 0,
    discountType: 'none',
    discountValue: 0,
    tax: 0,
    total: 10,
    paymentMethod: 'cash',
    cashPaid: 10,
    cashChange: 0,
    customerId: null,
    status: 'completed',
    ...overrides,
  };
}

const report = (transactions: SaleTransaction[], digits = 2) =>
  generateDailySummaryText({
    storeName: 'Test',
    currency: '$',
    digits,
    date: '2026-01-01',
    transactions,
    shift,
  });

describe('generateDailySummaryText cash drawer audit', () => {
  it('prints the cash refunds that the expected-cash line subtracts', () => {
    // A $10 cash sale with $4 handed back: the drawer holds 100 + 10 - 4. The
    // report used to subtract the refund without ever showing it, so the lines
    // above "Expected Cash" could not be added up to it.
    const text = report([cashSale({ status: 'partial', refundedAmount: 4 })]);
    expect(text).toContain('• Cash Refunds: -$4.00');
    expect(text).toContain('• Expected Cash in Drawer: $106.00');
  });

  it('shows no refund row when nothing was refunded', () => {
    expect(report([cashSale()])).not.toContain('Cash Refunds');
  });

  it('does not charge a card refund to the drawer', () => {
    const card = cashSale({ paymentMethod: 'card', cashPaid: undefined, refundedAmount: 4 });
    expect(report([card])).not.toContain('Cash Refunds');
  });

  it('prints the refund to the currency digits', () => {
    const text = report([cashSale({ status: 'partial', refundedAmount: 4.125 })], 3);
    expect(text).toContain('• Cash Refunds: -$4.125');
  });
});
