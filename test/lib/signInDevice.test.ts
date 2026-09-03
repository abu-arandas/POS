import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

// signInDevice caches the signed-in email in module state, so each test needs a
// fresh copy of the module rather than a way to reach in and reset it.
async function freshSignInDevice() {
  vi.resetModules();
  const mod = await import('../../src/lib/supabase');
  return mod.signInDevice;
}

/**
 * A client whose auth surface is scripted: `sessions` is consumed one entry per
 * getSession() call, so a test can hand back a live session first and an
 * expired one (null) afterwards.
 */
function makeClient(options: {
  sessions?: Array<object | null>;
  signInError?: { message: string };
}) {
  const sessions = options.sessions ?? [];
  let call = 0;
  const getSession = vi.fn(async () => ({
    data: { session: call < sessions.length ? sessions[call++] : null },
    error: null,
  }));
  const signInWithPassword = vi.fn(async () => ({ error: options.signInError ?? null }));
  return { auth: { getSession, signInWithPassword } } as unknown as SupabaseClient & {
    auth: { getSession: typeof getSession; signInWithPassword: typeof signInWithPassword };
  };
}

describe('signInDevice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('stays anonymous when no credentials are configured', async () => {
    const signInDevice = await freshSignInDevice();
    const client = makeClient({});

    await expect(signInDevice(client, '', '')).resolves.toBe(true);
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(client.auth.getSession).not.toHaveBeenCalled();
  });

  it('authenticates on the first call', async () => {
    const signInDevice = await freshSignInDevice();
    const client = makeClient({});

    await expect(signInDevice(client, 'device@example.com', 'pw')).resolves.toBe(true);
    expect(client.auth.signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it('reuses a live session instead of hitting the auth endpoint again', async () => {
    const signInDevice = await freshSignInDevice();
    const client = makeClient({ sessions: [{ access_token: 'live' }] });

    await signInDevice(client, 'device@example.com', 'pw');
    await expect(signInDevice(client, 'device@example.com', 'pw')).resolves.toBe(true);

    // The cache still short-circuits — but only after the client confirmed it.
    expect(client.auth.getSession).toHaveBeenCalledTimes(1);
    expect(client.auth.signInWithPassword).toHaveBeenCalledTimes(1);
  });

  // The regression: the cache recorded only the email, so once it matched,
  // signInDevice reported success against a session that had since expired and
  // callers went on to issue RLS-protected requests that could not succeed.
  it('re-authenticates when the cached session has expired', async () => {
    const signInDevice = await freshSignInDevice();
    const client = makeClient({ sessions: [null] }); // cache hit, but no session

    await signInDevice(client, 'device@example.com', 'pw');
    await expect(signInDevice(client, 'device@example.com', 'pw')).resolves.toBe(true);

    expect(client.auth.getSession).toHaveBeenCalledTimes(1);
    expect(client.auth.signInWithPassword).toHaveBeenCalledTimes(2);
  });

  it('reports failure when re-authentication after an expiry fails', async () => {
    const signInDevice = await freshSignInDevice();
    const good = makeClient({});
    await signInDevice(good, 'device@example.com', 'pw');

    // Same email, same module state, but the session is gone and the password
    // no longer works — a changed device-account password looks like this.
    const stale = makeClient({ sessions: [null], signInError: { message: 'invalid credentials' } });
    await expect(signInDevice(stale, 'device@example.com', 'pw')).resolves.toBe(false);
    expect(stale.auth.signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it('clears the cache when sign-in fails, so the next call retries', async () => {
    const signInDevice = await freshSignInDevice();
    const client = makeClient({ signInError: { message: 'nope' } });

    await expect(signInDevice(client, 'device@example.com', 'pw')).resolves.toBe(false);
    await expect(signInDevice(client, 'device@example.com', 'pw')).resolves.toBe(false);

    // Never cached, so the second call retries rather than short-circuiting.
    expect(client.auth.signInWithPassword).toHaveBeenCalledTimes(2);
    expect(client.auth.getSession).not.toHaveBeenCalled();
  });

  it('reports failure when the auth call throws', async () => {
    const signInDevice = await freshSignInDevice();
    const client = makeClient({});
    vi.mocked(client.auth.signInWithPassword).mockRejectedValue(new Error('offline'));

    await expect(signInDevice(client, 'device@example.com', 'pw')).resolves.toBe(false);
  });
});
