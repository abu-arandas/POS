import { describe, it, expect } from 'vitest';
import {
  buildTrendBuckets,
  categoryRevenue,
  computeKpis,
  netRevenue,
  operatorBreakdown,
  paymentTotals,
  reportableTransactions,
  topProducts,
  transactionProfit,
  withinLastDays,
} from '../../src/lib/dashboardMetrics';
import type { Product, SaleTransaction } from '../../src/types';

// The dashboard's arithmetic had no tests at all while it lived inside
// Dashboard.tsx's useMemo bodies — it could only be exercised by rendering a
// chart. These cover the parts that decide what a shop owner is told they
// earned.

const day = (iso: string) => new Date(iso).getTime();

const sale = (over: Partial<SaleTransaction> = {}): SaleTransaction => ({
  id: 'TX-1',
  date: '2026-03-10T12:00:00.000Z',
  items: [{ productId: 'p1', productName: 'Latte', price: 10, cost: 4, quantity: 2, total: 20 }],
  subtotal: 20,
  discount: 0,
  discountType: 'none',
  discountValue: 0,
  tax: 2,
  total: 22,
  paymentMethod: 'card',
  customerId: null,
  status: 'completed',
  ...over,
});

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Latte',
  price: 10,
  cost: 4,
  category: 'c1',
  sku: 'LAT',
  stock: 10,
  minStock: 2,
  image: '',
  ...over,
});

describe('netRevenue', () => {
  it('is the total when nothing was returned', () => {
    expect(netRevenue(sale())).toBe(22);
  });

  it('subtracts what has been refunded', () => {
    expect(netRevenue(sale({ refundedAmount: 11, status: 'partial' }))).toBe(11);
  });
});

describe('transactionProfit', () => {
  it('is the discounted subtotal less cost of goods', () => {
    // subtotal 20 - discount 0 - cost (4 x 2) = 12
    expect(transactionProfit(sale())).toBe(12);
  });

  it('takes the discount off the profit, not the cost', () => {
    // subtotal 20 - discount 5 - cost 8 = 7
    expect(transactionProfit(sale({ discount: 5, total: 17 }))).toBe(7);
  });

  it('prorates against a partial refund by value', () => {
    // Half the sale came back, so half the profit did too.
    expect(transactionProfit(sale({ refundedAmount: 11, status: 'partial' }))).toBe(6);
  });

  it('is zero once the whole sale has been returned', () => {
    expect(transactionProfit(sale({ refundedAmount: 22, status: 'refunded' }))).toBe(0);
  });

  it('does not divide by zero on a fully-discounted sale', () => {
    const free = sale({ subtotal: 20, discount: 20, total: 0, tax: 0 });
    expect(transactionProfit(free)).toBe(-8); // gave away goods that cost 8
  });
});

describe('computeKpis', () => {
  const today = [sale(), sale({ id: 'TX-2', total: 11, subtotal: 10, tax: 1 })];

  it('sums revenue, counts orders, and averages the basket', () => {
    const kpis = computeKpis(today, today, []);
    expect(kpis.revenueToday).toBe(33);
    expect(kpis.ordersToday).toBe(2);
    expect(kpis.aovToday).toBe(16.5);
  });

  it('reports a zero average basket rather than NaN on a day with no sales', () => {
    const kpis = computeKpis([], [], []);
    expect(kpis.aovToday).toBe(0);
    expect(kpis.avgDailyRevenue).toBe(0);
  });

  it('averages daily revenue over days that traded, not days elapsed', () => {
    // Two sales on one day and one on another: two trading days, not three.
    const history = [
      sale({ date: '2026-03-10T09:00:00.000Z' }),
      sale({ id: 'TX-2', date: '2026-03-10T17:00:00.000Z' }),
      sale({ id: 'TX-3', date: '2026-03-12T10:00:00.000Z' }),
    ];
    expect(computeKpis([], history, []).avgDailyRevenue).toBe(33);
  });

  it('counts low stock at or below the threshold, excluding out of stock', () => {
    const products = [
      product({ id: 'a', stock: 1, minStock: 2 }), // low
      product({ id: 'b', stock: 2, minStock: 2 }), // low (at the threshold)
      product({ id: 'c', stock: 9, minStock: 2 }), // fine
      product({ id: 'd', stock: 0, minStock: 2 }), // out, counted elsewhere
    ];
    expect(computeKpis([], [], products).lowStockItems).toBe(2);
  });
});

describe('buildTrendBuckets', () => {
  const todayStart = day('2026-03-12T00:00:00.000Z');

  it('emits one bucket per day including days with no sales', () => {
    const buckets = buildTrendBuckets([], todayStart, 3);
    expect(buckets).toHaveLength(3);
    expect(buckets.every((b) => b.revenue === 0 && b.profit === 0)).toBe(true);
  });

  it('files each sale under its own day', () => {
    const buckets = buildTrendBuckets(
      [
        sale({ date: '2026-03-12T09:00:00.000Z' }),
        sale({ id: 'TX-2', date: '2026-03-11T09:00:00.000Z' }),
      ],
      todayStart,
      3,
    );
    expect(buckets.map((b) => b.revenue)).toEqual([0, 22, 22]);
  });

  it('ignores sales outside the window rather than folding them into an edge day', () => {
    const buckets = buildTrendBuckets([sale({ date: '2026-01-01T09:00:00.000Z' })], todayStart, 3);
    expect(buckets.every((b) => b.revenue === 0)).toBe(true);
  });

  it('runs in ascending date order, oldest first', () => {
    const buckets = buildTrendBuckets([], todayStart, 3);
    const dates = buckets.map((b) => new Date(b.key).getTime());
    expect(dates[0]).toBeLessThan(dates[1]);
    expect(dates[1]).toBeLessThan(dates[2]);
  });
});

describe('topProducts', () => {
  it('ranks by net units sold and caps the list', () => {
    const txs = [
      sale({
        items: [
          { productId: 'p1', productName: 'Latte', price: 10, cost: 4, quantity: 2, total: 20 },
          { productId: 'p2', productName: 'Bun', price: 5, cost: 1, quantity: 9, total: 45 },
        ],
      }),
    ];
    const ranked = topProducts(txs, 1);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({ productId: 'p2', quantity: 9, revenue: 45 });
  });

  it('subtracts returned units so a refunded line does not hold the top spot', () => {
    const txs = [
      sale({
        items: [
          { productId: 'p1', productName: 'Latte', price: 10, cost: 4, quantity: 5, total: 50 },
        ],
        refundedItems: [{ productId: 'p1', quantity: 3 }],
        status: 'partial',
      }),
    ];
    expect(topProducts(txs)[0]).toMatchObject({ quantity: 2, revenue: 20 });
  });

  it('accumulates the same product across separate sales', () => {
    const ranked = topProducts([sale(), sale({ id: 'TX-2' })]);
    expect(ranked[0]).toMatchObject({ productId: 'p1', quantity: 4 });
  });
});

describe('categoryRevenue', () => {
  it('groups by the product catalogue and sorts descending', () => {
    const txs = [
      sale({
        items: [
          { productId: 'p1', productName: 'Latte', price: 10, cost: 4, quantity: 1, total: 10 },
          { productId: 'p2', productName: 'Bun', price: 5, cost: 1, quantity: 1, total: 5 },
        ],
      }),
    ];
    const products = [
      product({ id: 'p1', category: 'drinks' }),
      product({ id: 'p2', category: 'food' }),
    ];

    expect(categoryRevenue(txs, products)).toEqual([
      { categoryId: 'drinks', revenue: 10 },
      { categoryId: 'food', revenue: 5 },
    ]);
  });

  it('keeps revenue for a product that has since been deleted', () => {
    // Otherwise deleting a product silently removes historical revenue from the
    // chart, and last month's totals change because of an edit made today.
    expect(categoryRevenue([sale()], [])).toEqual([{ categoryId: 'general', revenue: 20 }]);
  });
});

describe('paymentTotals', () => {
  it('nets each tender and drops the ones that took nothing', () => {
    const totals = paymentTotals([
      sale({ paymentMethod: 'cash' }),
      sale({ id: 'TX-2', paymentMethod: 'card', refundedAmount: 11, status: 'partial' }),
    ]);
    expect(totals).toEqual([
      { method: 'cash', value: 22 },
      { method: 'card', value: 11 },
    ]);
  });

  it('ignores a loyalty redemption, which is not a tender the drawer sees', () => {
    expect(paymentTotals([sale({ paymentMethod: 'loyalty', total: 0 })])).toEqual([]);
  });
});

describe('operatorBreakdown', () => {
  it('groups by operator and ranks by revenue', () => {
    const rows = operatorBreakdown([
      sale({ operatorId: 'u1', operatorName: 'Ada' }),
      sale({ id: 'TX-2', operatorId: 'u2', operatorName: 'Grace', total: 50 }),
      sale({ id: 'TX-3', operatorId: 'u1', operatorName: 'Ada' }),
    ]);
    expect(rows).toEqual([
      { name: 'Grace', orders: 1, revenue: 50 },
      { name: 'Ada', orders: 2, revenue: 44 },
    ]);
  });

  it('groups sales recorded before operators were captured into one row', () => {
    const rows = operatorBreakdown([sale(), sale({ id: 'TX-2' })]);
    expect(rows).toEqual([{ name: '—', orders: 2, revenue: 44 }]);
  });
});

describe('withinLastDays', () => {
  const todayStart = day('2026-03-12T00:00:00.000Z');

  it('counts today as the first of the N days', () => {
    const txs = [
      sale({ date: '2026-03-12T09:00:00.000Z' }),
      sale({ id: 'TX-2', date: '2026-03-11T09:00:00.000Z' }),
      sale({ id: 'TX-3', date: '2026-03-10T09:00:00.000Z' }),
    ];
    expect(withinLastDays(txs, todayStart, 2).map((tx) => tx.id)).toEqual(['TX-1', 'TX-2']);
  });
});

describe('reportableTransactions', () => {
  it('keeps completed and partially refunded sales', () => {
    const txs = [
      sale({ id: 'a', status: 'completed' }),
      sale({ id: 'b', status: 'partial' }),
      sale({ id: 'c', status: 'refunded' }),
    ];
    expect(reportableTransactions(txs).map((tx) => tx.id)).toEqual(['a', 'b']);
  });

  it('drops a fully refunded sale entirely rather than counting a zero order', () => {
    expect(reportableTransactions([sale({ status: 'refunded' })])).toEqual([]);
  });
});
