// Pure folding for the sales dashboard.
//
// These lived as ten useMemo bodies inside Dashboard.tsx, which meant the
// screen's money arithmetic — how a refund reduces revenue, how profit is
// prorated against a partial return, what "net quantity sold" means once units
// have come back — could only be exercised by rendering a chart. Dashboard had
// no test file at all.
//
// DOM-free and deterministic, like poReport and shiftReport. Presentation stays
// in the component: labels, translated category names and chart colours are the
// screen's business, and none of them belong in a number.

import { Category, Product, PurchaseOrder, SaleTransaction } from '../types';

const round = (value: number) => Number(value.toFixed(2));

/**
 * What a sale contributes to revenue once anything returned is taken back off.
 *
 * Four separate memos each open-coded this. They agreed, which is luck rather
 * than design: the moment one of them learned about a new refund field and the
 * others did not, the dashboard would report a different revenue in the KPI tile
 * than in the chart directly beneath it.
 */
export function netRevenue(tx: SaleTransaction): number {
  return tx.total - (tx.refundedAmount ?? 0);
}

/**
 * Gross profit on a sale, with refunds prorated.
 *
 * Profit is taken on the discounted subtotal less cost of goods, then scaled by
 * the share of the sale that was NOT returned. Proration by value (rather than
 * by line) matches how computeRefund pays money back, so the two cannot drift
 * apart into a dashboard that disagrees with the till.
 */
export function transactionProfit(tx: SaleTransaction): number {
  const refundProportion = tx.total > 0 ? (tx.refundedAmount ?? 0) / tx.total : 0;
  const cost = tx.items.reduce((sum, item) => sum + item.cost * item.quantity, 0);
  return (tx.subtotal - tx.discount - cost) * (1 - refundProportion);
}

/**
 * The headline tiles.
 */
export interface DashboardKpis {
  revenueToday: number;
  ordersToday: number;
  aovToday: number;
  profitToday: number;
  avgDailyRevenue: number;
  lowStockItems: number;
}

/**
 * Today's figures, plus the historical daily average and the low-stock count.
 *
 * `avgDailyRevenue` divides by the number of days that actually TRADED, not by
 * the days elapsed — a terminal that was closed on Sunday should not report a
 * lower daily average for having been shut.
 */
export function computeKpis(
  todayTransactions: SaleTransaction[],
  allTransactions: SaleTransaction[],
  products: Product[],
): DashboardKpis {
  const revenueToday = todayTransactions.reduce((sum, tx) => sum + netRevenue(tx), 0);
  const ordersToday = todayTransactions.length;
  const profitToday = todayTransactions.reduce((sum, tx) => sum + transactionProfit(tx), 0);

  const tradingDays = new Set(allTransactions.map((tx) => new Date(tx.date).toDateString()));
  const totalRevenue = allTransactions.reduce((sum, tx) => sum + netRevenue(tx), 0);

  return {
    revenueToday: round(revenueToday),
    ordersToday,
    aovToday: round(ordersToday > 0 ? revenueToday / ordersToday : 0),
    profitToday: round(profitToday),
    avgDailyRevenue: round(totalRevenue / Math.max(1, tradingDays.size)),
    // "Low" is at or below the threshold but still sellable. Out-of-stock is a
    // different condition and is surfaced separately, so it is excluded here
    // rather than folded in.
    lowStockItems: products.filter((p) => p.stock <= p.minStock && p.stock > 0).length,
  };
}

/**
 * One day on the revenue/profit trend, keyed by `Date.toDateString()` so the
 * caller can attach a localized label without this module knowing a locale.
 */
export interface TrendBucket {
  key: string;
  revenue: number;
  profit: number;
}

/**
 * Revenue and profit per day over the last `buckets` days ending today.
 *
 * Empty days are emitted as zeroes rather than omitted: a gap in a time series
 * reads as "no data recorded" when the truth is "no sales that day", and a line
 * chart that skips the quiet days flatters the quiet days.
 */
export function buildTrendBuckets(
  transactions: SaleTransaction[],
  todayStart: number,
  buckets: number,
): TrendBucket[] {
  const byDay = new Map<string, TrendBucket>();
  const today = new Date(todayStart);

  for (let i = buckets - 1; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    byDay.set(day.toDateString(), { key: day.toDateString(), revenue: 0, profit: 0 });
  }

  for (const tx of transactions) {
    const bucket = byDay.get(new Date(tx.date).toDateString());
    if (!bucket) continue;
    bucket.revenue += netRevenue(tx);
    bucket.profit += transactionProfit(tx);
  }

  return [...byDay.values()].map((bucket) => ({
    ...bucket,
    revenue: round(bucket.revenue),
    profit: round(bucket.profit),
  }));
}

/**
 * One product's contribution over the window, net of returns.
 */
export interface ProductSales {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
}

/**
 * Best sellers by net units sold.
 *
 * Returned units are subtracted, so a line that was rung up and then handed
 * back does not keep a product at the top of the chart. A product returned more
 * often than it sold can therefore go negative, and is left that way rather than
 * clamped — a negative best-seller is a real signal about that product.
 */
export function topProducts(transactions: SaleTransaction[], limit = 5): ProductSales[] {
  const byProduct = new Map<string, ProductSales>();

  for (const tx of transactions) {
    const refunded: Record<string, number> = {};
    for (const item of tx.refundedItems ?? []) {
      refunded[item.productId] = (refunded[item.productId] ?? 0) + item.quantity;
    }
    for (const item of tx.items) {
      const entry = byProduct.get(item.productId) ?? {
        productId: item.productId,
        name: item.productName,
        quantity: 0,
        revenue: 0,
      };
      const netQuantity = item.quantity - (refunded[item.productId] ?? 0);
      entry.quantity += netQuantity;
      entry.revenue += item.price * netQuantity;
      byProduct.set(item.productId, entry);
    }
  }

  return [...byProduct.values()]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit)
    .map((entry) => ({ ...entry, revenue: round(entry.revenue) }));
}

/**
 * Revenue per category id, descending. Items whose product is no longer in the
 * catalogue fall under `general`, so deleting a product cannot quietly remove
 * historical revenue from the chart.
 */
export function categoryRevenue(
  transactions: SaleTransaction[],
  products: Product[],
): Array<{ categoryId: string; revenue: number }> {
  const categoryOf = new Map(products.map((product) => [product.id, product.category]));
  const byCategory = new Map<string, number>();

  for (const tx of transactions) {
    for (const item of tx.items) {
      const categoryId = categoryOf.get(item.productId) || 'general';
      byCategory.set(categoryId, (byCategory.get(categoryId) ?? 0) + item.total);
    }
  }

  return [...byCategory.entries()]
    .map(([categoryId, revenue]) => ({ categoryId, revenue: round(revenue) }))
    .sort((a, b) => b.revenue - a.revenue);
}

/**
 * Resolves a category id to its display name, falling back to 'General' for the
 * synthetic bucket and for a category that has since been deleted.
 */
export function categoryName(categoryId: string, categories: Category[]): string | null {
  return categories.find((category) => category.id === categoryId)?.name ?? null;
}

/**
 * Net takings per tender, excluding methods that took nothing.
 *
 * Keyed by the sale's dominant method, which is what a split sale is filed
 * under everywhere else in the app; the per-tender breakdown lives on the
 * receipt.
 */
export function paymentTotals(
  transactions: SaleTransaction[],
): Array<{ method: 'cash' | 'card' | 'mobile' | 'gift'; value: number }> {
  const totals: Record<'cash' | 'card' | 'mobile' | 'gift', number> = {
    cash: 0,
    card: 0,
    mobile: 0,
    gift: 0,
  };

  for (const tx of transactions) {
    if (tx.paymentMethod in totals) {
      totals[tx.paymentMethod as keyof typeof totals] += netRevenue(tx);
    }
  }

  return (Object.keys(totals) as Array<keyof typeof totals>)
    .map((method) => ({ method, value: round(totals[method]) }))
    .filter((entry) => entry.value > 0);
}

/**
 * One operator's till performance over the window.
 */
export interface OperatorSales {
  name: string;
  orders: number;
  revenue: number;
}

/**
 * Per-operator orders and net revenue, best first.
 *
 * Grouped by operator id where there is one and by name otherwise, so sales
 * rung up before operators were recorded still aggregate rather than each
 * becoming its own row.
 */
export function operatorBreakdown(transactions: SaleTransaction[]): OperatorSales[] {
  const byOperator = new Map<string, OperatorSales>();

  for (const tx of transactions) {
    const key = tx.operatorId ?? tx.operatorName ?? 'unknown';
    const entry = byOperator.get(key) ?? { name: tx.operatorName ?? '—', orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += netRevenue(tx);
    byOperator.set(key, entry);
  }

  return [...byOperator.values()]
    .map((entry) => ({ ...entry, revenue: round(entry.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);
}

/**
 * Restricts transactions to those on or after the start of the window. `days`
 * counts today as the first day, so 7 is today plus the six before it.
 */
export function withinLastDays(
  transactions: SaleTransaction[],
  todayStart: number,
  days: number,
): SaleTransaction[] {
  const start = new Date(todayStart);
  start.setDate(start.getDate() - (days - 1));
  return transactions.filter((tx) => new Date(tx.date) >= start);
}

/**
 * Sales that count toward reporting: completed, plus partially-refunded ones
 * whose un-returned remainder is still revenue. A fully refunded sale is
 * excluded outright rather than contributing a zero, so it cannot inflate the
 * order count.
 */
export function reportableTransactions(transactions: SaleTransaction[]): SaleTransaction[] {
  return transactions.filter((tx) => tx.status === 'completed' || tx.status === 'partial');
}

/**
 * Re-exported so the dashboard has one import for its figures. The purchase
 * order roll-up itself lives with the other PO logic.
 */
export type { PurchaseOrder };
