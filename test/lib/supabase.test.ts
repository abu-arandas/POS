import { describe, it, expect, vi } from 'vitest';
import {
  pullProducts,
  deleteRowsSupabase,
  DELETE_CHUNK_SIZE,
  PULL_PAGE_SIZE,
} from '../../src/lib/supabase';
import { SupabaseClient } from '@supabase/supabase-js';

// A pull walks the table by primary key, not by offset. The builder is
// chainable and thenable, so the mock has to be too:
// .select().order().limit()[.gt()][.eq()], with the terminal object awaited.
// `pages` is consumed one response per page.
function makeProductClient(pages: Array<{ data: unknown[] | null; error?: unknown }>) {
  const cursors: Array<string | null> = [];
  const limits: number[] = [];
  const orders: unknown[][] = [];
  const eq = vi.fn();
  let call = 0;

  // .order() returns the builder; .limit() ends one page and hands back a
  // terminal object that is both chainable (.gt for the cursor, .eq for the
  // store filter) and thenable, so `await query` resolves that page.
  const builder: Record<string, unknown> = {
    order: vi.fn((...args: unknown[]) => {
      orders.push(args);
      return builder;
    }),
    limit: vi.fn((n: number) => {
      limits.push(n);
      const index = cursors.push(null) - 1; // null until .gt() says otherwise
      const { data, error } = pages[call++] ?? { data: [] };
      const settled = Promise.resolve({ data, error: error ?? null });

      const terminal: Record<string, unknown> = {
        gt: vi.fn((_column: string, value: string) => {
          cursors[index] = value;
          return terminal;
        }),
        eq: vi.fn((...args: unknown[]) => {
          eq(...args);
          return terminal;
        }),
        then: settled.then.bind(settled),
      };
      return terminal;
    }),
  };

  const select = vi.fn(() => builder);
  const client = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;
  return { client, select, eq, cursors, limits, orders };
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
  it('maps rows and asks for a page keyed by primary key', async () => {
    const { client, select, limits, orders } = makeProductClient([
      { data: [productRow('1')] },
      { data: [] },
    ]);

    const result = await pullProducts(client);

    expect(select).toHaveBeenCalledWith('*');
    expect(orders[0]).toEqual(['id']);
    expect(limits[0]).toBe(PULL_PAGE_SIZE);
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

  it('carries the last id forward as the cursor, so offsets cannot shift', async () => {
    // Offset paging re-counts from the start of the result on every request, so
    // a sale rung up mid-pull slides a row across the page boundary and it is
    // fetched twice or missed. A keyset cursor has no such window.
    const { client, cursors } = makeProductClient([
      { data: [productRow('a'), productRow('b')] },
      { data: [productRow('c')] },
      { data: [] },
    ]);

    const result = await pullProducts(client);

    expect(result?.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(cursors).toEqual([null, 'b', 'c']);
  });

  it('confirms the end with an empty page rather than a short one', async () => {
    // A short page is exactly what a server-side row cap looks like, so it
    // cannot be read as "that was the last of them".
    const { client, cursors } = makeProductClient([{ data: [productRow('only')] }, { data: [] }]);
    await pullProducts(client);
    expect(cursors).toHaveLength(2);
  });

  it('filters by storeId when one is configured', async () => {
    const { client, eq } = makeProductClient([{ data: [] }]);
    const result = await pullProducts(client, 'store-123');
    expect(eq).toHaveBeenCalledWith('store_id', 'store-123');
    expect(result).toEqual([]);
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
