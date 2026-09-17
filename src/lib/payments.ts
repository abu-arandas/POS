import { Payment, PaymentMethod, SaleTransaction } from '../types';

/**
 * What a set of tender lines adds up to, including whether they cover the
 * order and how much cash change is owed.
 */
export interface TenderSummary {
  paidTotal: number; // sum of all tender lines
  cashTendered: number; // cash lines only
  cashChange: number; // change owed from cash overpayment
  dominantMethod: PaymentMethod; // largest single tender (used for reports/filtering)
  coversTotal: boolean; // whether the tenders cover the order total
}

/**
 * Reduces a set of split-payment tender lines to the figures a sale needs.
 * Only cash can overpay, so change is derived from the whole overpayment but
 * attributed to cash; cashTendered excludes card/mobile/gift so the receipt's
 * "cash paid" and the Z-report drawer math stay correct.
 */
export function summarizeTenders(payments: Payment[], total: number): TenderSummary {
  const clean = payments.filter((p) => (p.amount || 0) > 0);
  const round = (n: number) => Number(n.toFixed(2));
  const paidTotal = round(clean.reduce((s, p) => s + p.amount, 0));
  const cashTendered = round(
    clean.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0),
  );
  const cashChange = cashTendered > 0 ? round(Math.max(0, paidTotal - total)) : 0;
  const dominantMethod: PaymentMethod = clean.length
    ? [...clean].sort((a, b) => b.amount - a.amount)[0].method
    : 'cash';
  return {
    paidTotal,
    cashTendered,
    cashChange,
    dominantMethod,
    coversTotal: paidTotal >= total - 0.005,
  };
}

/**
 * What each method actually contributed to one sale, net of any change given.
 *
 * The amounts always sum to `tx.total`, and that invariant is the whole point.
 * Reporting used to read `tx.paymentMethod` — the DOMINANT tender — and treat
 * it as if it were the only one, which broke in opposite directions depending
 * on who was asking:
 *
 *   * The Z-report took cash from the real tender lines but card, mobile and
 *     gift from the dominant method at the sale's FULL value. A £30 sale split
 *     £10 cash / £20 card printed CASH 10 and CARD 30 — £40 of tender against
 *     a £30 gross, on the document that reconciles the drawer.
 *   * The dashboard's payment breakdown put 100% of that same sale under card
 *     and nothing under cash. It summed to the right total and still described
 *     a day that never happened.
 *
 * Change is charged to cash because only cash can overpay (see resolveTender in
 * lib/checkout.ts), so the drawer is the only place it comes out of.
 */
export function tenderBreakdown(tx: SaleTransaction): Partial<Record<PaymentMethod, number>> {
  const round = (n: number) => Number(n.toFixed(2));
  const breakdown: Partial<Record<PaymentMethod, number>> = {};
  const add = (method: PaymentMethod, amount: number) => {
    breakdown[method] = round((breakdown[method] ?? 0) + amount);
  };

  // A split sale records every tender line; `payments` is only present with
  // more than one (buildSaleTransaction drops it otherwise).
  if (tx.payments && tx.payments.length > 1) {
    for (const payment of tx.payments) {
      if (!Number.isFinite(payment.amount) || payment.amount <= 0) continue;
      add(payment.method, payment.amount);
    }
    const change = tx.cashChange ?? 0;
    if (change > 0 && breakdown.cash !== undefined) {
      breakdown.cash = round(Math.max(0, breakdown.cash - change));
    }
    return breakdown;
  }

  // Single tender: the whole sale sits on its one method. For cash that is what
  // was handed over less what was handed back, which on a normal sale is the
  // total — but a sale written before cashPaid was recorded has neither, so the
  // total is the fallback rather than a zero that would silently empty the
  // drawer column.
  if (tx.paymentMethod === 'cash') {
    add('cash', Math.max(0, (tx.cashPaid ?? tx.total) - (tx.cashChange ?? 0)));
    return breakdown;
  }
  add(tx.paymentMethod, tx.total);
  return breakdown;
}
