// Supabase-facing side of the super-admin fleet board (Phase 1). The pure
// shaping/folding lives in ./fleet; this module makes the actual RPC calls and
// runs the terminal heartbeat. Everything is defensive: with sync off, no
// client, or no store scope it no-ops (returns null/[]), so nothing here can
// break a single-store terminal.

import { getSupabaseClient, signInDevice } from './supabase';
import { useSettingsStore } from '../stores/settingsStore';
import { FleetStoreRow } from './fleet';
import { FleetDailyRow } from './fleetReport';
import { Store, Membership, Role, Product, Category } from '../types';

function activeClient() {
  const { supabaseConfig } = useSettingsStore.getState();
  if (!supabaseConfig.enabled || !supabaseConfig.url || !supabaseConfig.anonKey) return null;
  return getSupabaseClient(supabaseConfig.url, supabaseConfig.anonKey);
}

async function withSession() {
  const client = activeClient();
  if (!client) return null;
  const { supabaseConfig } = useSettingsStore.getState();
  await signInDevice(client, supabaseConfig.authEmail || '', supabaseConfig.authPassword || '');
  return client;
}

// Marks this terminal's store as "seen" via the store_heartbeat RPC. No-op
// unless sync is on and a storeId is configured.
export async function sendStoreHeartbeat(): Promise<void> {
  const storeId = useSettingsStore.getState().storeId;
  if (!storeId) return;
  const client = await withSession();
  if (!client) return;
  try {
    await client.rpc('store_heartbeat', { p_store: storeId });
  } catch (err) {
    console.warn('Store heartbeat failed:', err);
  }
}

// Returns the org id this device account is a super-admin for, or null. Used to
// decide whether to reveal the fleet board. RLS lets a user read only their own
// memberships, so this can't leak other accounts' rows.
export async function fetchSuperadminOrg(): Promise<string | null> {
  const client = await withSession();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from('memberships')
      .select('org_id, role, store_id')
      .eq('role', 'superadmin')
      .is('store_id', null)
      .limit(1);
    if (error) {
      // A missing memberships table (multi-store not provisioned) just means
      // "not a super-admin here" — don't surface it as an error.
      return null;
    }
    return data && data.length > 0 ? (data[0].org_id as string) : null;
  } catch {
    return null;
  }
}

// Pulls the per-store rollup for the fleet board via the fleet_summary RPC.
// Returns [] on any failure so the board can render an empty state.
export async function fetchFleetSummary(orgId: string, since: Date): Promise<FleetStoreRow[]> {
  const client = await withSession();
  if (!client) return [];
  try {
    const { data, error } = await client.rpc('fleet_summary', {
      p_org: orgId,
      p_since: since.toISOString(),
    });
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      storeId: String(r.store_id),
      storeName: String(r.store_name),
      revenue: Number(r.revenue ?? 0),
      orders: Number(r.orders ?? 0),
      lastSeenAt: (r.last_seen_at as string | null) ?? null,
    }));
  } catch (err) {
    console.warn('fleet_summary failed:', err);
    return [];
  }
}

// Pulls per-store, per-day revenue/order buckets for the consolidated reporting
// dashboard via the fleet_daily RPC. Returns [] on any failure.
export async function fetchFleetDaily(orgId: string, since: Date): Promise<FleetDailyRow[]> {
  const client = await withSession();
  if (!client) return [];
  try {
    const { data, error } = await client.rpc('fleet_daily', {
      p_org: orgId,
      p_since: since.toISOString(),
    });
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      storeId: String(r.store_id),
      storeName: String(r.store_name),
      day: String(r.day),
      revenue: Number(r.revenue ?? 0),
      orders: Number(r.orders ?? 0),
    }));
  } catch (err) {
    console.warn('fleet_daily failed:', err);
    return [];
  }
}

// ── Store & staff management (Phase 3) ───────────────────────────────────────
// All of these are super-admin operations gated by RLS on the backend
// (stores_write / memberships_admin_write = is_superadmin(org)). The client
// guard is convenience; the database is the real boundary. Each no-ops safely
// without a session.

function mapStore(r: Record<string, unknown>): Store {
  return {
    id: String(r.id),
    orgId: String(r.org_id),
    name: String(r.name),
    address: (r.address as string | null) ?? undefined,
    timezone: String(r.timezone ?? 'UTC'),
    currency: String(r.currency ?? '$'),
    status: (r.status as Store['status']) ?? 'active',
    lastSeenAt: (r.last_seen_at as string | null) ?? null,
    createdAt: String(r.created_at ?? ''),
  };
}

export async function listStores(orgId: string): Promise<Store[]> {
  const client = await withSession();
  if (!client) return [];
  try {
    const { data, error } = await client.from('stores').select('*').eq('org_id', orgId).order('name');
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(mapStore);
  } catch (err) {
    console.warn('listStores failed:', err);
    return [];
  }
}

// Insert-or-update a store. Returns true on success. RLS restricts this to a
// super-admin of the store's org.
export async function upsertStore(store: Store): Promise<boolean> {
  const client = await withSession();
  if (!client) return false;
  try {
    const { error } = await client.from('stores').upsert(
      {
        id: store.id,
        org_id: store.orgId,
        name: store.name,
        address: store.address ?? null,
        timezone: store.timezone,
        currency: store.currency,
        status: store.status,
      },
      { onConflict: 'id' },
    );
    return !error;
  } catch (err) {
    console.warn('upsertStore failed:', err);
    return false;
  }
}

export async function setStoreStatus(id: string, status: Store['status']): Promise<boolean> {
  const client = await withSession();
  if (!client) return false;
  try {
    const { error } = await client.from('stores').update({ status }).eq('id', id);
    return !error;
  } catch (err) {
    console.warn('setStoreStatus failed:', err);
    return false;
  }
}

export async function listMemberships(orgId: string): Promise<Membership[]> {
  const client = await withSession();
  if (!client) return [];
  try {
    const { data, error } = await client
      .from('memberships')
      .select('user_id, org_id, store_id, role')
      .eq('org_id', orgId);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      userId: String(r.user_id),
      orgId: String(r.org_id),
      storeId: (r.store_id as string | null) ?? null,
      role: r.role as Role,
    }));
  } catch (err) {
    console.warn('listMemberships failed:', err);
    return [];
  }
}

// Assign (or re-assign) a user's role at a store. The memberships primary key
// uses a coalesce expression that Postgres upsert can't target, so this is a
// delete-then-insert — idempotent and RLS-checked.
export async function setMembership(m: Membership): Promise<boolean> {
  const client = await withSession();
  if (!client) return false;
  try {
    // Match the existing row precisely: an org-wide membership stores NULL, which
    // PostgREST only matches with `is`, not `eq`.
    const del = client.from('memberships').delete().eq('user_id', m.userId);
    await (m.storeId === null ? del.is('store_id', null) : del.eq('store_id', m.storeId));
    const { error } = await client.from('memberships').insert({
      user_id: m.userId,
      org_id: m.orgId,
      store_id: m.storeId,
      role: m.role,
    });
    return !error;
  } catch (err) {
    console.warn('setMembership failed:', err);
    return false;
  }
}

export async function removeMembership(userId: string, storeId: string): Promise<boolean> {
  const client = await withSession();
  if (!client) return false;
  try {
    const { error } = await client
      .from('memberships')
      .delete()
      .eq('user_id', userId)
      .eq('store_id', storeId);
    return !error;
  } catch (err) {
    console.warn('removeMembership failed:', err);
    return false;
  }
}

// ── Central catalog push (Phase 4) ───────────────────────────────────────────
// Reads a store's catalog and writes catalog rows into a target store, both as
// a super-admin. Only additive/price writes flow through here (the diff is
// computed by lib/catalogPush); never any deletes.

export async function fetchStoreProducts(storeId: string): Promise<Product[]> {
  const client = await withSession();
  if (!client) return [];
  try {
    const { data, error } = await client.from('products').select('*').eq('store_id', storeId);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      price: Number(r.price ?? 0),
      cost: Number(r.cost ?? 0),
      category: (r.category as string | null) ?? '',
      sku: String(r.sku ?? ''),
      stock: Number(r.stock ?? 0),
      minStock: Number(r.min_stock ?? 0),
      image: String(r.image ?? ''),
    }));
  } catch (err) {
    console.warn('fetchStoreProducts failed:', err);
    return [];
  }
}

export async function fetchStoreCategories(storeId: string): Promise<Category[]> {
  const client = await withSession();
  if (!client) return [];
  try {
    const { data, error } = await client.from('categories').select('*').eq('store_id', storeId);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      color: String(r.color ?? ''),
    }));
  } catch (err) {
    console.warn('fetchStoreCategories failed:', err);
    return [];
  }
}

// Writes categories first (so product category FKs resolve), then products, all
// stamped with the target store_id. Returns true on success.
export async function pushStoreCatalog(
  storeId: string,
  categories: Category[],
  products: Product[],
): Promise<boolean> {
  const client = await withSession();
  if (!client) return false;
  try {
    if (categories.length > 0) {
      const { error: catErr } = await client.from('categories').upsert(
        categories.map((c) => ({ id: c.id, name: c.name, color: c.color, store_id: storeId })),
        { onConflict: 'id' },
      );
      if (catErr) {
        console.warn('pushStoreCatalog categories failed:', catErr);
        return false;
      }
    }
    if (products.length > 0) {
      const { error: prodErr } = await client.from('products').upsert(
        products.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          cost: p.cost,
          category: p.category || null, // empty → NULL to satisfy the FK
          sku: p.sku,
          stock: p.stock,
          min_stock: p.minStock,
          image: p.image,
          store_id: storeId,
        })),
        { onConflict: 'id' },
      );
      if (prodErr) {
        console.warn('pushStoreCatalog products failed:', prodErr);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.warn('pushStoreCatalog failed:', err);
    return false;
  }
}

// ── Heartbeat loop ──────────────────────────────────────────────────────────
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

// Starts a ~60s heartbeat (fires once immediately). Safe to call repeatedly.
export function startFleetHeartbeat(intervalMs = 60_000): void {
  stopFleetHeartbeat();
  void sendStoreHeartbeat();
  heartbeatTimer = setInterval(() => void sendStoreHeartbeat(), intervalMs);
}

export function stopFleetHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
