import type { OrderItem, Payment, PaymentMethod, StoreSettings, Tab, UserAccount } from '../types';
import { commitSale, type CommitSaleResult } from './saleService';
import { useTabStore } from '../stores/tabStore';
import { useTableStore } from '../stores/tableStore';
import { tabItems, isTabEmpty } from '../lib/tabs';

/**
 * Everything settlement needs that the tab does not already carry: how it is
 * being paid for, and the discount the operator agreed at the end.
 *
 * Deliberately no cart and no totals. The lines come from the tab and the money
 * is recomputed by buildSaleTransaction, for exactly the reason CheckoutRequest
 * carries no totals either — a caller-supplied figure on a permanent financial
 * record is a figure nobody checked.
 */
export interface SettleTabRequest {
  tabId: string;
  discountType: 'none' | 'fixed' | 'percentage' | 'loyalty';
  discountValue: number;
  paymentMethod: PaymentMethod;
  splitMode: boolean;
  splitPayments: Payment[];
  cashPaidText: string;
  currentUser: UserAccount | null;
  currentShiftId: string | null;
  settings: StoreSettings;
}

/** Why a settlement was refused, on top of everything commitSale can refuse. */
export type SettleTabError = 'unknown-tab' | 'already-settled' | 'empty-tab';

export type SettleTabResult =
  | (Extract<CommitSaleResult, { success: true }> & { tab: Tab })
  | { success: false; error: SettleTabError }
  | Extract<CommitSaleResult, { success: false }>;

/**
 * Settles a tab: turns its accumulated rounds into one sale and closes it.
 *
 * The sale goes through `commitSale` unchanged — not a parallel path. That is
 * the whole point: stock validation and decrement, loyalty points, the KDS
 * ticket, the transaction record and the cloud push all happen exactly as they
 * do for a walk-in sale, so a tab cannot drift into being a second, subtly
 * different way of selling things. Everything this function adds is on either
 * side of that call.
 *
 * Stock is therefore taken at SETTLEMENT, not as rounds are added, which
 * matches how held orders already behave ("stock is re-validated from the
 * catalog when the sale completes"). An open tab reserves nothing. For a café
 * that is right — the coffee is made and gone — and for a shop holding goods
 * back it is a real limitation rather than an oversight: reserving stock across
 * an open tab needs a reservation that survives a crash and is released when a
 * tab is discarded, which is a larger design than this.
 *
 * The tab is marked settled only AFTER the sale is committed. Marking first
 * would leave a refused sale — insufficient stock, a rejected tender — against
 * a tab nobody can reopen, with the bill gone and no money taken.
 */
export function settleTab(request: SettleTabRequest): SettleTabResult {
  const tabStore = useTabStore.getState();
  const tab = tabStore.tabs.find((candidate) => candidate.id === request.tabId);
  if (!tab) return { success: false, error: 'unknown-tab' };
  if (tab.status !== 'open') return { success: false, error: 'already-settled' };
  // A tab opened and never ordered against is not a bill. Settling it would
  // write a zero-value sale into the day's history and the Z-report.
  if (isTabEmpty(tab)) return { success: false, error: 'empty-tab' };

  // The tab's own snapshots, priced as the customer was quoted — never looked
  // up in the catalogue, which may have moved since the first round.
  const cartItems: Omit<OrderItem, 'total'>[] = tabItems(tab).map((item) => ({
    productId: item.productId,
    productName: item.productName,
    variantId: item.variantId,
    variantName: item.variantName,
    modifiers: item.modifiers,
    price: item.price,
    cost: item.cost,
    quantity: item.quantity,
  }));

  const outcome = commitSale({
    cartItems,
    discountType: request.discountType,
    discountValue: request.discountValue,
    paymentMethod: request.paymentMethod,
    splitMode: request.splitMode,
    splitPayments: request.splitPayments,
    cashPaidText: request.cashPaidText,
    selectedCustomerId: tab.customerId,
    activeCustomerName: tab.customerName ?? null,
    currentUser: request.currentUser,
    currentShiftId: request.currentShiftId,
    settings: request.settings,
  });

  if (!outcome.success) return outcome;

  // Settled against the sale it became, which is the audit link between the
  // two. Read through getState() rather than the snapshot above: a round may
  // have landed while this ran.
  useTabStore.getState().settleTab(tab.id, outcome.sale.transaction.id);

  // A table whose tab has been paid is free. Released here rather than left to
  // the screen, because a table still showing "occupied" after its bill was
  // settled is the kind of thing nobody notices until the next party is turned
  // away from an empty table.
  if (tab.tableId) useTableStore.getState().releaseTable(tab.tableId);

  const settled = useTabStore.getState().tabs.find((candidate) => candidate.id === tab.id) ?? tab;
  return { ...outcome, tab: settled };
}
