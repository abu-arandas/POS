import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchStoreCount,
  isSyncBlocked,
  resetStoreCountCache,
  resolveStoreScope,
  storeScopeWarning,
} from '../../src/lib/supabase/storeScope';

// One database, several shops. Every store-scoping decision in the app used to
// read `if (storeId)`, so an unset Store ID meant "do not filter" — a terminal
// pulled every store's catalogue, customers, transactions and staff, and Pull
// From Cloud then replaced local data with them. These are the checks that the
// absent case now fails CLOSED instead.

/**
 * `storesTable` says what a read of `stores` answers when the RPC is missing:
 * 'present', 'absent' (the table does not exist), or 'unreadable'.
 */
const clientReturning = (
  result: unknown,
  storesTable: 'present' | 'absent' | 'unreadable' = 'absent',
) =>
  ({
    rpc: vi.fn().mockResolvedValue(result),
    from: vi.fn(() => ({
      select: vi
        .fn()
        .mockResolvedValue(
          storesTable === 'present'
            ? { error: null }
            : storesTable === 'absent'
              ? { error: { code: 'PGRST205', message: 'Could not find the table public.stores' } }
              : { error: { code: '08006', message: 'no route' } },
        ),
    })),
  }) as unknown as SupabaseClient;

const withStores = (count: number) => clientReturning({ data: count, error: null });

const missingFn = (storesTable: 'present' | 'absent' | 'unreadable') =>
  clientReturning(
    {
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.pos_store_count' },
    },
    storesTable,
  );

beforeEach(() => resetStoreCountCache());

describe('reading the store count', () => {
  it('reports the count the database gives', async () => {
    expect(await fetchStoreCount(withStores(3))).toBe(3);
  });

  it('treats a database with neither the function nor the table as having none', async () => {
    // A definite answer, not a failure: the store dimension was never taken, so
    // there is nothing to be scoped to and nothing to leak between.
    expect(await fetchStoreCount(missingFn('absent'))).toBe(0);
  });

  it('handles the underlying Postgres code too', async () => {
    const missing = clientReturning(
      {
        data: null,
        error: { code: '42883', message: 'function pos_store_count() does not exist' },
      },
      'absent',
    );
    expect(await fetchStoreCount(missing)).toBe(0);
  });

  it('refuses to read a missing function as "no stores" when the table is there', async () => {
    // The case that matters most. pos_store_count() ships WITH this guard, so
    // every deployment already running multi-store-schema.sql is missing it
    // until the migration is re-run — reading that as zero would hand exactly
    // those fleets the unscoped, fleet-wide pull this module exists to stop.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await fetchStoreCount(missingFn('present'))).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('multi-store-schema.sql'));
    warn.mockRestore();
  });

  it('does not guess when it cannot tell whether the table is there', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await fetchStoreCount(missingFn('unreadable'))).toBeNull();
    warn.mockRestore();
  });

  it('reports an unrelated failure as unknown rather than as zero', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = clientReturning({ data: null, error: { code: '08006', message: 'no route' } });
    expect(await fetchStoreCount(broken)).toBeNull();
    warn.mockRestore();
  });
});

describe('deciding whether a terminal may sync', () => {
  it('allows a terminal that names its store', async () => {
    expect(await resolveStoreScope(withStores(5), 'store-A')).toBe('allowed');
  });

  it('allows an unscoped terminal on a single-store install', async () => {
    // The documented default, and the upgrade path: one backfilled store and a
    // Store ID that has never been set. This must keep working untouched.
    expect(await resolveStoreScope(withStores(1), '')).toBe('allowed');
    expect(await resolveStoreScope(withStores(0), undefined)).toBe('allowed');
  });

  it('refuses an unscoped terminal once the database holds several stores', async () => {
    expect(await resolveStoreScope(withStores(2), '')).toBe('store-id-required');
  });

  it('reports an unestablished scope as unknown, not as permission', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = clientReturning({ data: null, error: { message: 'offline' } });
    expect(await resolveStoreScope(broken, '')).toBe('unknown');
    warn.mockRestore();
  });
});

describe('what each operation does with that verdict', () => {
  it('blocks both a pull and a push when the terminal is unscoped on a fleet', async () => {
    const fleet = withStores(4);
    expect(await isSyncBlocked(fleet, '', 'pull')).toBe(true);
    expect(await isSyncBlocked(fleet, '', 'push')).toBe(true);
  });

  it('blocks a pull it cannot establish the scope for, but lets a push through', async () => {
    // A pull REPLACES local data and has no undo, so it is the strict one. A
    // push is additive and the outbox retries it, and whatever stopped the
    // scope check will stop the write too.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = clientReturning({ data: null, error: { message: 'offline' } });
    expect(await isSyncBlocked(broken, '', 'pull')).toBe(true);
    expect(await isSyncBlocked(broken, '', 'push')).toBe(false);
    warn.mockRestore();
  });

  it('blocks neither once a store is named', async () => {
    const fleet = withStores(4);
    expect(await isSyncBlocked(fleet, 'store-A', 'pull')).toBe(false);
    expect(await isSyncBlocked(fleet, 'store-A', 'push')).toBe(false);
  });
});

describe('caching the count', () => {
  it('asks once for repeated checks against the same client', async () => {
    const client = withStores(1);
    await resolveStoreScope(client, '');
    await resolveStoreScope(client, '');
    await resolveStoreScope(client, '');
    // Otherwise every sale's push would cost a round trip.
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it('does not answer for one project out of another project’s cache', async () => {
    // A terminal repointed from a single-store project at a multi-store one
    // would otherwise carry "1 store" across and go straight back to pulling
    // the fleet.
    const single = withStores(1);
    const fleet = withStores(9);
    expect(await resolveStoreScope(single, '')).toBe('allowed');
    expect(await resolveStoreScope(fleet, '')).toBe('store-id-required');
  });

  it('does not cache an unestablished answer', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const flaky = {
      rpc: vi
        .fn()
        .mockResolvedValueOnce({ data: null, error: { message: 'offline' } })
        .mockResolvedValue({ data: 2, error: null }),
    } as unknown as SupabaseClient;

    expect(await resolveStoreScope(flaky, '')).toBe('unknown');
    expect(await resolveStoreScope(flaky, '')).toBe('store-id-required');
    warn.mockRestore();
  });
});

describe('the warning the settings screen shows', () => {
  it('names the misconfiguration when a fleet terminal has no store id', async () => {
    expect(await storeScopeWarning(withStores(2), '')).toBe('store-id-required');
  });

  it('stays quiet for a single-store install and for a scoped terminal', async () => {
    expect(await storeScopeWarning(withStores(1), '')).toBeNull();
    expect(await storeScopeWarning(withStores(7), 'store-A')).toBeNull();
  });
});

describe('an older multi-store database, mid-upgrade', () => {
  it('blocks the pull and lets the push through', async () => {
    // stores exists, pos_store_count does not. The count is unknowable from the
    // client — `stores` carries RLS (has_store_access(id)), so an unscoped
    // terminal reads zero rows from a database holding twenty stores — so this
    // must not be resolved by guessing. Pull refuses; push is additive and the
    // outbox retries it.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const old = missingFn('present');

    expect(await resolveStoreScope(old, '')).toBe('unknown');
    expect(await isSyncBlocked(old, '', 'pull')).toBe(true);
    expect(await isSyncBlocked(old, '', 'push')).toBe(false);
    warn.mockRestore();
  });

  it('leaves a terminal that names its store alone', async () => {
    // It already says which store it is, so nothing about the count matters.
    const old = missingFn('present');
    expect(await isSyncBlocked(old, 'store-A', 'pull')).toBe(false);
  });
});
