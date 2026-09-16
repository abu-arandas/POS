import { describe, it, expect } from 'vitest';
import { cashKept, netCashMovements, summarizeShift } from '../../src/lib/shiftReport';
import { CashMovement, SaleTransaction } from '../../src/types';

const sale = (over: Partial<SaleTransaction>): SaleTransaction => ({
  id: 'TX',
  date: '2026-07-16T10:00:00.000Z',
  items: [],
  subtotal: 0,
  discount: 0,
  discountType: 'none',
  discountValue: 0,
  tax: 0,
  total: 0,
  paymentMethod: 'card',
  customerId: null,
  status: 'completed',
  ...over,
});

describe('cashKept', () => {
  it('is the total for a single cash sale (change nets out)', () => {
    expect(
      cashKept(sale({ paymentMethod: 'cash', total: 13.75, cashPaid: 20, cashChange: 6.25 })),
    ).toBe(13.75);
  });
  it('is zero for card/mobile/gift', () => {
    expect(cashKept(sale({ paymentMethod: 'card', total: 10 }))).toBe(0);
  });
  it('counts only the cash tender (minus change) for a split sale', () => {
    const tx = sale({
      paymentMethod: 'card',
      total: 30,
      payments: [
        { method: 'card', amount: 20 },
        { method: 'cash', amount: 15 },
      ],
      cashChange: 5,
    });
    expect(cashKept(tx)).toBe(10); // 15 cash in - 5 change
  });
});

describe('summarizeShift', () => {
  it('tallies sales by method and computes expected cash', () => {
    const txns = [
      sale({ id: 'A', paymentMethod: 'cash', total: 20, cashPaid: 20, cashChange: 0 }),
      sale({ id: 'B', paymentMethod: 'card', total: 30 }),
      sale({ id: 'C', paymentMethod: 'mobile', total: 10 }),
    ];
    const s = summarizeShift(txns);
    expect(s.saleCount).toBe(3);
    expect(s.grossSales).toBe(60);
    expect(s.cashSales).toBe(20);
    expect(s.cardSales).toBe(30);
    expect(s.mobileSales).toBe(10);
    expect(s.expectedCash(100)).toBe(120); // float 100 + 20 cash
  });

  it('nets refunds out of gross and removes cash refunds from the drawer', () => {
    const txns = [
      sale({
        id: 'A',
        paymentMethod: 'cash',
        total: 50,
        cashPaid: 50,
        cashChange: 0,
        status: 'partial',
        refundedAmount: 20,
      }),
      sale({
        id: 'B',
        paymentMethod: 'cash',
        total: 10,
        cashPaid: 10,
        cashChange: 0,
        status: 'refunded',
        refundedAmount: 10,
      }),
    ];
    const s = summarizeShift(txns);
    // gross: A nets 30 (50-20), B fully refunded nets 0 → 30
    expect(s.grossSales).toBe(30);
    // cash taken: A 50 + B 10 = 60; cash refunds: 20 + 10 = 30
    expect(s.cashSales).toBe(60);
    expect(s.cashRefunds).toBe(30);
    expect(s.expectedCash(0)).toBe(30); // 0 + 60 - 30
  });

  it('prorates cash refunds for split sales', () => {
    const tx = sale({
      id: 'C',
      paymentMethod: 'card',
      total: 100,
      payments: [
        { method: 'card', amount: 80 },
        { method: 'cash', amount: 20 },
      ],
      cashChange: 0,
      status: 'partial',
      refundedAmount: 50,
    });
    const s = summarizeShift([tx]);
    // The sale was 20% cash. Refunded $50 total, so $10 of that is cash out.
    expect(s.grossSales).toBe(50);
    expect(s.cashSales).toBe(20);
    expect(s.cashRefunds).toBe(10);
    expect(s.expectedCash(0)).toBe(10); // 0 + 20 cash - 10 refund
  });
});

const movement = (over: Partial<CashMovement>): CashMovement => ({
  id: 'cm',
  shiftId: 'shift-1',
  type: 'pay_out',
  amount: 0,
  reason: 'test',
  performedBy: 'Ada',
  createdAt: '2026-07-16T10:00:00.000Z',
  ...over,
});

describe('petty cash movements', () => {
  it('nets pay-ins against pay-outs', () => {
    expect(
      netCashMovements([
        movement({ type: 'pay_in', amount: 100 }),
        movement({ type: 'pay_out', amount: 30 }),
        movement({ type: 'pay_out', amount: 12.5 }),
      ]),
    ).toBe(57.5);
  });

  it('counts nothing when there are no movements', () => {
    expect(netCashMovements([])).toBe(0);
  });

  /**
   * The Shift screen added the movements to expectedCash() itself while the
   * printed Z-report called expectedCash() alone, so the figure on screen and
   * the figure on the document that reconciles the drawer disagreed by exactly
   * the net movement. Taking them as a parameter is what stops that recurring:
   * a caller that forgets them now reads as a caller that has none.
   */
  it('moves the expected drawer total, so screen and Z-report cannot disagree', () => {
    const cashSale = sale({ paymentMethod: 'cash', total: 40, cashPaid: 50, cashChange: 10 });
    const summary = summarizeShift([cashSale]);

    expect(summary.expectedCash(100)).toBe(140);
    expect(summary.expectedCash(100, [])).toBe(140);
    expect(summary.expectedCash(100, [movement({ type: 'pay_out', amount: 25 })])).toBe(115);
    expect(summary.expectedCash(100, [movement({ type: 'pay_in', amount: 25 })])).toBe(165);
  });
});
