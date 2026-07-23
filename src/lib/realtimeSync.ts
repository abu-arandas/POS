import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  getSupabaseClient,
  signInDevice,
  pullProducts,
  pullCategories,
  pullCustomers,
  pullTransactions,
  pullUserAccounts,
} from './supabase';
import { useSettingsStore } from '../stores/settingsStore';
import { useProductStore } from '../stores/productStore';
import { useCustomerStore } from '../stores/customerStore';
import { useTransactionStore } from '../stores/transactionStore';
import { useAuthStore } from '../stores/authStore';

let channel: RealtimeChannel | null = null;

const SYNCED_TABLES = ['products', 'categories', 'customers', 'transactions', 'user_accounts'];

// Subscribes to Postgres changes on the synced tables and mirrors them into the
// local stores, so a second terminal's writes appear here within a moment. On
// any change we debounce and re-pull the affected table (uniformly handles
// inserts, updates, and deletes without duplicating row-mapping logic). Local
// setters don't trigger a push, so there is no echo loop.
export async function startRealtimeSync(): Promise<boolean> {
  stopRealtimeSync();
  const { supabaseConfig } = useSettingsStore.getState();
  if (!supabaseConfig.enabled || !supabaseConfig.url || !supabaseConfig.anonKey) return false;

  const client = getSupabaseClient(supabaseConfig.url, supabaseConfig.anonKey);
  if (!client) return false;
  await signInDevice(client, supabaseConfig.authEmail || '', supabaseConfig.authPassword || '');

  const timers: Record<string, ReturnType<typeof setTimeout>> = {};
  const refresh = (table: string) => {
    clearTimeout(timers[table]);
    timers[table] = setTimeout(async () => {
      // Re-read the store scope each pull so it tracks config changes.
      const storeId = useSettingsStore.getState().storeId;
      if (table === 'products') {
        const d = await pullProducts(client, storeId);
        if (d) useProductStore.getState().setProducts(d);
      } else if (table === 'categories') {
        const d = await pullCategories(client, storeId);
        if (d) useProductStore.getState().setCategories(d);
      } else if (table === 'customers') {
        const d = await pullCustomers(client, storeId);
        if (d) useCustomerStore.getState().setCustomers(d);
      } else if (table === 'transactions') {
        const d = await pullTransactions(client, storeId);
        if (d) useTransactionStore.getState().setTransactions(d);
      } else if (table === 'user_accounts') {
        const d = await pullUserAccounts(client, storeId);
        if (d) useAuthStore.getState().setUsers(d);
      }
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

export function stopRealtimeSync(): void {
  if (channel) {
    channel.unsubscribe();
    channel = null;
  }
}
