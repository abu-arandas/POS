import { get, set, del } from 'idb-keyval';
import type { Category, Customer, Product, SaleTransaction, UserAccount } from '../types';
import type { SyncTable } from './supabase';
import { shortId } from './utils/ids';

/**
 * The durable queue of cloud writes this terminal still owes the server.
 *
 * A sale is committed locally first and pushed afterwards — that is what makes
 * the register work with the internet down. The push used to be attempted once
 * and, on failure, logged to the console and dropped. A van reversing into the
 * fibre, a Supabase blip, a laptop lid closing mid-request: any of them ended
 * with a sale that the till has, the receipt says happened, the day's revenue
 * counts, and the cloud has never heard of. Nothing in the app knew, so nothing
 * ever retried, and the next Pull From Cloud could overwrite the local copy
 * with a snapshot that never contained it.
 *
 * So every write is written down here, in IndexedDB, before it is attempted,
 * and stays until the server has acknowledged it. Replay is in submission order
 * and stops at the first failure, because these operations are not independent:
 * a refund that reaches the server before the sale it refunds is a transaction
 * the server rejects or, worse, accepts against nothing.
 *
 * Every queued operation is an upsert keyed by primary key or a delete by id,
 * so replaying one twice is the same as replaying it once. That is what makes a
 * crash between "server accepted" and "entry removed" harmless, and why no
 * separate idempotency token is needed.
 */

/** One unit of work owed to the cloud. */
export type OutboxOperation =
  | {
      type: 'push';
      products?: Product[];
      categories?: Category[];
      customers?: Customer[];
      transactions?: SaleTransaction[];
      users?: UserAccount[];
    }
  | { type: 'delete'; table: SyncTable; ids: string[] };

/** A queued operation plus its replay bookkeeping. */
export interface OutboxEntry {
  id: string;
  operation: OutboxOperation;
  /** ISO timestamp of the local commit this entry belongs to. */
  createdAt: string;
  attempts: number;
  /** Epoch ms before which replay should not retry this entry. */
  nextAttemptAt: number;
  lastError?: string;
}

/** What one drain of the queue did. */
export interface FlushSummary {
  sent: number;
  /** Entries still queued afterwards, including ones not yet due. */
  pending: number;
  /** True when the drain stopped early because an operation failed. */
  blocked: boolean;
}

/**
 * Sends one queued entry. Resolves true only when the server has accepted it —
 * anything else (offline, rejected, thrown) leaves the entry queued.
 */
export type OperationSender = (entry: OutboxEntry) => Promise<boolean>;

const OUTBOX_KEY = 'pos-cloud-outbox';

/**
 * Retry ladder, in ms. Short enough that a passing network blip clears on its
 * own within a sale or two; long enough that a store that has been offline all
 * morning is not hammering a dead endpoint every five seconds. The last rung
 * repeats for as long as the outage lasts.
 */
const RETRY_DELAYS_MS = [5_000, 15_000, 60_000, 300_000, 900_000, 1_800_000];

const backoffFor = (attempts: number): number =>
  RETRY_DELAYS_MS[Math.min(Math.max(attempts, 1), RETRY_DELAYS_MS.length) - 1];

type Listener = (pending: number) => void;
const listeners = new Set<Listener>();

/**
 * Serializes every read-modify-write of the queue.
 *
 * Two sales rung up a second apart both read the array, both append their own
 * entry, and the second write lands last — so the first sale's push is gone,
 * which is precisely the failure this file exists to prevent. Chaining the
 * mutations through one promise makes that impossible.
 */
let tail: Promise<unknown> = Promise.resolve();
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const result = tail.then(work, work);
  // Swallow here only to keep the chain alive; the caller still sees the error.
  tail = result.catch(() => undefined);
  return result;
}

async function readEntries(): Promise<OutboxEntry[]> {
  try {
    const stored = await get<OutboxEntry[]>(OUTBOX_KEY);
    return Array.isArray(stored) ? stored : [];
  } catch (err) {
    // A browser with IndexedDB blocked (private mode, a locked profile) must
    // still be able to ring up sales; it simply cannot promise replay.
    console.warn('Cloud outbox unreadable:', err);
    return [];
  }
}

async function writeEntries(entries: OutboxEntry[]): Promise<void> {
  if (entries.length === 0) await del(OUTBOX_KEY);
  else await set(OUTBOX_KEY, entries);
  for (const listener of listeners) listener(entries.length);
}

/** True when the operation carries nothing to send. */
export function isEmptyOperation(operation: OutboxOperation): boolean {
  if (operation.type === 'delete') return operation.ids.length === 0;
  return (
    (operation.products?.length ?? 0) === 0 &&
    (operation.categories?.length ?? 0) === 0 &&
    (operation.customers?.length ?? 0) === 0 &&
    (operation.transactions?.length ?? 0) === 0 &&
    (operation.users?.length ?? 0) === 0
  );
}

/**
 * Records an operation as owed. Returns the queued entry, or null when there
 * was nothing to queue.
 */
export async function enqueueOperation(operation: OutboxOperation): Promise<OutboxEntry | null> {
  if (isEmptyOperation(operation)) return null;
  const entry: OutboxEntry = {
    id: `ob-${shortId()}`,
    operation,
    createdAt: new Date().toISOString(),
    attempts: 0,
    nextAttemptAt: 0,
  };
  return exclusive(async () => {
    const entries = await readEntries();
    entries.push(entry);
    await writeEntries(entries);
    return entry;
  });
}

/**
 * Drains run one at a time, and a drain requested while one is running waits
 * rather than being dropped. Dropping it loses wake-ups that matter: the
 * reconnect drain is exactly the one that would arrive while a doomed attempt
 * from a moment ago is still timing out.
 *
 * This is a separate chain from `exclusive`, deliberately. That one guards the
 * stored array and is held only in short sections; this one serializes whole
 * drains, network calls included.
 */
let drainChain: Promise<unknown> = Promise.resolve();

/**
 * Replays queued operations in submission order until one fails or the queue
 * runs dry. An entry whose backoff has not elapsed blocks the drain rather than
 * being skipped — letting later entries past it would reorder the writes.
 *
 * The queue lock is taken around each read and each write, never across the
 * network call in between. Holding it for the whole drain would be simpler, but
 * it would mean a sale rung up during a slow drain waits on that network before
 * its own push is written down — and "written down before it is attempted" is
 * the entire promise of this file. Taking the lock in short sections instead
 * leaves a window in which a sale can append while a send is in flight, so the
 * result is applied surgically to the queue as it is *then*, rather than by
 * writing back an array read before that append existed.
 */
export function flushOutbox(send: OperationSender, now?: number): Promise<FlushSummary> {
  const run = drainChain.then(
    () => drainOnce(send, now),
    () => drainOnce(send, now),
  );
  // Swallow here only to keep the chain alive; the caller still sees the error.
  drainChain = run.catch(() => undefined);
  return run;
}

async function drainOnce(send: OperationSender, at?: number): Promise<FlushSummary> {
  // Resolved here rather than as a parameter default, so a drain that waited
  // behind another judges backoffs against the clock it actually ran at.
  const now = at ?? Date.now();
  let sent = 0;
  let blocked = false;

  for (;;) {
    const head = await exclusive(async () => (await readEntries())[0] ?? null);
    if (!head) break;
    if (head.nextAttemptAt > now) {
      blocked = true;
      break;
    }

    let accepted = false;
    let failure: string | undefined;
    try {
      accepted = await send(head);
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
    }

    const advanced = await exclusive(async () => {
      const entries = await readEntries();
      // Anything but our own entry at the head means the queue was cleared
      // under us; leave it alone and let the next drain start over.
      if (entries[0]?.id !== head.id) return false;

      if (accepted) entries.shift();
      else
        entries[0] = {
          ...head,
          attempts: head.attempts + 1,
          nextAttemptAt: now + backoffFor(head.attempts + 1),
          lastError: failure ?? 'rejected by the server',
        };

      await writeEntries(entries);
      return accepted;
    });

    if (!advanced) {
      blocked = true;
      break;
    }
    sent += 1;
  }

  return { sent, pending: await pendingOperationCount(), blocked };
}

/** How many operations are still owed to the cloud. */
export async function pendingOperationCount(): Promise<number> {
  return exclusive(async () => (await readEntries()).length);
}

/** The queued entries, oldest first. Exposed for diagnostics and tests. */
export async function peekOutbox(): Promise<OutboxEntry[]> {
  return exclusive(readEntries);
}

/**
 * Drops queued entries. `kind` narrows it to one operation type — a successful
 * full push makes every queued incremental push redundant (it sent the same
 * rows, in their newest form), while queued deletes still have to run.
 */
export async function clearOutbox(kind?: OutboxOperation['type']): Promise<void> {
  return exclusive(async () => {
    const entries = kind
      ? (await readEntries()).filter((entry) => entry.operation.type !== kind)
      : [];
    await writeEntries(entries);
  });
}

/**
 * Subscribes to the pending count. Fires on every queue mutation; returns an
 * unsubscribe function.
 */
export function subscribeToOutbox(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
