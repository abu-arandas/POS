import { describe, it, expect, vi } from 'vitest';
import {
  pullProducts,
  deleteRowsSupabase,
  DELETE_CHUNK_SIZE,
  PULL_PAGE_SIZE,
} from '../../src/lib/supabase';
import { SupabaseClient } from '@supabase/supabase-js';

// A pull walks the table in pages. The builder is chainable and thenable, so
// the mock has to be too: .select().order().range() and an optional .eq(), with
// the terminal object awaited. `pages` is consumed one response per range call.
function makeProductClient(pages: Array<{ data: unknown[] | null; error?: unknown }>) {
  const ranges: Array<[number, number]> = [];
  const eq = vi.fn();
  const orders: unknown[][] = [];
  let call = 0;

  const builder: Record<string, unknown> = {
    order: vi.fn((...args: unknown[]) => {
      orders.push(args);
      return builder;
    }),
    range: vi.fn((from: number, to: number) => {
      ranges.push([from, to]);
      const page = pages[call++] ?? { data: [] };
      const settled = Promise.resolve({ data: page.data, error: page.error ?? null });
      // The range() result must still expose .eq() — pullProducts appends the
      // store filter after range() — and must be awaitable.
      return {
        eq: eq.mockReturnValue(settled),
        then: settled.then.bind(settled),
      };
    }),
  };

  const select = vi.fn(() => builder);
  const client = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;
  return { client, select, eq, ranges, orders };
}

const productRow = (id: string) => ({
  id,
  name: `Product ${id}`,
  price: '10',
  cost: '5',
  category: 'Cat 1',
  sku: `SKU${id}`,
  stock: '100',
  min_stock: '10',
  image: 'img.png',
});

describe('pullProducts', () => {
  it('maps rows, and confirms the end with an empty page rather than a short one', async () => {
    // A short page is exactly what a server-side row cap looks like, so it
    // cannot be treated as "that was the last of them". Only an empty page ends
    // the walk — hence the second range call here for a single-row table.
    const { client, select, eq, ranges } = makeProductClient([{ data: [productRow('1')] }]);

    const result = await pullProducts(client);

    expect(select).toHaveBeenCalledWith('*');
    expect(eq).not.toHaveBeenCalled();
    expect(ranges).toEqual([
      [0, PULL_PAGE_SIZE - 1],
      [1, PULL_PAGE_SIZE],
    ]);
    expect(result).toEqual([
      {
        id: '1',
        name: 'Product 1',
        price: 10,
        cost: 5,
        category: 'Cat 1',
        sku: 'SKU1',
        stock: 100,
        minStock: 10,
        image: 'img.png',
      },
    ]);
  });

  it('orders the query, because paging an unordered table skips and repeats rows', async () => {
    const { client, orders } = makeProductClient([{ data: [] }]);
    await pullProducts(client);
    expect(orders).toEqual([['id']]);
  });

  it('filters by storeId when one is configured', async () => {
    const { client, eq } = makeProductClient([{ data: [] }]);
    const result = await pullProducts(client, 'store-123');
    expect(eq).toHaveBeenCalledWith('store_id', 'store-123');
    expect(result).toEqual([]);
  });

  it('walks every page until one comes back empty', async () => {
    const full = Array.from({ length: PULL_PAGE_SIZE }, (_, i) => productRow(`p${i}`));
    const { client, ranges } = makeProductClient([
      { data: full },
      { data: [productRow('last')] },
      { data: [] },
    ]);

    const result = await pullProducts(client);

    expect(result).toHaveLength(PULL_PAGE_SIZE + 1);
    expect(ranges).toEqual([
      [0, PULL_PAGE_SIZE - 1],
      [PULL_PAGE_SIZE, PULL_PAGE_SIZE * 2 - 1],
      [PULL_PAGE_SIZE + 1, PULL_PAGE_SIZE * 2],
    ]);
  });

  it('advances by rows received, so a server-side row cap cannot skip rows', async () => {
    // The server caps responses below PULL_PAGE_SIZE. Advancing by the page
    // size we *asked* for would jump straight past everything it withheld —
    // and because "Pull From Cloud" replaces all local data, those rows would
    // be silently destroyed rather than merely missed.
    const capped = Array.from({ length: 500 }, (_, i) => productRow(`c${i}`));
    const { client, ranges } = makeProductClient([{ data: capped }, { data: [] }]);

    const result = await pullProducts(client);

    expect(result).toHaveLength(500);
    expect(ranges[1]).toEqual([500, 500 + PULL_PAGE_SIZE - 1]);
  });

  it('treats a null page as the end rather than crashing', async () => {
    const { client } = makeProductClient([{ data: null }]);
    await expect(pullProducts(client)).resolves.toEqual([]);
  });

  it('returns null and reports when a page errors', async () => {
    const mockError = new Error('Database error');
    const { client } = makeProductClient([{ data: null, error: mockError }]);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(pullProducts(client)).resolves.toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith('Failed pulling products:', mockError);

    consoleSpy.mockRestore();
  });
});

// A single `.in('id', ids)` puts every id in the query string. "Delete All
// Transactions" on a busy terminal built a URL past what proxies and PostgREST
// accept, and the request failed after the local rows were already gone.
describe('deleteRowsSupabase', () => {
  const makeClient = () => {
    const inFn = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ in: inFn });
    const client = { from: vi.fn().mockReturnValue({ delete: del }) };
    return { client: client as unknown as SupabaseClient, inFn };
  };

  it('sends a single request when the ids fit in one chunk', async () => {
    const { client, inFn } = makeClient();
    const ids = Array.from({ length: 10 }, (_, i) => `tx-${i}`);
    await expect(deleteRowsSupabase(client, 'transactions', ids)).resolves.toBe(true);
    expect(inFn).toHaveBeenCalledTimes(1);
    expect(inFn).toHaveBeenCalledWith('id', ids);
  });

  it('splits a large delete into bounded chunks covering every id exactly once', async () => {
    const { client, inFn } = makeClient();
    const ids = Array.from({ length: DELETE_CHUNK_SIZE * 2 + 7 }, (_, i) => `tx-${i}`);
    await expect(deleteRowsSupabase(client, 'transactions', ids)).resolves.toBe(true);

    expect(inFn).toHaveBeenCalledTimes(3);
    const sent = inFn.mock.calls.flatMap((call) => call[1] as string[]);
    expect(sent).toEqual(ids);
    for (const call of inFn.mock.calls) {
      expect((call[1] as string[]).length).toBeLessThanOrEqual(DELETE_CHUNK_SIZE);
    }
  });

  it('reports failure but still attempts every remaining chunk', async () => {
    // The local rows are already deleted, so abandoning the rest of the chunks
    // would strand them in the cloud to resurrect on the next pull for nothing.
    const inFn = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'boom' } })
      .mockResolvedValueOnce({ error: null });
    const del = vi.fn().mockReturnValue({ in: inFn });
    const client = { from: vi.fn().mockReturnValue({ delete: del }) } as unknown as SupabaseClient;

    const ids = Array.from({ length: DELETE_CHUNK_SIZE * 3 }, (_, i) => `tx-${i}`);
    await expect(deleteRowsSupabase(client, 'transactions', ids)).resolves.toBe(false);
    expect(inFn).toHaveBeenCalledTimes(3);
    expect(inFn.mock.calls.flatMap((call) => call[1] as string[])).toEqual(ids);
  });

  it('reports failure when the request itself rejects, not just on an error result', async () => {
    const inFn = vi.fn().mockRejectedValue(new Error('network down'));
    const del = vi.fn().mockReturnValue({ in: inFn });
    const client = { from: vi.fn().mockReturnValue({ delete: del }) } as unknown as SupabaseClient;

    await expect(deleteRowsSupabase(client, 'products', ['p1', 'p2'])).resolves.toBe(false);
  });

  it('makes no request at all for an empty id list', async () => {
    const { client, inFn } = makeClient();
    await expect(deleteRowsSupabase(client, 'transactions', [])).resolves.toBe(true);
    expect(inFn).not.toHaveBeenCalled();
  });
});
