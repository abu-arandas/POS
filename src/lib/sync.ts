import {
  getSupabaseClient,
  pushProducts,
  pushCategories,
  pushCustomers,
  pushTransactions,
  pushUserAccounts,
  pullProducts,
  pullCategories,
  pullCustomers,
  pullTransactions,
  pullUserAccounts,
  testSupabaseConnection,
  deleteRowsSupabase,
  signInDevice,
  verifyLoginCloud,
  SyncTable,
} from './supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useSettingsStore } from '../stores/settingsStore';
import { notify } from './utils/ui';
import i18n from './i18n';
import { Product, Category, Customer, SaleTransaction, UserAccount } from '../types';

// Signs the client in with the configured device account (no-op when none is
// set). Call before any read/write so sync works once RLS is enabled.
const ensureDeviceSession = async (client: SupabaseClient): Promise<void> => {
  const { supabaseConfig } = useSettingsStore.getState();
  const signedIn = await signInDevice(
    client,
    supabaseConfig.authEmail || '',
    supabaseConfig.authPassword || '',
  );
  if (!signedIn) throw new Error('Supabase device authentication failed');
};

/**
 * Pushes the given changed records to Supabase, if cloud sync is configured.
 *
 * Every argument is optional and only non-empty lists are sent, which makes
 * this an incremental upsert rather than a full push. A failure is logged and
 * swallowed: sync is best-effort and must never block a sale.
 */
export const syncToCloudIfEnabled = async (
  prods?: Product[],
  cats?: Category[],
  custs?: Customer[],
  txs?: SaleTransaction[],
  accts?: UserAccount[],
) => {
  const { supabaseConfig } = useSettingsStore.getState();
  if (!supabaseConfig.enabled || !supabaseConfig.url || !supabaseConfig.anonKey) return;

  const client = getSupabaseClient(supabaseConfig.url, supabaseConfig.anonKey);
  if (!client) return;

  const storeId = useSettingsStore.getState().storeId;
  try {
    await ensureDeviceSession(client);
    // By passing only modified items as arrays to these functions, we do an incremental upsert!
    if (prods && prods.length > 0) await pushProducts(client, prods, storeId);
    if (cats && cats.length > 0) await pushCategories(client, cats, storeId);
    if (custs && custs.length > 0) await pushCustomers(client, custs, storeId);
    if (txs && txs.length > 0) await pushTransactions(client, txs, storeId);
    if (accts && accts.length > 0) await pushUserAccounts(client, accts, storeId);
  } catch (err) {
    console.warn('Background live sync push postponed:', err);
  }
};

/**
 * Validates a staff PIN against the cloud (verify_login RPC). Returns the
 * account on success — used by the lockscreen as a fallback when the local PIN
 * check fails, so a PIN changed on another terminal still works here.
 */
export const cloudLogin = async (name: string, pinHash: string): Promise<UserAccount | null> => {
  const { supabaseConfig } = useSettingsStore.getState();
  if (!supabaseConfig.enabled || !supabaseConfig.url || !supabaseConfig.anonKey) return null;
  const client = getSupabaseClient(supabaseConfig.url, supabaseConfig.anonKey);
  if (!client) return null;
  try {
    await ensureDeviceSession(client);
    const storeId = useSettingsStore.getState().storeId;
    return storeId
      ? await verifyLoginCloud(client, name, pinHash, storeId)
      : await verifyLoginCloud(client, name, pinHash);
  } catch (err) {
    console.warn('Cloud login postponed:', err);
    return null;
  }
};

/**
 * Verifies credentials by signing in (if a device account is set) and running a
 * lightweight query.
 */
export const testCloudConnection = async (url: string, anonKey: string): Promise<boolean> => {
  const client = getSupabaseClient(url, anonKey);
  if (!client) return false;
  try {
    await ensureDeviceSession(client);
    return await testSupabaseConnection(url, anonKey);
  } catch (err) {
    console.warn('Cloud connection test postponed:', err);
    return false;
  }
};

/**
 * A full pull of every synced table, as 'Pull From Cloud' replaces local data
 * with it.
 */
export interface CloudSnapshot {
  products: Product[];
  categories: Category[];
  customers: Customer[];
  users: UserAccount[];
  transactions: SaleTransaction[];
}

/**
 * Pushes the full local dataset to the cloud (manual "Push All" action).
 * Returns true only if every table upserted successfully.
 */
export const pushAllToCloud = async (
  url: string,
  anonKey: string,
  data: CloudSnapshot,
): Promise<boolean> => {
  const client = getSupabaseClient(url, anonKey);
  if (!client) return false;
  try {
    await ensureDeviceSession(client);
  } catch (err) {
    console.warn('Cloud push postponed:', err);
    return false;
  }

  const storeId = useSettingsStore.getState().storeId;
  const results = await Promise.all([
    pushCategories(client, data.categories, storeId),
    pushProducts(client, data.products, storeId),
    pushCustomers(client, data.customers, storeId),
    pushUserAccounts(client, data.users, storeId),
    pushTransactions(client, data.transactions, storeId),
  ]);
  return results.every(Boolean);
};

/**
 * Pulls the full dataset from the cloud (manual "Pull From Cloud" action).
 * Returns null if the client cannot be created; individual entities are null
 * only if that specific table failed to load.
 */
export const pullAllFromCloud = async (
  url: string,
  anonKey: string,
): Promise<{
  products: Product[] | null;
  categories: Category[] | null;
  customers: Customer[] | null;
  users: UserAccount[] | null;
  transactions: SaleTransaction[] | null;
} | null> => {
  const client = getSupabaseClient(url, anonKey);
  if (!client) return null;
  try {
    await ensureDeviceSession(client);
  } catch (err) {
    console.warn('Cloud pull postponed:', err);
    return null;
  }

  const storeId = useSettingsStore.getState().storeId;
  const [categories, products, customers, users, transactions] = await Promise.all([
    pullCategories(client, storeId),
    pullProducts(client, storeId),
    pullCustomers(client, storeId),
    pullUserAccounts(client, storeId),
    pullTransactions(client, storeId),
  ]);
  return { categories, products, customers, users, transactions };
};

// Propagates a local deletion to the cloud when live sync is enabled. Without
// this, deleted rows survive in Supabase and reappear on the next Pull.
const deleteFromCloudIfEnabled = async (table: SyncTable, ids: string[]): Promise<boolean> => {
  const { supabaseConfig } = useSettingsStore.getState();
  if (!supabaseConfig.enabled || !supabaseConfig.url || !supabaseConfig.anonKey) return true;
  if (!ids || ids.length === 0) return true;

  const client = getSupabaseClient(supabaseConfig.url, supabaseConfig.anonKey);
  if (!client) return false;

  try {
    await ensureDeviceSession(client);
  } catch (err) {
    // Not being able to reach Supabase at all is ordinary offline behaviour
    // that the rest of the app already tolerates quietly.
    console.warn('Background live sync delete postponed:', err);
    return false;
  }

  const deleted = await deleteRowsSupabase(client, table, ids);
  if (!deleted) {
    // The local rows are already gone. If the cloud copy survives, the next
    // Pull From Cloud silently brings them back and the user has no idea why —
    // so a rejected delete is worth saying out loud instead of swallowing.
    notify(
      i18n.t(
        'settings.cloudDeleteFailed',
        'Deleted here, but the cloud copy could not be removed. Those records may reappear on the next pull.',
      ),
      'error',
    );
  }
  return deleted;
};

/**
 * Deletes the given transactions from the cloud, if sync is configured.
 */
export const deleteTransactionsCloudIfEnabled = (ids: string[]): Promise<boolean> =>
  deleteFromCloudIfEnabled('transactions', ids);
/**
 * Deletes the given products from the cloud, if sync is configured.
 */
export const deleteProductsCloudIfEnabled = (ids: string[]): Promise<boolean> =>
  deleteFromCloudIfEnabled('products', ids);
/**
 * Deletes the given categories from the cloud, if sync is configured.
 */
export const deleteCategoriesCloudIfEnabled = (ids: string[]): Promise<boolean> =>
  deleteFromCloudIfEnabled('categories', ids);
/**
 * Deletes the given customers from the cloud, if sync is configured.
 */
export const deleteCustomersCloudIfEnabled = (ids: string[]): Promise<boolean> =>
  deleteFromCloudIfEnabled('customers', ids);
/**
 * Deletes the given user accounts from the cloud, if sync is configured.
 */
export const deleteUsersCloudIfEnabled = (ids: string[]): Promise<boolean> =>
  deleteFromCloudIfEnabled('user_accounts', ids);
