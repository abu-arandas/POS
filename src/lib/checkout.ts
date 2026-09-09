import {
  SaleTransaction,
  OrderItem,
  Payment,
  PaymentMethod,
  StoreSettings,
  UserAccount,
} from '../types';
import { summarizeTenders } from './payments';
import { shortId } from './utils/ids';
import { isPositiveIntegerQuantity, nonNegative } from './utils/validation';

/**
 * Everything the register has collected for one sale, with totals already
 * computed by calculateOrderTotals.
 */
export interface CheckoutRequest {
  cartItems: Omit<OrderItem, 'total'>[];
  subtotal: number;
  discountType: 'none' | 'fixed' | 'percentage' | 'loyalty';
  discountValue: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;

  paymentMethod: PaymentMethod;
  splitMode: boolean;
  splitPayments: Payment[];
  cashPaidText: string;
  cashChangeDue: number;

  selectedCustomerId: string | null;
  activeCustomerName: string | null;
  currentUser: UserAccount | null;
  currentShiftId: string | null;

  settings: StoreSettings;
}

/**
 * Either the transaction to persist plus the loyalty-points delta, or the
 * reason the tender was rejected.
 */
export type CheckoutOutcome =
  | { success: true; transaction: SaleTransaction; pointsDelta: number }
  | {
      success: false;
      error:
        'invalid-quantity' | 'split-incomplete' | 'split-non-cash-overpay' | 'insufficient-cash';
    };

/** How a sale was paid for, once the tender has been validated. */
interface ResolvedTender {
  saleMethod: PaymentMethod;
  payments?: Payment[];
  paidValue?: number;
  changeDue?: number;
}

type TenderOutcome =
  | { ok: true; tender: ResolvedTender }
  | { ok: false; error: 'split-incomplete' | 'split-non-cash-overpay' | 'insufficient-cash' };

/**
 * Validates what the operator tendered and settles how the sale records it:
 * which method it counts as, the split breakdown where there is one, and the
 * cash taken and change owed.
 */
function resolveTender(req: CheckoutRequest): TenderOutcome {
  if (req.splitMode) {
    const clean = req.splitPayments.filter((p) => (p.amount || 0) > 0);
    const tenders = summarizeTenders(clean, req.totalAmount);
    if (clean.length === 0 || !tenders.coversTotal) {
      return { ok: false, error: 'split-incomplete' };
    }
    // Only cash can overpay (for change). Non-cash tenders exceeding the
    // total would record phantom money with no way to return it.
    const nonCashTotal = clean.filter((p) => p.method !== 'cash').reduce((s, p) => s + p.amount, 0);
    if (nonCashTotal > req.totalAmount + 0.005) {
      return { ok: false, error: 'split-non-cash-overpay' };
    }
    const tookCash = tenders.cashTendered > 0;
    return {
      ok: true,
      tender: {
        saleMethod: tenders.dominantMethod,
        payments: clean,
        paidValue: tookCash ? tenders.cashTendered : undefined,
        changeDue: tookCash ? tenders.cashChange : undefined,
      },
    };
  }

  const paidValue = req.paymentMethod === 'cash' ? parseFloat(req.cashPaidText) || 0 : undefined;
  // A fully-discounted ($0) sale needs no tendered cash.
  if (req.paymentMethod === 'cash' && req.totalAmount > 0 && (paidValue ?? 0) < req.totalAmount) {
    return { ok: false, error: 'insufficient-cash' };
  }
  // A sale fully covered by redeemed points is a points redemption, not a $0
  // card charge. Any other $0 total (e.g. a 100% promo) keeps its chosen method.
  const saleMethod =
    req.totalAmount <= 0 && req.discountType === 'loyalty' ? 'loyalty' : req.paymentMethod;
  return {
    ok: true,
    tender: {
      saleMethod,
      paidValue,
      changeDue: saleMethod === 'cash' ? req.cashChangeDue : undefined,
    },
  };
}

/**
 * Validates the tender and assembles the SaleTransaction to persist.
 *
 * Split payments must cover the total exactly, apart from cash, which may
 * overpay and take change back. Returns a failure outcome rather than
 * throwing so the register can show the reason inline.
 */
export function buildSaleTransaction(req: CheckoutRequest): CheckoutOutcome {
  // Pricing sanitizes hostile numbers for display, but the persisted transaction
  // must never retain a zero, negative, fractional, non-finite, or unsafe line
  // quantity. Reject the request before validating tenders or writing money data.
  if (req.cartItems.some((item) => !isPositiveIntegerQuantity(item.quantity))) {
    return { success: false, error: 'invalid-quantity' };
  }

  const tendered = resolveTender(req);
  if (!tendered.ok) return { success: false, error: tendered.error };
  const { saleMethod, payments, paidValue, changeDue } = tendered.tender;

  const nextId = `TX-${shortId().toUpperCase()}`;

  const pointsEarned = req.selectedCustomerId
    ? Math.floor(req.totalAmount * req.settings.loyaltyPointsRate)
    : undefined;

  // Points actually redeemed. The requested count (req.discountValue) can exceed
  // what the order can absorb — calculateOrderTotals clamps the loyalty discount
  // to the subtotal, and the operator may shrink the cart after tapping Apply.
  // Only the redeemable count is deducted, so only that count may be persisted:
  // a refund reverses tx.discountValue, and storing the inflated request would
  // hand back points that were never taken.
  const redeemedPoints =
    req.discountType === 'loyalty' && req.settings.loyaltyPointValue > 0
      ? Math.round(req.discountAmount / req.settings.loyaltyPointValue)
      : 0;

  const transaction: SaleTransaction = {
    id: nextId,
    date: new Date().toISOString(),
    items: req.cartItems.map((item) => ({
      ...item,
      total: Number((nonNegative(item.price) * nonNegative(item.quantity)).toFixed(2)),
    })),
    subtotal: req.subtotal,
    discount: req.discountAmount,
    discountType: req.discountType,
    discountValue: req.discountType === 'loyalty' ? redeemedPoints : req.discountValue,
    tax: req.taxAmount,
    // The clamped rate, matching the one calculateOrderTotals actually taxed
    // with — a negative or non-finite configured rate charges 0, and the
    // receipt has to agree with the money.
    taxRate: nonNegative(req.settings.taxRate),
    total: req.totalAmount,
    paymentMethod: saleMethod,
    payments: payments && payments.length > 1 ? payments : undefined,
    cashPaid: paidValue,
    cashChange: changeDue,
    customerId: req.selectedCustomerId,
    customerName: req.activeCustomerName,
    operatorId: req.currentUser?.id ?? null,
    operatorName: req.currentUser?.name ?? null,
    pointsEarned,
    status: 'completed',
    shiftId: req.currentShiftId,
  };

  let pointsDelta = pointsEarned ?? 0;
  if (req.selectedCustomerId && req.discountType === 'loyalty') {
    pointsDelta -= redeemedPoints;
  }

  return { success: true, transaction, pointsDelta };
}
