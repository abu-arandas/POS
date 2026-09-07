import { describe, it, expect } from 'vitest';
import {
  CODE128_QUIET_MODULES,
  THERMAL_DOT_MM,
  code128ModuleMm,
  code128Modules,
  code128SvgMm,
} from '../../../../src/lib/printing/barcode';
import { printableWidthMm } from '../../../../src/lib/printing/receiptFormat';
import { buildReceiptHtml } from '../../../../src/lib/printing/receipt';
import type { PrinterConfig, SaleTransaction, StoreSettings } from '../../../../src/types';

// The HTML receipt used to emit its Code 128 at a FIXED 1.5px module and let
// `max-width: 90%` shrink whatever came out. That is not a fit — it scales the
// symbol uniformly, so the real 39-character receipt id landed at 0.83 of a
// printer dot per module on a 58mm roll. Neighbouring bars share a dot at that
// size and merge, so the receipt carried something shaped like a barcode that
// no scanner could read — while the ESC/POS and raster paths REFUSED the very
// same symbol on the very same roll.
//
// These pin the three renderers to one answer.

const REAL_ID = `TX-${'0f9a1b2c-3d4e-5f60-8192-a3b4c5d6e7f8'.toUpperCase()}`;
const modulesOf = (v: string) => code128Modules(v).reduce((a, b) => a + b, 0);

describe('code128ModuleMm', () => {
  it('refuses the real receipt id on a 58mm roll, as the thermal paths do', () => {
    expect(REAL_ID).toHaveLength(39);
    expect(code128ModuleMm(REAL_ID, printableWidthMm('58mm'))).toBeNull();
  });

  it('allows it on an 80mm roll, at no less than one printed dot', () => {
    const module = code128ModuleMm(REAL_ID, printableWidthMm('80mm'));
    expect(module).not.toBeNull();
    expect(module!).toBeGreaterThanOrEqual(THERMAL_DOT_MM);
  });

  it('never returns a module the paper cannot hold, quiet zones included', () => {
    const printable = printableWidthMm('80mm');
    const module = code128ModuleMm(REAL_ID, printable)!;
    const total = (modulesOf(REAL_ID) + CODE128_QUIET_MODULES * 2) * module;
    expect(total).toBeLessThanOrEqual(printable + 1e-9);
  });

  it('caps a short value so one SKU cannot swallow the label', () => {
    expect(code128ModuleMm('AB1', 100, THERMAL_DOT_MM, 0.4)).toBe(0.4);
  });
});

describe('code128SvgMm', () => {
  it('sizes the symbol in millimetres and bakes in its own quiet zone', () => {
    const fitted = code128SvgMm(REAL_ID, printableWidthMm('80mm'))!;
    expect(fitted).not.toBeNull();
    // Physical units, so no CSS box can quietly scale the module below a dot.
    expect(fitted.svg).toMatch(/width="[\d.]+mm"/);
    expect(fitted.widthMm).toBeLessThanOrEqual(printableWidthMm('80mm') + 1e-9);
    // viewBox spans the symbol plus both quiet zones, and the first bar starts
    // one full quiet zone in.
    const total = modulesOf(REAL_ID) + CODE128_QUIET_MODULES * 2;
    expect(fitted.svg).toContain(`viewBox="0 0 ${total} 10"`);
    expect(fitted.svg).toContain(`<rect x="${CODE128_QUIET_MODULES}"`);
  });

  it('returns null rather than an unreadable symbol', () => {
    expect(code128SvgMm(REAL_ID, printableWidthMm('58mm'))).toBeNull();
  });
});

const settings: StoreSettings = {
  storeName: 'Cafe Test',
  storeAddress: '1 Test Street',
  storePhone: '555-0100',
  storeLogo: '',
  taxRate: 5,
  currency: '$',
  loyaltyPointsRate: 1,
  loyaltyPointValue: 0.05,
};
const sale: SaleTransaction = {
  id: REAL_ID,
  date: '2026-03-04T20:15:00.000Z',
  items: [{ productId: 'p1', productName: 'Latte', price: 4.5, cost: 1, quantity: 2, total: 9 }],
  subtotal: 9,
  discount: 0,
  discountType: 'none',
  discountValue: 0,
  tax: 0.45,
  total: 9.45,
  paymentMethod: 'card',
  customerId: null,
  customerName: null,
  status: 'completed',
};
const printer = (paperSize: PrinterConfig['paperSize']): PrinterConfig => ({
  type: 'system',
  paperSize,
  showBarcode: true,
  footerMessage: '',
  autoPrintOnCheckout: true,
});

describe('buildReceiptHtml barcode block', () => {
  it('prints bars on 80mm', () => {
    const html = buildReceiptHtml(sale, settings, printer('80mm'));
    expect(html).toContain('<svg');
    expect(html).toContain(REAL_ID);
  });

  it('drops to the readable id alone on 58mm rather than printing a smear', () => {
    const html = buildReceiptHtml(sale, settings, printer('58mm'));
    expect(html).not.toContain('shape-rendering="crispEdges"');
    // The id still reaches the paper, so the sale stays lookup-able either way.
    expect(html).toContain(REAL_ID);
  });
});
