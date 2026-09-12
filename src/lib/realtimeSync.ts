import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import {
  getSupabaseClient,
  signInDevice,
  pullProducts,
  pullCategories,
  pullCustomers,
  pullTransactions,
  pullUserAccounts,
} from './supabase';
import { isSyncBlocked } from './supabase/storeScope';
import { useSettingsStore } from '../stores/settingsStore';
import { useProductStore } from '../stores/productStore';
import { useCustomerStore } from '../stores/customerStore';
import { useTransactionStore } from '../stores/transactionStore';
import { useAuthStore } from '../stores/authStore';

let channel: RealtimeChannel | null = null;

// Teardown state, module-level because stopRealtimeSync has to reach it.
//
// The debounce timers used to be a local of startRealtimeSync, so stopping only
// unsubscribed the channel: a refresh already inside its 400ms window still
// fired, still pulled through the captured client, and still wrote into the
// local stores afterwards. Since startRealtimeSync stops first, a restart could
// also let an old-client pull land on top of the new subscription's data.
//
// Clearing the timers alone would not be enough — a callback already past
// clearTimeout is awaiting its pull and will still write when it resolves — so
// each subscription carries a generation, and a pull whose generation is stale
// by the time it resolves is discarded.
let timers: Record<string, ReturnType<typeof setTimeout>> = {};
let generation = 0;

/**
 * Pull for each synced table, resolved into the write it *would* perform rather
 * than performing it. That leaves the caller a place to stand between the await
 * and the store, which is the one window `clearTimeout` cannot close: a pull
 * already past its timeout is mid-flight and will otherwise write whatever it
 * returns, however stale by then.
 *
 * Returns null when the pull failed, meaning: leave the local rows alone.
 */
const PULL_INTO_STORE = {
  products: async (client: SupabaseClient, storeId?: string) => {
    const rows = await pullProducts(client, storeId);
    return rows ? () => useProductStore.getState().setProducts(rows) : null;
  },
  categories: async (client: SupabaseClient, storeId?: string) => {
    const rows = await pullCategories(client, storeId);
    return rows ? () => useProductStore.getState().setCategories(rows) : null;
  },
  customers: async (client: SupabaseClient, storeId?: string) => {
    const rows = await pullCustomers(client, storeId);
    return rows ? () => useCustomerStore.getState().setCustomers(rows) : null;
  },
  transactions: async (client: SupabaseClient, storeId?: string) => {
    const rows = await pullTransactions(client, storeId);
    return rows ? () => useTransactionStore.getState().setTransactions(rows) : null;
  },
  user_accounts: async (client: SupabaseClient, storeId?: string) => {
    const rows = await pullUserAccounts(client, storeId);
    return rows ? () => useAuthStore.getState().setUsers(rows) : null;
  },
} as const;

type SyncedTable = keyof typeof PULL_INTO_STORE;

const SYNCED_TABLES = Object.keys(PULL_INTO_STORE) as SyncedTable[];

/**
 * Subscribes to Postgres changes on the synced tables and mirrors them into the
 * local stores, so a second terminal's writes appear here within a moment. On
 * any change we debounce and re-pull the affected table (uniformly handles
 * inserts, updates, and deletes without duplicating row-mapping logic). Local
 * setters don't trigger a push, so there is no echo loop.
 */
export async function startRealtimeSync(): Promise<boolean> {
  stopRealtimeSync();
  // Captured before the first await, not after it. stopRealtimeSync() has just
  // bumped the counter, so the value read here belongs to this start and no
  // other. Reading it after awaiting would pick up whatever a concurrent stop
  // or start had already moved it to, and this start would mistake itself for
  // the current one — the check below would then always pass, which is the
  // opposite of its purpose.
  const myGeneration = generation;

  const { supabaseConfig } = useSettingsStore.getState();
  if (!supabaseConfig.enabled || !supabaseConfig.url || !supabaseConfig.anonKey) return false;

  const client = getSupabaseClient(supabaseConfig.url, supabaseConfig.anonKey);
  if (!client) return false;
  const signedIn = await signInDevice(
    client,
    supabaseConfig.authEmail || '',
    supabaseConfig.authPassword || '',
  );
  if (!signedIn) return false;
  // Authentication is the only await here, so one check covers everything from
  // here to the channel assignment below.
  if (myGeneration !== generation) return false;

  /**
   * Queues a debounced re-pull of one table after a change arrives. Debounced
   * because a single operation on another terminal can produce a burst of
   * row events, and each of them would otherwise be a separate round trip.
   */
  const refresh = (table: SyncedTable) => {
    // A channel can still deliver after unsubscribe(). Without this, a stale
    // subscription's handler would reach into the shared timer map and cancel
    // the live subscription's pending pull.
    if (myGeneration !== generation) return;
    clearTimeout(timers[table]);
    timers[table] = setTimeout(async () => {
      // Re-read the store scope each pull so it tracks config changes.
      const { storeId } = useSettingsStore.getState();
      // Realtime is a pull like any other, and the most dangerous one to leave
      // ungated: it is automatic and continuous, so an unscoped terminal would
      // keep absorbing every store's products, customers and staff for as long
      // as the fleet kept trading — no operator ever presses anything. Same
      // rule, same strictness as Pull From Cloud, because it replaces local
      // rows the same way.
      if (await isSyncBlocked(client, storeId, 'pull')) return;
      const apply = await PULL_INTO_STORE[table](client, storeId);
      if (myGeneration !== generation) return; // stopped or restarted mid-pull
      // The store scope can change without restarting sync — App only restarts
      // it when the connection changes — so a generation check alone would let
      // the previous store's rows land in the newly selected store.
      if (useSettingsStore.getState().storeId !== storeId) return;
      apply?.();
    }, 400);
  };

  const ch = client.channel('pos-realtime');
  for (const table of SYNCED_TABLES) {
    ch.on(
      // supabase-js types this event union loosely; the string literal is valid.
      'postgres_changes' as never,
      { event: '*', schema: 'public', table } as never,
      () => refresh(table),
    );
  }
  ch.subscribe();
  channel = ch;
  return true;
}

/**
 * Tears down realtime sync: unsubscribes the channel, cancels the debounced
 * pulls that have not fired, and invalidates any already in flight so their
 * results are discarded rather than written. Safe to call when none is open.
 */
export function stopRealtimeSync(): void {
  generation += 1;
  for (const timer of Object.values(timers)) clearTimeout(timer);
  timers = {};
  if (channel) {
    channel.unsubscribe();
    channel = null;
  }
}
