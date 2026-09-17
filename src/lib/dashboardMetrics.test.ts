import { describe, expect, it } from 'vitest';
import {
  buildTrendBuckets,
  categoryName,
  categoryRevenue,
  computeKpis,
  netRevenue,
  operatorBreakdown,
  paymentTotals,
  reportableTransactions,
  topProducts,
  transactionProfit,
  withinLastDays,
} from './dashboardMetrics';
import type { Category, OrderItem, Product, SaleTransaction } from '../types';

const DAY = 24 * 60 * 60 * 1000;
/** Local midnight today, which is what the window helpers are anchored to. */
const TODAY_START = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
const daysAgo = (n: number) => new Date(TODAY_START + 12 * 60 * 60 * 1000 - n * DAY).toISOString();

const line = (overrides: Partial<OrderItem> = {}): OrderItem => ({
  productId: 'p1',
  productName: 'Widget',
  price: 10,
  cost: 4,
  quantity: 1,
  total: 10,
  ...overrides,
});

let counter = 0;
function sale(overrides: Partial<SaleTransaction> = {}): SaleTransaction {
  const items = overrides.items ?? [line()];
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  counter += 1;
  return {
    id: `TX-${counter}`,
    date: daysAgo(0),
    items,
    subtotal,
    discount: 0,
    discountType: 'none',
    discountValue: 0,
    tax: 0,
    total: subtotal,
    paymentMethod: 'cash',
    customerId: null,
    status: 'completed',
    ...overrides,
  };
}

describe('netRevenue', () => {
  it('takes returned money back off the sale', () => {
    expect(netRevenue(sale({ total: 50, refundedAmount: 20 }))).toBe(30);
  });

  it('is the total when nothing came back', () => {
    expect(netRevenue(sale({ total: 50 }))).toBe(50);
  });
});

describe('transactionProfit', () => {
  it('is the discounted subtotal less cost of goods', () => {
    const tx = sale({ items: [line({ price: 10, cost: 4, quantity: 2, total: 20 })], discount: 5 });
    // (20 - 5) - (4 * 2)
    expect(transactionProfit(tx)).toBe(7);
  });

  // Prorated by value, matching how computeRefund pays money back, so the
  // dashboard and the till cannot drift apart.
  it('scales down by the share of the sale that was returned', () => {
    const tx = sale({
      items: [line({ price: 10, cost: 4, quantity: 2, total: 20 })],
      total: 20,
      refundedAmount: 10,
    });
    expect(transactionProfit(tx)).toBe(6); // (20 - 8) * 0.5
  });

  it('does not divide by zero on a fully discounted sale', () => {
    const tx = sale({ items: [line({ price: 10, cost: 4, total: 10 })], discount: 10, total: 0 });
    expect(Number.isFinite(transactionProfit(tx))).toBe(true);
  });
});

describe('computeKpis', () => {
  const stocked = (stock: number, minStock: number): Product => ({
    id: `p-${stock}-${minStock}`,
    name: 'P',
    price: 1,
    cost: 0,
    category: 'c1',
    sku: 'S',
    stock,
    minStock,
    image: '',
  });

  it('reports today from the today list alone', () => {
    const today = [sale({ total: 30 })];
    const all = [...today, sale({ date: daysAgo(3), total: 70 })];
    const kpis = computeKpis(today, all, []);
    expect(kpis.revenueToday).toBe(30);
    expect(kpis.ordersToday).toBe(1);
  });

  it('is the average order value, not the sum', () => {
    const today = [sale({ total: 30 }), sale({ total: 70 })];
    expect(computeKpis(today, today, []).aovToday).toBe(50);
  });

  it('averages daily revenue over the days that actually traded', () => {
    const all = [sale({ date: daysAgo(0), total: 30 }), sale({ date: daysAgo(3), total: 70 })];
    // Two trading days, not four calendar ones: a shop that was shut should not
    // have its average dragged down by the days it was shut.
    expect(computeKpis([], all, []).avgDailyRevenue).toBe(50);
  });

  it('is all zeroes with no sales rather than NaN', () => {
    const kpis = computeKpis([], [], []);
    expect(kpis.revenueToday).toBe(0);
    expect(kpis.ordersToday).toBe(0);
    expect(kpis.aovToday).toBe(0);
    // No trading days must not become a division by zero.
    expect(Number.isNaN(kpis.avgDailyRevenue)).toBe(false);
  });

  // Revenue and profit alone cannot tell a quiet day from a busy one that was
  // discounted or returned away; these are the two figures that can.
  it('reports what was discounted off today and what came back against it', () => {
    const today = [
      sale({ total: 90, discount: 10, refundedAmount: 30, status: 'partial' }),
      sale({ total: 50, discount: 5 }),
    ];
    const kpis = computeKpis(today, today, []);
    expect(kpis.discountsToday).toBe(15);
    expect(kpis.returnedToday).toBe(30);
    // revenueToday is already net of the return, which is exactly why the
    // return has to be shown separately.
    expect(kpis.revenueToday).toBe(110);
  });

  it('reports zero rather than undefined when nothing was discounted or returned', () => {
    const today = [sale({ total: 20 })];
    const kpis = computeKpis(today, today, []);
    expect(kpis.discountsToday).toBe(0);
    expect(kpis.returnedToday).toBe(0);
  });

  it('counts low stock as at-or-below the threshold but still sellable', () => {
    // Out of stock is a different condition, surfaced separately, so a zero is
    // deliberately not folded in here.
    const kpis = computeKpis([], [], [stocked(2, 5), stocked(5, 5), stocked(9, 5), stocked(0, 5)]);
    expect(kpis.lowStockItems).toBe(2);
  });
});

describe('buildTrendBuckets', () => {
  it('emits a bucket per day, quiet days included', () => {
    const buckets = buildTrendBuckets([sale({ total: 40 })], TODAY_START, 7);
    expect(buckets).toHaveLength(7);
    // A gap reads as "no data recorded" when the truth is "no sales that day",
    // and a line chart that skips quiet days flatters them.
    expect(buckets.filter((b) => b.revenue === 0)).toHaveLength(6);
    expect(buckets[buckets.length - 1].revenue).toBe(40);
  });

  it('ignores a sale older than the window', () => {
    const buckets = buildTrendBuckets([sale({ date: daysAgo(30), total: 99 })], TODAY_START, 7);
    expect(buckets.every((b) => b.revenue === 0)).toBe(true);
  });

  it('accumulates several sales into one day', () => {
    const buckets = buildTrendBuckets([sale({ total: 10 }), sale({ total: 15 })], TODAY_START, 3);
    expect(buckets[buckets.length - 1].revenue).toBe(25);
  });
});

describe('topProducts', () => {
  // Ranked by net UNITS, not revenue — "best seller" is a question about how
  // many left the shelf, and a single expensive item is not a best seller.
  it('ranks by units sold and honours the limit', () => {
    const txs = [
      sale({
        items: [line({ productId: 'a', productName: 'A', price: 5, quantity: 9, total: 45 })],
      }),
      sale({
        items: [line({ productId: 'b', productName: 'B', price: 50, quantity: 1, total: 50 })],
      }),
    ];
    const top = topProducts(txs, 1);
    expect(top).toHaveLength(1);
    expect(top[0].name).toBe('A');
  });

  it('accumulates one product across several sales', () => {
    const txs = [
      sale({ items: [line({ productId: 'a', productName: 'A', quantity: 2, total: 20 })] }),
      sale({ items: [line({ productId: 'a', productName: 'A', quantity: 3, total: 30 })] }),
    ];
    expect(topProducts(txs)[0].quantity).toBe(5);
  });

  // A product returned more often than it sold goes negative and is left that
  // way: a negative best-seller is a real signal about that product.
  it('lets a heavily returned product go negative rather than clamping', () => {
    const tx = sale({
      items: [line({ productId: 'a', productName: 'A', quantity: 1, total: 10 })],
      refundedItems: [{ productId: 'a', quantity: 3 }],
      status: 'refunded',
    });
    expect(topProducts([tx])[0].quantity).toBe(-2);
  });

  it('nets returned units back out of a product line', () => {
    const tx = sale({
      items: [line({ productId: 'a', productName: 'A', quantity: 4, total: 40 })],
      subtotal: 40,
      total: 40,
      refundedAmount: 20,
      refundedItems: [{ productId: 'a', quantity: 2 }],
      status: 'partial',
    });
    const [entry] = topProducts([tx]);
    expect(entry.quantity).toBe(2);
  });
});

describe('categoryRevenue / categoryName', () => {
  const products: Product[] = [
    {
      id: 'p1',
      name: 'Widget',
      price: 10,
      cost: 4,
      category: 'c1',
      sku: 'W',
      stock: 0,
      minStock: 0,
      image: '',
    },
  ];
  const categories: Category[] = [{ id: 'c1', name: 'Tools', color: '' }];

  it('attributes a sold line to its product’s category', () => {
    const rows = categoryRevenue([sale()], products);
    expect(rows.find((r) => r.categoryId === 'c1')?.revenue).toBe(10);
  });

  // Deleting a product must not quietly remove historical revenue from the
  // chart, so its lines fall into a synthetic bucket instead of vanishing.
  it('files a deleted product’s revenue under general rather than dropping it', () => {
    const tx = sale({ items: [line({ productId: 'gone', total: 10 })] });
    expect(categoryRevenue([tx], products)).toEqual([{ categoryId: 'general', revenue: 10 }]);
  });

  it('resolves a category name and returns null for an unknown id', () => {
    expect(categoryName('c1', categories)).toBe('Tools');
    expect(categoryName('gone', categories)).toBeNull();
  });
});

describe('paymentTotals', () => {
  // The fix these pin: a split sale used to be filed entirely under its
  // dominant method, so the chart added up correctly while describing a day
  // that never happened — and cash is the column an owner reads this for.
  it('splits a sale across the methods it was really paid with', () => {
    const tx = sale({
      total: 30,
      paymentMethod: 'card',
      payments: [
        { method: 'cash', amount: 10 },
        { method: 'card', amount: 20 },
      ],
    });
    const rows = paymentTotals([tx]);
    expect(rows.find((r) => r.method === 'cash')?.value).toBe(10);
    expect(rows.find((r) => r.method === 'card')?.value).toBe(20);
  });

  it('still sums to the day’s net revenue', () => {
    const txs = [
      sale({
        total: 30,
        paymentMethod: 'card',
        payments: [
          { method: 'cash', amount: 10 },
          { method: 'card', amount: 20 },
        ],
      }),
      sale({ total: 15, paymentMethod: 'mobile' }),
    ];
    const total = paymentTotals(txs).reduce((sum, r) => sum + r.value, 0);
    expect(Number(total.toFixed(2))).toBe(45);
  });

  it('scales a partly refunded sale down across its methods', () => {
    const tx = sale({
      total: 30,
      refundedAmount: 15,
      paymentMethod: 'card',
      payments: [
        { method: 'cash', amount: 10 },
        { method: 'card', amount: 20 },
      ],
    });
    const rows = paymentTotals([tx]);
    expect(rows.find((r) => r.method === 'cash')?.value).toBe(5);
    expect(rows.find((r) => r.method === 'card')?.value).toBe(10);
  });

  it('omits methods that took nothing', () => {
    expect(
      paymentTotals([sale({ total: 10, paymentMethod: 'cash' })]).map((r) => r.method),
    ).toEqual(['cash']);
  });

  it('ignores a sale with no money on it', () => {
    expect(paymentTotals([sale({ total: 0, paymentMethod: 'loyalty' })])).toEqual([]);
  });
});

describe('operatorBreakdown', () => {
  it('ranks operators by net revenue', () => {
    const rows = operatorBreakdown([
      sale({ operatorId: 'u1', operatorName: 'Ada', total: 10 }),
      sale({ operatorId: 'u2', operatorName: 'Grace', total: 40 }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Grace', 'Ada']);
  });

  it('groups by id so a rename does not split one person in two', () => {
    const rows = operatorBreakdown([
      sale({ operatorId: 'u1', operatorName: 'Ada', total: 10 }),
      sale({ operatorId: 'u1', operatorName: 'Ada L.', total: 10 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].orders).toBe(2);
  });

  it('aggregates pre-operator sales into one row rather than one row each', () => {
    const rows = operatorBreakdown([sale({ total: 10 }), sale({ total: 10 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].orders).toBe(2);
  });
});

describe('withinLastDays', () => {
  it('counts today as the first day of the window', () => {
    const txs = [
      sale({ date: daysAgo(0) }),
      sale({ date: daysAgo(6) }),
      sale({ date: daysAgo(7) }),
    ];
    expect(withinLastDays(txs, TODAY_START, 7)).toHaveLength(2);
  });

  // A till whose clock was wrong keeps that date after the clock is fixed. With
  // no upper bound the sale counted toward every range at once, "Today"
  // included, permanently — while being invisible in the chart beside it,
  // because buildTrendBuckets has no bucket past today.
  it('excludes a sale dated in the future', () => {
    const future = new Date(TODAY_START + 5 * DAY).toISOString();
    expect(withinLastDays([sale({ date: future })], TODAY_START, 7)).toHaveLength(0);
  });
});

describe('reportableTransactions', () => {
  it('drops fully refunded sales and keeps partial ones', () => {
    const rows = reportableTransactions([
      sale({ status: 'completed' }),
      sale({ status: 'partial' }),
      sale({ status: 'refunded' }),
    ]);
    expect(rows.map((r) => r.status)).toEqual(['completed', 'partial']);
  });
});
