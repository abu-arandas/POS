import { describe, it, expect, afterEach } from 'vitest';
import { buildReceiptDoc, buildKitchenDoc, docStrings, DocRow } from '../../src/lib/receiptDoc';
import { defaultReceiptLayout, allTogglesOn } from '../../src/lib/receiptFormat';
import i18n from '../../src/lib/i18n';
import { SaleTransaction, StoreSettings, PrinterConfig } from '../../src/types';

const settings: StoreSettings = {
  storeName: 'Test Store',
  storeAddress: '1 Main St',
  storePhone: '555-0100',
  branchName: 'Downtown',
  taxNumber: '12345',
  taxRate: 8.5,
  currency: '$',
  loyaltyPointsRate: 1,
  loyaltyPointValue: 0.05,
};

const printer: PrinterConfig = {
  type: 'windows',
  paperSize: '80mm',
  showBarcode: true,
  footerMessage: 'Thanks!',
  autoPrintOnCheckout: true,
};

const tx: SaleTransaction = {
  id: 'TX-ABCD1234',
  date: '2026-07-25T20:15:00.000Z',
  items: [{ productId: 'p1', productName: 'Latte', price: 4.5, cost: 1, quantity: 2, total: 9 }],
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

const full = { ...defaultReceiptLayout(), show: allTogglesOn() };
const pairs = (rows: DocRow[]) =>
  rows.filter((r): r is Extract<DocRow, { kind: 'pair' }> => r.kind === 'pair');
const label = (rows: DocRow[], needle: string) => pairs(rows).find((r) => r.label.includes(needle));

describe('buildReceiptDoc', () => {
  it('opens with the store identity and closes with the barcode', () => {
    const rows = buildReceiptDoc(tx, settings, printer, full);
    // Logo then name, the same order the HTML receipt prints them in. The logo
    // row is what lets the thermal raster path honor show.logo at all; before it
    // existed the setting worked on a system print and did nothing on a thermal
    // printer (see receipt/rendererConsistency.test.ts).
    expect(rows[0]).toMatchObject({ kind: 'logo' });
    expect(rows[1]).toMatchObject({ kind: 'center', text: 'Test Store', style: 'title' });
    expect(rows.at(-1)).toMatchObject({ kind: 'barcode', value: 'TX-ABCD1234' });
  });

  it('carries the totals as label/value pairs', () => {
    const rows = buildReceiptDoc(tx, settings, printer, full);
    expect(label(rows, 'SUBTOTAL')?.value).toBe('$9.00');
    expect(label(rows, 'TOTAL PAID')?.value).toBe('$9.77');
    expect(label(rows, 'TAX')?.label).toContain('8.5%');
  });

  it('omits the barcode when the toggle is off', () => {
    const rows = buildReceiptDoc(tx, settings, printer, {
      ...full,
      show: { ...allTogglesOn(), barcode: false },
    });
    expect(rows.some((r) => r.kind === 'barcode')).toBe(false);
  });

  it('drops a whole block when its toggle is off', () => {
    const rows = buildReceiptDoc(tx, settings, printer, {
      ...full,
      show: { ...allTogglesOn(), totals: false },
    });
    expect(label(rows, 'SUBTOTAL')).toBeUndefined();
  });

  it('breaks out the unit price only when more than one was sold', () => {
    const rows = buildReceiptDoc(tx, settings, printer, full);
    expect(rows.some((r) => r.kind === 'line' && r.text.includes('@ $4.50'))).toBe(true);

    const single = { ...tx, items: [{ ...tx.items[0], quantity: 1, total: 4.5 }] };
    const one = buildReceiptDoc(single, settings, printer, full);
    expect(one.some((r) => r.kind === 'line' && r.text.includes('@ '))).toBe(false);
  });

  it('shows cash tendered and change only for a cash sale', () => {
    const cash: SaleTransaction = { ...tx, paymentMethod: 'cash', cashPaid: 20, cashChange: 10.23 };
    expect(label(buildReceiptDoc(cash, settings, printer, full), 'CHANGE')?.value).toBe('$10.23');
    expect(label(buildReceiptDoc(tx, settings, printer, full), 'CHANGE')).toBeUndefined();
  });

  it('breaks down a split payment line by line', () => {
    const split: SaleTransaction = {
      ...tx,
      payments: [
        { method: 'cash', amount: 5 },
        { method: 'card', amount: 4.77 },
      ],
    };
    const rows = buildReceiptDoc(split, settings, printer, full);
    expect(pairs(rows).filter((r) => r.value === '$5.00' || r.value === '$4.77')).toHaveLength(2);
  });

  // The old ESC/POS encoder printed the raw enum for both of these.
  it('translates the tender rather than printing the enum', () => {
    const rows = buildReceiptDoc(tx, settings, printer, full);
    expect(label(rows, 'METHOD')?.value).toBe('Card');
  });

  it('translates the status rather than printing the enum', () => {
    const rows = buildReceiptDoc({ ...tx, status: 'refunded' }, settings, printer, full);
    expect(rows.some((r) => r.kind === 'center' && r.text === 'Refunded')).toBe(true);
  });
});

describe('buildKitchenDoc', () => {
  it('titles the ticket with the station and lists items in large type', () => {
    const rows = buildKitchenDoc(tx, settings, 'Bar');
    expect(rows[0]).toMatchObject({ kind: 'center', text: '*** BAR ***' });
    expect(
      rows.some((r) => r.kind === 'line' && r.style === 'large' && r.text === '2x Latte'),
    ).toBe(true);
  });

  it('carries no prices, totals or barcode', () => {
    const text = docStrings(buildKitchenDoc(tx, settings, 'Bar')).join(' ');
    expect(text).not.toContain('$');
    expect(text).not.toContain('TOTAL');
    expect(buildKitchenDoc(tx, settings, 'Bar').some((r) => r.kind === 'barcode')).toBe(false);
  });

  // Takes the title from i18n ('Kitchen Ticket'), unlike the old ESC/POS
  // encoder which hardcoded '*** KITCHEN ***' and so could never translate.
  it('falls back to the translated title with no station name', () => {
    expect(buildKitchenDoc(tx, settings)[0]).toMatchObject({ text: '*** KITCHEN TICKET ***' });
  });
});

describe('docStrings', () => {
  it('collects every rendered string so needsRaster can inspect them', () => {
    const strings = docStrings(buildReceiptDoc(tx, settings, printer, full));
    expect(strings).toContain('Test Store');
    expect(strings).toContain('$9.77');
  });
});

describe('an Arabic receipt', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('produces Arabic strings that the text encoder could not print', async () => {
    await i18n.changeLanguage('ar');
    const rows = buildReceiptDoc(
      { ...tx, paymentMethod: 'cash', cashPaid: 10, cashChange: 0.23 },
      { ...settings, storeName: 'مقهى الأصالة', currency: 'د.أ' },
      printer,
      full,
    );
    const text = docStrings(rows).join(' ');
    expect(text).toContain('مقهى الأصالة');
    expect(text).toContain('نقدي'); // tender, translated
    expect(text).toContain('مكتملة'); // status, translated
  });
});

// The HTML receipt has always carried these; the thermal path did not, so a
// reprinted refund slip said "Refunded" and nothing else. On a money document
// that is the audit trail, and the customer copy often leaves the building.
describe('a refunded sale keeps its audit trail', () => {
  const refunded: SaleTransaction = {
    ...tx,
    status: 'refunded',
    refundDate: '2026-07-26T09:00:00.000Z',
    refundAuthorizedBy: 'Jane (manager)',
  };

  it('prints who authorised the refund', () => {
    const text = docStrings(buildReceiptDoc(refunded, settings, printer, full)).join(' ');
    expect(text).toContain('Jane (manager)');
  });

  it('prints when it was refunded', () => {
    const text = docStrings(buildReceiptDoc(refunded, settings, printer, full)).join(' ');
    expect(text).toContain('2026-07-26');
  });

  it('adds nothing for a sale that was never refunded', () => {
    const text = docStrings(buildReceiptDoc(tx, settings, printer, full)).join(' ');
    expect(text).not.toContain('REFUND AUTH');
  });
});
