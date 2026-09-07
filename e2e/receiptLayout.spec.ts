import { test, expect, type Page } from '@playwright/test';
import { receiptsPrintDoc, kitchenPrintDoc } from '../src/lib/receipt';
import { ROLL_MM } from '../src/lib/receiptFormat';
import type { PrinterConfig, SaleTransaction, StoreSettings } from '../src/types';

// Geometry of the printed page, checked in a real browser.
//
// Every other receipt test asserts on strings. That is why a receipt could go
// out with `body { width: 80mm; padding: 8px }` under the default content-box
// sizing — 16.4px wider than the roll — and have the print head clip the right
// edge off every amount, so a total of $27.04 printed as "$27.0". Nothing that
// looks at markup can see that; it only exists once the document is laid out.
//
// So these render the real document and measure it against the paper.

const ROLLS: PrinterConfig['paperSize'][] = ['58mm', '80mm'];
const CSS_DPI = 96;
const rollPx = (size: PrinterConfig['paperSize']) => Math.round((ROLL_MM[size] / 25.4) * CSS_DPI);

const settings: StoreSettings = {
  storeName: 'Rustic Bean Coffee House',
  storeAddress: '148 Al Wasl Road, Jumeirah 1, Dubai',
  storePhone: '+971 4 555 0142',
  branchName: 'Jumeirah Branch',
  taxNumber: 'TRN 100123456700003',
  storeLogo: '',
  taxRate: 5,
  currency: '$',
  loyaltyPointsRate: 1,
  loyaltyPointValue: 0.05,
};

// Deliberately hostile to the layout: a full-length receipt id, a product name
// far longer than the roll, a split tender, and a discount.
const TOTAL = '$27.04';
const sale: SaleTransaction = {
  id: `TX-${'0f9a1b2c-3d4e-5f60-8192-a3b4c5d6e7f8'.toUpperCase()}`,
  date: '2026-03-04T20:15:00.000Z',
  items: [
    {
      productId: 'p1',
      productName: 'Double Espresso Macchiato',
      price: 4.5,
      cost: 1,
      quantity: 2,
      total: 9,
    },
    {
      productId: 'p2',
      productName: 'Almond Croissant',
      price: 3.25,
      cost: 1,
      quantity: 1,
      total: 3.25,
    },
    {
      productId: 'p3',
      productName: 'Sourdough Avocado Toast with Poached Eggs',
      price: 11.5,
      cost: 4,
      quantity: 1,
      total: 11.5,
    },
    {
      productId: 'p4',
      productName: 'Still Water 500ml',
      price: 1.5,
      cost: 0.3,
      quantity: 3,
      total: 4.5,
    },
  ],
  subtotal: 28.25,
  discount: 2.5,
  discountType: 'fixed',
  discountValue: 2.5,
  tax: 1.29,
  total: 27.04,
  paymentMethod: 'cash',
  payments: [
    { method: 'cash', amount: 20 },
    { method: 'card', amount: 7.04 },
  ],
  cashPaid: 20,
  cashChange: 0,
  customerId: 'c1',
  customerName: 'Grace Hopper',
  operatorName: 'Ada Lovelace',
  pointsEarned: 27,
  status: 'completed',
};

const printer = (paperSize: PrinterConfig['paperSize']): PrinterConfig => ({
  type: 'system',
  paperSize,
  showBarcode: true,
  footerMessage: 'Thank you for shopping with us!',
  autoPrintOnCheckout: true,
});

/** Widest right edge of anything on the page, and the body's own box. */
async function geometry(page: Page, html: string, widthPx: number) {
  await page.setViewportSize({ width: widthPx, height: 1400 });
  await page.setContent(html, { waitUntil: 'load' });
  return page.evaluate(() => {
    let widest = 0;
    let culprit = '';
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > widest) {
        widest = r.right;
        culprit = (el.textContent ?? '').trim().slice(0, 60);
      }
    });
    return {
      bodyWidth: document.body.getBoundingClientRect().width,
      scrollWidth: document.documentElement.scrollWidth,
      widest,
      culprit,
      text: (document.body.textContent ?? '').replace(/\s+/g, ' ').trim(),
      barcodes: document.querySelectorAll('.barcode svg').length,
    };
  });
}

for (const roll of ROLLS) {
  test(`customer receipt fits a ${roll} roll and prints the total in full`, async ({ page }) => {
    const width = rollPx(roll);
    const g = await geometry(page, receiptsPrintDoc([sale], settings, printer(roll)), width);

    // 1px of tolerance for the mm -> device-pixel conversion; the bug this
    // guards was 16px, so nothing real hides under that.
    expect(g.bodyWidth, 'body must not be wider than the paper').toBeLessThanOrEqual(width + 1);
    expect(g.scrollWidth, 'nothing may overflow the roll').toBeLessThanOrEqual(width + 1);
    expect(g.widest, `"${g.culprit}" runs past the paper edge`).toBeLessThanOrEqual(width + 1);

    // The figure the whole document exists for, and the first casualty of the
    // clipping: it must be present whole, not as "$27.0".
    expect(g.text).toContain(TOTAL);
    // The id has to survive intact too — it is how the sale is looked up.
    expect(g.text.replace(/\s+/g, '')).toContain(sale.id);
  });

  test(`kitchen ticket fits a ${roll} roll`, async ({ page }) => {
    const width = rollPx(roll);
    const g = await geometry(page, kitchenPrintDoc(sale, settings, printer(roll), 'GRILL'), width);

    expect(g.scrollWidth).toBeLessThanOrEqual(width + 1);
    expect(g.widest, `"${g.culprit}" runs past the paper edge`).toBeLessThanOrEqual(width + 1);
    expect(g.text.replace(/\s+/g, '')).toContain(sale.id);
  });
}

test('the barcode is printed only where it can be read', async ({ page }) => {
  // 80mm has the room for a 39-character id; 58mm does not, and the ESC/POS and
  // raster paths both refuse it there. The HTML path must agree rather than
  // scaling the bars down until they merge.
  const wide = await geometry(
    page,
    receiptsPrintDoc([sale], settings, printer('80mm')),
    rollPx('80mm'),
  );
  expect(wide.barcodes).toBe(1);

  const narrow = await geometry(
    page,
    receiptsPrintDoc([sale], settings, printer('58mm')),
    rollPx('58mm'),
  );
  expect(narrow.barcodes).toBe(0);
  expect(narrow.text.replace(/\s+/g, '')).toContain(sale.id);
});
