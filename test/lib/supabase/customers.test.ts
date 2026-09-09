import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { pushCustomers, pullCustomers } from '../../../src/lib/supabase/customers';
import { makePagedClient, servingOnePage } from './pageClient';
import { PULL_PAGE_SIZE } from '../../../src/lib/supabase/sync-utils';
import type { Customer } from '../../../src/types';

// The customer mapper is the only place the camelCase domain object and the
// snake_case table meet, and nothing exercised it. A column written but never
// read back — a name typo on one side, a field forgotten on the other — fails
// silently: the push succeeds, the pull returns a row missing that field, and
// the loss only shows up when a regular's points are gone.

const customer: Customer = {
  id: 'CUST-1',
  name: 'Grace Hopper',
  email: 'grace@example.com',
  phone: '+1 555 0100',
  points: 240,
  createdAt: '2026-01-04',
};

/** Captures whatever push hands to `upsert`, without a network. */
function capturingClient() {
  const upserted: Record<string, unknown>[] = [];
  const client = {
    from: () => ({
      upsert: (rows: Record<string, unknown>[]) => (upserted.push(...rows), { error: null }),
    }),
  } as unknown as SupabaseClient;
  return { client, upserted };
}

describe('customer sync', () => {
  it('sends nothing, and reports success, for an empty list', async () => {
    const { client, upserted } = capturingClient();
    expect(await pushCustomers(client, [])).toBe(true);
    expect(upserted).toHaveLength(0);
  });

  it('round-trips every field', async () => {
    const { client, upserted } = capturingClient();
    expect(await pushCustomers(client, [customer])).toBe(true);
    expect(upserted[0].created_at).toBe('2026-01-04');

    const pulled = await pullCustomers(servingOnePage(upserted).client);
    expect(pulled).toEqual([customer]);
  });

  it('stamps the store id on the way out when one is configured', async () => {
    const { client, upserted } = capturingClient();
    await pushCustomers(client, [customer], 'store-7');
    expect(upserted[0].store_id).toBe('store-7');
  });

  it('leaves the row unstamped in single-store mode', async () => {
    const { client, upserted } = capturingClient();
    await pushCustomers(client, [customer]);
    expect(upserted[0]).not.toHaveProperty('store_id');
  });

  it('reads a null email or phone as empty rather than the string "null"', async () => {
    const pulled = await pullCustomers(
      servingOnePage([{ ...customer, email: null, phone: null, created_at: '2026-01-04' }]).client,
    );
    expect(pulled?.[0].email).toBe('');
    expect(pulled?.[0].phone).toBe('');
  });

  it('reads a NULL balance as zero', async () => {
    const pulled = await pullCustomers(
      servingOnePage([{ ...customer, points: null, created_at: '2026-01-04' }]).client,
    );
    expect(pulled?.[0].points).toBe(0);
  });

  it('reads a row with no points column as zero, not NaN', async () => {
    // This is the case the `|| 0` is actually for. Number(null) is already 0,
    // but Number(undefined) is NaN — and a NaN balance poisons every loyalty
    // sum it reaches, silently, because NaN compares false against everything.
    const noPointsColumn: Record<string, unknown> = { ...customer, created_at: '2026-01-04' };
    delete noPointsColumn.points;
    const pulled = await pullCustomers(servingOnePage([noPointsColumn]).client);
    expect(pulled?.[0].points).toBe(0);
  });

  it('keeps a real balance rather than falling through to zero', async () => {
    const pulled = await pullCustomers(
      servingOnePage([{ ...customer, created_at: '2026-01-04' }]).client,
    );
    expect(pulled?.[0].points).toBe(240);
  });

  it('dates a row that has no created_at rather than leaving it undefined', async () => {
    const pulled = await pullCustomers(servingOnePage([{ ...customer, created_at: null }]).client);
    expect(pulled?.[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('reports failure rather than claiming a failed push succeeded', async () => {
    const client = {
      from: () => ({ upsert: () => ({ error: { message: 'connection failure' } }) }),
    } as unknown as SupabaseClient;
    expect(await pushCustomers(client, [customer])).toBe(false);
  });

  it('returns null, not an empty list, when the pull fails', async () => {
    // An empty array means "the cloud has no customers" and replaces local
    // data; null means "ask again later". Conflating them deletes the book.
    const { client } = makePagedClient([{ data: null, error: { message: 'nope' } }]);
    expect(await pullCustomers(client)).toBeNull();
  });
});

// How the pull is performed, not just what it returns. A fake that ignores
// .order/.limit/.gt/.eq passes whether or not the cursor is carried forward or
// the store filter applied, which is most of what can actually go wrong here.
describe('how the customer pull walks the table', () => {
  it('asks for a page ordered by primary key', async () => {
    const { client, select, orders, limits } = makePagedClient([{ data: [] }]);
    await pullCustomers(client);
    expect(select).toHaveBeenCalledWith('*');
    expect(orders[0]).toEqual(['id']);
    expect(limits[0]).toBe(PULL_PAGE_SIZE);
  });

  it('carries the last id forward as the cursor and accumulates every page', async () => {
    const row = (id: string) => ({ ...customer, id, created_at: '2026-01-04' });
    const { client, cursors } = makePagedClient([
      { data: [row('a'), row('b')] },
      { data: [row('c')] },
      { data: [] },
    ]);

    const pulled = await pullCustomers(client);

    expect(pulled?.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(cursors).toEqual([null, 'b', 'c']);
  });

  it('confirms the end with an empty page rather than a short one', async () => {
    // A short page is what a server-side row cap looks like, so reading it as
    // the end would silently truncate the book and then overwrite the rest.
    const { client, cursors } = makePagedClient([
      { data: [{ ...customer, created_at: '2026-01-04' }] },
      { data: [] },
    ]);
    await pullCustomers(client);
    expect(cursors).toHaveLength(2);
  });

  it('filters by store when one is configured, and not when it is not', async () => {
    const scoped = makePagedClient([{ data: [] }]);
    await pullCustomers(scoped.client, 'store-7');
    expect(scoped.eq).toHaveBeenCalledWith('store_id', 'store-7');

    const unscoped = makePagedClient([{ data: [] }]);
    await pullCustomers(unscoped.client);
    expect(unscoped.eq).not.toHaveBeenCalled();
  });
});
