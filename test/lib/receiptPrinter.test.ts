import { describe, it, expect } from 'vitest';
import { buildReceiptHtml } from '../../src/lib/receiptPrinter';
import { SaleTransaction, StoreSettings, PrinterConfig } from '../../src/types';

const settings: StoreSettings = {
  storeName: 'Test Store',
  storeAddress: '1 Main St',
  storePhone: '555-0100',
  storeLogo: '',
  taxRate: 8.5,
  currency: '$',
  loyaltyPointsRate: 1,
  loyaltyPointValue: 0.05,
};

const printer: PrinterConfig = {
  type: 'system',
  paperSize: '80mm',
  showBarcode: true,
  footerMessage: 'Thanks!',
  autoPrintOnCheckout: true,
};

const baseTx: SaleTransaction = {
  id: 'TX-ABCD1234',
  date: '2026-07-16T10:00:00.000Z',
  items: [{ productId: 'p1', productName: 'Latte', price: 4.5, cost: 0.9, quantity: 2, total: 9 }],
  subtotal: 9,
  discount: 0,
  discountType: 'none',
  discountValue: 0,
  tax: 0.77,
  total: 9.77,
  paymentMethod: 'card',
  customerId: null,
  status: 'completed',
};

describe('buildReceiptHtml', () => {
  it('renders the core receipt fields', () => {
    const html = buildReceiptHtml(baseTx, settings, printer);
    expect(html).toContain('TX-ABCD1234');
    expect(html).toContain('Test Store');
    expect(html).toContain('2x Latte');
    expect(html).toContain('$9.77');
  });

  it('escapes hostile product and store names (stored-XSS defense)', () => {
    const evil: SaleTransaction = {
      ...baseTx,
      items: [
        {
          productId: 'p1',
          productName: '<img src=x onerror="alert(1)">',
          price: 1,
          cost: 0,
          quantity: 1,
          total: 1,
        },
      ],
    };
    const evilSettings = { ...settings, storeName: '<script>alert(2)</script>' };
    const html = buildReceiptHtml(evil, evilSettings, printer);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert(2)');
    expect(html).toContain('&lt;img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('shows cash lines only for cash payments', () => {
    const cash: SaleTransaction = {
      ...baseTx,
      paymentMethod: 'cash',
      cashPaid: 10,
      cashChange: 0.23,
    };
    expect(buildReceiptHtml(cash, settings, printer)).toContain('CASH PAID:');
    expect(buildReceiptHtml(baseTx, settings, printer)).not.toContain('CASH PAID:');
  });

  it('omits the barcode block when showBarcode is off', () => {
    const withBarcode = buildReceiptHtml(baseTx, settings, printer);
    const without = buildReceiptHtml(baseTx, settings, { ...printer, showBarcode: false });
    expect(withBarcode).toContain('AUTH-TX-ABCD1234');
    expect(without).not.toContain('AUTH-TX-ABCD1234');
  });

  it('shows the refund authorizer when present', () => {
    const refunded: SaleTransaction = {
      ...baseTx,
      status: 'refunded',
      refundDate: '2026-07-16T12:00:00.000Z',
      refundAuthorizedBy: 'Jane (manager)',
    };
    const html = buildReceiptHtml(refunded, settings, printer);
    expect(html).toContain('REFUND AUTH:');
    expect(html).toContain('Jane (manager)');
  });
});
