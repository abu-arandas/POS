import { Payment, PaymentMethod, SaleTransaction } from '../types';
import { CheckoutItem } from './pricing';
import { summarizeTenders } from './payments';

// Assembles a completed SaleTransaction from the register's checkout state.
// Pure and side-effect free: all tender validation and the derived payment /
// loyalty math live here so the money paths are unit-testable. Register maps
// the error codes to operator alerts and applies the side effects (stock,
// points, persistence, printing).

export type CheckoutError =
  | 'insufficient-cash' // single cash tender below the total
  | 'split-incomplete' // split tenders do not cover the total
  | 'split-overpay-noncash'; // non-cash split tenders exceed the total

export interface CheckoutTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
}

export type CheckoutPayment =
  | { mode: 'single'; method: Exclude<PaymentMethod, 'loyalty'>; cashPaid: number }
  | { mode: 'split'; payments: Payment[] };

export interface CheckoutInput {
  id: string;
  date: string; // ISO timestamp
  items: CheckoutItem[];
  totals: CheckoutTotals;
  discountType: SaleTransaction['discountType'];
  discountValue: number; // raw operator input (for loyalty: points selected)
  payment: CheckoutPayment;
  customer: { id: string; name: string | null } | null;
  operator: { id: string; name: string } | null;
  shiftId: string | null;
  settings: { loyaltyPointsRate: number; loyaltyPointValue: number };
}

export type CheckoutResult =
  { ok: true; transaction: SaleTransaction } | { ok: false; error: CheckoutError };

export function buildSaleTransaction(input: CheckoutInput): CheckoutResult {
  const { totals, payment, settings } = input;
  const total = totals.totalAmount;
  const round = (n: number) => Number(n.toFixed(2));

  let saleMethod: PaymentMethod;
  let payments: Payment[] | undefined;
  let cashPaid: number | undefined;
  let cashChange: number | undefined;

  if (payment.mode === 'split') {
    const clean = payment.payments.filter((p) => (p.amount || 0) > 0);
    const tenders = summarizeTenders(clean, total);
    if (clean.length === 0 || !tenders.coversTotal) {
      return { ok: false, error: 'split-incomplete' };
    }
    // Change can only be given for cash, so the non-cash tenders must not
    // exceed the total — otherwise the customer is silently overcharged.
    if (tenders.paidTotal - tenders.cashTendered > total + 0.005) {
      return { ok: false, error: 'split-overpay-noncash' };
    }
    payments = clean.length > 1 ? clean : undefined;
    saleMethod = tenders.dominantMethod;
    // cashPaid is the CASH tender only (not the card/mobile lines), so the
    // receipt's "cash paid" and the Z-report drawer math stay correct.
    cashPaid = tenders.cashTendered > 0 ? tenders.cashTendered : undefined;
    cashChange = tenders.cashTendered > 0 ? tenders.cashChange : undefined;
  } else {
    cashPaid = payment.method === 'cash' ? payment.cashPaid || 0 : undefined;
    // A fully-discounted ($0) sale needs no tendered cash.
    if (payment.method === 'cash' && total > 0 && (cashPaid ?? 0) < total) {
      return { ok: false, error: 'insufficient-cash' };
    }
    // A sale fully covered by redeemed points is a points redemption, not a $0
    // card charge. Any other $0 total (e.g. a 100% promo) keeps its chosen method.
    saleMethod = total <= 0 && input.discountType === 'loyalty' ? 'loyalty' : payment.method;
    cashChange = saleMethod === 'cash' ? round(Math.max(0, (cashPaid ?? 0) - total)) : undefined;
  }

  const pointsEarned = input.customer ? Math.floor(total * settings.loyaltyPointsRate) : undefined;

  // For a loyalty sale, record only the points actually redeemed: the
  // discount is clamped to the subtotal (pricing.ts), so a stale points
  // selection from a since-shrunk cart must not burn — or later refund —
  // more points than the value the customer actually received.
  const effectiveDiscountValue =
    input.discountType === 'loyalty' && settings.loyaltyPointValue > 0
      ? Math.min(input.discountValue, Math.ceil(totals.discountAmount / settings.loyaltyPointValue))
      : input.discountValue;

  return {
    ok: true,
    transaction: {
      id: input.id,
      date: input.date,
      items: input.items.map((item) => ({
        ...item,
        total: round(item.price * item.quantity),
      })),
      subtotal: totals.subtotal,
      discount: totals.discountAmount,
      discountType: input.discountType,
      discountValue: effectiveDiscountValue,
      tax: totals.taxAmount,
      total,
      paymentMethod: saleMethod,
      payments,
      cashPaid,
      cashChange,
      customerId: input.customer?.id ?? null,
      customerName: input.customer?.name ?? null,
      operatorId: input.operator?.id ?? null,
      operatorName: input.operator?.name ?? null,
      pointsEarned,
      status: 'completed',
      shiftId: input.shiftId,
    },
  };
}
