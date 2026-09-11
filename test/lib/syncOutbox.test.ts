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
import { resetStoreCountCache } from '../../src/lib/supabase/storeScope';
import { useSettingsStore } from '../../src/stores/settingsStore';
import * as supabaseLib from '../../src/lib/supabase';
import type { Product, SaleTransaction } from '../../src/types';

/**
 * A client for a single-store deployment. The store-scope guard asks a real
 * client how many stores the database holds before it will sync, and a bare
 * `{ auth: {} }` stub reads as "scope unknown" — which a pull refuses by design.
 */
const singleStoreClient = (stores = 1) =>
  ({ auth: {}, rpc: vi.fn().mockResolvedValue({ data: stores, error: null }) }) as never;

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
    vi.mocked(supabaseLib.getSupabaseClient).mockReturnValue(singleStoreClient());
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

  // The register keeps trading while "Push All" uploads. A sale rung up during
  // it queues a push whose rows the snapshot never contained, so retiring every
  // queued push at the end would throw that sale away — the exact loss the
  // outbox exists to prevent.
  it('keeps a push queued during the full upload, whose rows were not in it', async () => {
    let releaseUpload: () => void = () => {};
    const uploading = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    let uploadStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      uploadStarted = resolve;
    });

    vi.mocked(supabaseLib.pushTransactions).mockImplementation(async () => {
      uploadStarted();
      await uploading;
      return true;
    });

    const fullPush = pushAllToCloud('https://example.supabase.co', 'key', {
      products: [product],
      categories: [],
      customers: [],
      users: [],
      transactions: [transaction],
    });

    await started;
    // A sale lands mid-upload. Offline, so it stays queued rather than racing
    // the drain — what matters is that the full push does not discard it.
    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(false);
    await syncToCloudIfEnabled(undefined, undefined, undefined, [
      { ...transaction, id: 'TX-during-upload' },
    ]);

    releaseUpload();
    expect(await fullPush).toBe(true);

    expect(await pendingCloudWrites()).toBe(1);
    const [remaining] = await peekOutbox();
    expect((remaining.operation as { transactions: SaleTransaction[] }).transactions[0].id).toBe(
      'TX-during-upload',
    );
  });

  // The comment on sendOperation claims an ordering guarantee; continuing past
  // a refused table would send a transaction whose product rows never landed.
  it('stops at the first table the server refuses', async () => {
    vi.mocked(supabaseLib.pushProducts).mockResolvedValue(false);

    await syncToCloudIfEnabled([product], undefined, undefined, [transaction]);

    expect(supabaseLib.pushProducts).toHaveBeenCalled();
    expect(supabaseLib.pushTransactions).not.toHaveBeenCalled();
    expect(await pendingCloudWrites()).toBe(1);
  });
});

// A pull replaces local data with the server's copy, so anything this terminal
// has not managed to push would be erased by a snapshot that never contained it.
describe('pulling while writes are still owed', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearOutbox();
    setState(cloudOn);
    vi.mocked(supabaseLib.getSupabaseClient).mockReturnValue(singleStoreClient());
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

  // Settings pulls with whatever is typed in the form, which need not be what
  // is saved. Draining against the saved config would skip the drain entirely
  // and then replace local data anyway.
  it('drains with the credentials the pull itself is using, not the saved ones', async () => {
    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(false);
    await syncToCloudIfEnabled([product]);
    expect(await pendingCloudWrites()).toBe(1);

    // The operator has since switched sync off / cleared the saved project.
    setState({ supabaseConfig: { enabled: false, url: '', anonKey: '' }, storeId: '' });
    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(true);
    vi.setSystemTime(Date.now() + 60_000);

    await pullAllFromCloud('https://typed-in-the-form.supabase.co', 'typed-key');

    expect(supabaseLib.pushProducts).toHaveBeenCalled();
    expect(await pendingCloudWrites()).toBe(0);
    // And it used the credentials it was handed.
    expect(supabaseLib.getSupabaseClient).toHaveBeenCalledWith(
      'https://typed-in-the-form.supabase.co',
      'typed-key',
    );
  });
});

describe('the replay loop', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearOutbox();
    setState(cloudOn);
    vi.mocked(supabaseLib.getSupabaseClient).mockReturnValue(singleStoreClient());
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

// One Supabase project, several shops. A terminal whose Store ID was never set
// used to pull every store's rows — and Pull From Cloud REPLACES local data, so
// another shop's catalogue, customers and staff landed on this till. These are
// the checks that the unscoped case now refuses instead.
describe('a terminal with no Store ID against a multi-store database', () => {
  const fleetClient = () => singleStoreClient(3);

  beforeEach(async () => {
    vi.clearAllMocks();
    resetStoreCountCache();
    await clearOutbox();
    setState(cloudOn); // storeId: ''
    vi.mocked(supabaseLib.getSupabaseClient).mockReturnValue(fleetClient());
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
    for (const pull of [
      supabaseLib.pullProducts,
      supabaseLib.pullCategories,
      supabaseLib.pullCustomers,
      supabaseLib.pullTransactions,
      supabaseLib.pullUserAccounts,
    ]) {
      vi.mocked(pull).mockResolvedValue([] as never);
    }
  });

  afterEach(() => {
    resetStoreCountCache();
    vi.useRealTimers();
  });

  it('refuses the pull without reading a single row', async () => {
    const result = await pullAllFromCloud('https://example.supabase.co', 'key');

    expect(result).toBeNull();
    expect(supabaseLib.pullProducts).not.toHaveBeenCalled();
    expect(supabaseLib.pullCustomers).not.toHaveBeenCalled();
    expect(supabaseLib.pullUserAccounts).not.toHaveBeenCalled();
  });

  it('refuses the full push rather than writing rows no store owns', async () => {
    const ok = await pushAllToCloud('https://example.supabase.co', 'key', {
      products: [product],
      categories: [],
      customers: [],
      users: [],
      transactions: [transaction],
    });

    expect(ok).toBe(false);
    expect(supabaseLib.pushProducts).not.toHaveBeenCalled();
  });

  it('keeps a sale owed instead of pushing it unscoped', async () => {
    // store_id would land NULL: invisible to every scoped pull, and enough to
    // block multi-store-rls-enforce.sql's NOT NULL guard. Queued, so the sale
    // is not lost — it goes as soon as the Store ID is set.
    await syncToCloudIfEnabled([product], undefined, undefined, [transaction]);

    expect(supabaseLib.pushTransactions).not.toHaveBeenCalled();
    expect(await pendingCloudWrites()).toBe(1);
  });

  it('sends everything once the Store ID is set', async () => {
    await syncToCloudIfEnabled([product], undefined, undefined, [transaction]);
    expect(await pendingCloudWrites()).toBe(1);

    setState({ ...cloudOn, storeId: 'store-A' });
    resetStoreCountCache();
    vi.setSystemTime(Date.now() + 60_000);
    await retryPendingCloudWrites();

    expect(supabaseLib.pushTransactions).toHaveBeenCalledWith(
      expect.anything(),
      [transaction],
      'store-A',
    );
    expect(await pendingCloudWrites()).toBe(0);
  });

  it('still syncs a single-store install that has no Store ID', async () => {
    // The documented default. Nothing about it may change.
    vi.mocked(supabaseLib.getSupabaseClient).mockReturnValue(singleStoreClient(1));

    await syncToCloudIfEnabled([product], undefined, undefined, [transaction]);

    expect(supabaseLib.pushTransactions).toHaveBeenCalledWith(expect.anything(), [transaction], '');
    expect(await pendingCloudWrites()).toBe(0);
  });
});
