import { describe, it, expect } from 'vitest';
import { storeStatus, summarizeFleet, FleetStoreRow } from '../../src/lib/fleet';

const NOW = new Date('2026-07-23T12:00:00.000Z').getTime();
const agoMin = (m: number) => new Date(NOW - m * 60 * 1000).toISOString();

describe('storeStatus', () => {
  it('is online within 2 minutes', () => {
    expect(storeStatus(agoMin(0), NOW)).toBe('online');
    expect(storeStatus(agoMin(1.9), NOW)).toBe('online');
  });

  it('is stale between 2 and 15 minutes', () => {
    expect(storeStatus(agoMin(5), NOW)).toBe('stale');
    expect(storeStatus(agoMin(14), NOW)).toBe('stale');
  });

  it('is offline past 15 minutes or with no/blank timestamp', () => {
    expect(storeStatus(agoMin(30), NOW)).toBe('offline');
    expect(storeStatus(null, NOW)).toBe('offline');
    expect(storeStatus(undefined, NOW)).toBe('offline');
    expect(storeStatus('not-a-date', NOW)).toBe('offline');
  });
});

describe('summarizeFleet', () => {
  const rows: FleetStoreRow[] = [
    { storeId: 's1', storeName: 'Downtown', revenue: 100, orders: 4, lastSeenAt: agoMin(1) }, // online
    { storeId: 's2', storeName: 'Airport', revenue: 500, orders: 20, lastSeenAt: agoMin(40) }, // offline
    { storeId: 's3', storeName: 'Mall', revenue: 250, orders: 9, lastSeenAt: agoMin(10) }, // stale
  ];

  it('totals revenue, orders, and online count', () => {
    const r = summarizeFleet(rows, NOW);
    expect(r.storeCount).toBe(3);
    expect(r.totalRevenue).toBe(850);
    expect(r.totalOrders).toBe(33);
    expect(r.onlineCount).toBe(1);
  });

  it('attaches presence to each store', () => {
    const byId = Object.fromEntries(summarizeFleet(rows, NOW).stores.map((s) => [s.storeId, s]));
    expect(byId.s1.presence).toBe('online');
    expect(byId.s2.presence).toBe('offline');
    expect(byId.s3.presence).toBe('stale');
  });

  it('sorts online-first, then by revenue desc', () => {
    const order = summarizeFleet(rows, NOW).stores.map((s) => s.storeId);
    // s1 online first; then stale s3; then offline s2 (even though s2 has the most revenue)
    expect(order).toEqual(['s1', 's3', 's2']);
  });

  it('handles an empty fleet', () => {
    const r = summarizeFleet([], NOW);
    expect(r).toMatchObject({ storeCount: 0, totalRevenue: 0, totalOrders: 0, onlineCount: 0 });
    expect(r.stores).toEqual([]);
  });
});
