import { SaleTransaction } from '../types';

// Net cash a sale contributes to the drawer: cash tendered minus change given.
// For a single-cash sale that equals the total; for a split sale it's the cash
// tender line(s) minus change; card/mobile/gift contribute nothing.
export function cashKept(tx: SaleTransaction): number {
  if (tx.payments && tx.payments.length > 1) {
    const cashLine = tx.payments
      .filter((p) => p.method === 'cash')
      .reduce((s, p) => s + p.amount, 0);
    if (cashLine <= 0) return 0;
    return Number((cashLine - (tx.cashChange ?? 0)).toFixed(2));
  }
  if (tx.paymentMethod === 'cash') {
    return Number(((tx.cashPaid ?? tx.total) - (tx.cashChange ?? 0)).toFixed(2));
  }
  return 0;
}

// Whether any of the sale's tenders was cash (so a refund of it is cash out).
function saleUsedCash(tx: SaleTransaction): boolean {
  if (tx.payments && tx.payments.length > 1) return tx.payments.some((p) => p.method === 'cash');
  return tx.paymentMethod === 'cash';
}

export interface ShiftSummary {
  saleCount: number;
  grossSales: number; // sum of sale totals (net of refunds)
  cashSales: number; // net cash taken in
  cardSales: number;
  mobileSales: number;
  giftSales: number;
  cashRefunds: number; // cash paid back out
  expectedCash: (openingFloat: number) => number;
}

// Tallies a set of transactions (already filtered to one shift) into the
// figures a Z-report needs. Refunds reduce gross sales; cash refunds of
// cash sales reduce the drawer.
export function summarizeShift(transactions: SaleTransaction[]): ShiftSummary {
  let grossSales = 0;
  let cashSales = 0;
  let cardSales = 0;
  let mobileSales = 0;
  let giftSales = 0;
  let cashRefunds = 0;

  for (const tx of transactions) {
    const net = tx.status === 'refunded' ? 0 : tx.total - (tx.refundedAmount ?? 0);
    grossSales += net;
    const kept = cashKept(tx);
    cashSales += kept;
    if (saleUsedCash(tx) && tx.refundedAmount) {
      // Only the cash share of the sale leaves the drawer — a split sale's
      // card portion is refunded back to the card, not paid out in cash.
      const cashShare = tx.total > 0 ? Math.min(1, kept / tx.total) : 0;
      cashRefunds += Math.min(kept, tx.refundedAmount * cashShare);
    }

    // Non-cash breakdown by dominant method (split detail is on the receipt).
    if (tx.paymentMethod === 'card') cardSales += net;
    else if (tx.paymentMethod === 'mobile') mobileSales += net;
    else if (tx.paymentMethod === 'gift') giftSales += net;
  }

  const round = (n: number) => Number(n.toFixed(2));
  return {
    saleCount: transactions.length,
    grossSales: round(grossSales),
    cashSales: round(cashSales),
    cardSales: round(cardSales),
    mobileSales: round(mobileSales),
    giftSales: round(giftSales),
    cashRefunds: round(cashRefunds),
    expectedCash: (openingFloat: number) =>
      round(openingFloat + round(cashSales) - round(cashRefunds)),
  };
}
