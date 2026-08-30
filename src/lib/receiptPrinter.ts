/**
 * @deprecated Import from `receipt/`, `receipt/generator`, or `print/system`
 * in new code. This facade preserves the original public import path while the
 * implementation is organized by responsibility.
 */
export type { PrintOutcome } from './print/types';
export { buildReceiptHtml, buildKitchenTicketHtml, receiptDocHtml } from './receipt/generator';
export { receiptsPrintDoc, kitchenPrintDoc, receiptPreviewDoc } from './receipt/documents';
export { printTransactions, printKitchenTicketSystem } from './print/system';
