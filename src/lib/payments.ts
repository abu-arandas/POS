import { Payment, PaymentMethod } from '../types';

export interface TenderSummary {
  paidTotal: number; // sum of all tender lines
  cashTendered: number; // cash lines only
  cashChange: number; // change owed from cash overpayment
  dominantMethod: PaymentMethod; // largest single tender (used for reports/filtering)
  coversTotal: boolean; // whether the tenders cover the order total
}

// Reduces a set of split-payment tender lines to the figures a sale needs.
// Only cash can overpay, so change is derived from the whole overpayment but
// attributed to cash; cashTendered excludes card/mobile/gift so the receipt's
// "cash paid" and the Z-report drawer math stay correct.
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
