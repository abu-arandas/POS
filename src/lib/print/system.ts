import { PrinterConfig, ReceiptLayout, SaleTransaction, StoreSettings } from '../../types';
import { resolveCustomerLayout, resolveKitchenLayout } from '../receiptFormat';
import { buildKitchenTicketHtml, buildReceiptHtml } from '../receipt/generator';
import { openSystemPrintWindow } from './transport/system';
import type { PrintOutcome } from './types';

/**
 * Opens a print window for one or more receipts on the "system" printer type;
 * non-system types are mocked (ESC/POS handoff message). Returns an outcome the
 * caller can surface to the operator; all dynamic values are HTML-escaped.
 */
export function printTransactions(
  txs: SaleTransaction[],
  settings: StoreSettings,
  printerConfig: PrinterConfig,
  layout?: ReceiptLayout,
): PrintOutcome {
  if (printerConfig.type !== 'system') return 'esc-pos';
  if (txs.length === 0) return 'printed';

  const L = resolveCustomerLayout(layout, printerConfig);
  const rollWidth = printerConfig.paperSize === '58mm' ? '58mm' : '80mm';
  const receiptsHtml = txs
    .map((tx) => buildReceiptHtml(tx, settings, printerConfig, L))
    .join('<div class="page-break"></div>');
  return openSystemPrintWindow(receiptsHtml, rollWidth, L.fontFamily, L.fontSizePx);
}

/**
 * System-print path for the kitchen ticket format. Optionally titled with a
 * station name for per-station routing.
 */
export function printKitchenTicketSystem(
  tx: SaleTransaction,
  settings: StoreSettings,
  printerConfig: PrinterConfig,
  stationName?: string,
  layout?: ReceiptLayout,
): PrintOutcome {
  if (printerConfig.type !== 'system') return 'esc-pos';
  const L = resolveKitchenLayout(layout);
  const rollWidth = printerConfig.paperSize === '58mm' ? '58mm' : '80mm';
  return openSystemPrintWindow(
    buildKitchenTicketHtml(tx, settings, stationName, L),
    rollWidth,
    L.fontFamily,
    L.fontSizePx,
  );
}
