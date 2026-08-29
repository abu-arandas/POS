import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pushStoreCatalog } from '../../src/lib/fleetClient';
import { useSettingsStore } from '../../src/stores/settingsStore';
import * as supabaseLib from '../../src/lib/supabase';
import { Category, Product } from '../../src/types';

vi.mock('../../src/stores/settingsStore', () => ({
  useSettingsStore: { getState: vi.fn() },
}));

vi.mock('../../src/lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
  signInDevice: vi.fn(),
}));

const CATEGORIES: Category[] = [{ id: 'cat-9', name: 'Pastries', color: 'bg-amber-100' }];

const PRODUCTS: Product[] = [
  {
    id: 'prod-9',
    name: 'Croissant',
    price: 2.5,
    cost: 0.9,
    category: 'cat-9',
    sku: 'CRO-1',
    stock: 12,
    minStock: 3,
    image: '',
  },
];

/** A client whose rpc() resolves with the given result, recording every call. */
function mockClient(rpcResult: { error: unknown } = { error: null }) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const from = vi.fn();
  return { rpc, from };
}

function useClient(client: ReturnType<typeof mockClient>, signedIn = true) {
  vi.mocked(supabaseLib.getSupabaseClient).mockReturnValue(client as never);
  vi.mocked(supabaseLib.signInDevice).mockResolvedValue(signedIn);
  vi.mocked(useSettingsStore.getState).mockReturnValue({
    supabaseConfig: {
      enabled: true,
      url: 'https://test.supabase.co',
      anonKey: 'test-key',
      authEmail: 'device@example.com',
      authPassword: 'pw',
    },
  } as never);
}

describe('pushStoreCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('applies the whole catalog through a single transactional RPC', async () => {
    const client = mockClient();
    useClient(client);

    const ok = await pushStoreCatalog('store-2', CATEGORIES, PRODUCTS);

    expect(ok).toBe(true);
    // One request, not two: that is what makes the push atomic.
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.from).not.toHaveBeenCalled();

    const [fn, args] = client.rpc.mock.calls[0];
    expect(fn).toBe('push_store_catalog');
    expect(args.p_store_id).toBe('store-2');
    expect(args.p_categories).toEqual([{ id: 'cat-9', name: 'Pastries', color: 'bg-amber-100' }]);
    expect(args.p_products).toEqual([
      {
        id: 'prod-9',
        name: 'Croissant',
        price: 2.5,
        cost: 0.9,
        category: 'cat-9',
        sku: 'CRO-1',
        stock: 12,
        min_stock: 3,
        image: '',
      },
    ]);
  });

  it('sends an unset product category as NULL so the category FK resolves', async () => {
    const client = mockClient();
    useClient(client);

    await pushStoreCatalog('store-2', [], [{ ...PRODUCTS[0], category: '' }]);

    expect(client.rpc.mock.calls[0][1].p_products[0].category).toBeNull();
  });

  // The regression this RPC exists for: as two upserts, a product failure left
  // the categories from the first request behind and still reported false.
  it('reports failure without leaving a partial write behind', async () => {
    const client = mockClient({ error: { message: 'products upsert rejected' } });
    useClient(client);

    const ok = await pushStoreCatalog('store-2', CATEGORIES, PRODUCTS);

    expect(ok).toBe(false);
    // The categories cannot have been committed separately, because there was
    // never a separate request for them to be committed by.
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('reports failure when the RPC throws', async () => {
    const client = mockClient();
    client.rpc.mockRejectedValue(new Error('network down'));
    useClient(client);

    await expect(pushStoreCatalog('store-2', CATEGORIES, PRODUCTS)).resolves.toBe(false);
  });

  it('skips the round trip when there is nothing to push', async () => {
    const client = mockClient();
    useClient(client);

    await expect(pushStoreCatalog('store-2', [], [])).resolves.toBe(true);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('does nothing without an authenticated session', async () => {
    const client = mockClient();
    useClient(client, false);

    await expect(pushStoreCatalog('store-2', CATEGORIES, PRODUCTS)).resolves.toBe(false);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('does nothing when cloud sync is disabled', async () => {
    const client = mockClient();
    vi.mocked(supabaseLib.getSupabaseClient).mockReturnValue(client as never);
    vi.mocked(useSettingsStore.getState).mockReturnValue({
      supabaseConfig: { enabled: false, url: '', anonKey: '' },
    } as never);

    await expect(pushStoreCatalog('store-2', CATEGORIES, PRODUCTS)).resolves.toBe(false);
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
