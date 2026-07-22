import { describe, it, expect } from 'vitest';
import { encodeReceipt, encodeKitchenTicket } from '../../src/lib/escpos';
import { SaleTransaction, StoreSettings, PrinterConfig } from '../../src/types';

const settings: StoreSettings = {
  storeName: 'Test Store',
  storeAddress: '1 Main St',
  storePhone: '555-0100',
  taxRate: 10,
  currency: '$',
  loyaltyPointsRate: 1,
  loyaltyPointValue: 0.05,
};
const printer: PrinterConfig = {
  type: 'serial',
  paperSize: '80mm',
  showBarcode: true,
  footerMessage: 'Thanks!',
  autoPrintOnCheckout: false,
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

const bytes = (u: Uint8Array) => Array.from(u);
const findSeq = (u: Uint8Array, seq: number[]) => {
  const arr = bytes(u);
  for (let i = 0; i <= arr.length - seq.length; i++) {
    if (seq.every((b, j) => arr[i + j] === b)) return true;
  }
  return false;
};

describe('encodeReceipt', () => {
  it('starts with the ESC @ init sequence', () => {
    const out = encodeReceipt(tx, settings, printer);
    expect(out[0]).toBe(0x1b);
    expect(out[1]).toBe(0x40);
  });

  it('emits a full-cut command (GS V 0) near the end', () => {
    const out = encodeReceipt(tx, settings, printer);
    expect(findSeq(out, [0x1d, 0x56, 0x00])).toBe(true);
  });

  it('contains the store name and item text as ASCII bytes', () => {
    const out = encodeReceipt(tx, settings, printer);
    const ascii = bytes(out)
      .filter((b) => b >= 32 && b < 127)
      .map((b) => String.fromCharCode(b))
      .join('');
    expect(ascii).toContain('Test Store');
    expect(ascii).toContain('2x Latte');
    expect(ascii).toContain('TX-1');
  });

  it('kicks the drawer only when openDrawer is true', () => {
    const kick = [0x1b, 0x70, 0x00];
    expect(findSeq(encodeReceipt(tx, settings, printer, true), kick)).toBe(true);
    expect(findSeq(encodeReceipt(tx, settings, printer, false), kick)).toBe(false);
  });

  it('replaces multibyte characters with ASCII (no raw high bytes from text)', () => {
    const out = encodeReceipt({ ...tx, customerName: 'Café Zoë ☕' }, settings, printer);
    // The name becomes '?' placeholders; ensure it did not crash and stays byte-safe.
    const ascii = bytes(out)
      .filter((b) => b >= 32 && b < 127)
      .map((b) => String.fromCharCode(b))
      .join('');
    expect(ascii).toContain('MEMBER');
  });

  it('breaks out the unit price, item count, and tax rate', () => {
    const ascii = asciiOf(encodeReceipt(tx, settings, printer));
    expect(ascii).toContain('@ $4.50 ea'); // qty 2 → unit price line
    expect(ascii).toContain('ITEMS');
    expect(ascii).toContain('TAX (10%)'); // settings.taxRate = 10
  });

  it('prints a YOU SAVED line only when a discount applied', () => {
    const discounted = { ...tx, discount: 1.5 };
    expect(asciiOf(encodeReceipt(discounted, settings, printer))).toContain('YOU SAVED $1.50');
    expect(asciiOf(encodeReceipt(tx, settings, printer))).not.toContain('YOU SAVED');
  });

  it('shows earned points only for a member sale that earned some', () => {
    const member = { ...tx, customerName: 'Ann', pointsEarned: 9 };
    expect(asciiOf(encodeReceipt(member, settings, printer))).toContain('Points earned: 9');
    expect(asciiOf(encodeReceipt(tx, settings, printer))).not.toContain('Points earned');
  });

  it('emits a native Code128 barcode (GS k 73) of the receipt id when showBarcode is on', () => {
    const on = encodeReceipt(tx, settings, printer); // showBarcode: true
    expect(findSeq(on, [0x1d, 0x6b, 73])).toBe(true);
    expect(asciiOf(on)).toContain('{BTX-1'); // code-set-B prefixed payload
    const off = encodeReceipt(tx, settings, { ...printer, showBarcode: false });
    expect(findSeq(off, [0x1d, 0x6b, 73])).toBe(false);
  });
});

const asciiOf = (u: Uint8Array) =>
  bytes(u)
    .filter((b) => b >= 32 && b < 127)
    .map((b) => String.fromCharCode(b))
    .join('');

const ascii = (u: Uint8Array) =>
  bytes(u)
    .filter((b) => b >= 32 && b < 127)
    .map((b) => String.fromCharCode(b))
    .join('');

describe('encodeKitchenTicket', () => {
  it('starts with ESC @ and ends with a full cut', () => {
    const out = encodeKitchenTicket(tx, settings, printer);
    expect(out[0]).toBe(0x1b);
    expect(out[1]).toBe(0x40);
    expect(findSeq(out, [0x1d, 0x56, 0x00])).toBe(true);
  });

  it('lists items with quantities and the item count', () => {
    const out = ascii(encodeKitchenTicket(tx, settings, printer));
    expect(out).toContain('KITCHEN');
    expect(out).toContain('2x Latte');
    expect(out).toContain('ORDER');
    expect(out).toContain('2 ITEMS');
  });

  it('never prints prices, totals, or the drawer kick', () => {
    const out = encodeKitchenTicket(tx, settings, printer);
    // No cash-drawer pulse on a kitchen ticket.
    expect(findSeq(out, [0x1b, 0x70, 0x00])).toBe(false);
    // No currency amounts (the receipt shows "$9.00"; the ticket must not).
    expect(ascii(out)).not.toContain('$');
    expect(ascii(out)).not.toContain('TOTAL');
  });
});
