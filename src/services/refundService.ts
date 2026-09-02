import { Customer, Product, SaleTransaction } from '../types';
import { computeRefund, RefundComputation } from '../lib/refunds';
import { useProductStore } from '../stores/productStore';
import { useCustomerStore } from '../stores/customerStore';
import { RefundPatch, useTransactionStore } from '../stores/transactionStore';
import { syncToCloudIfEnabled } from '../lib/sync';

/**
 * What a committed refund changed. `computation` is the same figure the screen
 * previewed, so the confirmation and the receipt cannot disagree.
 */
export interface CommittedRefund {
  computation: RefundComputation;
  transaction: SaleTransaction;
  updatedProducts: Product[];
  updatedCustomer: Customer | null;
}

/**
 * Applies a refund: restocks the returned units, reverses the proportional
 * share of loyalty points, writes the cumulative refund state onto the sale,
 * and pushes all of it to the cloud. Returns null when the selection refunds
 * nothing.
 *
 * The transaction is re-read from the store before anything is computed. The
 * screen holds whichever copy it rendered the modal from, and that copy goes
 * stale the moment another terminal's refund arrives over realtime sync — so
 * computing from it would refund against pre-refund quantities and hand back
 * money that was already returned.
 */
export function commitRefund(
  transactionId: string,
  selection: Record<string, number>,
  authorizedBy: string,
  loyaltyPointsRate: number,
  loyaltyPointValue?: number,
): CommittedRefund | null {
  const transactionStore = useTransactionStore.getState();
  const transaction = transactionStore.transactions.find((tx) => tx.id === transactionId);
  if (!transaction) return null;

  const computation = computeRefund(transaction, selection, loyaltyPointsRate, loyaltyPointValue);
  if (!computation) return null;

  const productStore = useProductStore.getState();
  const liveById = new Map(productStore.products.map((product) => [product.id, product]));
  const updatedProducts: Product[] = [];
  for (const [productId, quantity] of Object.entries(computation.appliedItems)) {
    if (quantity <= 0) continue;
    const live = liveById.get(productId);
    if (!live) continue; // product deleted since the sale; nothing to restock
    const updated = { ...live, stock: live.stock + quantity };
    productStore.handleUpdateProduct(updated);
    updatedProducts.push(updated);
  }

  let updatedCustomer: Customer | null = null;
  if (transaction.customerId && computation.pointsReversal !== 0) {
    useCustomerStore
      .getState()
      .updateCustomerPoints(transaction.customerId, computation.pointsReversal);
    updatedCustomer =
      useCustomerStore
        .getState()
        .customers.find((customer) => customer.id === transaction.customerId) ?? null;
  }

  const refundDate = new Date().toISOString();
  const patch: RefundPatch = {
    refundedItems: computation.refundedItems,
    refundedAmount: computation.refundedAmount,
    status: computation.status,
    refundDate,
    authorizedBy,
  };
  transactionStore.applyRefund(transaction.id, patch);

  const refunded: SaleTransaction = {
    ...transaction,
    status: computation.status,
    refundedItems: computation.refundedItems,
    refundedAmount: computation.refundedAmount,
    refundDate,
    refundAuthorizedBy: authorizedBy,
  };

  void syncToCloudIfEnabled(
    updatedProducts.length > 0 ? updatedProducts : undefined,
    undefined,
    updatedCustomer ? [updatedCustomer] : undefined,
    [refunded],
  );

  return { computation, transaction: refunded, updatedProducts, updatedCustomer };
}
