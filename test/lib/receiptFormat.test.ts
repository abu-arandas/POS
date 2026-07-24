import { describe, it, expect } from 'vitest';
import {
  formatDateTime,
  defaultReceiptLayout,
  defaultKitchenLayout,
  legacyLayout,
  resolveCustomerLayout,
  resolveKitchenLayout,
  allTogglesOn,
} from '../../src/lib/receiptFormat';
import { PrinterConfig } from '../../src/types';

// A fixed local date: 2026-03-07, 14:05:09.
const D = new Date(2026, 2, 7, 14, 5, 9);

describe('formatDateTime', () => {
  it('formats common date patterns', () => {
    expect(formatDateTime(D, 'yyyy-MM-dd')).toBe('2026-03-07');
    expect(formatDateTime(D, 'dd/MM/yyyy')).toBe('07/03/2026');
    expect(formatDateTime(D, 'MM/dd/yyyy')).toBe('03/07/2026');
    expect(formatDateTime(D, 'd-M-yy')).toBe('7-3-26');
  });

  it('formats 12h and 24h time, with AM/PM', () => {
    expect(formatDateTime(D, 'HH:mm')).toBe('14:05');
    expect(formatDateTime(D, 'h:mm a')).toBe('2:05 PM');
    expect(formatDateTime(D, 'HH:mm:ss')).toBe('14:05:09');
  });

  it('renders 12 (not 0) for noon and midnight in 12h mode', () => {
    expect(formatDateTime(new Date(2026, 0, 1, 0, 30), 'h:mm a')).toBe('12:30 AM');
    expect(formatDateTime(new Date(2026, 0, 1, 12, 30), 'h:mm a')).toBe('12:30 PM');
  });

  it('passes unknown separators through unchanged', () => {
    expect(formatDateTime(D, 'yyyy.MM.dd @ HH:mm')).toBe('2026.03.07 @ 14:05');
  });
});

describe('layout defaults', () => {
  it('customer default shows everything except the new branch/tax blocks', () => {
    const l = defaultReceiptLayout();
    expect(l.show.storeName).toBe(true);
    expect(l.show.priceColumn).toBe(true);
    expect(l.show.branchName).toBe(false);
    expect(l.show.taxNumber).toBe(false);
  });

  it('kitchen default hides prices, totals, payment, logo, and barcode', () => {
    const k = defaultKitchenLayout();
    expect(k.show.priceColumn).toBe(false);
    expect(k.show.totals).toBe(false);
    expect(k.show.paymentDetails).toBe(false);
    expect(k.show.logo).toBe(false);
    expect(k.show.barcode).toBe(false);
    // still shows what the kitchen needs
    expect(k.show.receiptNumber).toBe(true);
    expect(k.show.time).toBe(true);
  });
});

describe('legacy resolution (backward compatibility)', () => {
  const printer: PrinterConfig = {
    type: 'system',
    paperSize: '80mm',
    showBarcode: false,
    footerMessage: 'Come again!',
    autoPrintOnCheckout: true,
  };

  it('legacyLayout carries the footer + barcode flag from the printer config', () => {
    const l = legacyLayout(printer);
    expect(l.footer).toBe('Come again!');
    expect(l.show.barcode).toBe(false);
    expect(l.show.storeName).toBe(true);
  });

  it('resolveCustomerLayout falls back to legacy when none is given', () => {
    expect(resolveCustomerLayout(undefined, printer).footer).toBe('Come again!');
    const explicit = { ...defaultReceiptLayout(), footer: 'X' };
    expect(resolveCustomerLayout(explicit, printer).footer).toBe('X');
  });

  it('resolveKitchenLayout falls back to the kitchen default', () => {
    expect(resolveKitchenLayout(undefined).show.priceColumn).toBe(false);
  });

  it('allTogglesOn turns every field on', () => {
    expect(Object.values(allTogglesOn()).every(Boolean)).toBe(true);
  });
});
