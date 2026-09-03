import { describe, it, expect } from 'vitest';
import {
  authorizeOverride,
  authorizerLabel,
  overrideCandidates,
} from '../../src/lib/managerOverride';
import { hashPinSalted, hashPinSaltedLegacy } from '../../src/lib/hash';
import type { UserAccount } from '../../src/types';

// The refund manager-override is the widest PIN surface in the app: the lock
// screen checks one PIN against the one account named, this checks a PIN
// against every manager and admin at once. It previously lived inside
// History.tsx and could only be exercised by rendering the screen and typing
// into a modal — so none of the rules below were pinned down anywhere.

async function user(over: Partial<UserAccount> & { id: string }, pin?: string) {
  // Defaults first, then the overrides — `over` carries a required id, so the
  // spread is what satisfies it.
  const base: UserAccount = {
    name: 'Ada',
    role: 'manager',
    pin: '',
    active: true,
    createdAt: '2026-01-01',
    ...over,
  };
  return pin ? { ...base, pin: await hashPinSalted(base.id, pin) } : base;
}

describe('overrideCandidates', () => {
  it('accepts managers and admins', async () => {
    const users = [
      await user({ id: 'm', role: 'manager' }),
      await user({ id: 'a', role: 'admin' }),
    ];
    expect(overrideCandidates(users).map((u) => u.id)).toEqual(['m', 'a']);
  });

  it('excludes cashiers, who are exactly who the prompt exists to stop', async () => {
    const users = [await user({ id: 'c', role: 'cashier' })];
    expect(overrideCandidates(users)).toEqual([]);
  });

  it('excludes a deactivated manager', async () => {
    // Revoking someone in Settings has to revoke their ability to authorize a
    // refund at the same moment, not at their next sign-in.
    const users = [await user({ id: 'm', role: 'manager', active: false })];
    expect(overrideCandidates(users)).toEqual([]);
  });
});

describe('authorizeOverride', () => {
  it('resolves the manager whose PIN was typed', async () => {
    const users = [
      await user({ id: 'm1', name: 'Ada' }, '1234'),
      await user({ id: 'm2', name: 'Grace' }, '5678'),
    ];
    const authorized = await authorizeOverride(users, '5678');
    expect(authorized?.id).toBe('m2');
  });

  it('accepts ANY eligible PIN, not just the first account', async () => {
    // The operator has not said whose PIN they are typing, so a match anywhere
    // in the list authorizes.
    const users = [
      await user({ id: 'm1' }, '1111'),
      await user({ id: 'm2' }, '2222'),
      await user({ id: 'm3' }, '3333'),
    ];
    expect((await authorizeOverride(users, '3333'))?.id).toBe('m3');
  });

  it('rejects a wrong PIN', async () => {
    const users = [await user({ id: 'm1' }, '1234')];
    expect(await authorizeOverride(users, '9999')).toBeNull();
  });

  it("rejects a cashier's PIN even when it is correct for that cashier", async () => {
    const users = [await user({ id: 'c1', role: 'cashier' }, '1234')];
    expect(await authorizeOverride(users, '1234')).toBeNull();
  });

  it("rejects a deactivated manager's correct PIN", async () => {
    const users = [await user({ id: 'm1', active: false }, '1234')];
    expect(await authorizeOverride(users, '1234')).toBeNull();
  });

  it('accepts a legacy v1 hash, so a manager who has not re-signed-in is not locked out', async () => {
    const legacy: UserAccount = {
      ...(await user({ id: 'm1' })),
      pin: await hashPinSaltedLegacy('m1', '1234'),
    };
    expect((await authorizeOverride([legacy], '1234'))?.id).toBe('m1');
  });

  it('rejects an empty PIN without consulting any account', async () => {
    const users = [await user({ id: 'm1' }, '1234')];
    expect(await authorizeOverride(users, '')).toBeNull();
  });

  it('returns null when the store holds no eligible staff at all', async () => {
    expect(await authorizeOverride([], '1234')).toBeNull();
  });

  it("does not accept one manager's PIN hashed against another's salt", async () => {
    // Salts are account-bound, so a PIN valid for m1 must not authorize m2 —
    // otherwise every account with the same PIN digits would collide.
    const m1 = await user({ id: 'm1' }, '1234');
    const m2 = await user({ id: 'm2' }, '9999');
    const authorized = await authorizeOverride([m2, m1], '1234');
    expect(authorized?.id).toBe('m1');
  });
});

describe('authorizerLabel', () => {
  it('records the name and role as the audit trail shows it', () => {
    expect(authorizerLabel({ name: 'Ada', role: 'manager' })).toBe('Ada (manager)');
  });
});
