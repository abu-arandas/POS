import { describe, it, expect } from 'vitest';
import { buildReceiptHtml, buildKitchenTicketHtml } from '../../src/lib/receiptPrinter';
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

  it('renders a real (SVG) barcode of the receipt id when showBarcode is on', () => {
    const withBarcode = buildReceiptHtml(baseTx, settings, printer);
    const without = buildReceiptHtml(baseTx, settings, { ...printer, showBarcode: false });
    // crispEdges is unique to the barcode SVG (the logo SVG lacks it), so it
    // cleanly distinguishes barcode-present from barcode-absent.
    expect(withBarcode).toContain('shape-rendering="crispEdges"');
    expect(withBarcode).toContain('barcode-label');
    expect(withBarcode).toContain('TX-ABCD1234');
    expect(withBarcode).not.toContain('|||||'); // the old decorative placeholder is gone
    expect(without).not.toContain('shape-rendering="crispEdges"');
    expect(without).not.toContain('barcode-label');
  });

  it('breaks out unit price for multi-qty lines, item count, and tax rate', () => {
    const multi: SaleTransaction = {
      ...baseTx,
      items: [{ productId: 'p1', productName: 'Latte', price: 4.5, cost: 0.9, quantity: 2, total: 9 }],
    };
    const html = buildReceiptHtml(multi, settings, printer);
    expect(html).toContain('@ $4.50 ea');
    expect(html).toContain('ITEMS:');
    expect(html).toContain('TAX (8.5%):'); // settings.taxRate = 8.5
  });

  it('shows a YOU SAVED banner and earned points where applicable', () => {
    const tx: SaleTransaction = {
      ...baseTx,
      discount: 2,
      customerName: 'Ann',
      pointsEarned: 12,
    };
    const html = buildReceiptHtml(tx, settings, printer);
    expect(html).toContain('YOU SAVED $2.00');
    expect(html).toContain('POINTS EARNED:');
    expect(html).toContain('>12<');
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

describe('buildKitchenTicketHtml', () => {
  it('renders the order id, items, and item count', () => {
    const html = buildKitchenTicketHtml(baseTx, settings);
    expect(html).toContain('KITCHEN');
    expect(html).toContain('TX-ABCD1234');
    expect(html).toContain('2x Latte');
    expect(html).toContain('2 ITEMS');
  });

  it('never leaks prices or payment details to the kitchen', () => {
    const html = buildKitchenTicketHtml(baseTx, settings);
    expect(html).not.toContain('$');
    expect(html).not.toContain('TOTAL');
    expect(html).not.toContain('METHOD');
  });

  it('escapes hostile product names (stored-XSS defense)', () => {
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
    const html = buildKitchenTicketHtml(evil, settings);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});
