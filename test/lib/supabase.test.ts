import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pullProducts, deleteRowsSupabase, DELETE_CHUNK_SIZE } from '../../src/lib/supabase';
import { SupabaseClient } from '@supabase/supabase-js';

describe('pullProducts', () => {
  let mockClient: any;
  let mockSelect: any;
  let mockEq: any;

  beforeEach(() => {
    mockEq = vi.fn();
    mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    mockClient = {
      from: vi.fn().mockReturnValue({ select: mockSelect }),
    };
  });

  it('should return mapped products on success without storeId', async () => {
    const mockData = [
      {
        id: '1',
        name: 'Product 1',
        price: '10',
        cost: '5',
        category: 'Cat 1',
        sku: 'SKU1',
        stock: '100',
        min_stock: '10',
        image: 'img1.png',
      },
    ];
    mockSelect.mockResolvedValue({ data: mockData, error: null });

    const result = await pullProducts(mockClient as unknown as SupabaseClient);

    expect(mockClient.from).toHaveBeenCalledWith('products');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq).not.toHaveBeenCalled();
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
        image: 'img1.png',
      },
    ]);
  });

  it('should filter by storeId if provided', async () => {
    const mockData: any[] = [];
    const mockPromise = Promise.resolve({ data: mockData, error: null });
    mockEq.mockReturnValue(mockPromise);
    mockSelect.mockReturnValue({ eq: mockEq });

    const result = await pullProducts(mockClient as unknown as SupabaseClient, 'store-123');

    expect(mockClient.from).toHaveBeenCalledWith('products');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq).toHaveBeenCalledWith('store_id', 'store-123');
    expect(result).toEqual([]);
  });

  it('should handle null data', async () => {
    mockSelect.mockResolvedValue({ data: null, error: null });

    const result = await pullProducts(mockClient as unknown as SupabaseClient);

    expect(result).toEqual([]);
  });

  it('should handle errors and return null', async () => {
    const mockError = new Error('Database error');
    mockSelect.mockResolvedValue({ data: null, error: mockError });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await pullProducts(mockClient as unknown as SupabaseClient);

    expect(result).toBeNull();
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
