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
import { isSyncBlocked } from './supabase/storeScope';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useSettingsStore } from '../stores/settingsStore';
import { notify } from './utils/ui';
import i18n from './i18n';
import { Product, Category, Customer, SaleTransaction, UserAccount } from '../types';
import {
  dropOutboxEntries,
  enqueueOperation,
  flushOutbox,
  OutboxEntry,
  OutboxOperation,
  peekOutbox,
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
 * Credentials to send with, when the caller has its own rather than the saved
 * ones. Settings hands "Push All" and "Pull From Cloud" whatever is typed in
 * the form, which is not necessarily what is persisted: a pull that drains the
 * outbox against a stale or disabled saved config would quietly skip the drain
 * and then replace local data anyway.
 */
export interface CloudCredentials {
  url: string;
  anonKey: string;
}

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
const sendOperation = async (
  operation: OutboxOperation,
  creds?: CloudCredentials,
): Promise<SendOutcome> => {
  const { supabaseConfig, storeId } = useSettingsStore.getState();
  const client = getSupabaseClient(
    creds?.url ?? supabaseConfig.url,
    creds?.anonKey ?? supabaseConfig.anonKey,
  );
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

  // Ordered, and stopping at the first refusal: a transaction that lands before
  // the product rows it refers to is a row the reports cannot explain, and
  // continuing past a failed table sends exactly that. The whole entry is
  // retried from the top either way, and every push is an idempotent upsert, so
  // stopping costs nothing and keeps the ordering the comment claims.
  // A terminal with no Store ID against a database holding several stores must
  // not write unscoped rows: store_id lands NULL, every scoped pull is then
  // blind to them, and they block multi-store-rls-enforce.sql's NOT NULL guard.
  // Refusing keeps the entry queued, so the rows are not lost — they go as soon
  // as the Store ID is set.
  if (await isSyncBlocked(client, storeId, 'push')) return 'rejected';

  const { products, categories, customers, transactions, users } = operation;
  const tables: Array<() => Promise<boolean>> = [];
  if (products?.length) tables.push(() => pushProducts(client, products, storeId));
  if (categories?.length) tables.push(() => pushCategories(client, categories, storeId));
  if (customers?.length) tables.push(() => pushCustomers(client, customers, storeId));
  if (transactions?.length) tables.push(() => pushTransactions(client, transactions, storeId));
  if (users?.length) tables.push(() => pushUserAccounts(client, users, storeId));

  for (const push of tables) {
    if (!(await push())) return 'rejected';
  }
  return 'sent';
};

/**
 * Drains the outbox. `onEntryOutcome` observes each attempt, which is how the
 * delete wrappers tell a server rejection from an unreachable server.
 */
const drainOutbox = (
  onEntryOutcome?: (entry: OutboxEntry, outcome: SendOutcome) => void,
  creds?: CloudCredentials,
) =>
  flushOutbox(async (entry) => {
    const outcome = await sendOperation(entry.operation, creds);
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
export const retryPendingCloudWrites = async (creds?: CloudCredentials): Promise<void> => {
  // Explicit credentials are their own authorization to try: they come from a
  // caller that is about to use them for a push or a pull, so the saved config
  // has no say.
  if (!creds && !cloudConfigured()) return;
  await drainOutbox(undefined, creds);
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
    // verify_login refuses an unscoped call on a multi-store database by itself,
    // so this is belt-and-braces rather than the guard — but it saves a round
    // trip, and it keeps the client's rule and the database's rule visibly the
    // same one. Treated as a pull: a login that cannot establish its scope is
    // refused, and the lockscreen's local PIN check has already run.
    if (await isSyncBlocked(client, storeId, 'pull')) return null;
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

  // Observed BEFORE anything is sent. `data` is the local state as the caller
  // read it, so these are the queued pushes it supersedes — and only these. The
  // register keeps trading while the upload runs, and a sale rung up during it
  // queues a push whose rows this snapshot never contained. Clearing every
  // queued push at the end would throw that sale's push away.
  const supersededIds = (await peekOutbox())
    .filter((entry) => entry.operation.type === 'push')
    .map((entry) => entry.id);

  try {
    await ensureDeviceSession(client);
  } catch (err) {
    console.warn('Cloud push postponed:', err);
    return false;
  }

  const { storeId } = useSettingsStore.getState();
  if (await isSyncBlocked(client, storeId, 'push')) return false;

  const results = await Promise.all([
    pushCategories(client, data.categories, storeId),
    pushProducts(client, data.products, storeId),
    pushCustomers(client, data.customers, storeId),
    pushUserAccounts(client, data.users, storeId),
    pushTransactions(client, data.transactions, storeId),
  ]);
  const pushed = results.every(Boolean);
  // A successful full push has sent those rows in their newest form, so
  // replaying the pushes it superseded would only re-upsert older copies.
  // Queued deletes are not covered by a push and stay put.
  if (pushed) await dropOutboxEntries(supersededIds);
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

  // Drained with the credentials this pull is using, not the saved ones: a pull
  // started from unsaved form values would otherwise skip the drain entirely
  // and then go on to replace local data.
  await retryPendingCloudWrites({ url, anonKey });

  const { storeId } = useSettingsStore.getState();
  // The strictest of the three. A pull REPLACES local data, so an unscoped pull
  // against a multi-store database does not merely read too much — it puts
  // another shop's catalogue, customers and staff on this till, and there is no
  // undo. Refused unless the scope is positively established.
  if (await isSyncBlocked(client, storeId, 'pull')) return null;

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
  await drainOutbox((entry, outcome) => {
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

  // Asked of the queue rather than inferred from the drain. An entry leaves the
  // queue only once the server has taken it, so this is the fact itself —
  // whereas the drain's `blocked` flag answers a different question and gets
  // this one wrong twice over: it reports failure when our delete landed and
  // something queued behind it did not, and it would report success when a
  // concurrent drain sent ours and this one found nothing to do.
  const stillOwed = (await peekOutbox()).some((entry) => entry.id === queued.id);
  return !stillOwed;
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
