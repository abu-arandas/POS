import { describe, expect, it } from 'vitest';
import { itemLabel, itemModifierNames } from './lineItem';
import { buildReceiptHtml } from './receipt/templates/customer';
import { buildKitchenTicketHtml } from './receipt/templates/kitchen';
import { buildReceiptDoc, buildKitchenDoc } from './receiptDoc';
import { defaultKitchenLayout, defaultReceiptLayout } from './receiptFormat';
import type {
  OrderItem,
  ReceiptLayout,
  PrinterConfig,
  SaleTransaction,
  SelectedModifier,
  StoreSettings,
} from '../../types';

const MODIFIERS: SelectedModifier[] = [
  { groupId: 'g1', groupName: 'Milk', optionId: 'o1', optionName: 'Oat Milk', priceDelta: 0.5 },
  { groupId: 'g2', groupName: 'Extras', optionId: 'o2', optionName: 'Extra Shot', priceDelta: 0.8 },
];

function item(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    productId: 'p1',
    productName: 'Latte',
    price: 4.3,
    cost: 1.2,
    quantity: 2,
    total: 8.6,
    ...overrides,
  };
}

function sale(items: OrderItem[]): SaleTransaction {
  return {
    id: 'TX-ABCD1234',
    date: '2026-01-01T12:00:00.000Z',
    items,
    subtotal: 8.6,
    discount: 0,
    discountType: 'none',
    discountValue: 0,
    tax: 0,
    total: 8.6,
    paymentMethod: 'cash',
    customerId: null,
    status: 'completed',
  };
}

const SETTINGS: StoreSettings = {
  storeName: 'Test Cafe',
  storeAddress: '1 Test Street',
  storePhone: '000',
  taxRate: 0,
  currency: '$',
  loyaltyPointsRate: 0,
  loyaltyPointValue: 0,
};

const PRINTER: PrinterConfig = {
  type: 'system',
  paperSize: '80mm',
  showBarcode: false,
  footerMessage: '',
  autoPrintOnCheckout: false,
};

/** Flattens a DocRow list to the text it would print. */
const docText = (rows: ReturnType<typeof buildReceiptDoc>) =>
  rows
    .map((row) => {
      if (row.kind === 'line' || row.kind === 'center') return row.text;
      if (row.kind === 'pair') return `${row.label} ${row.value}`;
      return '';
    })
    .join('\n');

describe('itemLabel', () => {
  it('appends the variant when there is one', () => {
    expect(itemLabel(item({ variantName: 'Large / Oat' }))).toBe('Latte — Large / Oat');
  });

  it('is the bare product name on a plain line', () => {
    expect(itemLabel(item())).toBe('Latte');
  });
});

describe('itemModifierNames', () => {
  it('lists the chosen option names in order', () => {
    expect(itemModifierNames(item({ modifiers: MODIFIERS }))).toEqual(['Oat Milk', 'Extra Shot']);
  });

  it('is empty rather than undefined for a line with no modifiers', () => {
    expect(itemModifierNames(item())).toEqual([]);
  });
});

// The regression these guard. Three renderers print a sold line — the HTML
// receipt, the HTML kitchen ticket, and the DocRow model behind ESC/POS and
// the canvas raster. The two HTML ones printed the bare product name, so the
// same sale read differently depending only on which printer was configured,
// and NONE of the three printed modifiers at all.
describe('every renderer names the variant', () => {
  const tx = sale([item({ variantName: 'Large / Oat' })]);

  it('HTML customer receipt', () => {
    expect(buildReceiptHtml(tx, SETTINGS, PRINTER)).toContain('Latte — Large / Oat');
  });

  it('HTML kitchen ticket', () => {
    expect(buildKitchenTicketHtml(tx, SETTINGS)).toContain('Latte — Large / Oat');
  });

  it('DocRow customer receipt (ESC/POS + raster)', () => {
    expect(docText(buildReceiptDoc(tx, SETTINGS, PRINTER))).toContain('Latte — Large / Oat');
  });

  it('DocRow kitchen ticket (ESC/POS + raster)', () => {
    expect(docText(buildKitchenDoc(tx, SETTINGS))).toContain('Latte — Large / Oat');
  });
});

describe('every renderer prints the modifiers', () => {
  const tx = sale([item({ variantName: 'Large', modifiers: MODIFIERS })]);

  it('HTML customer receipt', () => {
    const html = buildReceiptHtml(tx, SETTINGS, PRINTER);
    expect(html).toContain('Oat Milk');
    expect(html).toContain('Extra Shot');
  });

  it('HTML kitchen ticket', () => {
    const html = buildKitchenTicketHtml(tx, SETTINGS);
    expect(html).toContain('Oat Milk');
    expect(html).toContain('Extra Shot');
  });

  it('DocRow customer receipt (ESC/POS + raster)', () => {
    const text = docText(buildReceiptDoc(tx, SETTINGS, PRINTER));
    expect(text).toContain('Oat Milk');
    expect(text).toContain('Extra Shot');
  });

  it('DocRow kitchen ticket (ESC/POS + raster)', () => {
    const text = docText(buildKitchenDoc(tx, SETTINGS));
    expect(text).toContain('Oat Milk');
    expect(text).toContain('Extra Shot');
  });
});

describe('modifier rendering', () => {
  it('names modifiers without repricing them — the delta is already in the total', () => {
    const tx = sale([item({ modifiers: MODIFIERS })]);
    const html = buildReceiptHtml(tx, SETTINGS, PRINTER);
    // The line total appears; the individual +0.50 / +0.80 deltas do not.
    expect(html).toContain('8.60');
    expect(html).not.toContain('0.50');
    expect(html).not.toContain('0.80');
  });

  it('escapes a hostile modifier name in both HTML renderers', () => {
    const nasty: SelectedModifier[] = [
      {
        groupId: 'g',
        groupName: 'G',
        optionId: 'o',
        optionName: '<script>x</script>',
        priceDelta: 0,
      },
    ];
    const tx = sale([item({ modifiers: nasty })]);
    expect(buildReceiptHtml(tx, SETTINGS, PRINTER)).not.toContain('<script>');
    expect(buildKitchenTicketHtml(tx, SETTINGS)).not.toContain('<script>');
  });

  it('leaves a plain line untouched', () => {
    const tx = sale([item()]);
    expect(buildReceiptHtml(tx, SETTINGS, PRINTER)).not.toContain('item-mod');
    expect(buildKitchenTicketHtml(tx, SETTINGS)).not.toContain('kitchen-mod');
  });
});

describe('the modifiers toggle', () => {
  const tx = sale([item({ modifiers: MODIFIERS })]);

  it('is on by default for both the customer receipt and the kitchen ticket', () => {
    expect(defaultReceiptLayout().show.modifiers).toBe(true);
    // Especially here: a modifier is the one thing a kitchen ticket carries
    // that the menu does not already say.
    expect(defaultKitchenLayout().show.modifiers).toBe(true);
  });

  it('suppresses the block in every renderer when turned off', () => {
    const off = (base: ReceiptLayout): ReceiptLayout => ({
      ...base,
      show: { ...base.show, modifiers: false },
    });
    const customer = off(defaultReceiptLayout());
    const kitchen = off(defaultKitchenLayout());

    expect(buildReceiptHtml(tx, SETTINGS, PRINTER, customer)).not.toContain('Oat Milk');
    expect(buildKitchenTicketHtml(tx, SETTINGS, undefined, kitchen)).not.toContain('Oat Milk');
    expect(docText(buildReceiptDoc(tx, SETTINGS, PRINTER, customer))).not.toContain('Oat Milk');
    expect(docText(buildKitchenDoc(tx, SETTINGS, undefined, kitchen))).not.toContain('Oat Milk');
  });

  it('still prints the line itself when the block is off', () => {
    const customer = defaultReceiptLayout();
    customer.show.modifiers = false;
    expect(buildReceiptHtml(tx, SETTINGS, PRINTER, customer)).toContain('Latte');
  });
});
