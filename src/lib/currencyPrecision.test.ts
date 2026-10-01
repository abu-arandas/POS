// One sale, followed through every place that turns it into money — checkout,
// refund, the drawer, the receipt, the export — for a currency with three
// fractional digits. The unit tests for each module pin its own rounding; this
// file pins that they all round the SAME way, which is the property that was
// missing when each of them hard-coded `toFixed(2)`.
import { describe, expect, it } from 'vitest';
import { buildSaleTransaction, type CheckoutRequest } from './checkout';
import { transactionsToCsvRows } from './csv';
import { generateDailySummaryText } from './dailySummaryReport';
import { receiptPlainText } from './digitalReceipt';
import { currencyDigits } from './money';
import { buildReceiptDoc } from './printing/receiptDoc';
import { computeRefund } from './refunds';
import { summarizeShift } from './shiftReport';
import type { PrinterConfig, SaleTransaction, StoreSettings } from '../types';

const settingsFor = (currency: string, taxRate = 16): StoreSettings => ({
  storeName: 'Test',
  storeAddress: '',
  storePhone: '',
  taxRate,
  currency,
  loyaltyPointsRate: 0,
  loyaltyPointValue: 0,
});

const PRINTER: PrinterConfig = {
  type: 'system',
  paperSize: '80mm',
  showBarcode: false,
  footerMessage: '',
  autoPrintOnCheckout: false,
};

function request(settings: StoreSettings, overrides: Partial<CheckoutRequest> = {}) {
  return {
    cartItems: [
      { productId: 'a', productName: 'Tea', price: 3.335, cost: 1, quantity: 2 },
      { productId: 'b', productName: 'Cake', price: 1.25, cost: 0.5, quantity: 1 },
    ],
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
    settings,
    ...overrides,
  } satisfies CheckoutRequest;
}

function sold(settings: StoreSettings, overrides: Partial<CheckoutRequest> = {}): SaleTransaction {
  const outcome = buildSaleTransaction(request(settings, overrides));
  if (!outcome.success) throw new Error(`checkout refused: ${outcome.error}`);
  return outcome.transaction;
}

describe('a JOD sale keeps its fils from checkout to export', () => {
  const settings = settingsFor('JOD');
  const digits = currencyDigits(settings);
  const tx = sold(settings);

  it('rounds the sale to three digits, not two', () => {
    // 3.335×2 + 1.25 = 7.920; 16% tax = 1.2672 -> 1.267; total 9.187.
    // At two digits this sale was 7.92 / 1.27 / 9.19.
    expect(digits).toBe(3);
    expect(tx.subtotal).toBe(7.92);
    expect(tx.tax).toBe(1.267);
    expect(tx.total).toBe(9.187);
  });

  it('owes change to the fil', () => {
    expect(tx.cashPaid).toBe(10);
    expect(tx.cashChange).toBe(0.813);
  });

  it('refunds exactly the total, however the lines come back', () => {
    const first = computeRefund(tx, { a: 1 }, 0, 0, digits);
    expect(first).not.toBeNull();
    const afterFirst: SaleTransaction = {
      ...tx,
      status: 'partial',
      refundedItems: first!.refundedItems,
      refundedAmount: first!.refundedAmount,
    };
    const second = computeRefund(afterFirst, { a: 1, b: 1 }, 0, 0, digits);
    expect(second!.fullyRefunded).toBe(true);
    // The instalments are prorated to the fil — at two digits the first would
    // hand back 3.87 and the second 5.317. The cumulative scheme makes them sum to
    // the sale at ANY precision, so the sum alone cannot tell the two apart.
    expect(first!.refundAmount).toBe(3.869);
    expect(second!.refundAmount).toBe(5.318);
    expect(Number((first!.refundAmount + second!.refundAmount).toFixed(3))).toBe(tx.total);
  });

  it('reconciles the drawer to the fil', () => {
    const shift = summarizeShift([tx], digits);
    expect(shift.grossSales).toBe(9.187);
    expect(shift.cashSales).toBe(9.187);
    expect(shift.expectedCash(5)).toBe(14.187);
  });

  it('prints three digits on the thermal/HTML receipt rows', () => {
    const rows = JSON.stringify(buildReceiptDoc(tx, settings, PRINTER));
    expect(rows).toContain('JOD9.187');
    expect(rows).toContain('JOD1.267');
    expect(rows).toContain('JOD0.813');
    expect(rows).not.toContain('JOD9.19');
  });

  it('prints three digits on the shared plain-text receipt', () => {
    const text = receiptPlainText(tx, settings);
    expect(text).toContain('Total: JOD9.187');
    expect(text).toContain('Tax: JOD1.267');
  });

  it('exports three digits to CSV', () => {
    const [row] = transactionsToCsvRows([tx], digits);
    expect(row).toMatchObject({
      subtotal: '7.920',
      tax: '1.267',
      total: '9.187',
      refunded: '0.000',
    });
  });

  it('writes the daily summary to three digits', () => {
    const text = generateDailySummaryText({
      storeName: 'Test',
      currency: settings.currency,
      digits,
      date: '2026-01-01',
      transactions: [tx],
    });
    expect(text).toContain('Gross Revenue: JOD9.187');
    expect(text).toContain('Tax Collected: JOD1.267');
  });

  it('refuses a tender 0.001 short of the total, which two digits could not see', () => {
    const outcome = buildSaleTransaction(request(settings, { cashPaidText: '9.186' }));
    expect(outcome).toEqual({ success: false, error: 'insufficient-cash' });
  });

  it('accepts a split that covers the total to the fil, and rejects one that is a fil short', () => {
    const split = (card: number, cash: number) =>
      buildSaleTransaction(
        request(settings, {
          splitMode: true,
          splitPayments: [
            { method: 'card', amount: card },
            { method: 'cash', amount: cash },
          ],
        }),
      );
    expect(split(5, 4.187).success).toBe(true);
    expect(split(5, 4.186)).toEqual({ success: false, error: 'split-incomplete' });
  });
});

describe('currencies that are not three-digit are untouched', () => {
  it('rounds a dollar sale to cents exactly as before', () => {
    const tx = sold(settingsFor('$'));
    expect(tx.subtotal).toBe(7.92);
    expect(tx.tax).toBe(1.27);
    expect(tx.total).toBe(9.19);
    expect(tx.cashChange).toBe(0.81);
  });

  it('treats an ISO USD code the same as the symbol', () => {
    expect(sold(settingsFor('USD')).total).toBe(9.19);
  });

  it('rounds a yen sale to whole units', () => {
    const tx = sold(settingsFor('JPY'), { cashPaidText: '20' });
    expect(tx.total).toBe(9);
    expect(tx.cashChange).toBe(11);
    expect(receiptPlainText(tx, settingsFor('JPY'))).toContain('Total: JPY9');
  });
});
