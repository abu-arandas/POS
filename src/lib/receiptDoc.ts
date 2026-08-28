// A backend-neutral description of a printed receipt: an ordered list of rows,
// each saying what to show and how to emphasise it, with no idea how it will be
// drawn. receiptCanvas.ts turns this into dots for a thermal printer.
//
// Pure and DOM-free, so the whole layout — which blocks appear for a given set
// of ReceiptLayout toggles, what the totals read, how a split payment breaks
// down — is unit-testable without a canvas.

import { SaleTransaction, StoreSettings, PrinterConfig, ReceiptLayout } from '../types';
import i18n from './i18n';
import { formatDateTime, resolveCustomerLayout, resolveKitchenLayout } from './receiptFormat';

/**
 * Visual weight of a receipt row. Each renderer maps these to its own medium —
 * font weight on canvas, ESC/POS emphasis on a thermal printer.
 */
export type RowStyle = 'normal' | 'bold' | 'muted' | 'title' | 'large';

/**
 * One row of the printer-independent receipt document. The canvas, HTML and
 * ESC/POS renderers all consume this same shape.
 */
export type DocRow =
  // A single run of centered text.
  | { kind: 'center'; text: string; style?: RowStyle }
  // Label on the leading edge, value on the trailing edge. Direction-aware:
  // the canvas renderer flips these for an RTL receipt. `boxed` draws a ruled
  // border around the row — used for the total, which is what a customer
  // actually looks for and which needs to survive faded thermal paper.
  | { kind: 'pair'; label: string; value: string; style?: RowStyle; boxed?: boolean }
  // Free text on the leading edge.
  | { kind: 'line'; text: string; style?: RowStyle }
  | { kind: 'divider' }
  | { kind: 'barcode'; value: string };

// Tender labels, translated. The receipt used to print the raw enum ('cash'),
// which reads as a stray English word on an Arabic receipt.
function payLabel(method: string): string {
  const key = `register.pay${method.charAt(0).toUpperCase()}${method.slice(1)}`;
  return i18n.t(key, method.toUpperCase());
}

const money = (cur: string, n: number) => `${cur}${n.toFixed(2)}`;

/** The customer receipt, as rows. Mirrors buildReceiptHtml's block order. */
/**
 * Builds the customer receipt as renderer-independent rows, honoring the
 * layout's field toggles. Pure — no DOM and no printer bytes.
 */
export function buildReceiptDoc(
  tx: SaleTransaction,
  settings: StoreSettings,
  printerConfig: PrinterConfig,
  layout?: ReceiptLayout,
): DocRow[] {
  const L = resolveCustomerLayout(layout, printerConfig);
  const S = L.show;
  const cur = settings.currency;
  const d = new Date(tx.date);
  const rows: DocRow[] = [];

  if (L.header) rows.push({ kind: 'center', text: L.header, style: 'bold' });
  if (S.storeName) rows.push({ kind: 'center', text: settings.storeName, style: 'title' });
  if (S.branchName && settings.branchName)
    rows.push({ kind: 'center', text: settings.branchName, style: 'muted' });
  if (S.address && settings.storeAddress)
    rows.push({ kind: 'center', text: settings.storeAddress, style: 'muted' });
  if (S.phone && settings.storePhone)
    rows.push({
      kind: 'center',
      text: `${i18n.t('receipt.phone', 'Phone')}: ${settings.storePhone}`,
      style: 'muted',
    });
  if (S.taxNumber && settings.taxNumber)
    rows.push({
      kind: 'center',
      text: `${i18n.t('receipt.vat', 'VAT')}: ${settings.taxNumber}`,
      style: 'muted',
    });
  rows.push({ kind: 'divider' });

  if (S.date)
    rows.push({
      kind: 'pair',
      label: i18n.t('history.date', 'DATE:'),
      value: formatDateTime(d, L.dateFormat),
    });
  if (S.time)
    rows.push({
      kind: 'pair',
      label: `${i18n.t('receiptCfg.tg_time', 'Time').toUpperCase()}:`,
      value: formatDateTime(d, L.timeFormat),
    });
  if (S.receiptNumber)
    rows.push({
      kind: 'pair',
      label: i18n.t('history.receipt', 'RECEIPT:'),
      value: tx.id,
      style: 'bold',
    });
  if (S.operator && tx.operatorName)
    rows.push({
      kind: 'pair',
      label: i18n.t('history.operator', 'OPERATOR:'),
      value: tx.operatorName,
    });
  if (S.customer && tx.customerName)
    rows.push({
      kind: 'pair',
      label: i18n.t('history.member', 'MEMBER:'),
      value: tx.customerName,
      style: 'bold',
    });
  rows.push({ kind: 'divider' });

  for (const item of tx.items) {
    const name = `${item.quantity}x ${item.productName}`;
    if (S.priceColumn) {
      rows.push({ kind: 'pair', label: name, value: money(cur, item.total) });
      if (S.itemUnitPrice && item.quantity > 1) {
        rows.push({
          kind: 'line',
          text: `@ ${money(cur, item.price)} ${i18n.t('register.each', 'ea')}`,
          style: 'muted',
        });
      }
    } else {
      rows.push({ kind: 'line', text: name });
    }
  }
  rows.push({ kind: 'divider' });

  if (S.totals) {
    const itemCount = tx.items.reduce((s, i) => s + i.quantity, 0);
    rows.push({
      kind: 'pair',
      label: i18n.t('history.itemsUpper', 'ITEMS:'),
      value: String(itemCount),
      style: 'muted',
    });
    rows.push({
      kind: 'pair',
      label: i18n.t('history.subtotal', 'SUBTOTAL:'),
      value: money(cur, tx.subtotal),
    });
    if (tx.discount > 0)
      rows.push({
        kind: 'pair',
        label: i18n.t('history.discount', 'DISCOUNT:'),
        value: `-${money(cur, tx.discount)}`,
      });
    const taxStr = i18n.t('history.tax', 'TAX:').replace(':', '');
    rows.push({
      kind: 'pair',
      label: `${settings.taxRate > 0 ? `${taxStr} (${settings.taxRate}%)` : taxStr}:`,
      value: money(cur, tx.tax),
    });
    rows.push({
      kind: 'pair',
      label: i18n.t('history.totalPaid', 'TOTAL PAID:'),
      value: money(cur, tx.total),
      style: 'large',
      boxed: true,
    });
    if (tx.discount > 0)
      rows.push({
        kind: 'center',
        text: `${i18n.t('history.savings', 'YOU SAVED')} ${money(cur, tx.discount)}`,
        style: 'bold',
      });
  }

  if (S.paymentDetails) {
    rows.push({
      kind: 'pair',
      label: i18n.t('history.payMethod', 'METHOD:'),
      value: payLabel(tx.paymentMethod),
      style: 'bold',
    });
    if (tx.payments && tx.payments.length > 1) {
      for (const p of tx.payments) {
        rows.push({ kind: 'pair', label: `  ${payLabel(p.method)}`, value: money(cur, p.amount) });
      }
    }
  }

  const isCash =
    tx.paymentMethod === 'cash' || (tx.payments ?? []).some((p) => p.method === 'cash');
  if (S.changeDue && isCash) {
    rows.push({
      kind: 'pair',
      label: i18n.t('history.cashPaid', 'CASH PAID:'),
      value: money(cur, tx.cashPaid ?? 0),
    });
    rows.push({
      kind: 'pair',
      label: i18n.t('history.cashChange', 'CHANGE:'),
      value: money(cur, tx.cashChange ?? 0),
      style: 'bold',
    });
  }
  if (S.loyalty && tx.customerName && (tx.pointsEarned ?? 0) > 0) {
    rows.push({
      kind: 'pair',
      label: i18n.t('history.pointsEarned', 'POINTS EARNED:'),
      value: String(tx.pointsEarned),
      style: 'bold',
    });
  }

  rows.push({ kind: 'divider' });
  rows.push({
    kind: 'center',
    text: i18n.t(`receipt.status_${tx.status}`, tx.status),
    style: 'bold',
  });
  // Who authorised the refund and when. The HTML receipt has always printed
  // this; the thermal path never did, so a reprinted refund slip carried the
  // word "Refunded" and nothing else — no date, no authoriser. That is the
  // audit trail on a money document, and the customer copy is often the only
  // copy that leaves the building.
  if (tx.refundDate) {
    const refundDate = new Date(tx.refundDate);
    if (!Number.isNaN(refundDate.getTime())) {
      rows.push({
        kind: 'center',
        text: `${i18n.t('history.refund', 'REFUND:')} ${formatDateTime(refundDate, L.dateFormat)}`,
        style: 'muted',
      });
    }
  }
  if (tx.refundAuthorizedBy)
    rows.push({
      kind: 'center',
      text: `${i18n.t('history.refundAuthBy', 'REFUND AUTH:')} ${tx.refundAuthorizedBy}`,
      style: 'muted',
    });
  if (L.footer) rows.push({ kind: 'center', text: L.footer, style: 'muted' });
  if (S.barcode) rows.push({ kind: 'barcode', value: tx.id });

  return rows;
}

/** The kitchen ticket, as rows. Items in large type, no prices, no payment. */
/**
 * Builds a kitchen ticket as renderer-independent rows: order identity and
 * items only, with no pricing.
 */
export function buildKitchenDoc(
  tx: SaleTransaction,
  settings: StoreSettings,
  stationName?: string,
  layout?: ReceiptLayout,
): DocRow[] {
  const L = resolveKitchenLayout(layout);
  const S = L.show;
  const d = new Date(tx.date);
  const rows: DocRow[] = [];

  const title = stationName
    ? stationName.toUpperCase()
    : i18n.t('receiptCfg.kitchenTitle', 'KITCHEN').toUpperCase();
  rows.push({ kind: 'center', text: `*** ${title} ***`, style: 'title' });
  if (L.header) rows.push({ kind: 'center', text: L.header, style: 'bold' });
  if (S.storeName) rows.push({ kind: 'center', text: settings.storeName });
  rows.push({ kind: 'divider' });

  if (S.receiptNumber)
    rows.push({
      kind: 'pair',
      label: `${i18n.t('receiptCfg.tg_receiptNumber', 'ORDER').toUpperCase()}:`,
      value: tx.id,
      style: 'bold',
    });
  if (S.date)
    rows.push({
      kind: 'pair',
      label: i18n.t('history.date', 'DATE:'),
      value: formatDateTime(d, L.dateFormat),
    });
  if (S.time)
    rows.push({
      kind: 'pair',
      label: `${i18n.t('receiptCfg.tg_time', 'Time').toUpperCase()}:`,
      value: formatDateTime(d, L.timeFormat),
    });
  if (S.operator && tx.operatorName)
    rows.push({
      kind: 'pair',
      label: i18n.t('history.operator', 'OPERATOR:'),
      value: tx.operatorName,
    });
  if (S.customer && tx.customerName)
    rows.push({
      kind: 'pair',
      label: i18n.t('history.customer', 'CUSTOMER:'),
      value: tx.customerName,
    });
  rows.push({ kind: 'divider' });

  for (const item of tx.items) {
    rows.push({ kind: 'line', text: `${item.quantity}x ${item.productName}`, style: 'large' });
  }

  rows.push({ kind: 'divider' });
  rows.push({
    kind: 'center',
    text: `${tx.items.reduce((s, i) => s + i.quantity, 0)} ${i18n
      .t('history.itemsUpper', 'ITEMS')
      .replace(':', '')}`,
    style: 'bold',
  });
  if (L.footer) rows.push({ kind: 'center', text: L.footer, style: 'muted' });

  return rows;
}

/** Every piece of text in a doc, for the needsRaster check. */
/**
 * Flattens a document to its visible text runs. Used by tests and by the
 * translation checks to assert what actually reaches the paper.
 */
export function docStrings(rows: DocRow[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    if (r.kind === 'center' || r.kind === 'line') out.push(r.text);
    else if (r.kind === 'pair') out.push(r.label, r.value);
    else if (r.kind === 'barcode') out.push(r.value);
  }
  return out;
}
