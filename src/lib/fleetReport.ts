// Pure folding for the consolidated cross-store reporting dashboard (Phase 2).
// DOM-free and deterministic so it can be unit-tested like poReport /
// kitchenRouting. The Supabase-facing fetches live in ./fleetClient; this module
// only shapes rows the RPCs return.

import { FleetStoreRow } from './fleet';

// One (store, day) bucket from the fleet_daily RPC. `day` is an ISO date
// ('YYYY-MM-DD') already bucketed in the store's local timezone server-side.
export interface FleetDailyRow {
  storeId: string;
  storeName: string;
  day: string;
  revenue: number;
  orders: number;
}

export interface FleetTotals {
  revenue: number;
  orders: number;
  avgOrder: number;
  storeCount: number;
  activeCount: number; // stores with at least one order in the window
}

export interface RankedStore {
  storeId: string;
  storeName: string;
  revenue: number;
  orders: number;
  share: number; // 0..1 fraction of total revenue
}

export interface DailyPoint {
  day: string;
  revenue: number;
  orders: number;
}

// Consolidated totals across the given store rollups. avgOrder is revenue per
// order (0 when there are no orders), activeCount is stores that transacted.
export function fleetTotals(rows: FleetStoreRow[]): FleetTotals {
  const revenue = rows.reduce((sum, r) => sum + r.revenue, 0);
  const orders = rows.reduce((sum, r) => sum + r.orders, 0);
  return {
    revenue,
    orders,
    avgOrder: orders > 0 ? revenue / orders : 0,
    storeCount: rows.length,
    activeCount: rows.filter((r) => r.orders > 0).length,
  };
}

// Stores ranked by revenue (desc), each with its share of total revenue.
// Ties break by name so the order is stable.
export function rankStores(rows: FleetStoreRow[]): RankedStore[] {
  const total = rows.reduce((sum, r) => sum + r.revenue, 0);
  return rows
    .map((r) => ({
      storeId: r.storeId,
      storeName: r.storeName,
      revenue: r.revenue,
      orders: r.orders,
      share: total > 0 ? r.revenue / total : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue || a.storeName.localeCompare(b.storeName));
}

// Folds daily rows into a single day-keyed series, ascending by day. With a
// storeId, restricts to that store (drill-in); without one, sums every store
// that transacted on each day.
export function buildDailySeries(rows: FleetDailyRow[], storeId?: string): DailyPoint[] {
  const scoped = storeId ? rows.filter((r) => r.storeId === storeId) : rows;
  const byDay = new Map<string, DailyPoint>();
  for (const r of scoped) {
    const point = byDay.get(r.day);
    if (point) {
      point.revenue += r.revenue;
      point.orders += r.orders;
    } else {
      byDay.set(r.day, { day: r.day, revenue: r.revenue, orders: r.orders });
    }
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}
