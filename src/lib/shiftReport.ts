import { CashMovement, SaleTransaction } from '../types';

/**
 * Net cash that petty-cash movements put into (or took out of) the drawer.
 * Pay-ins add, pay-outs subtract; amounts are stored unsigned.
 */
export function netCashMovements(movements: readonly CashMovement[]): number {
  return Number(
    movements
      .reduce((sum, m) => sum + (m.type === 'pay_in' ? m.amount : -m.amount), 0)
      .toFixed(2),
  );
}

/**
 * Net cash a sale contributes to the drawer: cash tendered minus change given.
 * For a single-cash sale that equals the total; for a split sale it's the cash
 * tender line(s) minus change; card/mobile/gift contribute nothing.
 */
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

/**
 * Z-report figures for one shift. `expectedCash` closes over the tallies so
 * the caller supplies only the opening float.
 */
export interface ShiftSummary {
  saleCount: number;
  grossSales: number; // sum of sale totals (net of refunds)
  cashSales: number; // gross cash taken in (refunds tracked separately in cashRefunds)
  cardSales: number;
  mobileSales: number;
  giftSales: number;
  cashRefunds: number; // cash paid back out
  /**
   * What the drawer should hold at close.
   *
   * `movements` is a parameter rather than something the caller adds on
   * afterwards, because adding it afterwards is exactly what went wrong: the
   * Shift screen did `expectedCash(float) + payIns - payOuts` while the printed
   * Z-report called `expectedCash(float)` alone, so any petty-cash movement put
   * a different expected figure on the screen and on the document that
   * reconciles the till. One function, one answer.
   */
  expectedCash: (openingFloat: number, movements?: readonly CashMovement[]) => number;
}

/**
 * Tallies a set of transactions (already filtered to one shift) into the
 * figures a Z-report needs. Refunds reduce gross sales; cash refunds of
 * cash sales reduce the drawer.
 */
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
    cashSales += cashKept(tx);

    const refundAmt = tx.refundedAmount ?? 0;
    if (refundAmt > 0 && tx.total > 0) {
      const cashShare = cashKept(tx) / tx.total;
      cashRefunds += refundAmt * cashShare;
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
    expectedCash: (openingFloat: number, movements: readonly CashMovement[] = []) =>
      round(openingFloat + round(cashSales) - round(cashRefunds) + netCashMovements(movements)),
  };
}
