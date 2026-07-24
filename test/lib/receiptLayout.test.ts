import { describe, it, expect } from 'vitest';
import { buildReceiptHtml } from '../../src/lib/receiptPrinter';
import { encodeReceipt } from '../../src/lib/escpos';
import { defaultReceiptLayout } from '../../src/lib/receiptFormat';
import { SaleTransaction, StoreSettings, PrinterConfig, ReceiptLayout } from '../../src/types';

const settings: StoreSettings = {
  storeName: 'Test Store',
  storeAddress: '1 Main St',
  storePhone: '555-0100',
  branchName: 'Downtown',
  taxNumber: 'VAT-999',
  taxRate: 10,
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
const tx: SaleTransaction = {
  id: 'TX-1',
  date: '2026-07-16T10:00:00.000Z',
  items: [{ productId: 'p', productName: 'Latte', price: 4.5, cost: 0.9, quantity: 2, total: 9 }],
  subtotal: 9,
  discount: 0,
  discountType: 'none',
  discountValue: 0,
  tax: 0.9,
  total: 9.9,
  paymentMethod: 'card',
  customerId: null,
  status: 'completed',
};

const asciiOf = (u: Uint8Array) =>
  Array.from(u)
    .filter((b) => b >= 32 && b < 127)
    .map((b) => String.fromCharCode(b))
    .join('');

describe('buildReceiptHtml honors the layout', () => {
  it('hides toggled-off blocks (phone, totals, barcode) and shows header', () => {
    const layout: ReceiptLayout = {
      ...defaultReceiptLayout(),
      header: 'WELCOME',
      show: { ...defaultReceiptLayout().show, phone: false, totals: false, barcode: false },
    };
    const html = buildReceiptHtml(tx, settings, printer, layout);
    expect(html).toContain('WELCOME');
    expect(html).not.toContain('Phone:');
    expect(html).not.toContain('TOTAL PAID:');
    expect(html).not.toContain('shape-rendering="crispEdges"');
    // things still on remain
    expect(html).toContain('Test Store');
    expect(html).toContain('2x Latte');
  });

  it('shows branch name and tax number when enabled and present', () => {
    const layout: ReceiptLayout = {
      ...defaultReceiptLayout(),
      show: { ...defaultReceiptLayout().show, branchName: true, taxNumber: true },
    };
    const html = buildReceiptHtml(tx, settings, printer, layout);
    expect(html).toContain('Downtown');
    expect(html).toContain('VAT: VAT-999');
  });

  it('uses the chosen footer text', () => {
    const layout = { ...defaultReceiptLayout(), footer: 'See you soon' };
    expect(buildReceiptHtml(tx, settings, printer, layout)).toContain('See you soon');
  });
});

describe('encodeReceipt honors the layout', () => {
  it('drops all money when prices, totals, payment, change and barcode are off', () => {
    const layout: ReceiptLayout = {
      ...defaultReceiptLayout(),
      show: {
        ...defaultReceiptLayout().show,
        priceColumn: false,
        totals: false,
        paymentDetails: false,
        changeDue: false,
        barcode: false,
      },
    };
    const ascii = asciiOf(encodeReceipt(tx, settings, printer, false, layout));
    expect(ascii).not.toContain('$');
    expect(ascii).toContain('2x Latte'); // item name still prints
  });
});
