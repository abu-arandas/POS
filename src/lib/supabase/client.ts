import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;
let currentUrl = '';
let currentKey = '';
// Email the current client instance is signed in as ('' = anonymous).
let authedEmail = '';

/**
 * Lazy initialization of Supabase client to avoid crashes on bad keys
 */
export function getSupabaseClient(url: string, anonKey: string): SupabaseClient | null {
  if (!url || !anonKey) {
    supabaseInstance = null;
    return null;
  }

  if (supabaseInstance && currentUrl === url && currentKey === anonKey) {
    return supabaseInstance;
  }

  try {
    currentUrl = url;
    currentKey = anonKey;
    authedEmail = ''; // new client starts anonymous
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: false,
      },
    });
    return supabaseInstance;
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    supabaseInstance = null;
    return null;
  }
}

/**
 * Signs the client in with a Supabase Auth "device" account so it operates as an
 * authenticated role (required when RLS is enabled). No-op when no credentials
 * are configured — the client stays anonymous exactly as before.
 *
 * The cached email is a hint, not proof: it records who we signed in as, never
 * whether that session is still good. Nothing clears it when a session expires,
 * the account is signed out, or the password changes, so on its own it would
 * keep reporting success while every RLS-protected request failed. supabase-js
 * refreshes the token on its own and usually makes the cache honest — but this
 * is an offline-first POS, and a terminal offline long enough for refresh to
 * fail is exactly the case that matters. So the session is confirmed with the
 * client before the cache is trusted.
 *
 * getSession() is not purely local: it reads the stored session, and if that
 * session is at or near expiry it awaits a token refresh (auth-js
 * __loadSession -> _callRefreshToken). So the hot path — a live session — costs
 * a storage read and nothing more, and the network only comes into it exactly
 * when the old code would have returned a false success. That refresh is also
 * the cheaper of the two ways out: it succeeds without ever reaching
 * signInWithPassword, and only a failed refresh falls through to a full
 * password sign-in.
 */
export async function signInDevice(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<boolean> {
  if (!email || !password) return true; // anonymous mode
  try {
    if (authedEmail === email) {
      const { data } = await client.auth.getSession();
      if (data?.session) return true; // still signed in on this client
      authedEmail = ''; // expired or signed out — re-authenticate below
    }
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      console.warn('Supabase device sign-in failed:', error.message);
      authedEmail = '';
      return false;
    }
    authedEmail = email;
    return true;
  } catch (err) {
    console.error('Supabase device sign-in error:', err);
    authedEmail = '';
    return false;
  }
}

/**
 * Probes whether a URL/anon-key pair points at a reachable Supabase project.
 *
 * The probe targets `categories`, not `user_accounts_public`: schema.sql
 * REVOKEs that view from `anon`, so a terminal running without a device account
 * (the "anonymous mode" signInDevice explicitly allows) got a hard permission
 * error and was told its credentials were wrong. `categories` is only
 * RLS-filtered, so an unauthorised caller gets an empty result rather than an
 * error — which still distinguishes a bad URL/key (network or 401) from a
 * working project.
 */
export async function testSupabaseConnection(url: string, anonKey: string): Promise<boolean> {
  const client = getSupabaseClient(url, anonKey);
  if (!client) return false;

  try {
    const { error } = await client.from('categories').select('id').limit(1);
    if (error) {
      console.warn('Supabase test table fetch failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Supabase test connect error:', err);
    return false;
  }
}
