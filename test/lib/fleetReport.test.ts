import { describe, it, expect } from 'vitest';
import {
  fleetTotals,
  rankStores,
  buildDailySeries,
  FleetDailyRow,
} from '../../src/lib/fleetReport';
import { FleetStoreRow } from '../../src/lib/fleet';

const rows: FleetStoreRow[] = [
  { storeId: 's1', storeName: 'Downtown', revenue: 100, orders: 4, lastSeenAt: null },
  { storeId: 's2', storeName: 'Airport', revenue: 500, orders: 20, lastSeenAt: null },
  { storeId: 's3', storeName: 'Mall', revenue: 0, orders: 0, lastSeenAt: null },
];

describe('fleetTotals', () => {
  it('sums revenue and orders and derives avg order value', () => {
    const t = fleetTotals(rows);
    expect(t.revenue).toBe(600);
    expect(t.orders).toBe(24);
    expect(t.avgOrder).toBe(25);
  });

  it('counts stores and active (transacting) stores separately', () => {
    const t = fleetTotals(rows);
    expect(t.storeCount).toBe(3);
    expect(t.activeCount).toBe(2); // s3 had no orders
  });

  it('avoids divide-by-zero with no orders', () => {
    const t = fleetTotals([{ storeId: 'x', storeName: 'X', revenue: 0, orders: 0, lastSeenAt: null }]);
    expect(t.avgOrder).toBe(0);
  });

  it('handles an empty fleet', () => {
    expect(fleetTotals([])).toEqual({
      revenue: 0,
      orders: 0,
      avgOrder: 0,
      storeCount: 0,
      activeCount: 0,
    });
  });
});

describe('rankStores', () => {
  it('ranks by revenue desc with each store share of total', () => {
    const ranked = rankStores(rows);
    expect(ranked.map((r) => r.storeId)).toEqual(['s2', 's1', 's3']);
    expect(ranked[0].share).toBeCloseTo(500 / 600);
    expect(ranked[1].share).toBeCloseTo(100 / 600);
    expect(ranked[2].share).toBe(0);
  });

  it('breaks revenue ties by store name', () => {
    const tied: FleetStoreRow[] = [
      { storeId: 'b', storeName: 'Beta', revenue: 50, orders: 1, lastSeenAt: null },
      { storeId: 'a', storeName: 'Alpha', revenue: 50, orders: 1, lastSeenAt: null },
    ];
    expect(rankStores(tied).map((r) => r.storeName)).toEqual(['Alpha', 'Beta']);
  });

  it('reports zero share when the whole fleet has no revenue', () => {
    const ranked = rankStores([
      { storeId: 'a', storeName: 'A', revenue: 0, orders: 0, lastSeenAt: null },
    ]);
    expect(ranked[0].share).toBe(0);
  });
});

describe('buildDailySeries', () => {
  const daily: FleetDailyRow[] = [
    { storeId: 's1', storeName: 'Downtown', day: '2026-07-22', revenue: 40, orders: 2 },
    { storeId: 's2', storeName: 'Airport', day: '2026-07-22', revenue: 60, orders: 3 },
    { storeId: 's1', storeName: 'Downtown', day: '2026-07-21', revenue: 10, orders: 1 },
  ];

  it('folds every store into one day-keyed series, ascending by day', () => {
    const series = buildDailySeries(daily);
    expect(series.map((p) => p.day)).toEqual(['2026-07-21', '2026-07-22']);
    expect(series[1]).toEqual({ day: '2026-07-22', revenue: 100, orders: 5 });
  });

  it('restricts to a single store when a storeId is given (drill-in)', () => {
    const series = buildDailySeries(daily, 's1');
    expect(series).toEqual([
      { day: '2026-07-21', revenue: 10, orders: 1 },
      { day: '2026-07-22', revenue: 40, orders: 2 },
    ]);
  });

  it('returns an empty series for no rows', () => {
    expect(buildDailySeries([])).toEqual([]);
  });
});
