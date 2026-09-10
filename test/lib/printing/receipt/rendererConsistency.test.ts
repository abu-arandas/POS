import { describe, it, expect } from 'vitest';
import { buildReceiptHtml } from '../../../../src/lib/printing/receipt';
import { buildReceiptDoc, docStrings } from '../../../../src/lib/printing/receiptDoc';
import { allTogglesOn } from '../../../../src/lib/printing/receiptFormat';
import type {
  PrinterConfig,
  ReceiptLayout,
  ReceiptToggles,
  SaleTransaction,
  StoreSettings,
} from '../../../../src/types';

// One receipt, two descriptions.
//
// The HTML receipt is assembled by receipt/templates/customer.ts; the thermal
// receipt (ESC/POS text and the raster bitmap) is assembled from the DocRow
// list in receiptDoc.ts. Both read the same ReceiptToggles, and each decides
// independently what to do with them — so a toggle wired into one and forgotten
// in the other produces a setting that works on one printer and is silently
// ignored on another.
//
// That is not hypothetical: `show.logo` was honored by the HTML path and absent
// from the DocRow model entirely, so an operator who switched the store logo on
// saw it on a system print and never on the thermal receipt.
//
// This test walks every toggle and asserts the two descriptions agree about
// whether its block is present. It is the guard that makes the duplication safe
// to keep: the renderers may differ in HOW they draw a block, never in WHETHER.

const settings: StoreSettings = {
  storeName: 'Cafe Test',
  storeAddress: '1 Test Street',
  storePhone: '555-0100',
  branchName: 'Downtown',
  taxNumber: 'VAT-99',
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
  footerMessage: 'Thank you!',
  autoPrintOnCheckout: true,
};

const sale: SaleTransaction = {
  id: 'TX-ABCD1234',
  date: '2026-03-04T20:15:00.000Z',
  items: [
    { productId: 'p1', productName: 'Latte', price: 4.5, cost: 1, quantity: 2, total: 9 },
    { productId: 'p2', productName: 'Croissant', price: 3, cost: 1, quantity: 1, total: 3 },
  ],
  subtotal: 12,
  discount: 1,
  discountType: 'fixed',
  discountValue: 1,
  tax: 0.83,
  total: 11.83,
  paymentMethod: 'cash',
  cashPaid: 20,
  cashChange: 8.17,
  customerId: 'c1',
  customerName: 'Grace Hopper',
  operatorName: 'Ada Lovelace',
  pointsEarned: 11,
  status: 'completed',
};

const layout = (show: ReceiptToggles): ReceiptLayout => ({
  header: '',
  footer: '',
  fontFamily: 'monospace',
  fontSizePx: 12,
  dateFormat: 'yyyy-MM-dd',
  timeFormat: 'h:mm a',
  show,
});

/**
 * A string that appears in a block's output, used to detect the block.
 *
 * Each probe has to be unsatisfiable by every OTHER block on this fixture, and
 * two things make that harder than it looks. The Code 128 barcode is an SVG
 * whose <rect> coordinates are plain decimals, so a bare "9.00" matches a bar
 * position; the money probes therefore keep their currency symbol, which the
 * SVG can never contain. And the first line's total must differ from the
 * subtotal, or a price-column probe is satisfied by the totals block instead.
 */
const PROBES: Record<keyof ReceiptToggles, string> = {
  logo: 'logo',
  storeName: 'Cafe Test',
  branchName: 'Downtown',
  address: '1 Test Street',
  phone: '555-0100',
  taxNumber: 'VAT-99',
  date: '2026-03-04',
  time: ':15',
  receiptNumber: 'TX-ABCD1234',
  operator: 'Ada Lovelace',
  customer: 'Grace Hopper',
  itemUnitPrice: '@ $4.50',
  priceColumn: '$9.00',
  totals: 'SUBTOTAL',
  paymentDetails: 'METHOD',
  changeDue: 'CASH PAID',
  loyalty: 'POINTS EARNED',
  barcode: 'TX-ABCD1234',
};

// The barcode also renders the receipt id, so probing receiptNumber or barcode
// needs the other switched off to attribute the string to one block.
const CONFLICTS: Partial<Record<keyof ReceiptToggles, Array<keyof ReceiptToggles>>> = {
  receiptNumber: ['barcode'],
  barcode: ['receiptNumber'],
};

function htmlHas(show: ReceiptToggles, probe: string): boolean {
  return buildReceiptHtml(sale, settings, printer, layout(show)).includes(probe);
}

function docHas(show: ReceiptToggles, probe: string): boolean {
  const rows = buildReceiptDoc(sale, settings, printer, layout(show));
  // docStrings only flattens text runs, so a logo row carries no text. Detect
  // structural rows by kind as well, or a block that renders as an image would
  // read as "absent" from both and the comparison would pass vacuously.
  const kinds = rows.map((row) => row.kind).join(' ');
  return docStrings(rows).some((text) => text.includes(probe)) || kinds.includes(probe);
}

const TOGGLE_KEYS = Object.keys(allTogglesOn()) as Array<keyof ReceiptToggles>;

describe('HTML and DocRow receipts agree on every toggle', () => {
  it.each(TOGGLE_KEYS)('%s is present in both renderers when on', (key) => {
    const show = { ...allTogglesOn() };
    for (const off of CONFLICTS[key] ?? []) show[off] = false;

    const probe = PROBES[key];
    expect(
      { html: htmlHas(show, probe), doc: docHas(show, probe) },
      `"${key}" must be rendered by both the HTML and the thermal receipt`,
    ).toEqual({ html: true, doc: true });
  });

  it.each(TOGGLE_KEYS)('%s is absent from both renderers when off', (key) => {
    const show = { ...allTogglesOn(), [key]: false };
    for (const off of CONFLICTS[key] ?? []) show[off] = false;

    const probe = PROBES[key];
    expect(
      { html: htmlHas(show, probe), doc: docHas(show, probe) },
      `"${key}" must be suppressed by both the HTML and the thermal receipt`,
    ).toEqual({ html: false, doc: false });
  });
});

// The tax rate a sale was charged at belongs to the sale, not to today's
// settings. A receipt reprinted from History after the operator changes the
// rate used to read `settings.taxRate`, so a sale rung up at 8.5% reprinted as
// "TAX (16%)" beside its original $0.83 — a wrong rate on a tax document, on
// both renderers.
describe('the tax rate on a reprint', () => {
  const reprint = (tx: SaleTransaction, currentRate: number) => {
    const now: StoreSettings = { ...settings, taxRate: currentRate };
    const full = layout(allTogglesOn());
    return {
      html: buildReceiptHtml(tx, now, printer, full),
      thermal: docStrings(buildReceiptDoc(tx, now, printer, full)).join('\n'),
    };
  };

  it('shows the rate the sale was charged at, not the rate now in force', () => {
    const { html, thermal } = reprint({ ...sale, taxRate: 8.5 }, 16);

    for (const out of [html, thermal]) {
      expect(out).toContain('TAX (8.5%)');
      expect(out).not.toContain('16%');
    }
  });

  it('leaves the percentage off a sale recorded before the rate was stored', () => {
    // taxRate is absent — the rate is genuinely unknown and cannot be recovered
    // from the stored figures, so neither renderer may invent one.
    const { html, thermal } = reprint(sale, 16);

    for (const out of [html, thermal]) {
      expect(out).toContain('TAX');
      expect(out).not.toContain('16%');
      expect(out).not.toMatch(/TAX \(/);
    }
    // The amount, which is the figure that matters, still prints.
    expect(thermal).toContain('$0.83');
  });

  it('leaves the percentage off a zero-rated sale', () => {
    const { html, thermal } = reprint({ ...sale, taxRate: 0, tax: 0 }, 16);

    for (const out of [html, thermal]) expect(out).not.toMatch(/TAX \(/);
  });
});
