import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
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
import { pendingPushIds, queuedDeleteIds } from './outbox';
import { useSettingsStore } from '../stores/settingsStore';
import { useProductStore } from '../stores/productStore';
import { useCustomerStore } from '../stores/customerStore';
import { useTransactionStore } from '../stores/transactionStore';
import { useAuthStore } from '../stores/authStore';

/**
 * How long a burst of change events gathers before one batched pull, and the
 * hardest a later event may push that back. sendOperation pushes an outbox
 * entry's tables one after another, so a single sale's events arrive spread
 * over a few hundred milliseconds: the window has to be wide enough to collect
 * them and short enough that the till still feels live. The cap is what stops a
 * busy fleet from extending the window indefinitely and starving the pull it
 * keeps asking for.
 */
const BATCH_WINDOW_MS = 400;
const BATCH_MAX_WAIT_MS = 1_200;

/** Retry backoff, and the ceiling it climbs to. */
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 30_000;

/**
 * How many times in a row a batch may retry its own failed pulls before it
 * stops and waits to be told again.
 *
 * Bounded rather than endless because a failure is not always transient: a
 * deployment that REVOKEs a table from the device account fails identically
 * forever, and an unbounded retry would poll it for as long as the till is
 * open. What is lost by giving up is small — the next change event, or the
 * refresh that every rejoin performs, picks the table back up, and a failure
 * long enough to exhaust these rounds is long enough that the socket drops and
 * rejoins anyway.
 */
const MAX_PULL_RETRY_ROUNDS = 5;

let channel: RealtimeChannel | null = null;

// Teardown state, module-level because stopRealtimeSync has to reach it.
//
// The debounce timer used to be a local of startRealtimeSync, so stopping only
// unsubscribed the channel: a refresh already inside its window still fired,
// still pulled through the captured client, and still wrote into the local
// stores afterwards. Since startRealtimeSync stops first, a restart could also
// let an old-client pull land on top of the new subscription's data.
//
// Clearing the timer alone would not be enough — a callback already past
// clearTimeout is awaiting its pull and will still write when it resolves — so
// each subscription carries a generation, and a pull whose generation is stale
// by the time it resolves is discarded.
let generation = 0;

/**
 * The tables a pull still owes, and the single timer that will go and get them.
 *
 * One timer for all of them rather than one per table, and that is the point.
 * A single operation writes several tables at once — commitSale pushes the
 * products it decremented, the customer whose points moved and the transaction
 * itself in one outbox entry — and Postgres reports each table separately. With
 * a timer and a round trip per table, those three landed here whenever their
 * own request happened to resolve, so the other terminal showed a sale whose
 * stock had not moved yet, or a loyalty balance no transaction explained. Every
 * reader of two tables at once saw the tear: useDashboardMetrics derives its
 * KPIs from transactions and products together, and the Z-report reconciles
 * against both.
 *
 * Batched, one change arrives as one change — pulled together and written in a
 * single synchronous block, so nothing renders half of it.
 */
const dirtyTables = new Set<SyncedTable>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;
/** When the open batch window must fire regardless of later events. */
let batchDeadline = 0;
/**
 * Whether a batch is between its first pull and its last write.
 *
 * One batch at a time, because two can finish in the order their requests
 * happen to come back rather than the order they started: a second batch that
 * overtakes the first has the first then apply its older snapshot on top and
 * regress every table in it. Tables stay owed while one runs, and the batch in
 * flight opens the next window itself once it is done.
 */
let batchRunning = false;

// Backoff for a pull that came back empty-handed and for a subscription that
// would not join, so neither keeps retrying a server that is down at the rate
// events arrive. Reset by a successful pull and by a successful join.
let pullRetryMs = RETRY_BASE_MS;
let pullRetryRounds = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelayMs = RETRY_BASE_MS;

/**
 * Raised by scheduleReconnect for exactly as long as it takes the restart it
 * asked for to tear the old subscription down.
 *
 * It is what tells an automatic retry from a fresh start. A retry has to carry
 * its backoff across the stop — resetting it there would hand every attempt the
 * base delay again and flatten the backoff into a fixed-rate poll — while App
 * remounting, or an operator switching sync back on, is a new intent that
 * should not inherit a delay earned by an earlier outage.
 */
let reconnecting = false;

/**
 * Folds a pulled snapshot over the local rows, keeping anything this terminal
 * has written and the server has not accepted yet.
 *
 * A pull REPLACES the table. That is correct for rows the server owns, and
 * wrong for the ones it has never seen: a sale committed a moment ago lives
 * only here until its outbox push lands, so applying the snapshot verbatim
 * dropped it out of the history and the Z-report — and a shift closed inside
 * that window reconciled against a figure that was missing a sale. The outbox
 * says exactly which ids are in that state, so they are the ones local wins on.
 *
 * `newRowsAt` is where a row the server has never seen belongs, and it differs
 * per table rather than being a detail: addTransaction prepends (newest first)
 * while handleAddProduct appends, and putting a new product at the front would
 * quietly reshuffle a catalogue the operator has arranged by hand.
 */
export function mergePendingLocal<T extends { id: string }>(
  pulled: T[],
  local: T[],
  pending: Set<string>,
  newRowsAt: 'start' | 'end',
  /** Rows deleted locally whose deletion the server has not accepted yet. */
  queuedDeletes: Set<string> = new Set(),
): T[] {
  // The server still has a row the operator has already deleted here, because
  // it has not been told yet. Applying the snapshot as-is would put that row
  // back on screen, and keep putting it back on every pull until the delete
  // drained. The local absence is the newer fact.
  const visible =
    queuedDeletes.size > 0 ? pulled.filter((row) => !queuedDeletes.has(row.id)) : pulled;

  if (pending.size === 0) return visible;
  const localPending = new Map(
    local.filter((row) => pending.has(row.id)).map((row) => [row.id, row]),
  );
  if (localPending.size === 0) return visible;

  // An id the server already has keeps its position and takes the local copy,
  // which is the newer of the two — it is queued precisely because the server
  // has not caught up to it.
  const merged = visible.map((row) => localPending.get(row.id) ?? row);
  const onServer = new Set(visible.map((row) => row.id));
  const unseen = local.filter((row) => pending.has(row.id) && !onServer.has(row.id));
  if (unseen.length === 0) return merged;
  return newRowsAt === 'start' ? [...unseen, ...merged] : [...merged, ...unseen];
}

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
    if (!rows) return null;
    return () => {
      const store = useProductStore.getState();
      // Read at APPLY time, not before the await above: a sale committed while
      // the pull was in flight is in the store but would not have been in a
      // set captured earlier, and the merge would drop it.
      store.setProducts(
        mergePendingLocal(
          rows,
          store.products,
          pendingPushIds('products'),
          'end',
          queuedDeleteIds('products'),
        ),
      );
    };
  },
  categories: async (client: SupabaseClient, storeId?: string) => {
    const rows = await pullCategories(client, storeId);
    if (!rows) return null;
    return () => {
      const store = useProductStore.getState();
      // Read at APPLY time, not before the await above: a sale committed while
      // the pull was in flight is in the store but would not have been in a
      // set captured earlier, and the merge would drop it.
      store.setCategories(
        mergePendingLocal(
          rows,
          store.categories,
          pendingPushIds('categories'),
          'end',
          queuedDeleteIds('categories'),
        ),
      );
    };
  },
  customers: async (client: SupabaseClient, storeId?: string) => {
    const rows = await pullCustomers(client, storeId);
    if (!rows) return null;
    return () => {
      const store = useCustomerStore.getState();
      // Read at APPLY time, not before the await above: a sale committed while
      // the pull was in flight is in the store but would not have been in a
      // set captured earlier, and the merge would drop it.
      store.setCustomers(
        mergePendingLocal(
          rows,
          store.customers,
          pendingPushIds('customers'),
          'end',
          queuedDeleteIds('customers'),
        ),
      );
    };
  },
  transactions: async (client: SupabaseClient, storeId?: string) => {
    const rows = await pullTransactions(client, storeId);
    if (!rows) return null;
    return () => {
      const store = useTransactionStore.getState();
      // Read at APPLY time, not before the await above: a sale committed while
      // the pull was in flight is in the store but would not have been in a
      // set captured earlier, and the merge would drop it.
      store.setTransactions(
        mergePendingLocal(
          rows,
          store.transactions,
          pendingPushIds('transactions'),
          'start',
          queuedDeleteIds('transactions'),
        ),
      );
    };
  },
  user_accounts: async (client: SupabaseClient, storeId?: string) => {
    const rows = await pullUserAccounts(client, storeId);
    // A refused read is not a set of rows. Writing 'denied' into the store
    // would replace every staff account with a string, and the lockscreen reads
    // that store — so an anonymous terminal would lose its own way back in.
    if (rows === 'denied' || !rows) return null;
    return () => {
      const store = useAuthStore.getState();
      store.setUsers(
        mergePendingLocal(
          rows,
          store.users,
          pendingPushIds('user_accounts'),
          'end',
          queuedDeleteIds('user_accounts'),
        ),
      );
    };
  },
} as const;

type SyncedTable = keyof typeof PULL_INTO_STORE;

const SYNCED_TABLES = Object.keys(PULL_INTO_STORE) as SyncedTable[];

/**
 * Subscribes to Postgres changes on the synced tables and mirrors them into the
 * local stores, so a second terminal's writes appear here within a moment.
 *
 * Three things have to hold for that to be true, and each of them is something
 * this used to get wrong:
 *
 *   * A change arrives whole. Events are collected across a short window and
 *     the tables they name are pulled together and applied in one synchronous
 *     block — see `dirtyTables` for what the per-table version cost.
 *   * Every join reconciles. `postgres_changes` delivers only what happens
 *     while subscribed and replays nothing, so a terminal that was closed,
 *     offline, or merely between rejoins never hears about those writes at all.
 *     Subscribing therefore refreshes every table, and so does each automatic
 *     rejoin after a dropped socket — without it a ten-second outage left this
 *     till silently stale until someone, somewhere in the fleet, happened to
 *     write again.
 *   * A refused join is not the end of it. It used to be: `subscribe()` was
 *     called with no callback, so a CHANNEL_ERROR — a table missing from the
 *     supabase_realtime publication, an RLS refusal, a token that expired —
 *     killed live sync silently and for good, while Settings went on reporting
 *     "connected" because that status comes from the REST probe and knows
 *     nothing about the socket.
 *
 * Local setters don't trigger a push, so there is no echo loop.
 */
export async function startRealtimeSync(): Promise<boolean> {
  stopRealtimeSync();
  // Consumed by the stop above, which is the only thing that reads it.
  reconnecting = false;
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
  if (!signedIn) {
    // Ordinary offline behaviour, and it recovers on its own — but only if
    // something tries again. Nothing did: App starts realtime once, when the
    // connection status changes, so a terminal that opened during an outage
    // stayed un-subscribed for the rest of the session while every other part
    // of the app went on retrying. A disabled or unconfigured cloud returns
    // above instead, because retrying that would never succeed.
    if (myGeneration === generation) scheduleReconnect();
    return false;
  }
  // Authentication is the only await here, so one check covers everything from
  // here to the channel assignment below.
  if (myGeneration !== generation) return false;

  /**
   * Opens the batch window, or re-aims one already open. A later event pushes
   * the pull back so a burst is gathered into one round trip, but never past
   * `batchDeadline`.
   */
  const scheduleBatch = (delayMs: number, maxWaitMs: number): void => {
    // See `batchRunning`. The running batch picks up whatever is owed.
    if (batchRunning) return;
    const now = Date.now();
    if (batchTimer === null) {
      batchDeadline = now + maxWaitMs;
    } else {
      clearTimeout(batchTimer);
    }
    batchTimer = setTimeout(
      () => {
        batchTimer = null;
        void runBatch();
      },
      Math.max(0, Math.min(delayMs, batchDeadline - now)),
    );
  };

  /**
   * Re-queues tables a batch could not refresh, and answers how long to wait
   * before trying them again — or null when the rounds are spent.
   */
  const owe = (tables: readonly SyncedTable[], reason: string): number | null => {
    if (pullRetryRounds >= MAX_PULL_RETRY_ROUNDS) {
      console.warn(`Realtime sync gave up on ${tables.join(', ')}: ${reason}`);
      return null;
    }
    pullRetryRounds += 1;
    for (const table of tables) dirtyTables.add(table);
    const delay = pullRetryMs;
    pullRetryMs = Math.min(pullRetryMs * 2, RETRY_MAX_MS);
    return delay;
  };

  /**
   * One batch: pull the named tables, apply what came back together, and
   * answer with the delay after which whatever did not should be tried again.
   */
  const pullAndApply = async (tables: SyncedTable[]): Promise<number | null> => {
    // Re-read the store scope each pull so it tracks config changes.
    const { storeId } = useSettingsStore.getState();
    // Realtime is a pull like any other, and the most dangerous one to leave
    // ungated: it is automatic and continuous, so an unscoped terminal would
    // keep absorbing every store's products, customers and staff for as long
    // as the fleet kept trading — no operator ever presses anything. Same
    // rule, same strictness as Pull From Cloud, because it replaces local
    // rows the same way.
    //
    // Asked once for the whole batch rather than per table, so every table in
    // it is pulled under one scope decision and they cannot disagree.
    if (await isSyncBlocked(client, storeId, 'pull')) {
      // Owed rather than dropped, because "blocked" is not always an answer
      // that will keep. A pull is refused on an UNKNOWN scope as well as a
      // missing one, and unknown usually means the count query caught a blip
      // — so dropping the tables here turned a moment of bad line into a
      // terminal that stayed stale until some unrelated write happened to
      // arrive. Bounded like any other failure, so the genuinely persistent
      // case (a terminal with no Store ID on a multi-store database) stops
      // instead of polling for as long as the till is open.
      return owe(tables, 'store scope could not be established');
    }

    let applies: Array<(() => void) | null>;
    try {
      applies = await Promise.all(tables.map((table) => PULL_INTO_STORE[table](client, storeId)));
    } catch (err) {
      // The pulls swallow their own errors and answer null, so this is the
      // unexpected kind. Treated as "every table failed" rather than thrown:
      // an unhandled rejection out of a timer takes nothing with it but the
      // logs, and the retry below is the useful response either way.
      console.warn('Realtime pull failed:', err);
      applies = tables.map(() => null);
    }

    // Neither of these owes a retry: the subscription or the scope has moved
    // on, and what this batch holds is about the terminal as it was.
    if (myGeneration !== generation) return null; // stopped or restarted mid-pull
    // The store scope can change without restarting sync — App only restarts
    // it when the connection changes — so a generation check alone would let
    // the previous store's rows land in the newly selected store.
    if (useSettingsStore.getState().storeId !== storeId) return null;

    // In one synchronous span, with nothing awaited between them. This is the
    // entire reason the pulls were batched: an await here would let a render
    // fall between two tables of the same change and put the tear back.
    for (const apply of applies) apply?.();

    const failed = tables.filter((_, index) => applies[index] === null);
    if (failed.length === 0) {
      pullRetryMs = RETRY_BASE_MS;
      pullRetryRounds = 0;
      return null;
    }
    // A table that did not come back is owed, not forgotten. Left for the next
    // change event it could sit stale for as long as the fleet stayed quiet,
    // which is exactly when a terminal is most likely to be on a bad line.
    return owe(failed, 'pull returned nothing');
  };

  /** Runs one batch, then starts the next window if anything is still owed. */
  const runBatch = async (): Promise<void> => {
    if (myGeneration !== generation) return;
    const tables = [...dirtyTables];
    dirtyTables.clear();
    if (tables.length === 0) return;

    batchRunning = true;
    let retryDelayMs: number | null = null;
    try {
      retryDelayMs = await pullAndApply(tables);
    } finally {
      // A stop or a restart while this was in flight has already cleared both
      // the flag and the queue for whichever subscription comes next, so
      // touching either here would reach into one that is no longer this one.
      if (myGeneration === generation) {
        batchRunning = false;
        if (dirtyTables.size > 0) {
          // Events that arrived mid-batch were deliberately given no timer of
          // their own; this is the window they have been waiting for.
          const delay = retryDelayMs ?? BATCH_WINDOW_MS;
          scheduleBatch(delay, Math.max(delay, BATCH_MAX_WAIT_MS));
        }
      }
    }
  };

  /** Marks tables as owed and makes sure a batched pull is on its way. */
  const refresh = (tables: readonly SyncedTable[]): void => {
    // A channel can still deliver after unsubscribe(). Without this, a stale
    // subscription's handler would reach into the shared timer and re-aim the
    // live subscription's pending pull.
    if (myGeneration !== generation) return;
    for (const table of tables) dirtyTables.add(table);
    scheduleBatch(BATCH_WINDOW_MS, BATCH_MAX_WAIT_MS);
  };

  const ch = client.channel('pos-realtime');
  for (const table of SYNCED_TABLES) {
    ch.on(
      // supabase-js types this event union loosely; the string literal is valid.
      'postgres_changes' as never,
      { event: '*', schema: 'public', table } as never,
      () => refresh([table]),
    );
  }
  ch.subscribe((status, err) => {
    // The same stale-channel guard the handlers carry: a channel being torn
    // down reports CLOSED, and an old one can still report an error after a
    // restart has replaced it.
    if (myGeneration !== generation) return;

    if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
      reconnectDelayMs = RETRY_BASE_MS;
      pullRetryMs = RETRY_BASE_MS;
      pullRetryRounds = 0;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      // Every join, not only the first — supabase-js re-runs this callback on
      // each automatic rejoin. Nothing replays the events missed while this
      // terminal was not subscribed, so the join is the only moment it can
      // find out what it missed, and a full refresh is how it asks.
      refresh(SYNCED_TABLES);
      return;
    }

    if (
      status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
      status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
    ) {
      console.warn(`Realtime subscription ${status}:`, err?.message ?? '(no detail)');
      scheduleReconnect();
    }
    // CLOSED is this module's own unsubscribe, or a socket supabase-js is
    // already rejoining by itself; either way the rejoin reports SUBSCRIBED
    // above and there is nothing to do here.
  });
  channel = ch;
  return true;
}

/**
 * Resubscribes from scratch after a join this connection cannot retry its way
 * out of.
 *
 * supabase-js rejoins on its own for most failures, so this is the backstop for
 * the ones where retrying the same join cannot help — a table that is not in
 * the supabase_realtime publication, a device session that expired since, a
 * binding the server disagrees with. A successful join cancels it, so the cost
 * of firing when the client would have recovered anyway is one redundant
 * resubscribe; the cost of never firing is live sync that is simply off.
 */
function scheduleReconnect(): void {
  if (reconnectTimer !== null) return; // one is already waiting
  const delay = reconnectDelayMs;
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, RETRY_MAX_MS);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnecting = true;
    void startRealtimeSync();
  }, delay);
}

/**
 * Tears down realtime sync: unsubscribes the channel, cancels the batched pull
 * and the reconnect that have not fired, and invalidates any pull already in
 * flight so its results are discarded rather than written. Safe to call when
 * none is open.
 *
 * Resets the backoff counters unless this stop is the one a reconnect attempt
 * performs on its way in — see `reconnecting`.
 */
export function stopRealtimeSync(): void {
  generation += 1;
  if (!reconnecting) {
    reconnectDelayMs = RETRY_BASE_MS;
    pullRetryMs = RETRY_BASE_MS;
    pullRetryRounds = 0;
  }
  if (batchTimer !== null) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
  dirtyTables.clear();
  batchRunning = false;
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (channel) {
    channel.unsubscribe();
    channel = null;
  }
}
