// Pure helpers for the super-admin fleet board (see scripts/multi-store-schema.sql).
// DOM-free and backend-free so they unit-test like the rest of lib/*. The actual
// Supabase heartbeat + fleet_summary calls will live alongside these once the
// multi-store backend is provisioned; these functions shape and fold whatever
// rows come back.

/**
 * How recently a store last checked in, derived from its heartbeat by
 * storeStatus.
 */
export type StorePresence = 'online' | 'stale' | 'offline';

/**
 * Thresholds for translating a heartbeat timestamp into a presence state.
 */
export const PRESENCE_ONLINE_MS = 2 * 60 * 1000; // ≤ 2 min → online
/**
 * Upper bound for 'stale'. A heartbeat older than this reads as offline.
 */
export const PRESENCE_STALE_MS = 15 * 60 * 1000; // ≤ 15 min → stale, else offline

/**
 * Classifies a store by how recently it last checked in. A missing/blank
 * timestamp is always offline.
 */
export function storeStatus(
  lastSeenAt: string | null | undefined,
  now: number = Date.now(),
): StorePresence {
  if (!lastSeenAt) return 'offline';
  const seen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seen)) return 'offline';
  const age = now - seen;
  if (age <= PRESENCE_ONLINE_MS) return 'online';
  if (age <= PRESENCE_STALE_MS) return 'stale';
  return 'offline';
}

/**
 * One row of the fleet board — a per-store rollup (from the fleet_summary RPC).
 */
export interface FleetStoreRow {
  storeId: string;
  storeName: string;
  revenue: number;
  orders: number;
  lastSeenAt: string | null;
}

/**
 * A store row with its heartbeat resolved to a presence state.
 */
export interface FleetStore extends FleetStoreRow {
  presence: StorePresence;
}

/**
 * Roll-up across every store in the org, as the fleet board renders it.
 */
export interface FleetSummary {
  stores: FleetStore[];
  totalRevenue: number;
  totalOrders: number;
  onlineCount: number;
  storeCount: number;
}

/**
 * Folds raw fleet rows into board-ready data: attaches presence to each store,
 * sums revenue/orders, counts online stores, and sorts online-first then by
 * revenue desc so the busiest live stores surface at the top.
 */
export function summarizeFleet(rows: FleetStoreRow[], now: number = Date.now()): FleetSummary {
  const stores: FleetStore[] = rows.map((r) => ({
    ...r,
    presence: storeStatus(r.lastSeenAt, now),
  }));

  const presenceRank: Record<StorePresence, number> = { online: 0, stale: 1, offline: 2 };
  stores.sort(
    (a, b) => presenceRank[a.presence] - presenceRank[b.presence] || b.revenue - a.revenue,
  );

  return {
    stores,
    totalRevenue: Number(stores.reduce((s, r) => s + r.revenue, 0).toFixed(2)),
    totalOrders: stores.reduce((s, r) => s + r.orders, 0),
    onlineCount: stores.filter((s) => s.presence === 'online').length,
    storeCount: stores.length,
  };
}
