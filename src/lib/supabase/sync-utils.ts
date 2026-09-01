import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Adds store_id to each outgoing record when a store scope is configured.
 * A no-op in single-store mode (empty storeId), so existing deployments push
 * exactly the same payload as before. Pure and unit-tested.
 */
export function stampStoreId<T extends object>(records: T[], storeId?: string): T[] {
  if (!storeId) return records;
  return records.map((r) => ({ ...r, store_id: storeId }));
}

/**
 * A pull used to be one unbounded request: `.select('*')` with no limit, for
 * every row in the table. Two things go wrong with that. PostgREST caps how
 * many rows a single response may return (Supabase exposes it as `max-rows`),
 * and a cap silently truncates — the client cannot tell a capped response from
 * a complete one, so a terminal would quietly pull a partial catalogue and,
 * because "Pull From Cloud" replaces all local data, overwrite the rest. And a
 * terminal that has been trading for a year has a transaction history that is
 * simply too large to want in one response.
 *
 * So the pulls walk the table in pages, the same way deleteRowsSupabase chunks
 * its ids.
 */
export const PULL_PAGE_SIZE = 1000;

// Paged by primary key, not by offset.
//
// `.range(from, to)` counts rows from the start of the result on each request,
// so anything inserted or deleted before a later page shifts every offset after
// it — a sale rung up mid-pull slides one row across the page boundary and it is
// either fetched twice or missed entirely. Pulls are not short (they walk the
// whole table) and the register is writing the whole time, so that window is
// wide open in normal use. Because the result then *replaces* local state, a
// dropped row is not a stale read, it is data destroyed.
//
// Keying each page off the last id seen has no such window: rows before the
// cursor cannot move it, and inserts land on a page that has not been read yet.
//
// Two further details:
//
//   * Stop on an empty page, not a short one. A short page is exactly what a
//     server-side row cap (Supabase's `max-rows`) looks like, and treating it
//     as the end would silently truncate the pull.
//   * `id` is the primary key on every synced table, so it is unique and stable
//     — the two properties a keyset cursor needs.
export async function fetchAllPages<Row extends { id: string }>(
  page: (
    afterId: string | null,
    limit: number,
  ) => PromiseLike<{ data: Row[] | null; error: unknown }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  let afterId: string | null = null;
  for (;;) {
    const { data, error } = await page(afterId, PULL_PAGE_SIZE);
    if (error) throw error;
    const batch = data ?? [];
    if (batch.length === 0) return rows;
    for (const row of batch) rows.push(row);
    afterId = batch[batch.length - 1].id;
  }
}

// Applies the keyset cursor to a query. Ascending id order is what makes the
// cursor meaningful; callers that want a different order sort the result.
export function keyset<
  T extends { order: (c: string) => T; limit: (n: number) => T; gt: (c: string, v: string) => T },
>(query: T, afterId: string | null, limit: number): T {
  const ordered = query.order('id').limit(limit);
  return afterId === null ? ordered : ordered.gt('id', afterId);
}

/**
 * Delete rows by id from any synced table. Used by the cloud delete-sync
 * wrappers so that local deletions are propagated instead of resurrecting on
 * the next Pull From Cloud.
 */
export type SyncTable = 'products' | 'categories' | 'customers' | 'transactions' | 'user_accounts';

/**
 * PostgREST puts an `in` filter in the query string, so one request per id-set
 * has a hard ceiling: "Delete All Transactions" on a busy terminal built a URL
 * past what proxies and the server accept, and the whole delete failed after
 * the local rows were already gone. Chunking keeps each request well inside
 * any URL limit.
 */
export const DELETE_CHUNK_SIZE = 500;

/**
 * A chunked delete is not one transaction, so a failure part-way through leaves
 * the earlier chunks already deleted. Every remaining chunk is still attempted
 * rather than abandoned: the local rows are gone either way, so each chunk that
 * does land is a row that will not resurrect on the next Pull From Cloud.
 * Returns false if any chunk failed — callers must not read that as "nothing
 * was deleted".
 */
export async function deleteRowsSupabase(
  client: SupabaseClient,
  table: SyncTable,
  ids: string[],
): Promise<boolean> {
  if (ids.length === 0) return true;
  let failedRows = 0;
  for (let i = 0; i < ids.length; i += DELETE_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + DELETE_CHUNK_SIZE);
    try {
      const { error } = await client.from(table).delete().in('id', chunk);
      if (error) throw error;
    } catch (err) {
      failedRows += chunk.length;
      console.error(`Failed deleting ${chunk.length} row(s) from ${table}:`, err);
    }
  }
  if (failedRows > 0) {
    console.error(`${failedRows} of ${ids.length} ${table} row(s) survive in the cloud.`);
  }
  return failedRows === 0;
}
