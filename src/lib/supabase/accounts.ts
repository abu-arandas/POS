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
 * Whether the CURRENT ROLE lacks the grant. Postgres raises 42501
 * (insufficient_privilege) and PostgREST forwards that SQLSTATE verbatim.
 *
 * Only that code, on purpose. Two things it deliberately does not match:
 *
 *   PGRST301 is a PostgREST code, not a Postgres one, and it means the JWT is
 *   invalid or expired. That is a recoverable session problem whose remedy is
 *   to sign in again — telling the operator to go and configure credentials
 *   they have already configured would send them at the wrong thing.
 *
 *   The message text. postgrest-js's own guidance is to "branch on [code]
 *   rather than on message text", and a substring match on "permission denied"
 *   would swallow any other privilege error the wording happens to fit.
 */
function isPermissionDenied(error: unknown): boolean {
  return ((error ?? {}) as { code?: string }).code === '42501';
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
    if (await isAnonymousDenial(client, err)) return 'denied';
    // Logged whole, not just `.message`: for 42501 Postgres puts the literal
    // fix in `hint` ("GRANT SELECT ON ... TO <role>"), and that names the role
    // that was actually refused — which is the one thing the code cannot say.
    console.error('Failed pulling user accounts:', err);
    return null;
  }
}

/**
 * Whether a refusal is the ordinary anonymous-mode one, which has a remedy the
 * operator can act on, rather than a missing grant, which does not.
 *
 * 42501 says a role lacked the privilege. It does NOT say which role, so the
 * code alone cannot tell "this terminal is signed in as nobody, and staff are
 * deliberately not released to nobody" apart from "the GRANT in schema.sql was
 * never run". The client knows: an anonymous client holds no session. Treating
 * both as the friendly configuration message would tell someone with a broken
 * schema to set a device account they have already set, and quietly keep the
 * stale staff list instead of reporting the fault.
 */
async function isAnonymousDenial(client: SupabaseClient, err: unknown): Promise<boolean> {
  if (!isPermissionDenied(err)) return false;
  if (await hasSession(client)) return false; // signed in and still refused — a real fault
  console.info(
    'Staff accounts were not pulled: this terminal is connected anonymously, and ' +
      'user_accounts_public is readable only by an authenticated device account. Set the ' +
      'device email and password in Settings → Cloud Sync to sync staff.',
  );
  return true;
}

/**
 * Whether this client currently holds a session. A client that cannot say is
 * not holding one, so a failure here reads as anonymous rather than blocking
 * the diagnosis.
 */
async function hasSession(client: SupabaseClient): Promise<boolean> {
  try {
    const { data } = await client.auth.getSession();
    return Boolean(data?.session);
  } catch {
    return false;
  }
}
