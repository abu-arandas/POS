import { Customer, Product, SaleTransaction } from '../types';
import { buildSaleTransaction, CheckoutOutcome, CheckoutRequest } from '../lib/checkout';
import { useProductStore } from '../stores/productStore';
import { useCustomerStore } from '../stores/customerStore';
import { useTransactionStore } from '../stores/transactionStore';
import { syncToCloudIfEnabled } from '../lib/sync';

/**
 * What committing a sale changed, so the caller can drive the receipt and the
 * printer without re-deriving any of it.
 */
export interface CommittedSale {
  transaction: SaleTransaction;
  /** True when any tender was cash — the condition that kicks the drawer. */
  isCashSale: boolean;
  updatedProducts: Product[];
  updatedCustomer: Customer | null;
}

/**
 * Either the committed sale or the reason the tender was refused. Mirrors
 * CheckoutOutcome's error union so the register keeps messaging each case.
 */
export type CommitSaleResult =
  | { success: true; sale: CommittedSale }
  | { success: false; error: Extract<CheckoutOutcome, { success: false }>['error'] };

/**
 * Commits one sale: validates the tender, decrements stock, moves loyalty
 * points, persists the transaction, and pushes all of it to the cloud.
 *
 * This is the whole store-writing half of checkout, lifted out of the register
 * screen. It was inline in a useCallback with fourteen dependencies, which made
 * the money path reachable only by rendering a component and clicking through a
 * modal. Here it is an ordinary function over the stores.
 *
 * Stock comes off the LIVE product records rather than the cart's snapshots.
 * The cart holds copies taken at add-to-cart time, so writing those back would
 * silently revert any price, name or stock edit made while the sale was open.
 */
export function commitSale(request: CheckoutRequest): CommitSaleResult {
  const outcome = buildSaleTransaction(request);
  if (!outcome.success) return { success: false, error: outcome.error };

  const { transaction, pointsDelta } = outcome;

  // Quantities are read off the built transaction rather than taking the cart
  // as a second parameter. transaction.items is assembled from the same cart
  // lines and carries productId and quantity, so the two cannot disagree —
  // whereas a separately-passed cart could, and the caller would never know.
  const productStore = useProductStore.getState();
  const liveById = new Map(productStore.products.map((product) => [product.id, product]));
  const updatedProducts: Product[] = [];
  for (const item of transaction.items) {
    const live = liveById.get(item.productId);
    if (!live) continue; // deleted mid-sale; nothing to decrement
    const updated = { ...live, stock: Math.max(0, live.stock - item.quantity) };
    productStore.handleUpdateProduct(updated);
    updatedProducts.push(updated);
  }

  let updatedCustomer: Customer | null = null;
  if (request.selectedCustomerId) {
    useCustomerStore.getState().updateCustomerPoints(request.selectedCustomerId, pointsDelta);
    // Re-read after the write so the pushed row carries the new balance.
    updatedCustomer =
      useCustomerStore
        .getState()
        .customers.find((customer) => customer.id === request.selectedCustomerId) ?? null;
  }

  useTransactionStore.getState().addTransaction(transaction);

  // Best-effort and deliberately not awaited: a sync failure must never block
  // or delay handing the customer their receipt.
  void syncToCloudIfEnabled(
    updatedProducts,
    undefined,
    updatedCustomer ? [updatedCustomer] : undefined,
    [transaction],
  );

  const isCashSale =
    transaction.paymentMethod === 'cash' ||
    (transaction.payments ?? []).some((payment) => payment.method === 'cash');

  return {
    success: true,
    sale: { transaction, isCashSale, updatedProducts, updatedCustomer },
  };
}
