import { CashMovement, SaleTransaction } from '../types';
import { tenderBreakdown } from './payments';

/**
 * Net cash that petty-cash movements put into (or took out of) the drawer.
 * Pay-ins add, pay-outs subtract; amounts are stored unsigned.
 */
export function netCashMovements(movements: readonly CashMovement[]): number {
  return Number(
    movements.reduce((sum, m) => sum + (m.type === 'pay_in' ? m.amount : -m.amount), 0).toFixed(2),
  );
}

/**
 * Net cash a sale contributes to the drawer: cash tendered minus change given.
 * For a single-cash sale that equals the total; for a split sale it's the cash
 * tender line(s) minus change; card/mobile/gift contribute nothing.
 */
export function cashKept(tx: SaleTransaction): number {
  return tenderBreakdown(tx).cash ?? 0;
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

    // Every method's real contribution, which sums to tx.total. The non-cash
    // lines used to be taken from tx.paymentMethod — the DOMINANT tender — at
    // the sale's full value, while cash came from the actual tender lines. A
    // £30 sale split £10 cash / £20 card therefore printed CASH 10 and CARD 30,
    // so the breakdown on the drawer-reconciliation document overstated the
    // day's tender by the cash half of every split sale.
    const tenders = tenderBreakdown(tx);
    const refundAmt = tx.refundedAmount ?? 0;
    // Refunds are prorated across the methods in the same ratio they were
    // taken. A refund has no tender lines of its own, so the sale's own mix is
    // the only defensible split — and it is what makes a fully refunded sale
    // net to zero in every column at once.
    const refundedShare = tx.total > 0 ? Math.min(1, refundAmt / tx.total) : 0;
    const netOf = (amount: number | undefined) => (amount ?? 0) * (1 - refundedShare);

    // Cash stays GROSS, with refunds carried separately in cashRefunds: the
    // drawer took the notes and then gave some back, and a Z-report that
    // silently netted them would not show the operator either movement.
    cashSales += tenders.cash ?? 0;
    if (refundAmt > 0 && tx.total > 0) {
      cashRefunds += refundAmt * ((tenders.cash ?? 0) / tx.total);
    }

    cardSales += netOf(tenders.card);
    mobileSales += netOf(tenders.mobile);
    giftSales += netOf(tenders.gift);
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
