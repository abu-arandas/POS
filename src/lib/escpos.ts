import { SaleTransaction, StoreSettings, PrinterConfig } from '../types';

// Minimal ESC/POS command encoder. Produces the raw byte stream a thermal
// printer understands, independent of transport (Web Serial, network socket,
// Bluetooth). Kept pure and free of DOM/hardware so it is unit-testable.

const ESC = 0x1b;
const GS = 0x1d;

class EscPosBuilder {
  private chunks: number[] = [];
  private enc = new TextEncoder();

  raw(...bytes: number[]) {
    this.chunks.push(...bytes);
    return this;
  }
  text(s: string) {
    // Latin-1-ish: printers choke on multibyte; strip to ASCII-safe bytes.
    for (const ch of s) {
      const code = ch.codePointAt(0) ?? 63;
      this.chunks.push(code > 0x7f ? 0x3f /* '?' */ : code);
    }
    return this;
  }
  line(s = '') {
    this.text(s).raw(0x0a);
    return this;
  }
  init() {
    return this.raw(ESC, 0x40);
  } // ESC @  (reset)
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
  const b = new EscPosBuilder();

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
