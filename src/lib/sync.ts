import { getSupabaseClient, pushProducts, pushCategories, pushCustomers, pushTransactions, pushUserAccounts } from './supabase';
import { useSettingsStore } from '../stores/settingsStore';
import { Product, Category, Customer, SaleTransaction, UserAccount } from '../types';

export const syncToCloudIfEnabled = async (
  prods?: Product[], 
  cats?: Category[], 
  custs?: Customer[], 
  txs?: SaleTransaction[],
  accts?: UserAccount[]
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
