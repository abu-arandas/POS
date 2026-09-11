import {
  SaleTransaction,
  OrderItem,
  Payment,
  PaymentMethod,
  StoreSettings,
  UserAccount,
} from '../types';
import { summarizeTenders } from './payments';
import { calculateOrderTotals } from './pricing';
import { shortId } from './utils/ids';
import { isPositiveIntegerQuantity, nonNegative } from './utils/validation';

/**
 * Everything the register has collected for one sale.
 *
 * Deliberately carries no money totals. They used to be passed in alongside the
 * cart — the register had already computed them for the screen — and
 * buildSaleTransaction persisted them verbatim. That made every monetary field
 * on a permanent financial record caller-supplied: any caller could hand over a
 * cart of $20 and a total of $2, and the transaction, the receipt, the day's
 * revenue and the cloud row would all agree on the wrong number. The register's
 * figures are display state; the ones that get persisted are recomputed here
 * from the cart, the discount and the settings.
 */
export interface CheckoutRequest {
  cartItems: Omit<OrderItem, 'total'>[];
  discountType: 'none' | 'fixed' | 'percentage' | 'loyalty';
  /** The operator's raw input: a percentage, a currency amount, or a point count. */
  discountValue: number;

  paymentMethod: PaymentMethod;
  splitMode: boolean;
  splitPayments: Payment[];
  cashPaidText: string;

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

const round2 = (n: number) => Number(n.toFixed(2));

/**
 * Reads the cash the operator keyed in. An empty or unparseable box is "nothing
 * tendered yet" — legitimate on a fully-discounted sale — but a value that
 * parses to something impossible is a refusal, not a zero: a negative or
 * infinite tender must never reach `cashPaid` on a persisted sale, and the
 * total-covered check alone does not catch it (a $0 sale covers any amount).
 */
function parseTenderedCash(text: string): number | null {
  const parsed = parseFloat(text);
  if (Number.isNaN(parsed)) return 0;
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/** A tender line that can legitimately contribute money to a sale. */
const isRealTender = (payment: Payment) =>
  Number.isFinite(payment.amount) && (payment.amount || 0) > 0;

/**
 * Validates what the operator tendered and settles how the sale records it:
 * which method it counts as, the split breakdown where there is one, and the
 * cash taken and change owed.
 *
 * `totalAmount` is the recomputed total, never the caller's — the amount the
 * tender has to cover and the amount change is measured against have to be the
 * same number as the one persisted on the sale.
 */
function resolveTender(req: CheckoutRequest, totalAmount: number): TenderOutcome {
  if (req.splitMode) {
    const clean = req.splitPayments.filter(isRealTender);
    const tenders = summarizeTenders(clean, totalAmount);
    if (clean.length === 0 || !tenders.coversTotal) {
      return { ok: false, error: 'split-incomplete' };
    }
    // Only cash can overpay (for change). Non-cash tenders exceeding the
    // total would record phantom money with no way to return it.
    const nonCashTotal = clean.filter((p) => p.method !== 'cash').reduce((s, p) => s + p.amount, 0);
    if (nonCashTotal > totalAmount + 0.005) {
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

  let paidValue: number | undefined;
  if (req.paymentMethod === 'cash') {
    const tendered = parseTenderedCash(req.cashPaidText);
    if (tendered === null) return { ok: false, error: 'insufficient-cash' };
    // A fully-discounted ($0) sale needs no tendered cash.
    if (totalAmount > 0 && tendered < totalAmount) {
      return { ok: false, error: 'insufficient-cash' };
    }
    paidValue = tendered;
  }

  // A sale fully covered by redeemed points is a points redemption, not a $0
  // card charge. Any other $0 total (e.g. a 100% promo) keeps its chosen method.
  const saleMethod =
    totalAmount <= 0 && req.discountType === 'loyalty' ? 'loyalty' : req.paymentMethod;
  return {
    ok: true,
    tender: {
      saleMethod,
      paidValue,
      // Derived, not accepted: change is what the validated tender exceeds the
      // recomputed total by, so it cannot disagree with either.
      changeDue:
        saleMethod === 'cash' ? round2(Math.max(0, (paidValue ?? 0) - totalAmount)) : undefined,
    },
  };
}

/**
 * The discount figure worth keeping on the record: what was actually applied,
 * not what was asked for. calculateOrderTotals clamps every discount to the
 * order value, so persisting the raw request would let a receipt print "150%
 * off" beside a discount worth 100%, and a $40 "fixed" discount beside the $20
 * it could actually take.
 *
 * Loyalty is the case with money attached: a refund reverses this number into
 * the customer's balance, so storing the requested count would hand back points
 * that were never deducted.
 */
function appliedDiscountValue(
  discountType: CheckoutRequest['discountType'],
  requested: number,
  discountAmount: number,
  loyaltyPointValue: number,
): number {
  switch (discountType) {
    case 'loyalty':
      return loyaltyPointValue > 0 ? Math.round(discountAmount / loyaltyPointValue) : 0;
    case 'percentage':
      return Math.min(100, nonNegative(requested));
    case 'fixed':
      return discountAmount;
    default:
      return 0;
  }
}

/**
 * Recomputes the sale's money, validates the tender against it, and assembles
 * the SaleTransaction to persist.
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

  const { subtotal, discountAmount, taxAmount, totalAmount } = calculateOrderTotals(
    req.cartItems,
    req.discountType,
    req.discountValue,
    req.settings,
  );

  const tendered = resolveTender(req, totalAmount);
  if (!tendered.ok) return { success: false, error: tendered.error };
  const { saleMethod, payments, paidValue, changeDue } = tendered.tender;

  const nextId = `TX-${shortId().toUpperCase()}`;

  // The rate is clamped like taxRate and loyaltyPointValue are. A negative or
  // non-finite setting would otherwise award negative or NaN points — which
  // reach both the transaction and the customer's balance, and NaN compares
  // false against everything it later touches.
  const pointsEarned = req.selectedCustomerId
    ? Math.floor(totalAmount * nonNegative(req.settings.loyaltyPointsRate))
    : undefined;

  // For a loyalty discount this IS the point count redeemed, which is why the
  // persisted figure and the balance deduction below cannot drift apart.
  const discountValueApplied = appliedDiscountValue(
    req.discountType,
    req.discountValue,
    discountAmount,
    nonNegative(req.settings.loyaltyPointValue),
  );

  const transaction: SaleTransaction = {
    id: nextId,
    date: new Date().toISOString(),
    items: req.cartItems.map((item) => ({
      ...item,
      total: round2(nonNegative(item.price) * nonNegative(item.quantity)),
    })),
    subtotal,
    discount: discountAmount,
    discountType: req.discountType,
    discountValue: discountValueApplied,
    tax: taxAmount,
    // The clamped rate, matching the one calculateOrderTotals actually taxed
    // with — a negative or non-finite configured rate charges 0, and the
    // receipt has to agree with the money.
    taxRate: nonNegative(req.settings.taxRate),
    total: totalAmount,
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
    pointsDelta -= discountValueApplied;
  }

  return { success: true, transaction, pointsDelta };
}
