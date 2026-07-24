// Pure helpers for configurable receipts: a small token date/time formatter, the
// preset option lists the Receipt Settings UI offers, and the default / legacy
// layouts. DOM-free and deterministic so it unit-tests like the other lib/*
// helpers. The renderers (escpos.ts, receiptPrinter.ts) consume these.

import { PrinterConfig, ReceiptLayout, ReceiptToggles } from '../types';

// Formats a date with a subset of the familiar yyyy/MM/dd HH:mm tokens. Longer
// tokens are matched first (yyyy before yy, MM before M, …) so patterns like
// 'yyyy-MM-dd' and 'h:mm a' resolve correctly. Unknown characters pass through
// as literal separators.
export function formatDateTime(date: Date, pattern: string): string {
  const h24 = date.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const pad = (n: number) => String(n).padStart(2, '0');
  const map: Record<string, string> = {
    yyyy: String(date.getFullYear()),
    yy: pad(date.getFullYear() % 100),
    MM: pad(date.getMonth() + 1),
    M: String(date.getMonth() + 1),
    dd: pad(date.getDate()),
    d: String(date.getDate()),
    HH: pad(h24),
    H: String(h24),
    hh: pad(h12),
    h: String(h12),
    mm: pad(date.getMinutes()),
    m: String(date.getMinutes()),
    ss: pad(date.getSeconds()),
    s: String(date.getSeconds()),
    a: h24 < 12 ? 'AM' : 'PM',
  };
  return pattern.replace(/yyyy|yy|MM|M|dd|d|HH|H|hh|h|mm|m|ss|s|a/g, (tok) => map[tok] ?? tok);
}

// Preset options surfaced in the settings dropdowns (with a live sample).
export const DATE_FORMATS = ['yyyy-MM-dd', 'dd/MM/yyyy', 'MM/dd/yyyy', 'dd-MM-yyyy'];
export const TIME_FORMATS = ['h:mm a', 'HH:mm', 'hh:mm a', 'HH:mm:ss'];
export const RECEIPT_FONTS = ['monospace', 'Arial', 'Courier New', 'Tahoma', 'Times New Roman'];

export function allTogglesOn(): ReceiptToggles {
  return {
    logo: true,
    storeName: true,
    branchName: true,
    address: true,
    phone: true,
    taxNumber: true,
    date: true,
    time: true,
    receiptNumber: true,
    operator: true,
    customer: true,
    itemUnitPrice: true,
    priceColumn: true,
    totals: true,
    paymentDetails: true,
    changeDue: true,
    loyalty: true,
    barcode: true,
  };
}

// A sensible starting customer receipt: everything on except the two newly
// added blocks (branch name, tax number), which stay off until an operator
// fills those store fields in.
export function defaultReceiptLayout(): ReceiptLayout {
  return {
    header: '',
    footer: 'Thank you for shopping with us!',
    fontFamily: 'monospace',
    fontSizePx: 12,
    dateFormat: 'yyyy-MM-dd',
    timeFormat: 'h:mm a',
    show: { ...allTogglesOn(), branchName: false, taxNumber: false },
  };
}

// The kitchen ticket only needs what the line cooks read: items, order id, time,
// who rang it. Prices, totals, payment, logo, address, tax and barcode are off.
export function defaultKitchenLayout(): ReceiptLayout {
  return {
    header: '',
    footer: '',
    fontFamily: 'monospace',
    fontSizePx: 16,
    dateFormat: 'yyyy-MM-dd',
    timeFormat: 'HH:mm',
    show: {
      ...allTogglesOn(),
      logo: false,
      branchName: false,
      address: false,
      phone: false,
      taxNumber: false,
      date: false,
      itemUnitPrice: false,
      priceColumn: false,
      totals: false,
      paymentDetails: false,
      changeDue: false,
      loyalty: false,
      barcode: false,
    },
  };
}

// Behavior for a renderer called without an explicit layout: preserve the
// pre-settings output exactly — everything on, footer/barcode taken from the
// PrinterConfig, and the two brand-new blocks (branch, tax number) left off
// since they never printed before.
export function legacyLayout(printerConfig: PrinterConfig): ReceiptLayout {
  return {
    ...defaultReceiptLayout(),
    footer: printerConfig.footerMessage,
    show: { ...allTogglesOn(), branchName: false, taxNumber: false, barcode: printerConfig.showBarcode },
  };
}

export function resolveCustomerLayout(
  layout: ReceiptLayout | undefined,
  printerConfig: PrinterConfig,
): ReceiptLayout {
  return layout ?? legacyLayout(printerConfig);
}

export function resolveKitchenLayout(layout: ReceiptLayout | undefined): ReceiptLayout {
  return layout ?? defaultKitchenLayout();
}
