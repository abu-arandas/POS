import { describe, expect, it } from 'vitest';
import { cashKept, netCashMovements, summarizeShift } from './shiftReport';
import type { CashMovement, SaleTransaction } from '../types';

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

function movement(overrides: Partial<CashMovement>): CashMovement {
  return {
    id: 'cm-1',
    shiftId: 'shift-1',
    type: 'pay_in',
    amount: 0,
    reason: 'test',
    performedBy: 'Tester',
    createdAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('cashKept', () => {
  it('is the total on an exact cash sale', () => {
    expect(cashKept(sale({ total: 12.5, paymentMethod: 'cash', cashPaid: 12.5 }))).toBe(12.5);
  });

  it('excludes change from an overpaid cash sale', () => {
    expect(
      cashKept(sale({ total: 27.04, paymentMethod: 'cash', cashPaid: 50, cashChange: 22.96 })),
    ).toBe(27.04);
  });

  it('is zero on a card sale', () => {
    expect(cashKept(sale({ total: 30, paymentMethod: 'card' }))).toBe(0);
  });

  it('counts only the cash line of a split sale', () => {
    const tx = sale({
      total: 30,
      paymentMethod: 'card',
      payments: [
        { method: 'cash', amount: 10 },
        { method: 'card', amount: 20 },
      ],
    });
    expect(cashKept(tx)).toBe(10);
  });
});

describe('netCashMovements', () => {
  it('adds pay-ins and subtracts pay-outs', () => {
    expect(
      netCashMovements([
        movement({ type: 'pay_in', amount: 50 }),
        movement({ type: 'pay_out', amount: 20 }),
      ]),
    ).toBe(30);
  });

  it('is zero with no movements', () => {
    expect(netCashMovements([])).toBe(0);
  });
});

describe('summarizeShift', () => {
  // The regression this file exists for. The breakdown used to take cash from
  // the real tender lines but card/mobile/gift from the DOMINANT method at the
  // sale's full value, so this £30 sale reported CASH 10 + CARD 30 = £40 of
  // tender on the document that reconciles the drawer.
  it('does not double-count a split sale across cash and card', () => {
    const split = sale({
      total: 30,
      paymentMethod: 'card',
      payments: [
        { method: 'cash', amount: 10 },
        { method: 'card', amount: 20 },
      ],
    });
    const s = summarizeShift([split]);
    expect(s.grossSales).toBe(30);
    expect(s.cashSales).toBe(10);
    expect(s.cardSales).toBe(20);
    expect(s.cashSales + s.cardSales + s.mobileSales + s.giftSales).toBe(s.grossSales);
  });

  it('splits a three-way tender across its own methods', () => {
    const tx = sale({
      total: 100,
      paymentMethod: 'card',
      payments: [
        { method: 'cash', amount: 25 },
        { method: 'card', amount: 50 },
        { method: 'mobile', amount: 25 },
      ],
    });
    const s = summarizeShift([tx]);
    expect(s.cashSales).toBe(25);
    expect(s.cardSales).toBe(50);
    expect(s.mobileSales).toBe(25);
  });

  it('prorates a partial refund across the methods it was taken on', () => {
    // £30 taken as £10 cash + £20 card; half of it comes back.
    const tx = sale({
      total: 30,
      paymentMethod: 'card',
      status: 'partial',
      refundedAmount: 15,
      payments: [
        { method: 'cash', amount: 10 },
        { method: 'card', amount: 20 },
      ],
    });
    const s = summarizeShift([tx]);
    expect(s.grossSales).toBe(15);
    expect(s.cashSales).toBe(10); // gross: the drawer really did take £10
    expect(s.cashRefunds).toBe(5); // and really did give £5 back
    expect(s.cardSales).toBe(10);
    // Cash net of its refund plus the other columns still reconciles to gross.
    expect(s.cashSales - s.cashRefunds + s.cardSales).toBe(s.grossSales);
  });

  it('nets a fully refunded cash sale to nothing in the drawer', () => {
    const tx = sale({
      total: 40,
      paymentMethod: 'cash',
      cashPaid: 40,
      status: 'refunded',
      refundedAmount: 40,
    });
    const s = summarizeShift([tx]);
    expect(s.grossSales).toBe(0);
    expect(s.cashSales - s.cashRefunds).toBe(0);
    expect(s.expectedCash(100)).toBe(100);
  });

  // refundedAmount was added after refunds already existed, so a fully refunded
  // sale from an older install carries status 'refunded' and no amount at all.
  // Reading the amount alone reported its entire tender as taken — £100 of card
  // sales against £0 of gross — on the drawer-reconciliation document.
  describe('a legacy fully refunded sale carrying no refundedAmount', () => {
    it('contributes nothing to the card column', () => {
      const s = summarizeShift([sale({ total: 100, paymentMethod: 'card', status: 'refunded' })]);
      expect(s.grossSales).toBe(0);
      expect(s.cardSales).toBe(0);
    });

    it('nets to nothing in the drawer', () => {
      const s = summarizeShift([
        sale({ total: 100, paymentMethod: 'cash', cashPaid: 100, status: 'refunded' }),
      ]);
      expect(s.cashSales - s.cashRefunds).toBe(0);
      expect(s.expectedCash(50)).toBe(50);
    });

    it('zeroes every method of a split sale at once', () => {
      const s = summarizeShift([
        sale({
          total: 30,
          paymentMethod: 'card',
          status: 'refunded',
          payments: [
            { method: 'cash', amount: 10 },
            { method: 'card', amount: 20 },
          ],
        }),
      ]);
      expect(s.cardSales).toBe(0);
      expect(s.cashSales - s.cashRefunds).toBe(0);
    });
  });

  it('folds petty cash into the one expected figure', () => {
    const tx = sale({ total: 60, paymentMethod: 'cash', cashPaid: 60 });
    const s = summarizeShift([tx]);
    const movements = [
      movement({ type: 'pay_in', amount: 20 }),
      movement({ type: 'pay_out', amount: 35 }),
    ];
    // float 100 + cash 60 + pay-ins 20 - pay-outs 35
    expect(s.expectedCash(100, movements)).toBe(145);
    expect(s.expectedCash(100)).toBe(160);
  });

  it('counts an empty shift as zero, not NaN', () => {
    const s = summarizeShift([]);
    expect(s.saleCount).toBe(0);
    expect(s.grossSales).toBe(0);
    expect(s.expectedCash(50)).toBe(50);
  });
});
