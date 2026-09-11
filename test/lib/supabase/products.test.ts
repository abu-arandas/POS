import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  pushProducts,
  pushCategories,
  pullCategories,
  toProductRow,
} from '../../../src/lib/supabase/products';
import { makePagedClient, servingOnePage } from './pageClient';
import { PULL_PAGE_SIZE } from '../../../src/lib/supabase/sync-utils';
import type { Category, Product } from '../../../src/types';

// pullProducts is covered in test/lib/supabase.test.ts. The rest of this module
// — the two pushes and the category pull — was not, which left the catalogue
// half of cloud sync resting on the assumption that the mappers were right. A
// column written under the wrong name pushes cleanly and comes back missing;
// the first anyone hears of it is a till showing the wrong price.

const product: Product = {
  id: 'PROD-1',
  name: 'Flat White',
  price: 4.5,
  cost: 1.2,
  category: 'cat-coffee',
  sku: 'FW-001',
  stock: 24,
  minStock: 6,
  image: 'https://example.com/fw.png',
};

const category: Category = { id: 'cat-coffee', name: 'Coffee', color: '#6f4e37' };

/** Captures whatever push hands to `upsert`, without a network. */
function capturingClient() {
  const upserted: Record<string, unknown>[] = [];
  const from = vi.fn(() => ({
    upsert: (rows: Record<string, unknown>[]) => (upserted.push(...rows), { error: null }),
  }));
  return { client: { from } as unknown as SupabaseClient, from, upserted };
}

const rejectingClient = () =>
  ({
    from: () => ({ upsert: () => ({ error: { message: 'connection failure' } }) }),
  }) as unknown as SupabaseClient;

describe('product sync', () => {
  it('sends nothing, and reports success, for an empty list', async () => {
    const { client, upserted } = capturingClient();
    expect(await pushProducts(client, [])).toBe(true);
    expect(upserted).toHaveLength(0);
  });

  it('maps every field to its column', async () => {
    const { client, from, upserted } = capturingClient();
    expect(await pushProducts(client, [product])).toBe(true);

    expect(from).toHaveBeenCalledWith('products');
    expect(upserted[0]).toEqual({
      id: 'PROD-1',
      name: 'Flat White',
      price: 4.5,
      cost: 1.2,
      category: 'cat-coffee',
      sku: 'FW-001',
      stock: 24,
      min_stock: 6,
      image: 'https://example.com/fw.png',
    });
  });

  it('writes an unset category as SQL NULL, not an empty id', () => {
    // products.category is a foreign key. '' is not a category that exists, so
    // the row would be rejected outright — and the product would never sync.
    expect(toProductRow({ ...product, category: '' }).category).toBeNull();
  });

  it('stamps the store id on the way out when one is configured', async () => {
    const { client, upserted } = capturingClient();
    await pushProducts(client, [product], 'store-7');
    expect(upserted[0].store_id).toBe('store-7');
  });

  it('leaves the row unstamped in single-store mode', async () => {
    const { client, upserted } = capturingClient();
    await pushProducts(client, [product]);
    expect(upserted[0]).not.toHaveProperty('store_id');
  });

  it('reports failure rather than claiming a failed push succeeded', async () => {
    // The outbox decides whether to retry from this boolean, so a push that
    // reports success on a rejected write is a row silently dropped.
    expect(await pushProducts(rejectingClient(), [product])).toBe(false);
  });

  it('reports failure when the request itself rejects', async () => {
    const client = {
      from: () => ({
        upsert: () => Promise.reject(new Error('socket hang up')),
      }),
    } as unknown as SupabaseClient;
    expect(await pushProducts(client, [product])).toBe(false);
  });
});

describe('category sync', () => {
  it('sends nothing, and reports success, for an empty list', async () => {
    const { client, upserted } = capturingClient();
    expect(await pushCategories(client, [])).toBe(true);
    expect(upserted).toHaveLength(0);
  });

  it('round-trips a category', async () => {
    const { client, from, upserted } = capturingClient();
    expect(await pushCategories(client, [category])).toBe(true);
    expect(from).toHaveBeenCalledWith('categories');

    const pulled = await pullCategories(servingOnePage(upserted).client);
    expect(pulled).toEqual([category]);
  });

  it('stamps and strips the store id around the round trip', async () => {
    const { client, upserted } = capturingClient();
    await pushCategories(client, [category], 'store-7');
    expect(upserted[0].store_id).toBe('store-7');

    // store_id is a sync-only column; the domain object must not grow one, or
    // it ends up written back into local state and into the next push.
    const pulled = await pullCategories(servingOnePage(upserted).client);
    expect(pulled).toEqual([category]);
    expect(pulled?.[0]).not.toHaveProperty('store_id');
  });

  it('reports failure rather than claiming a failed push succeeded', async () => {
    expect(await pushCategories(rejectingClient(), [category])).toBe(false);
  });

  it('returns null, not an empty list, when the pull fails', async () => {
    // An empty array means "the cloud has no categories" and replaces local
    // data; null means "ask again later". Conflating them empties the menu.
    const { client } = makePagedClient([{ data: null, error: { message: 'nope' } }]);
    expect(await pullCategories(client)).toBeNull();
  });
});

describe('how the category pull walks the table', () => {
  it('asks for a page ordered by primary key', async () => {
    const { client, select, orders, limits } = makePagedClient([{ data: [] }]);
    await pullCategories(client);
    expect(select).toHaveBeenCalledWith('*');
    expect(orders[0]).toEqual(['id']);
    expect(limits[0]).toBe(PULL_PAGE_SIZE);
  });

  it('carries the last id forward as the cursor and accumulates every page', async () => {
    const row = (id: string) => ({ ...category, id });
    const { client, cursors } = makePagedClient([
      { data: [row('a'), row('b')] },
      { data: [row('c')] },
      { data: [] },
    ]);

    const pulled = await pullCategories(client);

    expect(pulled?.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(cursors).toEqual([null, 'b', 'c']);
  });

  it('filters by store when one is configured, and not when it is not', async () => {
    const scoped = makePagedClient([{ data: [] }]);
    await pullCategories(scoped.client, 'store-7');
    expect(scoped.eq).toHaveBeenCalledWith('store_id', 'store-7');

    const unscoped = makePagedClient([{ data: [] }]);
    await pullCategories(unscoped.client);
    expect(unscoped.eq).not.toHaveBeenCalled();
  });
});
