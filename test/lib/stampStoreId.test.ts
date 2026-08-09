import { describe, it, expect } from 'vitest';
import { stampStoreId } from '../../src/lib/supabase';

describe('stampStoreId', () => {
  it('adds store_id to every record when a store scope is set', () => {
    const out = stampStoreId([{ id: 'a' }, { id: 'b' }], 'store-1');
    expect(out).toEqual([
      { id: 'a', store_id: 'store-1' },
      { id: 'b', store_id: 'store-1' },
    ]);
  });

  it('is a no-op in single-store mode (empty/undefined storeId)', () => {
    const records = [{ id: 'a' }, { id: 'b' }];
    expect(stampStoreId(records, '')).toBe(records); // same reference — unchanged payload
    expect(stampStoreId(records, undefined)).toBe(records);
  });

  it('does not mutate the input records', () => {
    const records = [{ id: 'a' }];
    stampStoreId(records, 'store-1');
    expect(records[0]).toEqual({ id: 'a' }); // original untouched
  });

  it('handles an empty array', () => {
    const out = stampStoreId([], 'store-1');
    expect(out).toEqual([]);
  });

  it('overwrites an existing store_id if present', () => {
    const records = [{ id: 'a', store_id: 'old-store' }];
    const out = stampStoreId(records, 'new-store');
    expect(out).toEqual([{ id: 'a', store_id: 'new-store' }]);
  });

  it('preserves all other properties on the input objects', () => {
    const records = [{ id: 'a', name: 'Product A', price: 100, active: true }];
    const out = stampStoreId(records, 'store-1');
    expect(out).toEqual([
      { id: 'a', name: 'Product A', price: 100, active: true, store_id: 'store-1' }
    ]);
  });
});
