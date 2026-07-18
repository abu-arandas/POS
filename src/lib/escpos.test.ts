import { describe, it, expect } from 'vitest';
import { encodeReceipt } from './escpos';
import { SaleTransaction, StoreSettings, PrinterConfig } from '../types';

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

  it('kicks the drawer only when the caller asks for it (cash checkout, not reprints)', () => {
    const kick = [0x1b, 0x70, 0x00];
    expect(findSeq(encodeReceipt(tx, settings, printer, { openDrawer: true }), kick)).toBe(true);
    expect(findSeq(encodeReceipt(tx, settings, printer), kick)).toBe(false);
    // autoPrintOnCheckout alone must NOT pop the drawer (reprints share this path).
    expect(
      findSeq(encodeReceipt(tx, settings, { ...printer, autoPrintOnCheckout: true }), kick),
    ).toBe(false);
  });

  it('folds accents to their base letter in ASCII mode (é→e, not ?)', () => {
    const out = encodeReceipt({ ...tx, customerName: 'Café Zoë ☕' }, settings, printer);
    const ascii = bytes(out)
      .filter((b) => b >= 32 && b < 127)
      .map((b) => String.fromCharCode(b))
      .join('');
    expect(ascii).toContain('MEMBER');
    expect(ascii).toContain('Cafe Zoe ?'); // accents folded; the emoji stays '?'
    // Nothing outside printable ASCII / control bytes leaks from text.
    expect(bytes(out).every((b) => b <= 0x7e || b === 0xfa)).toBe(true); // 0xfa = drawer pulse arg
  });

  it('selects WPC1252 and prints accents/€ natively in latin1 mode', () => {
    const out = encodeReceipt(
      { ...tx, customerName: 'Café' },
      { ...settings, currency: '€' },
      { ...printer, codepage: 'latin1' },
    );
    expect(findSeq(out, [0x1b, 0x74, 16])).toBe(true); // ESC t 16 after init
    expect(bytes(out)).toContain(0xe9); // é
    expect(bytes(out)).toContain(0x80); // € (CP1252)
  });

  it('still folds unmappable characters in latin1 mode', () => {
    const out = encodeReceipt({ ...tx, customerName: 'Škoda ☕' }, settings, {
      ...printer,
      codepage: 'latin1',
    });
    expect(bytes(out)).toContain(0x8a); // Š maps via the CP1252 extras table
    const ascii = bytes(out)
      .filter((b) => b >= 32 && b < 127)
      .map((b) => String.fromCharCode(b))
      .join('');
    expect(ascii).toContain('koda ?'); // the emoji still degrades to '?'
  });
});
