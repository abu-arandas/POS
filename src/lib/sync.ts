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
import { Product, Category, Customer, SaleTransaction, UserAccount } from '../types';

// Signs the client in with the configured device account (no-op when none is
// set). Call before any read/write so sync works once RLS is enabled.
const ensureDeviceSession = async (client: SupabaseClient) => {
  const { supabaseConfig } = useSettingsStore.getState();
  await signInDevice(client, supabaseConfig.authEmail || '', supabaseConfig.authPassword || '');
};

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

  try {
    await ensureDeviceSession(client);
    // By passing only modified items as arrays to these functions, we do an incremental upsert!
    if (prods && prods.length > 0) await pushProducts(client, prods);
    if (cats && cats.length > 0) await pushCategories(client, cats);
    if (custs && custs.length > 0) await pushCustomers(client, custs);
    if (txs && txs.length > 0) await pushTransactions(client, txs);
    if (accts && accts.length > 0) await pushUserAccounts(client, accts);
  } catch (err) {
    console.warn('Background live sync push postponed:', err);
  }
};

// Validates a staff PIN against the cloud (verify_login RPC). Returns the
// account on success — used by the lockscreen as a fallback when the local PIN
// check fails, so a PIN changed on another terminal still works here.
export const cloudLogin = async (
  name: string,
  pinHash: string,
): Promise<UserAccount | null> => {
  const { supabaseConfig } = useSettingsStore.getState();
  if (!supabaseConfig.enabled || !supabaseConfig.url || !supabaseConfig.anonKey) return null;
  const client = getSupabaseClient(supabaseConfig.url, supabaseConfig.anonKey);
  if (!client) return null;
  await ensureDeviceSession(client);
  return verifyLoginCloud(client, name, pinHash);
};

// Verifies credentials by signing in (if a device account is set) and running a
// lightweight query.
export const testCloudConnection = async (url: string, anonKey: string): Promise<boolean> => {
  const client = getSupabaseClient(url, anonKey);
  if (!client) return false;
  await ensureDeviceSession(client);
  return testSupabaseConnection(url, anonKey);
};

export interface CloudSnapshot {
  products: Product[];
  categories: Category[];
  customers: Customer[];
  users: UserAccount[];
  transactions: SaleTransaction[];
}

// Pushes the full local dataset to the cloud (manual "Push All" action).
// Returns true only if every table upserted successfully.
export const pushAllToCloud = async (
  url: string,
  anonKey: string,
  data: CloudSnapshot,
): Promise<boolean> => {
  const client = getSupabaseClient(url, anonKey);
  if (!client) return false;
  await ensureDeviceSession(client);

  const results = await Promise.all([
    pushCategories(client, data.categories),
    pushProducts(client, data.products),
    pushCustomers(client, data.customers),
    pushUserAccounts(client, data.users),
    pushTransactions(client, data.transactions),
  ]);
  return results.every(Boolean);
};

// Pulls the full dataset from the cloud (manual "Pull From Cloud" action).
// Returns null if the client cannot be created; individual entities are null
// only if that specific table failed to load.
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
  await ensureDeviceSession(client);

  const [categories, products, customers, users, transactions] = await Promise.all([
    pullCategories(client),
    pullProducts(client),
    pullCustomers(client),
    pullUserAccounts(client),
    pullTransactions(client),
  ]);
  return { categories, products, customers, users, transactions };
};

// Propagates a local deletion to the cloud when live sync is enabled. Without
// this, deleted rows survive in Supabase and reappear on the next Pull.
const deleteFromCloudIfEnabled = async (table: SyncTable, ids: string[]) => {
  const { supabaseConfig } = useSettingsStore.getState();
  if (!supabaseConfig.enabled || !supabaseConfig.url || !supabaseConfig.anonKey) return;
  if (!ids || ids.length === 0) return;

  const client = getSupabaseClient(supabaseConfig.url, supabaseConfig.anonKey);
  if (!client) return;

  try {
    await ensureDeviceSession(client);
    await deleteRowsSupabase(client, table, ids);
  } catch (err) {
    console.warn('Background live sync delete postponed:', err);
  }
};

export const deleteTransactionsCloudIfEnabled = (ids: string[]) =>
  deleteFromCloudIfEnabled('transactions', ids);
export const deleteProductsCloudIfEnabled = (ids: string[]) =>
  deleteFromCloudIfEnabled('products', ids);
export const deleteCategoriesCloudIfEnabled = (ids: string[]) =>
  deleteFromCloudIfEnabled('categories', ids);
export const deleteCustomersCloudIfEnabled = (ids: string[]) =>
  deleteFromCloudIfEnabled('customers', ids);
export const deleteUsersCloudIfEnabled = (ids: string[]) =>
  deleteFromCloudIfEnabled('user_accounts', ids);
