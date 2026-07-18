import { SaleTransaction, StoreSettings, PrinterConfig } from '../types';

// Minimal ESC/POS command encoder. Produces the raw byte stream a thermal
// printer understands, independent of transport (Web Serial, network socket,
// Bluetooth). Kept pure and free of DOM/hardware so it is unit-testable.

const ESC = 0x1b;
const GS = 0x1d;

export type EscPosCodepage = 'ascii' | 'latin1';

// Windows-1252 bytes for the characters that sit outside Latin-1's 0xA0–0xFF
// block (the 0x80–0x9F range CP1252 repurposes). Everything in 0xA0–0xFF maps
// 1:1 from the Unicode code point.
const CP1252_EXTRAS: Record<number, number> = {
  0x20ac: 0x80, // €
  0x201a: 0x82, // ‚
  0x0192: 0x83, // ƒ
  0x201e: 0x84, // „
  0x2026: 0x85, // …
  0x2020: 0x86, // †
  0x2021: 0x87, // ‡
  0x2030: 0x89, // ‰
  0x0160: 0x8a, // Š
  0x2039: 0x8b, // ‹
  0x0152: 0x8c, // Œ
  0x017d: 0x8e, // Ž
  0x2018: 0x91, // '
  0x2019: 0x92, // '
  0x201c: 0x93, // "
  0x201d: 0x94, // "
  0x2022: 0x95, // •
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x2122: 0x99, // ™
  0x0161: 0x9a, // š
  0x203a: 0x9b, // ›
  0x0153: 0x9c, // œ
  0x017e: 0x9e, // ž
  0x0178: 0x9f, // Ÿ
};

class EscPosBuilder {
  private chunks: number[] = [];
  private enc = new TextEncoder();

  constructor(private codepage: EscPosCodepage = 'ascii') {}

  raw(...bytes: number[]) {
    this.chunks.push(...bytes);
    return this;
  }
  // Encodes one character for the active codepage. ASCII passes through;
  // in 'latin1' mode accented Latin and CP1252 punctuation/€ print natively;
  // anything else has its diacritics folded away (é→e) and finally becomes
  // '?'. Arabic (and other non-Latin scripts) cannot be rendered by ESC/POS
  // text mode — the system printer type handles those receipts.
  private encodeChar(ch: string): number {
    const code = ch.codePointAt(0) ?? 0x3f;
    if (code >= 0x20 && code <= 0x7e) return code;
    if (this.codepage === 'latin1') {
      if (code >= 0xa0 && code <= 0xff) return code;
      const extra = CP1252_EXTRAS[code];
      if (extra !== undefined) return extra;
    }
    const folded = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (folded !== ch && folded.length === 1) {
      const base = folded.codePointAt(0)!;
      if (base >= 0x20 && base <= 0x7e) return base;
    }
    return 0x3f; // '?'
  }
  text(s: string) {
    for (const ch of s) this.chunks.push(this.encodeChar(ch));
    return this;
  }
  line(s = '') {
    this.text(s).raw(0x0a);
    return this;
  }
  init() {
    this.raw(ESC, 0x40); // ESC @  (reset)
    // ESC t 16 selects the WPC1252 character code table (Epson-compatible).
    if (this.codepage === 'latin1') this.raw(ESC, 0x74, 16);
    return this;
  }
  align(a: 'left' | 'center' | 'right') {
    return this.raw(ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0);
  }
  bold(on: boolean) {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }
  doubleHeight(on: boolean) {
    return this.raw(GS, 0x21, on ? 0x01 : 0x00);
  }
  feed(n = 1) {
    return this.raw(ESC, 0x64, n);
  }
  cut() {
    return this.raw(GS, 0x56, 0x00);
  } // full cut
  drawerKick() {
    return this.raw(ESC, 0x70, 0x00, 0x19, 0xfa);
  } // pulse pin 2
  build(): Uint8Array {
    // Merge accumulated codepoints; text() already pushed byte values.
    return Uint8Array.from(this.chunks);
  }
  // Encode a run of UTF-8 text properly (used only where multibyte is safe).
  utf8(s: string) {
    this.chunks.push(...this.enc.encode(s));
    return this;
  }
}

// Two columns padded to `width` characters (default 32 for 58mm, 48 for 80mm).
function twoCol(left: string, right: string, width: number): string {
  const space = Math.max(1, width - left.length - right.length);
  return left + ' '.repeat(space) + right;
}

export interface EncodeReceiptOptions {
  // Pulse the cash drawer after the cut. Callers set this for the checkout
  // print of a cash sale only — reprints from history must never pop the drawer.
  openDrawer?: boolean;
}

export function encodeReceipt(
  tx: SaleTransaction,
  settings: StoreSettings,
  printerConfig: PrinterConfig,
  options: EncodeReceiptOptions = {},
): Uint8Array {
  const width = printerConfig.paperSize === '58mm' ? 32 : 48;
  const cur = settings.currency;
  const b = new EscPosBuilder(printerConfig.codepage ?? 'ascii');

  b.init().align('center').bold(true).doubleHeight(true).line(settings.storeName);
  b.doubleHeight(false).bold(false);
  if (settings.storeAddress) b.line(settings.storeAddress);
  if (settings.storePhone) b.line(settings.storePhone);
  b.line('-'.repeat(width));

  b.align('left');
  b.line(twoCol('DATE', new Date(tx.date).toLocaleString(), width));
  b.line(twoCol('RECEIPT', tx.id, width));
  if (tx.operatorName) b.line(twoCol('OPERATOR', tx.operatorName, width));
  if (tx.customerName) b.line(twoCol('MEMBER', tx.customerName, width));
  b.line('-'.repeat(width));

  for (const item of tx.items) {
    b.line(
      twoCol(`${item.quantity}x ${item.productName}`, `${cur}${item.total.toFixed(2)}`, width),
    );
  }
  b.line('-'.repeat(width));

  b.line(twoCol('SUBTOTAL', `${cur}${tx.subtotal.toFixed(2)}`, width));
  if (tx.discount > 0) b.line(twoCol('DISCOUNT', `-${cur}${tx.discount.toFixed(2)}`, width));
  b.line(twoCol('TAX', `${cur}${tx.tax.toFixed(2)}`, width));
  b.bold(true)
    .line(twoCol('TOTAL', `${cur}${tx.total.toFixed(2)}`, width))
    .bold(false);
  b.line(twoCol('METHOD', tx.paymentMethod.toUpperCase(), width));
  if (tx.payments && tx.payments.length > 1) {
    for (const p of tx.payments) {
      b.line(twoCol(`  ${p.method.toUpperCase()}`, `${cur}${p.amount.toFixed(2)}`, width));
    }
  }
  if (tx.paymentMethod === 'cash' || (tx.payments ?? []).some((p) => p.method === 'cash')) {
    b.line(twoCol('CASH', `${cur}${(tx.cashPaid ?? 0).toFixed(2)}`, width));
    b.line(twoCol('CHANGE', `${cur}${(tx.cashChange ?? 0).toFixed(2)}`, width));
  }
  b.line('-'.repeat(width));

  b.align('center').line(printerConfig.footerMessage || 'Thank you!');
  b.feed(3).cut();
  if (options.openDrawer) b.drawerKick();
  return b.build();
}
