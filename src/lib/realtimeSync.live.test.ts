/**
 * The live-sync subscription itself, as opposed to the merge it applies
 * (realtimeSync.test.ts). What is under test here is timing: which pulls a
 * burst of change events costs, when their results reach the stores, and what
 * happens when a join or a pull does not come back.
 *
 * Supabase is mocked down to a fake channel, so the tests drive the two things
 * the real server would — row events and subscription status — and read the
 * REAL stores on the other side.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  getSupabaseClient: vi.fn(),
  signInDevice: vi.fn(),
  pullProducts: vi.fn(),
  pullCategories: vi.fn(),
  pullCustomers: vi.fn(),
  pullTransactions: vi.fn(),
  pullUserAccounts: vi.fn(),
}));

vi.mock('./supabase/storeScope', () => ({ isSyncBlocked: vi.fn() }));

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
import { startRealtimeSync, stopRealtimeSync } from './realtimeSync';
import { useSettingsStore } from '../stores/settingsStore';
import { useProductStore } from '../stores/productStore';
import { useCustomerStore } from '../stores/customerStore';
import { useTransactionStore } from '../stores/transactionStore';
import { useAuthStore } from '../stores/authStore';

/** Every pull the module makes, so a test can talk about "one round". */
const pulls = {
  products: vi.mocked(pullProducts),
  categories: vi.mocked(pullCategories),
  customers: vi.mocked(pullCustomers),
  transactions: vi.mocked(pullTransactions),
  user_accounts: vi.mocked(pullUserAccounts),
};
type Table = keyof typeof pulls;
const TABLES = Object.keys(pulls) as Table[];

const callCounts = () =>
  Object.fromEntries(TABLES.map((table) => [table, pulls[table].mock.calls.length])) as Record<
    Table,
    number
  >;

/** A promise a test resolves by hand, to hold one table's pull open. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

class FakeChannel {
  handlers = new Map<string, () => void>();
  status: ((status: string, err?: Error) => void) | null = null;
  unsubscribes = 0;

  on(_event: unknown, filter: { table: string }, handler: () => void) {
    this.handlers.set(filter.table, handler);
    return this;
  }
  subscribe(callback: (status: string, err?: Error) => void) {
    this.status = callback;
    return this;
  }
  unsubscribe() {
    this.unsubscribes += 1;
    return Promise.resolve('ok');
  }

  /** A row changed on another terminal. */
  emit(table: Table) {
    this.handlers.get(table)?.();
  }
  /** The channel joined — on first subscribe, or on an automatic rejoin. */
  join() {
    this.status?.('SUBSCRIBED');
  }
  refuse(message = 'not in publication') {
    this.status?.('CHANNEL_ERROR', new Error(message));
  }
}

let channels: FakeChannel[] = [];
const live = () => channels[channels.length - 1];

beforeEach(() => {
  vi.useFakeTimers();
  channels = [];
  vi.mocked(getSupabaseClient).mockReturnValue({
    channel: () => {
      const channel = new FakeChannel();
      channels.push(channel);
      return channel;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  vi.mocked(signInDevice).mockResolvedValue(true);
  vi.mocked(isSyncBlocked).mockResolvedValue(false);
  for (const table of TABLES) pulls[table].mockResolvedValue([]);

  useSettingsStore.setState({
    supabaseConfig: {
      url: 'https://example.supabase.co',
      anonKey: 'anon',
      enabled: true,
      status: 'connected',
    },
    storeId: '',
  });
  useProductStore.setState({ products: [], categories: [] });
  useCustomerStore.setState({ customers: [] });
  useTransactionStore.setState({ transactions: [] });
  useAuthStore.setState({ users: [] });
});

afterEach(() => {
  stopRealtimeSync();
  vi.useRealTimers();
  vi.clearAllMocks();
});

/** Subscribes and clears the full refresh the join performs. */
async function subscribed(): Promise<FakeChannel> {
  await startRealtimeSync();
  const channel = live();
  channel.join();
  await vi.advanceTimersByTimeAsync(2_000);
  for (const table of TABLES) pulls[table].mockClear();
  vi.mocked(isSyncBlocked).mockClear();
  return channel;
}

describe('a burst of change events', () => {
  // The regression. One sale writes three tables — commitSale pushes the
  // decremented products, the customer whose points moved and the transaction
  // in one outbox entry — and Postgres reports each of them separately. A timer
  // and a round trip per table meant they landed here whenever each request
  // happened to resolve, so the other till showed a sale whose stock had not
  // moved yet.
  it('costs one pull per table, not one round per event', async () => {
    const channel = await subscribed();

    channel.emit('products');
    channel.emit('customers');
    channel.emit('transactions');
    channel.emit('products'); // a second row of the same table, same sale
    await vi.advanceTimersByTimeAsync(2_000);

    expect(callCounts()).toEqual({
      products: 1,
      customers: 1,
      transactions: 1,
      categories: 0,
      user_accounts: 0,
    });
    // One scope decision for the batch, so the tables in it cannot be pulled
    // under two different answers.
    expect(isSyncBlocked).toHaveBeenCalledTimes(1);
  });

  it('holds every table until the slowest of them has answered', async () => {
    const channel = await subscribed();
    const slowProducts = deferred<unknown[]>();
    pulls.products.mockReturnValue(slowProducts.promise as ReturnType<typeof pullProducts>);
    pulls.transactions.mockResolvedValue([
      { id: 'sale-1', items: [], total: 5 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    channel.emit('products');
    channel.emit('transactions');
    await vi.advanceTimersByTimeAsync(2_000);

    // The transactions pull resolved long ago. Applying it now is exactly the
    // tear this batching exists to prevent: a sale on screen whose stock
    // movement has not arrived.
    expect(useTransactionStore.getState().transactions).toEqual([]);

    slowProducts.resolve([]);
    await vi.advanceTimersByTimeAsync(0);

    expect(useTransactionStore.getState().transactions).toHaveLength(1);
  });

  it('cannot be postponed indefinitely by a terminal that keeps writing', async () => {
    const channel = await subscribed();

    // An event every 300ms: shorter than the 400ms window, so each one re-aims
    // the timer. Without a hard cap the pull would never run.
    for (let i = 0; i < 10; i += 1) {
      channel.emit('products');
      await vi.advanceTimersByTimeAsync(300);
    }

    expect(pulls.products.mock.calls.length).toBeGreaterThan(0);
  });
});

describe('joining', () => {
  // postgres_changes delivers only what happens while subscribed and replays
  // nothing, so everything written while this terminal was closed, offline, or
  // between rejoins is invisible to it. The join is the only moment it can ask.
  it('reconciles every table, with no change event to prompt it', async () => {
    await startRealtimeSync();
    live().join();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(callCounts()).toEqual({
      products: 1,
      categories: 1,
      customers: 1,
      transactions: 1,
      user_accounts: 1,
    });
  });

  it('reconciles again on the rejoin after a dropped socket', async () => {
    const channel = await subscribed();

    channel.join(); // supabase-js re-runs the callback on every rejoin
    await vi.advanceTimersByTimeAsync(2_000);

    expect(callCounts()).toEqual({
      products: 1,
      categories: 1,
      customers: 1,
      transactions: 1,
      user_accounts: 1,
    });
  });

  it('resubscribes after a refused join instead of going quiet', async () => {
    await startRealtimeSync();
    expect(channels).toHaveLength(1);

    live().refuse();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(channels).toHaveLength(2);
    expect(channels[1].status).not.toBeNull();
  });

  it('backs off between refusals rather than retrying at event rate', async () => {
    await startRealtimeSync();

    live().refuse();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(channels).toHaveLength(2);

    live().refuse();
    await vi.advanceTimersByTimeAsync(2_000); // still inside the doubled delay
    expect(channels).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(channels).toHaveLength(3);
  });

  it('retries a sign-in that failed, so a terminal opened offline recovers', async () => {
    vi.mocked(signInDevice).mockResolvedValueOnce(false);

    expect(await startRealtimeSync()).toBe(false);
    expect(channels).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(channels).toHaveLength(1);
  });
});

describe('a pull that fails', () => {
  it('is retried, and the tables that answered are not', async () => {
    const channel = await subscribed();
    pulls.products.mockResolvedValueOnce(null);

    channel.emit('products');
    channel.emit('customers');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(callCounts()).toEqual({
      products: 1,
      customers: 1,
      categories: 0,
      transactions: 0,
      user_accounts: 0,
    });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(callCounts()).toEqual({
      products: 2,
      customers: 1,
      categories: 0,
      transactions: 0,
      user_accounts: 0,
    });
  });

  it('gives up rather than polling a table that always refuses', async () => {
    const channel = await subscribed();
    pulls.products.mockResolvedValue(null);

    channel.emit('products');
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    // The first attempt plus a bounded number of retries — not one every
    // backoff interval for as long as the till is open.
    expect(pulls.products.mock.calls.length).toBeLessThanOrEqual(6);
  });
});

describe('stopping', () => {
  it('cancels a batch that has not fired and unsubscribes the channel', async () => {
    const channel = await subscribed();

    channel.emit('products');
    stopRealtimeSync();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(pulls.products).not.toHaveBeenCalled();
    expect(channel.unsubscribes).toBe(1);
  });

  it('discards a pull already in flight rather than writing it', async () => {
    const channel = await subscribed();
    const slow = deferred<unknown[]>();
    pulls.transactions.mockReturnValue(slow.promise as ReturnType<typeof pullTransactions>);

    channel.emit('transactions');
    await vi.advanceTimersByTimeAsync(2_000);
    stopRealtimeSync();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    slow.resolve([{ id: 'late', items: [], total: 1 }] as any);
    await vi.advanceTimersByTimeAsync(0);

    expect(useTransactionStore.getState().transactions).toEqual([]);
  });

  it('stops a refused channel from resubscribing afterwards', async () => {
    await startRealtimeSync();

    live().refuse();
    stopRealtimeSync();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(channels).toHaveLength(1);
  });
});
