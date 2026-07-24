import { SaleTransaction, StoreSettings, PrinterConfig, ReceiptLayout } from '../types';
import { formatDateTime, resolveCustomerLayout, resolveKitchenLayout } from './receiptFormat';

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

export function encodeReceipt(
  tx: SaleTransaction,
  settings: StoreSettings,
  printerConfig: PrinterConfig,
  openDrawer = false,
  layout?: ReceiptLayout,
): Uint8Array {
  const width = printerConfig.paperSize === '58mm' ? 32 : 48;
  const cur = settings.currency;
  const L = resolveCustomerLayout(layout, printerConfig);
  const S = L.show;
  const b = new EscPosBuilder();

  b.init().align('center');
  if (L.header) b.bold(true).line(L.header).bold(false);
  if (S.storeName) {
    b.bold(true).doubleHeight(true).line(settings.storeName).doubleHeight(false).bold(false);
  }
  if (S.branchName && settings.branchName) b.line(settings.branchName);
  if (S.address && settings.storeAddress) b.line(settings.storeAddress);
  if (S.phone && settings.storePhone) b.line(settings.storePhone);
  if (S.taxNumber && settings.taxNumber) b.line(`VAT: ${settings.taxNumber}`);
  b.divider(width);

  const d = new Date(tx.date);
  b.align('left');
  if (S.date) b.line(twoCol('DATE', formatDateTime(d, L.dateFormat), width));
  if (S.time) b.line(twoCol('TIME', formatDateTime(d, L.timeFormat), width));
  if (S.receiptNumber) b.line(twoCol('RECEIPT', tx.id, width));
  if (S.operator && tx.operatorName) b.line(twoCol('OPERATOR', tx.operatorName, width));
  if (S.customer && tx.customerName) b.line(twoCol('MEMBER', tx.customerName, width));
  b.divider(width);

  for (const item of tx.items) {
    if (S.priceColumn) {
      b.line(
        twoCol(`${item.quantity}x ${item.productName}`, `${cur}${item.total.toFixed(2)}`, width),
      );
      // Break out the unit price when more than one was sold.
      if (S.itemUnitPrice && item.quantity > 1) {
        b.line(`   @ ${cur}${item.price.toFixed(2)} ${'ea'}`);
      }
    } else {
      b.line(`${item.quantity}x ${item.productName}`);
    }
  }
  b.divider(width);

  if (S.totals) {
    const itemCount = tx.items.reduce((s, i) => s + i.quantity, 0);
    b.line(twoCol('ITEMS', String(itemCount), width));
    b.line(twoCol('SUBTOTAL', `${cur}${tx.subtotal.toFixed(2)}`, width));
    if (tx.discount > 0) b.line(twoCol('DISCOUNT', `-${cur}${tx.discount.toFixed(2)}`, width));
    const taxLabel = settings.taxRate > 0 ? `TAX (${settings.taxRate}%)` : 'TAX';
    b.line(twoCol(taxLabel, `${cur}${tx.tax.toFixed(2)}`, width));
    b.bold(true)
      .doubleHeight(true)
      .line(twoCol('TOTAL', `${cur}${tx.total.toFixed(2)}`, width))
      .doubleHeight(false)
      .bold(false);
  }
  if (S.paymentDetails) {
    b.line(twoCol('METHOD', tx.paymentMethod.toUpperCase(), width));
    if (tx.payments && tx.payments.length > 1) {
      for (const p of tx.payments) {
        b.line(twoCol(`  ${p.method.toUpperCase()}`, `${cur}${p.amount.toFixed(2)}`, width));
      }
    }
  }
  if (S.changeDue && (tx.paymentMethod === 'cash' || (tx.payments ?? []).some((p) => p.method === 'cash'))) {
    b.line(twoCol('CASH', `${cur}${(tx.cashPaid ?? 0).toFixed(2)}`, width));
    b.line(twoCol('CHANGE', `${cur}${(tx.cashChange ?? 0).toFixed(2)}`, width));
  }

  // Savings + loyalty call-outs, centered under the totals.
  if (S.totals && tx.discount > 0) {
    b.align('center').bold(true).line(`YOU SAVED ${cur}${tx.discount.toFixed(2)}`).bold(false);
  }
  if (S.loyalty && tx.customerName && (tx.pointsEarned ?? 0) > 0) {
    b.align('center').line(`Points earned: ${tx.pointsEarned}`);
  }

  b.align('center').divider(width);
  if (L.footer) b.line(L.footer);

  // Real, scannable barcode of the receipt id for quick lookup/returns.
  if (S.barcode) {
    b.feed(1).align('center').barcode128(tx.id).feed(1);
  }

  b.feed(3).cut();
  if (openDrawer) b.drawerKick();
  return b.build();
}

// Kitchen ticket: what the line cooks need and nothing else — order id, time,
// who rang it, and big-type quantities/items. Deliberately no prices, no
// payment info, no drawer kick. An optional stationName titles the ticket for
// per-station routing (e.g. "BAR", "GRILL").
export function encodeKitchenTicket(
  tx: SaleTransaction,
  settings: StoreSettings,
  printerConfig: PrinterConfig,
  stationName?: string,
  layout?: ReceiptLayout,
): Uint8Array {
  const width = printerConfig.paperSize === '58mm' ? 32 : 48;
  const L = resolveKitchenLayout(layout);
  const S = L.show;
  const b = new EscPosBuilder();

  const title = stationName ? `*** ${stationName.toUpperCase()} ***` : '*** KITCHEN ***';
  b.init().align('center').bold(true).doubleHeight(true).line(title);
  b.doubleHeight(false);
  if (L.header) b.line(L.header);
  if (S.storeName) b.line(settings.storeName);
  b.bold(false);
  b.divider(width);

  const d = new Date(tx.date);
  b.align('left');
  if (S.receiptNumber) b.line(twoCol('ORDER', tx.id, width));
  if (S.date) b.line(twoCol('DATE', formatDateTime(d, L.dateFormat), width));
  if (S.time) b.line(twoCol('TIME', formatDateTime(d, L.timeFormat), width));
  if (S.operator && tx.operatorName) b.line(twoCol('OPERATOR', tx.operatorName, width));
  if (S.customer && tx.customerName) b.line(twoCol('CUSTOMER', tx.customerName, width));
  b.divider(width);

  b.doubleHeight(true).bold(true);
  for (const item of tx.items) {
    b.line(`${item.quantity}x ${item.productName}`);
  }
  b.bold(false).doubleHeight(false);
  b.divider(width);

  b.align('center').line(`${tx.items.reduce((s, i) => s + i.quantity, 0)} ITEMS`);
  if (L.footer) b.line(L.footer);
  b.feed(3).cut();
  return b.build();
}
