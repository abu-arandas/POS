import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Whether a terminal is allowed to sync given the store scope it is configured
 * with — and the deployment it is pointed at.
 *
 * Every store-scoping decision in this app used to read the same way: `if
 * (storeId)`. An empty store id therefore meant "do not filter", so a terminal
 * whose Store ID had never been set pulled EVERY store's products, customers,
 * transactions and staff accounts out of a shared database, and — because Pull
 * From Cloud replaces local data — put another shop's catalogue and another
 * shop's staff on this till. The cloud login then accepted those staff members'
 * PINs, because `verify_login` read an absent store the same way.
 *
 * The fix is to stop treating absence as a wildcard. "No store configured" is a
 * legitimate single-store install, and it is a misconfiguration on a database
 * holding several stores; the only thing that tells them apart is how many
 * stores the database actually has. That question is asked here and, for the
 * login, in `verify_login` itself, both through the same `pos_store_count()`
 * function so the two halves cannot disagree about which deployments are scoped.
 */

/** PostgREST cannot find the function; the underlying Postgres code is 42883. */
function isMissingFunction(error: unknown): boolean {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  if (code === 'PGRST202' || code === '42883') return true;
  return typeof message === 'string' && message.includes('pos_store_count');
}

/** PostgREST cannot find the table; the underlying Postgres code is 42P01. */
function isMissingTable(error: unknown): boolean {
  const { code } = (error ?? {}) as { code?: string };
  return code === 'PGRST205' || code === '42P01';
}

/**
 * Whether the database has a store dimension at all, used only when
 * `pos_store_count()` is absent.
 *
 * The count itself cannot be taken from here: `stores` carries RLS
 * (`has_store_access(id)`), so an unscoped terminal reads zero rows from a
 * database holding twenty stores. Its EXISTENCE is still a fact RLS does not
 * hide, and that is all this asks.
 */
async function storesTableExists(client: SupabaseClient): Promise<boolean | null> {
  const { error } = await client.from('stores').select('id', { head: true, count: 'exact' });
  if (!error) return true;
  if (isMissingTable(error)) return false;
  return null; // could not tell
}

/**
 * How many stores the database holds, or null when it cannot be established.
 *
 * The missing-function case is the subtle one, and getting it wrong fails open
 * in the worst place. `pos_store_count()` is introduced alongside this guard, so
 * EVERY deployment that already runs multi-store-schema.sql is missing it until
 * the migration is re-run — reading that as "no stores" would hand precisely
 * those fleets an unscoped, fleet-wide pull, which is the leak this whole module
 * exists to close.
 *
 * So a missing function is not an answer by itself. It is one only when the
 * `stores` table is missing too, which means the database never took the store
 * dimension and there is genuinely nothing to be scoped to. If the table is
 * there, the count is UNKNOWN — and a pull, which replaces local data, refuses
 * on unknown.
 */
export async function fetchStoreCount(client: SupabaseClient): Promise<number | null> {
  try {
    const { data, error } = await client.rpc('pos_store_count');
    if (error) {
      if (!isMissingFunction(error)) throw error;
      const hasStores = await storesTableExists(client);
      if (hasStores === false) return 0; // never took the store dimension
      console.warn(
        'pos_store_count() is missing but the stores table is present — this database ran an ' +
          'older multi-store migration. Re-run src/db/multi-store-schema.sql; until then this ' +
          'terminal will not pull, because it cannot tell how many stores it would be reading.',
      );
      return null;
    }
    const count = Number(data);
    return Number.isFinite(count) ? count : null;
  } catch (err) {
    console.warn('Could not read the store count:', err);
    return null;
  }
}

/**
 * The count, cached briefly so a per-sale push does not cost a round trip.
 *
 * Bounded rather than permanent: a second store can be added to an organisation
 * at any time, and a terminal that cached "1 store" at boot would keep pulling
 * the fleet for the rest of its session. A few minutes of staleness is the most
 * a newly-added store can go unnoticed.
 */
const COUNT_TTL_MS = 5 * 60 * 1000;

/**
 * Keyed by client, not module-global. Two Supabase projects are two different
 * deployments with two different store counts, and a terminal repointed from a
 * single-store project at a multi-store one would otherwise carry the old
 * project's "1 store" answer across and go straight back to pulling the fleet.
 */
let cache = new WeakMap<SupabaseClient, { count: number; at: number }>();

/** Drops every cached count. Exported for tests and for an explicit re-check. */
export function resetStoreCountCache(): void {
  cache = new WeakMap();
}

async function storeCount(client: SupabaseClient, now = Date.now()): Promise<number | null> {
  const hit = cache.get(client);
  if (hit && now - hit.at < COUNT_TTL_MS) return hit.count;
  const count = await fetchStoreCount(client);
  if (count === null) return null;
  cache.set(client, { count, at: now });
  return count;
}

/**
 * `allowed` — this terminal may sync as configured.
 * `store-id-required` — the database holds several stores and this terminal has
 *   not been told which one it is; syncing would cross stores.
 * `unknown` — the scope could not be established (the network, typically).
 */
export type StoreScope = 'allowed' | 'store-id-required' | 'unknown';

/**
 * Decides whether a sync may proceed.
 *
 * A configured store id is always allowed: whether this terminal may actually
 * reach that store is the database's call, enforced by RLS once
 * multi-store-rls-enforce.sql has been run, and not something the client can
 * decide about itself.
 */
export async function resolveStoreScope(
  client: SupabaseClient,
  storeId: string | undefined,
): Promise<StoreScope> {
  if (storeId) return 'allowed';
  const count = await storeCount(client);
  if (count === null) return 'unknown';
  return count > 1 ? 'store-id-required' : 'allowed';
}

/**
 * Whether the named operation must be refused.
 *
 * A pull is the strict one, and deliberately so: it REPLACES local data, so a
 * pull that cannot establish its scope risks overwriting this shop's catalogue
 * with another's, and there is no undo. A push is additive and the outbox
 * retries it, so an unestablished scope lets it through — the write will fail on
 * its own if the network is what went wrong.
 */
export async function isSyncBlocked(
  client: SupabaseClient,
  storeId: string | undefined,
  operation: 'pull' | 'push',
): Promise<boolean> {
  const scope = await resolveStoreScope(client, storeId);
  if (scope === 'store-id-required') return true;
  return operation === 'pull' && scope === 'unknown';
}

/**
 * Whether saving this Store ID leaves the terminal able to sync, for the
 * Settings screen to report before the operator walks away from it.
 *
 * Deliberately only asks the one question that has an unambiguous answer:
 * is this terminal unscoped against a database holding several stores? Checking
 * that a *named* store exists would read `stores`, which is itself RLS-scoped to
 * the stores this device belongs to — so a correct id would come back
 * "not found" on a terminal whose membership has not been granted yet, and the
 * operator would be sent to fix the wrong thing.
 */
export async function storeScopeWarning(
  client: SupabaseClient,
  storeId: string,
): Promise<'store-id-required' | null> {
  if (storeId) return null;
  const count = await storeCount(client);
  return count !== null && count > 1 ? 'store-id-required' : null;
}
