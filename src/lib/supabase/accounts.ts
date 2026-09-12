import { SupabaseClient } from '@supabase/supabase-js';
import { UserAccount } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { fetchAllPages, keyset, stampStoreId } from './sync-utils';

/**
 * Validates a staff login against the cloud via the SECURITY DEFINER
 * verify_login RPC (see src/db/schema.sql). Returns the account's non-secret
 * fields on success, or null. The PIN hash never leaves the database on the
 * return path — only the caller's versioned PBKDF2-derived candidate is sent.
 */
export async function verifyLoginCloud(
  client: SupabaseClient,
  name: string,
  pinHash: string,
  storeId?: string,
): Promise<UserAccount | null> {
  try {
    const params: Record<string, string> = { p_name: name, p_pin_hash: pinHash };
    if (storeId) params.p_store_id = storeId;
    const { data, error } = await client.rpc('verify_login', params);
    if (error) {
      console.warn('Cloud verify_login failed:', error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      role: row.role as UserAccount['role'],
      active: !!row.active,
      createdAt: row.created_at,
      pin: pinHash, // cache only the candidate hash that was just verified
    };
  } catch (err) {
    console.error('Cloud verify_login error:', err);
    return null;
  }
}

/**
 * Push local user accounts
 */
export async function pushUserAccounts(
  client: SupabaseClient,
  accounts: UserAccount[],
  storeId?: string,
): Promise<boolean> {
  if (accounts.length === 0) return true;
  try {
    const records = stampStoreId(
      accounts.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        pin: a.pin,
        active: a.active,
        created_at: a.createdAt,
      })),
      storeId,
    );
    const { error } = await client.from('user_accounts').upsert(records);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Failed pushing user accounts:', err);
    return false;
  }
}

/**
 * Pull user accounts
 */
/**
 * Whether the database refused the read outright, rather than failing to serve
 * it. Postgres raises 42501 (insufficient_privilege) when a role lacks the
 * grant; PostgREST forwards that code and answers 401/403.
 */
function isPermissionDenied(error: unknown): boolean {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  if (code === '42501' || code === 'PGRST301') return true;
  return typeof message === 'string' && /permission denied/i.test(message);
}

/**
 * Staff accounts from the cloud.
 *
 * `'denied'` is a third outcome, distinct from both rows and failure: the
 * database answered, and the answer was that this client may not read them.
 */
export async function pullUserAccounts(
  client: SupabaseClient,
  storeId?: string,
): Promise<UserAccount[] | 'denied' | null> {
  try {
    const data = await fetchAllPages((afterId, limit) => {
      let query = keyset(client.from('user_accounts_public').select('*'), afterId, limit);
      if (storeId) query = query.eq('store_id', storeId);
      return query;
    });
    // The public projection intentionally has no PIN column. Keep the local
    // secret for matching ids so a cloud pull cannot erase offline login data.
    const localUsers = new Map(useAuthStore.getState().users.map((user) => [user.id, user]));
    return (data || []).map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role as UserAccount['role'],
      pin: localUsers.get(r.id)?.pin ?? '',
      active: Boolean(r.active),
      createdAt: r.created_at,
    }));
  } catch (err) {
    if (isPermissionDenied(err)) {
      // Not a fault. `user_accounts_public` grants SELECT to `authenticated`
      // and revokes it from `anon` on purpose, so a terminal running in
      // anonymous mode — no device account in Settings → Cloud Sync — cannot
      // read staff accounts however healthy the connection is. Reporting this
      // as "failed to load" alongside a genuine outage sends the operator
      // looking for a broken database instead of an unset email and password.
      console.info(
        'Staff accounts were not pulled: this terminal is connected anonymously, and ' +
          'user_accounts_public is readable only by an authenticated device account. Set the ' +
          'device email and password in Settings → Cloud Sync to sync staff.',
      );
      return 'denied';
    }
    console.error('Failed pulling user accounts:', err);
    return null;
  }
}
