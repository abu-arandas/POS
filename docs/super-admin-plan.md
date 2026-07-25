# Multi-store / super-admin design

How EA POS scales from one till to a fleet of locations. Referenced from
`src/types.ts`, `src/lib/fleet.ts`, `src/stores/settingsStore.ts`, and both
multi-store SQL scripts.

The guiding constraint: **a single-store terminal must keep working exactly as
before.** Every piece below is additive and inert until an operator opts in by
setting a Store ID.

---

## 1. The two role systems

They are deliberately separate, and conflating them is the easiest way to
introduce a security hole.

| | `UserAccount.role` | `Membership.role` |
|---|---|---|
| Where | on-device, in IndexedDB | cloud, in Postgres |
| Identifies | the operator at the keypad | the Supabase auth user the terminal signs in as |
| Values | `admin` / `manager` / `cashier` | `superadmin` / `admin` / `manager` / `cashier` |
| Guards | which screens render (`src/lib/access.ts`) | which rows the database returns (RLS) |

A terminal `admin` is **not** a super-admin. Opening the Fleet board requires
both: the terminal role allows the screen (`SCREEN_ROLES.fleet`), *and*
`fetchSuperadminOrg()` resolved an org-wide membership. The client check is
convenience; the database is the real boundary.

`superadmin` is org-wide and is stored with `store_id IS NULL`. It is never
handed out per store — see `ASSIGNABLE_ROLES` in `src/lib/storeForm.ts`.

## 2. The store dimension

`stores` holds the locations; `memberships` links a cloud auth user to a store
(or to the whole org when `store_id` is null). Every synced table carries a
`store_id`.

Uniqueness is enforced with a **unique index**, not a primary key:

```sql
CREATE UNIQUE INDEX memberships_user_store_key
  ON memberships (user_id, COALESCE(store_id, '__org__'));
```

A `PRIMARY KEY` constraint accepts only bare column names — an expression there
is a syntax error that aborts the whole script. The `COALESCE` sentinel collapses
org-wide rows so a user gets at most one org-wide membership *and* at most one
membership per store.

## 3. Rollout phases

| Phase | What lands | Script |
|---|---|---|
| 0 | `stores`, `memberships`, `store_id` columns, backfill to `store-default`, access predicates, fleet RPCs | `scripts/multi-store-schema.sql` |
| 1 | Fleet board — live per-store presence + today's totals (`store_heartbeat`, `fleet_summary`) | — |
| 2 | Consolidated cross-store reporting (`fleet_daily`) | — |
| 3 | Central store & staff management | — |
| 4 | Central catalog push | — |

Phases 1–4 are client features on top of the Phase 0 backend
(`src/components/Fleet*.tsx`, `StoreAdmin.tsx`, `CatalogPush.tsx`, with the
Supabase calls in `src/lib/fleetClient.ts` and the pure folding in
`src/lib/fleet.ts`, `fleetReport.ts`, `catalogPush.ts`).

## 4. Advisory vs. enforced

**Advisory** (after Phase 0): terminals stamp and filter by `store_id`, but the
database still lets any authenticated device account read anything. Good enough
while you migrate; not a security boundary.

**Enforced** (§7 below): RLS decides. Run this only when you mean it.

## 5. Heartbeat and presence

Each terminal calls `store_heartbeat(store_id)` every ~60s while sync is
connected. `storeStatus()` in `src/lib/fleet.ts` turns `last_seen_at` into
online (≤2 min) / stale (≤15 min) / offline. Presence is re-derived on a client
timer so a store going quiet flips without a manual refresh.

## 6. Catalog push safety

Cross-store catalog copies match on **business key** (SKU, else name), never on
internal id — ids are store-scoped, so a "copy" is always a new row with a new
id. Category references are remapped to the target store's own categories.
Stock is per-store inventory and is never carried over (new products land at 0).
The plan only adds products/categories and updates prices; it never deletes, so
a push cannot wipe a store's catalog. See `planCatalogPush`.

## 7. Enforcing RLS

`scripts/multi-store-rls-enforce.sql` flips the store dimension from advisory to
enforced. **Read its header before running it.** Preconditions:

1. `scripts/multi-store-schema.sql` applied.
2. No NULL `store_id` anywhere (the script refuses to proceed otherwise).
3. Every terminal has its Store ID set in Settings, and every device account has
   a membership row for that store. Super-admins have an org-wide membership.

Miss any of these and terminals lose access to their own data.

### The blanket-policy trap

`scripts/schema.sql` creates permissive `"staff full access" … USING (TRUE)`
policies for the single-store case. **Postgres combines permissive policies with
OR**, so leaving them in place alongside the store-scoped policies means every
authenticated terminal keeps full cross-store read/write and the store scoping
does nothing at all.

The enforce script therefore drops them, and `schema.sql` detects an enforced
install (it looks for the `products_read` policy) and skips recreating them, so
re-running it later cannot silently reopen access.

Rollback is documented at the bottom of the enforce script; it restores the
blanket policies, because dropping the store-scoped ones on their own would lock
every terminal out rather than opening access back up.

## 8. Fleet RPCs

`fleet_summary` and `fleet_daily` are `SECURITY INVOKER`, so they stay scoped to
the caller's memberships — a super-admin sees the org, anyone else sees their own
store. Both exclude fully refunded sales and net partial refunds out of revenue.
`fleet_daily` buckets by day in each store's own timezone so a store's "day"
matches its local books.

`store_heartbeat`, `is_superadmin`, and `has_store_access` are `SECURITY
DEFINER` (policies must be able to call the predicates), and `store_heartbeat`
re-checks `has_store_access` in its body so a terminal can only touch its own
store.
