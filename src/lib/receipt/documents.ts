import { PrinterConfig, ReceiptLayout, SaleTransaction, StoreSettings } from '../../types';
import { resolveCustomerLayout, resolveKitchenLayout } from '../receiptFormat';
import { buildKitchenTicketHtml } from './templates/kitchen';
import { buildReceiptHtml } from './templates/customer';
import { receiptDocHtml } from './document';
import type { ReceiptDocumentKind } from './types';

/**
 * Full standalone receipt document(s) for silent Electron printing (no window,
 * no dialog). Mirrors what printTransactions writes into the print window.
 */
export function receiptsPrintDoc(
  txs: SaleTransaction[],
  settings: StoreSettings,
  printerConfig: PrinterConfig,
  layout?: ReceiptLayout,
): string {
  const L = resolveCustomerLayout(layout, printerConfig);
  const rollWidth = printerConfig.paperSize === '58mm' ? '58mm' : '80mm';
  const body = txs
    .map((tx) => buildReceiptHtml(tx, settings, printerConfig, L))
    .join('<div class="page-break"></div>');
  return receiptDocHtml(body, rollWidth, L.fontFamily, L.fontSizePx, false);
}

/**
 * Full standalone kitchen-ticket document for silent Electron printing.
 */
export function kitchenPrintDoc(
  tx: SaleTransaction,
  settings: StoreSettings,
  printerConfig: PrinterConfig,
  stationName?: string,
  layout?: ReceiptLayout,
): string {
  const L = resolveKitchenLayout(layout);
  const rollWidth = printerConfig.paperSize === '58mm' ? '58mm' : '80mm';
  return receiptDocHtml(
    buildKitchenTicketHtml(tx, settings, stationName, L),
    rollWidth,
    L.fontFamily,
    L.fontSizePx,
    false,
  );
}

/**
 * Full standalone HTML doc for the settings live preview (rendered in an
 * isolated iframe). `kind` picks the customer receipt or the kitchen ticket.
 */
export function receiptPreviewDoc(
  tx: SaleTransaction,
  settings: StoreSettings,
  printerConfig: PrinterConfig,
  layout: ReceiptLayout,
  kind: ReceiptDocumentKind,
): string {
  const rollWidth = printerConfig.paperSize === '58mm' ? '58mm' : '80mm';
  const body =
    kind === 'kitchen'
      ? buildKitchenTicketHtml(tx, settings, undefined, layout)
      : buildReceiptHtml(tx, settings, printerConfig, layout);
  return receiptDocHtml(body, rollWidth, layout.fontFamily, layout.fontSizePx, false);
}
