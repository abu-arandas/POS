/**
 * Backward-compatible Supabase facade.
 *
 * New code should import from the focused modules under ./supabase. Existing
 * consumers can continue importing from ./supabase while the implementation is
 * organized by responsibility.
 */
export { getSupabaseClient, signInDevice, testSupabaseConnection } from './client';
export { verifyLoginCloud, pushUserAccounts, pullUserAccounts } from './accounts';
export { pushProducts, pullProducts, pushCategories, pullCategories } from './products';
export { pushCustomers, pullCustomers } from './customers';
export { pushTransactions, pullTransactions } from './transactions';
export {
  stampStoreId,
  fetchAllPages,
  keyset,
  deleteRowsSupabase,
  PULL_PAGE_SIZE,
  DELETE_CHUNK_SIZE,
} from './sync-utils';
export type { SyncTable } from './sync-utils';
