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
 * One cart line the live catalogue cannot fulfil, named so the operator learns
 * which item to fix rather than just that "something" is short.
 */
export interface StockShortfall {
  productId: string;
  productName: string;
  requested: number;
  /** Units the live catalogue actually holds; 0 for a product that is gone. */
  available: number;
}

/** Why a sale was refused. The tender reasons come from CheckoutOutcome. */
export type CommitSaleError =
  | Extract<CheckoutOutcome, { success: false }>['error']
  | 'insufficient-stock'
  | 'product-unavailable';

/**
 * Either the committed sale or the reason it was refused. Nothing is written on
 * a refusal — no stock, no points, no transaction, no cloud push.
 */
export type CommitSaleResult =
  | { success: true; sale: CommittedSale }
  | { success: false; error: CommitSaleError; shortfalls?: StockShortfall[] };

/**
 * Totals the units each product is being sold, across every line.
 *
 * Summed rather than taken per line because a product must be checked and
 * decremented once for the whole sale. The register merges repeat taps into one
 * cart line, so two lines for one product is not something it produces today —
 * but a per-line check would pass two lines of 3 against 4 in stock, and a
 * per-line decrement would write the second line's result over the first and
 * take 3 units off instead of 6. Neither is a risk worth leaving to the caller.
 */
function requiredUnits(transaction: SaleTransaction): Map<string, number> {
  const required = new Map<string, number>();
  for (const item of transaction.items) {
    required.set(item.productId, (required.get(item.productId) ?? 0) + item.quantity);
  }
  return required;
}

/**
 * Checks what the sale needs against the live catalogue.
 *
 * The cart caps each line against the stock figure captured when the item was
 * added, which is a snapshot: another terminal can sell the same SKU while this
 * register sits on an open sale, and an inventory correction can land at any
 * moment. So the snapshot is a hint, and this is the decision.
 */
function findShortfalls(
  transaction: SaleTransaction,
  required: Map<string, number>,
  liveById: Map<string, Product>,
): { shortfalls: StockShortfall[]; anyMissing: boolean } {
  const shortfalls: StockShortfall[] = [];
  let anyMissing = false;
  // Named from the transaction so a missing product still has a name to show.
  const namedBy = new Map(transaction.items.map((item) => [item.productId, item.productName]));

  for (const [productId, quantity] of required) {
    const live = liveById.get(productId);
    if (!live) {
      anyMissing = true;
      shortfalls.push({
        productId,
        productName: namedBy.get(productId) ?? productId,
        requested: quantity,
        available: 0,
      });
      continue;
    }
    if (live.stock < quantity) {
      shortfalls.push({
        productId,
        productName: live.name,
        requested: quantity,
        available: Math.max(0, live.stock),
      });
    }
  }

  return { shortfalls, anyMissing };
}

/**
 * Commits one sale: validates the tender and the stock, decrements stock, moves
 * loyalty points, persists the transaction, and pushes all of it to the cloud.
 *
 * This is the whole store-writing half of checkout, lifted out of the register
 * screen. It was inline in a useCallback with fourteen dependencies, which made
 * the money path reachable only by rendering a component and clicking through a
 * modal. Here it is an ordinary function over the stores.
 *
 * Stock comes off the LIVE product records rather than the cart's snapshots.
 * The cart holds copies taken at add-to-cart time, so writing those back would
 * silently revert any price, name or stock edit made while the sale was open.
 *
 * Availability is decided against those same live records, before anything is
 * written. It used to be decided by `Math.max(0, stock - quantity)` as the
 * decrement happened: a line for 5 units against 2 in stock still recorded a
 * sale of 5, drove stock to 0 rather than -3, and a deleted product recorded a
 * sale of goods the catalogue no longer had at all. The receipt, the day's
 * revenue, the loyalty award and the cloud row then all asserted a quantity
 * that inventory never contained, and nothing anywhere said so.
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

  // Validate the whole sale before the first write. Refusing halfway through
  // would leave the earlier lines decremented against a sale never recorded.
  const required = requiredUnits(transaction);
  const { shortfalls, anyMissing } = findShortfalls(transaction, required, liveById);
  if (shortfalls.length > 0) {
    // A vanished product is reported ahead of a merely short one: the operator
    // has to remove that line, whereas a short line can be reduced.
    return {
      success: false,
      error: anyMissing ? 'product-unavailable' : 'insufficient-stock',
      shortfalls,
    };
  }

  const updatedProducts: Product[] = [];
  for (const [productId, quantity] of required) {
    // Non-null: findShortfalls above refused the sale if any product was gone.
    const live = liveById.get(productId)!;
    const updated = { ...live, stock: live.stock - quantity };
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

  // Not awaited: a slow or failed network must never delay handing the customer
  // their receipt. It is not fire-and-forget either — syncToCloudIfEnabled
  // durably queues the rows first, so a push that fails here is retried rather
  // than lost.
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
