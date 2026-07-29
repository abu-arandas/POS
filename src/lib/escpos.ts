import { SaleTransaction, StoreSettings, PrinterConfig, ReceiptLayout } from '../types';
import { DocRow, buildReceiptDoc, buildKitchenDoc } from './receiptDoc';

// Minimal ESC/POS command encoder. Produces the raw byte stream a thermal
// printer understands, independent of transport (Web Serial, network socket,
// Bluetooth). Kept pure and free of DOM/hardware so it is unit-testable.

const ESC = 0x1b;
const GS = 0x1d;

class EscPosBuilder {
  private chunks: number[] = [];
  private enc = new TextEncoder();
  private lastWasDivider = false;

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
    this.lastWasDivider = false;
    return this;
  }
  // A dashed separator that collapses consecutive calls, so hiding a whole
  // section (via receipt-layout toggles) never prints two rules back-to-back.
  divider(width: number) {
    if (this.lastWasDivider) return this;
    this.text('-'.repeat(width)).raw(0x0a);
    this.lastWasDivider = true;
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
  // Native Code128 (code set B) barcode with the human-readable value printed
  // below it. Uses the printer's built-in barcode engine, so it's always sharp
  // and scannable regardless of paper width.
  barcode128(value: string) {
    this.raw(GS, 0x68, 0x50); // GS h 80  — barcode height (dots)
    this.raw(GS, 0x77, 0x02); // GS w 2   — narrow module width
    this.raw(GS, 0x48, 0x02); // GS H 2   — print HRI text below the bars
    // GS k 73 n d1..dn — Code128; data is prefixed with "{B" to select code set B.
    const payload = `{B${value}`;
    this.raw(GS, 0x6b, 73, payload.length);
    for (const ch of payload) this.chunks.push(ch.charCodeAt(0) & 0x7f);
    return this;
  }
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

// Renders the shared receipt document (receiptDoc.ts) as ESC/POS text.
//
// This is the compact, fast path, and it is limited to what a printer's default
// codepage can express — text() below drops anything above 0x7F. Receipts that
// carry other scripts go out as a bitmap instead; see escposRaster.ts. Both
// paths now describe the receipt from the same DocRow list, so a layout toggle
// or a label change lands on both without being written twice.
function renderDoc(rows: DocRow[], width: number, b: EscPosBuilder): void {
  for (const row of rows) {
    switch (row.kind) {
      case 'divider':
        b.divider(width);
        break;
      case 'center': {
        const big = row.style === 'title' || row.style === 'large';
        const bold = big || row.style === 'bold';
        b.align('center');
        if (bold) b.bold(true);
        if (big) b.doubleHeight(true);
        b.line(row.text);
        if (big) b.doubleHeight(false);
        if (bold) b.bold(false);
        break;
      }
      case 'line': {
        const big = row.style === 'large' || row.style === 'title';
        const bold = big || row.style === 'bold';
        b.align('left');
        if (bold) b.bold(true);
        if (big) b.doubleHeight(true);
        b.line(row.text);
        if (big) b.doubleHeight(false);
        if (bold) b.bold(false);
        break;
      }
      case 'pair': {
        const big = row.style === 'large' || row.style === 'title';
        const bold = big || row.style === 'bold';
        b.align('left');
        if (bold) b.bold(true);
        if (big) b.doubleHeight(true);
        b.line(twoCol(row.label, row.value, width));
        if (big) b.doubleHeight(false);
        if (bold) b.bold(false);
        break;
      }
      case 'barcode':
        b.feed(1).align('center').barcode128(row.value).feed(1);
        break;
    }
  }
}

export function encodeReceipt(
  tx: SaleTransaction,
  settings: StoreSettings,
  printerConfig: PrinterConfig,
  openDrawer = false,
  layout?: ReceiptLayout,
): Uint8Array {
  const width = printerConfig.paperSize === '58mm' ? 32 : 48;
  const b = new EscPosBuilder();
  b.init();
  renderDoc(buildReceiptDoc(tx, settings, printerConfig, layout), width, b);
  b.feed(3).cut();
  if (openDrawer) b.drawerKick();
  return b.build();
}

// Kitchen ticket: what the line cooks need and nothing else. Deliberately no
// prices, no payment info, no drawer kick. An optional stationName titles the
// ticket for per-station routing (e.g. "BAR", "GRILL").
export function encodeKitchenTicket(
  tx: SaleTransaction,
  settings: StoreSettings,
  printerConfig: PrinterConfig,
  stationName?: string,
  layout?: ReceiptLayout,
): Uint8Array {
  const width = printerConfig.paperSize === '58mm' ? 32 : 48;
  const b = new EscPosBuilder();
  b.init();
  renderDoc(buildKitchenDoc(tx, settings, stationName, layout), width, b);
  b.feed(3).cut();
  return b.build();
}
