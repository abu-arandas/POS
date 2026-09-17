import { describe, expect, it } from 'vitest';
import { summarizeTenders, tenderBreakdown } from './payments';
import type { Payment, SaleTransaction } from '../types';

/** A sale with only the fields the tender maths reads. */
function sale(overrides: Partial<SaleTransaction>): SaleTransaction {
  return {
    id: 'TX-TEST',
    date: '2026-01-01T12:00:00.000Z',
    items: [],
    subtotal: 0,
    discount: 0,
    discountType: 'none',
    discountValue: 0,
    tax: 0,
    total: 0,
    paymentMethod: 'cash',
    customerId: null,
    status: 'completed',
    ...overrides,
  };
}

const sum = (breakdown: Partial<Record<string, number>>) =>
  Number(
    Object.values(breakdown)
      .reduce((total: number, amount) => total + (amount ?? 0), 0)
      .toFixed(2),
  );

describe('summarizeTenders', () => {
  it('attributes change to cash and picks the largest tender as dominant', () => {
    const payments: Payment[] = [
      { method: 'cash', amount: 15 },
      { method: 'card', amount: 20 },
    ];
    const summary = summarizeTenders(payments, 30);
    expect(summary.paidTotal).toBe(35);
    expect(summary.cashTendered).toBe(15);
    expect(summary.cashChange).toBe(5);
    expect(summary.dominantMethod).toBe('card');
    expect(summary.coversTotal).toBe(true);
  });

  it('does not report change when no cash was tendered', () => {
    const summary = summarizeTenders([{ method: 'card', amount: 30 }], 30);
    expect(summary.cashChange).toBe(0);
  });

  it('tolerates a half-cent shortfall so float noise cannot refuse a paid sale', () => {
    expect(summarizeTenders([{ method: 'card', amount: 29.999 }], 30).coversTotal).toBe(true);
    expect(summarizeTenders([{ method: 'card', amount: 29.98 }], 30).coversTotal).toBe(false);
  });
});

describe('tenderBreakdown', () => {
  // The invariant the reporting bug violated: whatever the tender mix, the
  // per-method amounts add up to exactly what the sale was worth.
  it('sums to the sale total on a split sale', () => {
    const tx = sale({
      total: 30,
      paymentMethod: 'card',
      payments: [
        { method: 'cash', amount: 10 },
        { method: 'card', amount: 20 },
      ],
    });
    expect(tenderBreakdown(tx)).toEqual({ cash: 10, card: 20 });
    expect(sum(tenderBreakdown(tx))).toBe(tx.total);
  });

  it('takes change back out of the cash line, not the card line', () => {
    const tx = sale({
      total: 30,
      paymentMethod: 'card',
      cashChange: 5,
      payments: [
        { method: 'cash', amount: 15 },
        { method: 'card', amount: 20 },
      ],
    });
    expect(tenderBreakdown(tx)).toEqual({ cash: 10, card: 20 });
    expect(sum(tenderBreakdown(tx))).toBe(tx.total);
  });

  it('nets an overpaid single cash sale down to the total', () => {
    const tx = sale({ total: 27.04, paymentMethod: 'cash', cashPaid: 50, cashChange: 22.96 });
    expect(tenderBreakdown(tx)).toEqual({ cash: 27.04 });
  });

  it('falls back to the total for a cash sale written before cashPaid existed', () => {
    const tx = sale({ total: 12.5, paymentMethod: 'cash' });
    expect(tenderBreakdown(tx)).toEqual({ cash: 12.5 });
  });

  it('puts a single non-cash sale entirely on its own method', () => {
    expect(tenderBreakdown(sale({ total: 30, paymentMethod: 'card' }))).toEqual({ card: 30 });
    expect(tenderBreakdown(sale({ total: 8, paymentMethod: 'mobile' }))).toEqual({ mobile: 8 });
  });

  it('merges repeated tender lines of the same method', () => {
    const tx = sale({
      total: 30,
      paymentMethod: 'cash',
      payments: [
        { method: 'cash', amount: 10 },
        { method: 'cash', amount: 20 },
      ],
    });
    expect(tenderBreakdown(tx)).toEqual({ cash: 30 });
  });

  it('ignores non-finite and non-positive tender lines', () => {
    const tx = sale({
      total: 20,
      paymentMethod: 'card',
      payments: [
        { method: 'card', amount: 20 },
        { method: 'cash', amount: Number.NaN },
        { method: 'gift', amount: 0 },
      ],
    });
    expect(tenderBreakdown(tx)).toEqual({ card: 20 });
  });
});
