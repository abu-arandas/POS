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
import {
  clearOutbox,
  enqueueOperation,
  flushOutbox,
  OutboxEntry,
  OutboxOperation,
  pendingOperationCount,
} from './outbox';

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

/** Whether this terminal has a cloud to sync with at all. */
const cloudConfigured = (): boolean => {
  const { supabaseConfig } = useSettingsStore.getState();
  return Boolean(supabaseConfig.enabled && supabaseConfig.url && supabaseConfig.anonKey);
};

/**
 * How an attempted cloud write ended. `unreachable` is ordinary offline
 * behaviour and stays quiet; `rejected` means the request reached a server that
 * refused it, which is worth telling the operator about for a delete.
 */
type SendOutcome = 'sent' | 'rejected' | 'unreachable';

/**
 * Performs one queued operation against Supabase. The only place in this module
 * that talks to the network on the write path — everything else queues work and
 * lets the outbox decide when this runs.
 */
const sendOperation = async (operation: OutboxOperation): Promise<SendOutcome> => {
  const { supabaseConfig, storeId } = useSettingsStore.getState();
  const client = getSupabaseClient(supabaseConfig.url, supabaseConfig.anonKey);
  if (!client) return 'unreachable';

  try {
    await ensureDeviceSession(client);
  } catch (err) {
    // Not being able to reach Supabase at all is ordinary offline behaviour
    // that the rest of the app already tolerates quietly.
    console.warn('Cloud write postponed:', err);
    return 'unreachable';
  }

  if (operation.type === 'delete') {
    return (await deleteRowsSupabase(client, operation.table, operation.ids)) ? 'sent' : 'rejected';
  }

  // Ordered, and every table awaited: a transaction that lands before the
  // product rows it refers to is a row the reports cannot explain.
  const { products, categories, customers, transactions, users } = operation;
  const results: boolean[] = [];
  if (products?.length) results.push(await pushProducts(client, products, storeId));
  if (categories?.length) results.push(await pushCategories(client, categories, storeId));
  if (customers?.length) results.push(await pushCustomers(client, customers, storeId));
  if (transactions?.length) results.push(await pushTransactions(client, transactions, storeId));
  if (users?.length) results.push(await pushUserAccounts(client, users, storeId));
  return results.every(Boolean) ? 'sent' : 'rejected';
};

/**
 * Drains the outbox. `onEntryOutcome` observes each attempt, which is how the
 * delete wrappers tell a server rejection from an unreachable server.
 */
const drainOutbox = (onEntryOutcome?: (entry: OutboxEntry, outcome: SendOutcome) => void) =>
  flushOutbox(async (entry) => {
    const outcome = await sendOperation(entry.operation);
    onEntryOutcome?.(entry, outcome);
    return outcome === 'sent';
  });

/**
 * Queues the given changed records for Supabase and tries to send them now, if
 * cloud sync is configured.
 *
 * Every argument is optional and only non-empty lists are queued, which makes
 * this an incremental upsert rather than a full push.
 *
 * The queue is the point. This used to try the network once and swallow the
 * error, so a sale rung up during a thirty-second outage was simply never
 * pushed and nothing ever noticed. Now the rows are written to the outbox in
 * IndexedDB first and removed only once the server has taken them, so the worst
 * a failed push costs is a delay. Callers still need not await it: a slow
 * network must not hold up a receipt.
 */
export const syncToCloudIfEnabled = async (
  prods?: Product[],
  cats?: Category[],
  custs?: Customer[],
  txs?: SaleTransaction[],
  accts?: UserAccount[],
) => {
  // With no cloud configured there is nothing to reconcile against later, so
  // queueing would only grow a backlog for a server that does not exist.
  if (!cloudConfigured()) return;

  const queued = await enqueueOperation({
    type: 'push',
    products: prods,
    categories: cats,
    customers: custs,
    transactions: txs,
    users: accts,
  });
  if (!queued) return;

  await drainOutbox();
};

/**
 * Replays anything the outbox still owes the cloud. Safe to call at any time:
 * an empty queue costs one IndexedDB read.
 */
export const retryPendingCloudWrites = async (): Promise<void> => {
  if (!cloudConfigured()) return;
  await drainOutbox();
};

/** How many cloud writes this terminal has not yet had accepted. */
export const pendingCloudWrites = (): Promise<number> => pendingOperationCount();

const REPLAY_INTERVAL_MS = 30_000;
let replayTimer: ReturnType<typeof setInterval> | null = null;
let replayOnline: (() => void) | null = null;

/**
 * Starts the background replay loop: on reconnect, and on a slow timer for the
 * outages the browser never reports (a captive portal, a server that is up but
 * refusing). Idempotent.
 */
export const startOutboxReplay = (): void => {
  if (replayTimer !== null) return;
  replayTimer = setInterval(() => void retryPendingCloudWrites(), REPLAY_INTERVAL_MS);
  replayOnline = () => void retryPendingCloudWrites();
  if (typeof window !== 'undefined') window.addEventListener('online', replayOnline);
  void retryPendingCloudWrites();
};

/** Stops the background replay loop. The queue itself survives — it is on disk. */
export const stopOutboxReplay = (): void => {
  if (replayTimer !== null) {
    clearInterval(replayTimer);
    replayTimer = null;
  }
  if (replayOnline && typeof window !== 'undefined') {
    window.removeEventListener('online', replayOnline);
  }
  replayOnline = null;
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
    const { storeId } = useSettingsStore.getState();
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

  const { storeId } = useSettingsStore.getState();
  const results = await Promise.all([
    pushCategories(client, data.categories, storeId),
    pushProducts(client, data.products, storeId),
    pushCustomers(client, data.customers, storeId),
    pushUserAccounts(client, data.users, storeId),
    pushTransactions(client, data.transactions, storeId),
  ]);
  const pushed = results.every(Boolean);
  // A successful full push has just sent every local row in its newest form, so
  // the incremental pushes still queued behind it are redundant — and replaying
  // them would re-upsert older copies of rows this push has already settled.
  // Queued deletes are not covered by a push and stay put.
  if (pushed) await clearOutbox('push');
  return pushed;
};

/**
 * Pulls the full dataset from the cloud (manual "Pull From Cloud" action).
 * Returns null if the client cannot be created; individual entities are null
 * only if that specific table failed to load.
 *
 * The outbox is drained first. A pull replaces local data with the server's
 * copy, so anything this terminal has not managed to push yet would be erased
 * by a snapshot that never contained it. Sending first turns that into a
 * no-op; when the queue will not drain, `pendingCloudWrites()` is non-zero and
 * the caller is expected to warn before replacing anything.
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

  await retryPendingCloudWrites();

  const { storeId } = useSettingsStore.getState();
  const [categories, products, customers, users, transactions] = await Promise.all([
    pullCategories(client, storeId),
    pullProducts(client, storeId),
    pullCustomers(client, storeId),
    pullUserAccounts(client, storeId),
    pullTransactions(client, storeId),
  ]);
  return { categories, products, customers, users, transactions };
};

/**
 * Propagates a local delete to the cloud, so the rows do not come back on
 * the next pull. A no-op that reports success when sync is off — there is
 * nothing to keep in step.
 *
 * Returns whether the server accepted the delete during this call. A `false`
 * no longer means the delete is lost: it is queued in the outbox like every
 * other cloud write and replayed until it lands.
 */
const deleteFromCloudIfEnabled = async (table: SyncTable, ids: string[]): Promise<boolean> => {
  if (!cloudConfigured()) return true;
  if (!ids || ids.length === 0) return true;

  const queued = await enqueueOperation({ type: 'delete', table, ids });
  if (!queued) return true;

  let rejected = false;
  const summary = await drainOutbox((entry, outcome) => {
    if (entry.id === queued.id && outcome === 'rejected') rejected = true;
  });

  if (rejected) {
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
  // Our entry is only gone from the queue once the server took it, and the
  // drain runs in order, so a blocked drain means ours did not land either.
  return !summary.blocked;
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
