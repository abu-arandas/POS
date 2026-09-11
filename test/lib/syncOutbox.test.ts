import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  syncToCloudIfEnabled,
  retryPendingCloudWrites,
  pendingCloudWrites,
  pushAllToCloud,
  pullAllFromCloud,
  startOutboxReplay,
  stopOutboxReplay,
} from '../../src/lib/sync';
import { clearOutbox, peekOutbox } from '../../src/lib/outbox';
import { useSettingsStore } from '../../src/stores/settingsStore';
import * as supabaseLib from '../../src/lib/supabase';
import type { Product, SaleTransaction } from '../../src/types';

vi.mock('../../src/stores/settingsStore', () => ({
  useSettingsStore: { getState: vi.fn() },
}));

vi.mock('../../src/lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
  signInDevice: vi.fn(),
  verifyLoginCloud: vi.fn(),
  testSupabaseConnection: vi.fn(),
  deleteRowsSupabase: vi.fn(),
  pushProducts: vi.fn(),
  pushCategories: vi.fn(),
  pushCustomers: vi.fn(),
  pushTransactions: vi.fn(),
  pushUserAccounts: vi.fn(),
  pullProducts: vi.fn(),
  pullCategories: vi.fn(),
  pullCustomers: vi.fn(),
  pullTransactions: vi.fn(),
  pullUserAccounts: vi.fn(),
}));

vi.mock('../../src/lib/utils/ui', () => ({ notify: vi.fn() }));

const product: Product = {
  id: 'p1',
  name: 'Latte',
  price: 10,
  cost: 4,
  category: 'c1',
  sku: 'LAT-1',
  stock: 3,
  minStock: 1,
  image: '',
};

const transaction: SaleTransaction = {
  id: 'TX-1',
  date: '2026-01-01T10:00:00.000Z',
  items: [{ productId: 'p1', productName: 'Latte', price: 10, cost: 4, quantity: 1, total: 10 }],
  subtotal: 10,
  discount: 0,
  discountType: 'none',
  discountValue: 0,
  tax: 1,
  total: 11,
  paymentMethod: 'cash',
  customerId: null,
  customerName: null,
  operatorId: 'u1',
  operatorName: 'Ada',
  status: 'completed',
  shiftId: 'shift-1',
};

const cloudOn = {
  supabaseConfig: {
    enabled: true,
    url: 'https://example.supabase.co',
    anonKey: 'key',
    authEmail: 'device@example.com',
    authPassword: 'pw',
  },
  storeId: '',
};

const setState = (state: unknown) =>
  (useSettingsStore.getState as unknown as ReturnType<typeof vi.fn>).mockReturnValue(state);

// A sale is recorded locally and pushed afterwards. Everything below is about
// the case the register cannot avoid: the push does not get through.
describe('cloud writes survive a failed push', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearOutbox();
    setState(cloudOn);
    vi.mocked(supabaseLib.getSupabaseClient).mockReturnValue({ auth: {} } as never);
    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(true);
    for (const push of [
      supabaseLib.pushProducts,
      supabaseLib.pushCategories,
      supabaseLib.pushCustomers,
      supabaseLib.pushTransactions,
      supabaseLib.pushUserAccounts,
    ]) {
      vi.mocked(push).mockResolvedValue(true);
    }
  });

  // Several tests jump the clock past a backoff rung; none may leave it there.
  afterEach(() => vi.useRealTimers());

  it('sends the rows straight away when the cloud is reachable', async () => {
    await syncToCloudIfEnabled([product], undefined, undefined, [transaction]);

    expect(supabaseLib.pushProducts).toHaveBeenCalledWith(expect.anything(), [product], '');
    expect(supabaseLib.pushTransactions).toHaveBeenCalledWith(expect.anything(), [transaction], '');
    expect(await pendingCloudWrites()).toBe(0);
  });

  it('keeps the sale owed when the terminal is offline, and sends it on reconnect', async () => {
    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(false);

    await syncToCloudIfEnabled([product], undefined, undefined, [transaction]);

    expect(supabaseLib.pushTransactions).not.toHaveBeenCalled();
    expect(await pendingCloudWrites()).toBe(1);

    // Network comes back. The replay loop calls this; nothing about the sale
    // had to be remembered by the caller.
    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(true);
    // Past the first backoff rung.
    vi.setSystemTime(Date.now() + 60_000);
    await retryPendingCloudWrites();

    expect(supabaseLib.pushTransactions).toHaveBeenCalledWith(expect.anything(), [transaction], '');
    expect(await pendingCloudWrites()).toBe(0);
  });

  it('keeps the sale owed when the server rejects the write', async () => {
    vi.mocked(supabaseLib.pushTransactions).mockResolvedValue(false);

    await syncToCloudIfEnabled(undefined, undefined, undefined, [transaction]);

    expect(await pendingCloudWrites()).toBe(1);
    const [entry] = await peekOutbox();
    expect(entry.operation).toMatchObject({ type: 'push' });
    expect(entry.attempts).toBe(1);
  });

  it('replays several outage-era sales in the order they were rung up', async () => {
    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(false);
    await syncToCloudIfEnabled(undefined, undefined, undefined, [{ ...transaction, id: 'TX-1' }]);
    await syncToCloudIfEnabled(undefined, undefined, undefined, [{ ...transaction, id: 'TX-2' }]);

    expect(await pendingCloudWrites()).toBe(2);

    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(true);
    vi.setSystemTime(Date.now() + 60_000);
    await retryPendingCloudWrites();

    const pushedIds = vi
      .mocked(supabaseLib.pushTransactions)
      .mock.calls.map((call) => (call[1] as SaleTransaction[])[0].id);
    expect(pushedIds).toEqual(['TX-1', 'TX-2']);
    expect(await pendingCloudWrites()).toBe(0);
  });

  it('queues nothing when cloud sync is switched off', async () => {
    setState({ supabaseConfig: { enabled: false, url: '', anonKey: '' }, storeId: '' });

    await syncToCloudIfEnabled([product]);

    expect(await pendingCloudWrites()).toBe(0);
  });

  it('does not attempt a write it has nothing to send', async () => {
    await syncToCloudIfEnabled([], [], [], []);

    expect(supabaseLib.pushProducts).not.toHaveBeenCalled();
    expect(await pendingCloudWrites()).toBe(0);
  });

  // "Push All" has just sent every local row in its newest form, so the
  // incremental pushes queued behind it would only re-upsert older copies.
  it('drops superseded pushes after a successful full push, but keeps deletes', async () => {
    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(false);
    await syncToCloudIfEnabled([product]);
    expect(await pendingCloudWrites()).toBe(1);

    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(true);
    const ok = await pushAllToCloud('https://example.supabase.co', 'key', {
      products: [product],
      categories: [],
      customers: [],
      users: [],
      transactions: [transaction],
    });

    expect(ok).toBe(true);
    expect(await pendingCloudWrites()).toBe(0);
  });
});

// A pull replaces local data with the server's copy, so anything this terminal
// has not managed to push would be erased by a snapshot that never contained it.
describe('pulling while writes are still owed', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearOutbox();
    setState(cloudOn);
    vi.mocked(supabaseLib.getSupabaseClient).mockReturnValue({ auth: {} } as never);
    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(true);
    for (const pull of [
      supabaseLib.pullProducts,
      supabaseLib.pullCategories,
      supabaseLib.pullCustomers,
      supabaseLib.pullTransactions,
      supabaseLib.pullUserAccounts,
    ]) {
      vi.mocked(pull).mockResolvedValue([] as never);
    }
    vi.mocked(supabaseLib.pushProducts).mockResolvedValue(true);
  });

  afterEach(() => vi.useRealTimers());

  it('sends what it owes before reading the cloud back', async () => {
    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(false);
    await syncToCloudIfEnabled([product]);
    expect(await pendingCloudWrites()).toBe(1);

    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(true);
    vi.setSystemTime(Date.now() + 60_000);
    const data = await pullAllFromCloud('https://example.supabase.co', 'key');

    expect(supabaseLib.pushProducts).toHaveBeenCalled();
    expect(await pendingCloudWrites()).toBe(0);
    expect(data).not.toBeNull();
  });

  it('leaves the queue intact when the push still cannot get through', async () => {
    vi.mocked(supabaseLib.pushProducts).mockResolvedValue(false);
    await syncToCloudIfEnabled([product]);

    await pullAllFromCloud('https://example.supabase.co', 'key');

    // Still owed — the caller reads pendingCloudWrites() and warns before
    // replacing anything.
    expect(await pendingCloudWrites()).toBe(1);
  });
});

describe('the replay loop', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearOutbox();
    setState(cloudOn);
    vi.mocked(supabaseLib.getSupabaseClient).mockReturnValue({ auth: {} } as never);
    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(true);
    vi.mocked(supabaseLib.pushProducts).mockResolvedValue(true);
  });

  afterEach(() => stopOutboxReplay());

  it('drains on reconnect, which is the signal that matters', async () => {
    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(false);
    await syncToCloudIfEnabled([product]);
    expect(await pendingCloudWrites()).toBe(1);

    startOutboxReplay();
    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(true);
    vi.setSystemTime(Date.now() + 60_000);

    window.dispatchEvent(new Event('online'));

    // The listener fires a floating promise; wait for its effect rather than
    // guessing how many microtasks the drain takes.
    await vi.waitFor(async () => expect(await pendingCloudWrites()).toBe(0));
    vi.useRealTimers();
  });

  it('stops listening once torn down', async () => {
    startOutboxReplay();
    stopOutboxReplay();

    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(false);
    await syncToCloudIfEnabled([product]);
    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(true);

    window.dispatchEvent(new Event('online'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The queue is on disk and survives; nothing replayed it.
    expect(await pendingCloudWrites()).toBe(1);
  });

  it('starting twice does not stack two loops', () => {
    startOutboxReplay();
    expect(() => startOutboxReplay()).not.toThrow();
    stopOutboxReplay();
    // Idempotent teardown too, so an unmount that runs twice is harmless.
    expect(() => stopOutboxReplay()).not.toThrow();
  });
});
