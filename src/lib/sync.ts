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
  deleteTransactionsSupabase,
} from './supabase';
import { useSettingsStore } from '../stores/settingsStore';
import { Product, Category, Customer, SaleTransaction, UserAccount } from '../types';

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

// Verifies credentials by attempting a lightweight query.
export const testCloudConnection = (url: string, anonKey: string): Promise<boolean> =>
  testSupabaseConnection(url, anonKey);

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

  const [categories, products, customers, users, transactions] = await Promise.all([
    pullCategories(client),
    pullProducts(client),
    pullCustomers(client),
    pullUserAccounts(client),
    pullTransactions(client),
  ]);
  return { categories, products, customers, users, transactions };
};

export const deleteTransactionsCloudIfEnabled = async (ids: string[]) => {
  const { supabaseConfig } = useSettingsStore.getState();
  if (!supabaseConfig.enabled || !supabaseConfig.url || !supabaseConfig.anonKey) return;

  const client = getSupabaseClient(supabaseConfig.url, supabaseConfig.anonKey);
  if (!client) return;

  try {
    if (ids && ids.length > 0) await deleteTransactionsSupabase(client, ids);
  } catch (err) {
    console.warn('Background live sync delete postponed:', err);
  }
};
