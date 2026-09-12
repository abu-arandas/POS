import { describe, it, expect, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  pushUserAccounts,
  pullUserAccounts,
  verifyLoginCloud,
} from '../../../src/lib/supabase/accounts';
import { useAuthStore } from '../../../src/stores/authStore';
import { makePagedClient, servingOnePage } from './pageClient';
import { PULL_PAGE_SIZE } from '../../../src/lib/supabase/sync-utils';
import type { UserAccount } from '../../../src/types';

// Staff accounts are the one synced table whose secret deliberately does NOT
// travel: the cloud projection `user_accounts_public` has no pin column, so a
// pull must keep the local hash rather than blanking it. Get that wrong and a
// routine "Pull From Cloud" locks every operator out of an offline terminal —
// the same class of outage as a mis-verified work factor, arriving by a
// different road. None of it was covered.

const account: UserAccount = {
  id: 'u-1',
  name: 'Ada Lovelace',
  role: 'admin',
  pin: 'v2$600000$9b2e37bf6f878649d3d422d6dd6286a6$' + 'a'.repeat(64),
  active: true,
  createdAt: '2026-01-04',
};

/**
 * Narrows a pull result to rows. `pullUserAccounts` has three outcomes — rows,
 * `'denied'`, and `null` — so the assertions below have to say which one they
 * expect rather than reaching straight for `[0]`.
 */
function rowsOf(result: UserAccount[] | 'denied' | null): UserAccount[] {
  expect(Array.isArray(result)).toBe(true);
  return result as UserAccount[];
}

function capturingClient() {
  const upserted: Record<string, unknown>[] = [];
  const client = {
    from: () => ({
      upsert: (rows: Record<string, unknown>[]) => (upserted.push(...rows), { error: null }),
    }),
  } as unknown as SupabaseClient;
  return { client, upserted };
}

/**
 * Answers the RPC with `reply`, recording the function NAME as well as the
 * params. The name matters: verify_login is a SECURITY DEFINER function, so a
 * misspelling does not fall back to a slower path, it fails every cloud login.
 */
function rpcClient(reply: unknown, error: { message: string } | null = null) {
  const calls: Array<{ fn: string; params: Record<string, string> }> = [];
  const client = {
    rpc: (fn: string, params: Record<string, string>) => {
      calls.push({ fn, params });
      return Promise.resolve({ data: reply, error });
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

beforeEach(() => {
  useAuthStore.setState({ users: [], currentUser: null });
});

describe('user account sync', () => {
  it('round-trips the non-secret fields', async () => {
    const { client, upserted } = capturingClient();
    expect(await pushUserAccounts(client, [account])).toBe(true);
    expect(upserted[0].created_at).toBe('2026-01-04');

    // The public view carries no pin, so serve the row without one.
    const publicRow = { ...(upserted[0] as Record<string, unknown>) };
    delete publicRow.pin;
    useAuthStore.setState({ users: [account] });
    const pulled = await pullUserAccounts(servingOnePage([publicRow]).client);
    expect(pulled).toEqual([account]);
  });

  it('keeps the local PIN hash a cloud pull cannot supply', async () => {
    // This is the whole reason the mapper reads the local store. Blanking the
    // hash here would lock an offline terminal out on the next Pull From Cloud.
    useAuthStore.setState({ users: [account] });
    const pulled = await pullUserAccounts(
      servingOnePage([
        { id: 'u-1', name: 'Ada Lovelace', role: 'admin', active: true, created_at: '2026-01-04' },
      ]).client,
    );
    expect(rowsOf(pulled)[0].pin).toBe(account.pin);
  });

  it('leaves an account this terminal has never seen with no PIN', async () => {
    // Nothing local to keep, and inventing a hash would be worse than an empty
    // one: '' can never verify, so the account simply cannot sign in here yet.
    const pulled = await pullUserAccounts(
      servingOnePage([
        { id: 'u-9', name: 'New Hire', role: 'cashier', active: true, created_at: '2026-02-01' },
      ]).client,
    );
    expect(rowsOf(pulled)[0].pin).toBe('');
  });

  // `user_accounts_public` grants SELECT to `authenticated` and revokes it from
  // `anon` on purpose. A terminal with no device account is therefore refused —
  // correctly — and reporting that as a load failure sent the operator hunting
  // for a broken database instead of an unset email and password.
  it('reports a refused read as denied, not as a failure', async () => {
    const denied = {
      from: () => ({
        select: () => ({
          order: () => ({
            limit: () =>
              Promise.resolve({
                data: null,
                error: {
                  code: '42501',
                  message: 'permission denied for view user_accounts_public',
                },
              }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;
    expect(await pullUserAccounts(denied)).toBe('denied');
  });

  it('still reports an unrelated failure as a failure', async () => {
    // Only 42501 is the configuration answer. Anything else is a real fault and
    // must stay distinguishable from it, or a broken database reads as "just
    // set a device account".
    const broken = {
      from: () => ({
        select: () => ({
          order: () => ({
            limit: () =>
              Promise.resolve({
                data: null,
                error: { code: '08006', message: 'no route to host' },
              }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;
    expect(await pullUserAccounts(broken)).toBeNull();
  });

  it('reads a deactivated account as inactive rather than truthy', async () => {
    const pulled = await pullUserAccounts(
      servingOnePage([
        { id: 'u-1', name: 'Ada', role: 'admin', active: false, created_at: '2026-01-04' },
      ]).client,
    );
    expect(rowsOf(pulled)[0].active).toBe(false);
  });

  it('sends nothing, and reports success, for an empty list', async () => {
    const { client, upserted } = capturingClient();
    expect(await pushUserAccounts(client, [])).toBe(true);
    expect(upserted).toHaveLength(0);
  });

  it('stamps the store id on the way out when one is configured', async () => {
    const { client, upserted } = capturingClient();
    await pushUserAccounts(client, [account], 'store-7');
    expect(upserted[0].store_id).toBe('store-7');
  });

  it('reports failure rather than claiming a failed push succeeded', async () => {
    const client = {
      from: () => ({ upsert: () => ({ error: { message: 'connection failure' } }) }),
    } as unknown as SupabaseClient;
    expect(await pushUserAccounts(client, [account])).toBe(false);
  });
});

// How the pull is performed, not just what it returns.
describe('how the account pull walks the view', () => {
  it('reads the public projection, ordered by primary key', async () => {
    const { client, from, select, orders, limits } = makePagedClient([{ data: [] }]);
    await pullUserAccounts(client);
    expect(from).toHaveBeenCalledWith('user_accounts_public');
    expect(select).toHaveBeenCalledWith('*');
    expect(orders[0]).toEqual(['id']);
    expect(limits[0]).toBe(PULL_PAGE_SIZE);
  });

  it('carries the last id forward as the cursor and accumulates every page', async () => {
    const row = (id: string) => ({
      id,
      name: `Staff ${id}`,
      role: 'cashier',
      active: true,
      created_at: '2026-01-04',
    });
    const { client, cursors } = makePagedClient([
      { data: [row('a'), row('b')] },
      { data: [row('c')] },
      { data: [] },
    ]);

    const pulled = await pullUserAccounts(client);

    expect(rowsOf(pulled).map((u) => u.id)).toEqual(['a', 'b', 'c']);
    expect(cursors).toEqual([null, 'b', 'c']);
  });

  it('filters by store when one is configured, and not when it is not', async () => {
    const scoped = makePagedClient([{ data: [] }]);
    await pullUserAccounts(scoped.client, 'store-7');
    expect(scoped.eq).toHaveBeenCalledWith('store_id', 'store-7');

    const unscoped = makePagedClient([{ data: [] }]);
    await pullUserAccounts(unscoped.client);
    expect(unscoped.eq).not.toHaveBeenCalled();
  });

  it('returns null rather than an empty roster when a page errors', async () => {
    const { client } = makePagedClient([{ data: null, error: { message: 'nope' } }]);
    expect(await pullUserAccounts(client)).toBeNull();
  });
});

describe('verifyLoginCloud', () => {
  const row = {
    id: 'u-1',
    name: 'Ada Lovelace',
    role: 'admin',
    active: true,
    created_at: '2026-01-04',
  };

  it('calls the verify_login RPC by name', async () => {
    // A misspelling here does not degrade to a slower path — it fails every
    // cloud login, and the local-only fallback hides that until a terminal
    // needs a PIN changed on another till.
    const { client, calls } = rpcClient([row]);
    await verifyLoginCloud(client, 'Ada Lovelace', account.pin);
    expect(calls[0].fn).toBe('verify_login');
  });

  it('sends the derived hash, never the PIN itself', async () => {
    const { client, calls } = rpcClient([row]);
    await verifyLoginCloud(client, 'Ada Lovelace', account.pin);
    expect(calls[0].params).toEqual({ p_name: 'Ada Lovelace', p_pin_hash: account.pin });
  });

  it('scopes the lookup to a store when one is configured', async () => {
    const { client, calls } = rpcClient([row]);
    await verifyLoginCloud(client, 'Ada Lovelace', account.pin, 'store-7');
    expect(calls[0].params.p_store_id).toBe('store-7');
  });

  it('caches the candidate hash that was just verified', async () => {
    // The RPC never returns the stored hash, so the account comes back carrying
    // the candidate the cloud just accepted — which is what lets the next
    // sign-in happen offline.
    const { client } = rpcClient([row]);
    const user = await verifyLoginCloud(client, 'Ada Lovelace', account.pin);
    expect(user).toEqual({ ...account, pin: account.pin });
  });

  it('accepts a bare row as well as a single-element array', async () => {
    const { client } = rpcClient(row);
    expect((await verifyLoginCloud(client, 'Ada Lovelace', account.pin))?.id).toBe('u-1');
  });

  it('refuses when the RPC matches nobody', async () => {
    for (const reply of [[], null, undefined]) {
      const { client } = rpcClient(reply);
      expect(await verifyLoginCloud(client, 'Ada Lovelace', account.pin)).toBeNull();
    }
  });

  it('refuses on an RPC error rather than throwing at the login prompt', async () => {
    const { client } = rpcClient(null, { message: 'permission denied' });
    expect(await verifyLoginCloud(client, 'Ada Lovelace', account.pin)).toBeNull();
  });

  it('refuses when the call throws outright', async () => {
    const client = {
      rpc: () => Promise.reject(new Error('network down')),
    } as unknown as SupabaseClient;
    expect(await verifyLoginCloud(client, 'Ada Lovelace', account.pin)).toBeNull();
  });
});
