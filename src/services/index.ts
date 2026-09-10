/**
 * Cross-store operations.
 *
 * A sale, a refund and a stock receipt each touch several stores at once
 * (products, customers, transactions, the supply log) and then push the result
 * to the cloud. That orchestration used to live inline in Register, History and
 * Inventory, which meant the money paths could only be exercised by rendering a
 * screen and clicking through a modal, and that three screens each held their
 * own copy of the ordering rules.
 *
 * These functions are the seam. They read and write stores through getState(),
 * exactly as the screens did, so behaviour is unchanged — but they are ordinary
 * functions, callable from a test with no DOM.
 *
 * The split is deliberate: everything that changes persisted state lives here;
 * everything the operator sees — toasts, modals, receipts, the printer — stays
 * in the component. A service never notifies and never prints.
 */
export { commitSale } from './saleService';
export type { CommitSaleResult, CommittedSale } from './saleService';

export { commitRefund } from './refundService';
export type { CommittedRefund } from './refundService';

export { adjustStock, receivePurchaseOrder } from './stockService';
export type {
  StockAdjustmentError,
  StockAdjustmentRequest,
  StockAdjustmentResult,
} from './stockService';
