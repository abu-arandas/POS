import { SupabaseClient } from '@supabase/supabase-js';
import { UserAccount } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { fetchAllPages, keyset, stampStoreId } from './sync-utils';

/**
 * Validates a staff login against the cloud via the SECURITY DEFINER
 * verify_login RPC (see scripts/schema.sql). Returns the account's non-secret
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
export async function pullUserAccounts(
  client: SupabaseClient,
  storeId?: string,
): Promise<UserAccount[] | null> {
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
      active: !!r.active,
      createdAt: r.created_at,
    }));
  } catch (err) {
    console.error('Failed pulling user accounts:', err);
    return null;
  }
}
