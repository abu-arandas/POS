import { describe, it, expect, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  pushUserAccounts,
  pullUserAccounts,
  verifyLoginCloud,
} from '../../../src/lib/supabase/accounts';
import { useAuthStore } from '../../../src/stores/authStore';
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

function capturingClient() {
  const upserted: Record<string, unknown>[] = [];
  const client = {
    from: () => ({
      upsert: (rows: Record<string, unknown>[]) => (upserted.push(...rows), { error: null }),
    }),
  } as unknown as SupabaseClient;
  return { client, upserted };
}

function servingClient(rows: Record<string, unknown>[]) {
  let served = false;
  const page = () => {
    const data = served ? [] : rows;
    served = true;
    return Promise.resolve({ data, error: null });
  };
  const builder: Record<string, unknown> = {};
  builder.order = () => builder;
  builder.limit = () => builder;
  builder.gt = () => builder;
  builder.eq = () => builder;
  builder.then = (resolve: (v: unknown) => unknown) => page().then(resolve);
  return { from: () => ({ select: () => builder }) } as unknown as SupabaseClient;
}

/** Answers the verify_login RPC with `reply`, and records what it was asked. */
function rpcClient(reply: unknown, error: { message: string } | null = null) {
  const calls: Array<Record<string, string>> = [];
  const client = {
    rpc: (_fn: string, params: Record<string, string>) => {
      calls.push(params);
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
    const pulled = await pullUserAccounts(servingClient([publicRow]));
    expect(pulled).toEqual([account]);
  });

  it('keeps the local PIN hash a cloud pull cannot supply', async () => {
    // This is the whole reason the mapper reads the local store. Blanking the
    // hash here would lock an offline terminal out on the next Pull From Cloud.
    useAuthStore.setState({ users: [account] });
    const pulled = await pullUserAccounts(
      servingClient([
        { id: 'u-1', name: 'Ada Lovelace', role: 'admin', active: true, created_at: '2026-01-04' },
      ]),
    );
    expect(pulled?.[0].pin).toBe(account.pin);
  });

  it('leaves an account this terminal has never seen with no PIN', async () => {
    // Nothing local to keep, and inventing a hash would be worse than an empty
    // one: '' can never verify, so the account simply cannot sign in here yet.
    const pulled = await pullUserAccounts(
      servingClient([
        { id: 'u-9', name: 'New Hire', role: 'cashier', active: true, created_at: '2026-02-01' },
      ]),
    );
    expect(pulled?.[0].pin).toBe('');
  });

  it('reads a deactivated account as inactive rather than truthy', async () => {
    const pulled = await pullUserAccounts(
      servingClient([
        { id: 'u-1', name: 'Ada', role: 'admin', active: false, created_at: '2026-01-04' },
      ]),
    );
    expect(pulled?.[0].active).toBe(false);
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

describe('verifyLoginCloud', () => {
  const row = {
    id: 'u-1',
    name: 'Ada Lovelace',
    role: 'admin',
    active: true,
    created_at: '2026-01-04',
  };

  it('sends the derived hash, never the PIN itself', async () => {
    const { client, calls } = rpcClient([row]);
    await verifyLoginCloud(client, 'Ada Lovelace', account.pin);
    expect(calls[0]).toEqual({ p_name: 'Ada Lovelace', p_pin_hash: account.pin });
  });

  it('scopes the lookup to a store when one is configured', async () => {
    const { client, calls } = rpcClient([row]);
    await verifyLoginCloud(client, 'Ada Lovelace', account.pin, 'store-7');
    expect(calls[0].p_store_id).toBe('store-7');
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
