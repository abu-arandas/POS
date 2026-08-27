# Multi-store / super-admin plan

How EA POS grows from one terminal to a fleet, and what is actually built today.

The guiding constraint: **a single-store install must never notice any of
this.** Every piece below is additive, defaults to off, and no-ops when there is
no multi-store backend. `storeId` defaults to `''`, which means "single-store
mode" everywhere it is read.

## 1. Vocabulary

| Term            | Meaning                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| **Org**         | The tenant. One business, many stores. Identified by `org_id` (a plain `TEXT`).                                |
| **Store**       | One physical location. Row in `stores`, identified by `store_id`.                                              |
| **Membership**  | Links a _cloud_ auth user (`auth.users`) to an org, optionally scoped to one store. Row in `memberships`.      |
| **UserAccount** | A _terminal_ login — the PIN accounts on the lock screen. Deliberately **not** the same thing as a membership. |

That last distinction matters. A terminal PIN account (`admin` / `manager` /
`cashier`) says what someone may do on _this device_. A membership says which
stores a _cloud identity_ may read and write. A super-admin is an org-wide
membership (`store_id IS NULL`, `role = 'superadmin'`), never a terminal role.
The Fleet board is gated on both: `SCREEN_ROLES.fleet` is admin-only in
`src/lib/access.ts`, _and_ `fetchSuperadminOrg()` must resolve a membership.

## 2. Data model

`scripts/multi-store-schema.sql` (run after `scripts/schema.sql`) adds:

- `stores` — id, org, name, address, timezone, currency, status, `last_seen_at`
- `memberships` — (user, org, store?, role), unique per user per store
- a nullable `store_id` on all five synced tables, backfilled to a single
  `store-default` store so existing rows keep working
- predicates `is_superadmin(org)` and `has_store_access(store)`
- RPCs `store_heartbeat`, `fleet_summary`, `fleet_daily`

Ids are store-scoped by convention, not by composite key: products and
categories keep a single-column `id` and carry a `store_id` alongside. This is
why a catalog "copy" between stores mints a **new** id rather than sharing one
(see §6).

## 3. Phase 1 — presence and the live board

Each terminal calls `store_heartbeat(storeId)` every 60s
(`startFleetHeartbeat` in `src/lib/fleetClient.ts`), which stamps
`stores.last_seen_at`. The board folds that into online / idle / offline via
`storeStatus()` in `src/lib/fleet.ts`:

- ≤ 2 min → **online**
- ≤ 15 min → **idle**
- otherwise → **offline**

`fleet_summary(org, since)` returns the per-store rollup the board renders.
Fully refunded sales are excluded and partial refunds are netted off, matching
how the Z-report counts.

## 4. Phase 2 — consolidated reporting

`fleet_daily(org, since)` buckets revenue and orders per store per day, using
**each store's own timezone** so a location's "day" matches its local books.
Days with no sales are omitted; the client fills gaps. Folding lives in
`src/lib/fleetReport.ts` (totals, ranking with revenue share, day series with
optional per-store drill-in).

## 5. Phase 3 — store and staff management

`StoreAdmin.tsx` creates and suspends stores and assigns memberships. Store ids
are slugified from the name (`slugifyStoreId`) with numeric disambiguation.
Writes are RLS-checked as `is_superadmin(org)` — the client-side guard is
convenience only, the database is the boundary.

`memberships` has no usable PostgREST upsert target because its uniqueness
comes from an expression index over `COALESCE(store_id, '__org__')`. The client
therefore calls database-side transactional RPCs for set/remove operations.
Org-wide rows store `NULL`, and the RPCs use NULL-safe matching.

## 6. Phase 4 — central catalog push

A super-admin edits one store's catalog and pushes it to others. Planning is
pure (`src/lib/catalogPush.ts`); the reads and writes are in `fleetClient.ts`.
Four rules keep it safe:

1. Matching is by **business key** — SKU if present, else normalised name —
   never by internal id, which is store-scoped.
2. A new product in the target gets a **fresh id**; ids are never shared across
   stores.
3. Category references are remapped to the target store's own category ids,
   matched by name and created on demand.
4. **Stock is never pushed.** Inventory is per-store; new products land at 0.

The default plan adds products/categories and updates prices. Operators may
explicitly enable metadata reconciliation for names, SKUs, categories, images,
and reorder levels. It never deletes, so a push cannot wipe a store's catalog.

## 7. Enforcing the store boundary

Until this step the store dimension is **advisory**: rows carry `store_id`, and
clients filter on it, but `schema.sql`'s blanket `USING (TRUE)` policies mean
any authenticated terminal could still read any row.

`scripts/multi-store-rls-enforce.sql` makes it **enforced** — the database
decides. Read its header before running it. All of the following must hold, or
you will lock terminals out of their own data:

1. `multi-store-schema.sql` has been applied.
2. Every row in every synced table has a non-null `store_id`. The script refuses
   to proceed otherwise.
3. Every terminal has its Store ID set in Settings, **and** its Supabase device
   user has a membership row for that store.

The script sets `store_id NOT NULL`, then replaces the blanket policies with
store-scoped read/insert/update/delete policies keyed on `has_store_access`.
Dropping the blanket policies is not optional: Postgres ORs permissive policies
together, so leaving a `USING (TRUE)` policy in place makes the store-scoped
ones meaningless. Re-running `schema.sql` afterwards is safe — it detects the
enforced setup (by looking for the `products_read` policy) and skips recreating
them. A commented rollback block at the bottom returns you to advisory mode.

## 8. Notes and known gaps

- **Store ids remain globally keyed for backward compatibility,** but new UI-created
  ids are prefixed with the organization identifier so common names do not collide.
- **Membership changes are transactional.** `setMembership` and
  `removeMembership` use database-side RPCs, including NULL-safe org-wide rows.
- **Cloud PIN verification is store-scoped when a terminal has a Store ID.** The
  local lock screen remains available offline, while `verify_login` filters the
  cloud account by `store_id` and cannot authenticate an unrelated store context.
- **The fleet RPCs are `SECURITY INVOKER`** by design, so they stay RLS-scoped
  to the caller. The predicates they lean on are `SECURITY DEFINER` with a
  pinned `search_path`.
