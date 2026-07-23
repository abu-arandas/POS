# Super-Admin & Multi-Store Plan

Status: **Phase 0 (Foundations) implemented — later phases proposed**
Audience: maintainers deciding how EA POS should grow from a single-store app into
a multi-store platform overseen by a super-admin.

**Implemented so far (Phase 0):** `Store` / `Membership` / `Role` types
(`src/types.ts`); the pure fleet helpers `storeStatus` / `summarizeFleet`
(`src/lib/fleet.ts`, unit-tested); the additive backend migration
(`scripts/multi-store-schema.sql` — stores, memberships, `store_id` columns +
backfill, RLS predicates/policies, `store_heartbeat` + `fleet_summary` RPCs); a
terminal `storeId` in the settings store; and backward-compatible `store_id`
stamping/filtering in the sync layer (a no-op while `storeId` is empty, so
single-store installs are unchanged). Phases 1–4 below are still proposed.

---

## 1. Goal

Give an owner/operator of **multiple stores** one place to:

- See **which stores are online right now** (live "connected stores" board).
- View **consolidated performance** across all stores (sales, profit, orders,
  low stock) and drill into any single store.
- Manage **stores, staff, and catalog** centrally, and push catalog/price/user
  changes down to individual stores.
- Do all of this **without weakening** the per-store terminals, which must keep
  working fully offline exactly as they do today.

The headline capability the request names — *"checks all the connected
stores"* — is the **Fleet board**: a super-admin screen that lists every store,
its live online/offline state, last-seen time, today's sales, and any alerts.

---

## 2. Where we are today (grounded recap)

The app is **single-store, offline-first**:

- **State**: 8 Zustand stores persisted to IndexedDB (`idb-keyval`). The terminal
  is the source of truth and works with no network.
- **Cloud sync (optional)**: one Supabase project == one store. `src/lib/sync.ts`
  + `src/lib/supabase.ts` push/pull five tables — `products`, `categories`,
  `customers`, `transactions`, `user_accounts` — with a debounced realtime
  re-pull (`src/lib/realtimeSync.ts`). Device auth via `signInDevice`.
- **Roles**: `admin | manager | cashier`, enforced by `SCREEN_ROLES` in
  `src/lib/access.ts`. All three are **within one store** — there is no notion of
  an actor who spans stores.
- **Schema**: `scripts/schema.sql`. **No table has a `store_id`.** Every row in a
  project belongs, implicitly, to that one store.

Key consequence: today, "multiple stores" == "multiple isolated Supabase
projects", with no way to see across them. The plan below adds a store dimension
so one backend can hold many stores and a super-admin can query across them.

---

## 3. Core model

Introduce two first-class concepts:

- **Store** — a physical location. Has an id, name, address, timezone, currency,
  status, and a `last_seen_at` heartbeat.
- **Membership** — links a Supabase Auth **user** to a **store** with a role.
  A super-admin is a membership at the **org** level (all stores) rather than a
  single store.

```
Org (tenant)
 ├── Store A ──> terminals, staff (admin/manager/cashier), catalog, sales
 ├── Store B ──> …
 └── Store C ──> …
Super-admin: an org-level member who can read every store and manage them.
```

### 3.1 New / changed types (`src/types.ts`)

```ts
export interface Store {
  id: string;
  orgId: string;
  name: string;
  address?: string;
  timezone: string;         // e.g. "America/Los_Angeles"
  currency: string;
  status: 'active' | 'suspended';
  lastSeenAt?: string;      // ISO; updated by terminal heartbeat
  createdAt: string;
}

// Adds the super-admin tier above the existing per-store roles.
export type Role = 'superadmin' | 'admin' | 'manager' | 'cashier';

export interface Membership {
  userId: string;           // Supabase auth uid
  orgId: string;
  storeId: string | null;   // null == org-wide (super-admin)
  role: Role;
}
```

`storeId: string` is added to every synced record (products, categories,
customers, transactions, user_accounts, and — once synced — shifts/PO/supply).

---

## 4. Backend (Supabase) design

### 4.1 Schema additions (`scripts/schema.sql`)

```sql
create table stores (
  id           text primary key,
  org_id       text not null,
  name         text not null,
  address      text,
  timezone     text not null default 'UTC',
  currency     text not null default '$',
  status       text not null default 'active' check (status in ('active','suspended')),
  last_seen_at timestamptz,
  created_at   timestamptz not null default now()
);

create table memberships (
  user_id  uuid not null references auth.users(id) on delete cascade,
  org_id   text not null,
  store_id text references stores(id) on delete cascade,  -- null = org-wide (super-admin)
  role     text not null check (role in ('superadmin','admin','manager','cashier')),
  primary key (user_id, coalesce(store_id, '__org__'))
);

-- Every existing synced table gains a store_id (backfilled to the current store).
alter table products      add column store_id text references stores(id);
alter table categories    add column store_id text references stores(id);
alter table customers     add column store_id text references stores(id);
alter table transactions  add column store_id text references stores(id);
alter table user_accounts add column store_id text references stores(id);
-- Indexed for the fleet queries:
create index on transactions (store_id, date);
create index on products (store_id);
```

### 4.2 Row-Level Security — the security backbone

Two helper predicates keep policies short and auditable:

```sql
-- Is the caller a super-admin for this org?
create or replace function is_superadmin(p_org text) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from memberships m
    where m.user_id = auth.uid() and m.org_id = p_org
      and m.role = 'superadmin' and m.store_id is null
  );
$$;

-- Does the caller belong to this specific store (any role)?
create or replace function has_store_access(p_store text) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from memberships m
    where m.user_id = auth.uid()
      and (m.store_id = p_store
           or (m.store_id is null and m.org_id =
               (select org_id from stores s where s.id = p_store)))
  );
$$;
```

Then, on each synced table:

```sql
alter table transactions enable row level security;

create policy read_own_store  on transactions for select
  using (has_store_access(store_id));

create policy write_own_store on transactions for insert
  with check (has_store_access(store_id));
-- (analogous update/delete policies)
```

A terminal signs in as its store's device user → it can only read/write **its**
`store_id`. A super-admin's membership (`store_id is null`) satisfies
`has_store_access` for **every** store in the org → it can read the whole fleet,
**enforced by the database, not the client.** This is the single most important
security property of the design.

### 4.3 Aggregation RPCs (fast fleet views)

Rather than pulling every transaction across every store, the super-admin
dashboard calls `SECURITY INVOKER` RPCs that aggregate server-side and are still
RLS-scoped:

```sql
-- Per-store rollup for a date window: today's revenue, orders, low-stock count.
create function fleet_summary(p_org text, p_since timestamptz)
returns table (store_id text, store_name text, revenue numeric,
               orders int, last_seen_at timestamptz, online boolean) ...
```

`online` = `last_seen_at > now() - interval '2 minutes'`.

---

## 5. Store presence / heartbeat ("connected stores")

The literal ask — *check all connected stores* — is a **liveness** feature.

- Each terminal, while sync is enabled, calls a lightweight `store_heartbeat`
  RPC every ~60s that sets `stores.last_seen_at = now()` for its store (and can
  piggyback terminal count, app version, pending-unsynced count).
- The super-admin Fleet board subscribes via **Supabase Realtime** to the
  `stores` table and/or polls `fleet_summary`, rendering each store as:
  - 🟢 **Online** — `last_seen_at` within the last 2 min
  - 🟡 **Stale** — 2–15 min
  - 🔴 **Offline** — older / never
- Offline is expected and fine (offline-first); the board simply shows last-seen
  and cached last-known numbers. No terminal is ever blocked by the backend.

New client module: `src/lib/fleet.ts` (heartbeat sender + fleet queries),
mirroring the existing `realtimeSync.ts` pattern.

---

## 6. Front-end

### 6.1 Super-admin surface

A new top-level area shown **only** to a `superadmin` membership (gated the same
way `SCREEN_ROLES` gates today, extended for the new role):

- **Fleet board** (`components/admin/FleetBoard.tsx`) — the "connected stores"
  grid: online status, last-seen, today's revenue/orders, low-stock and
  unsynced-count alerts per store; click a store to impersonate/drill in.
- **Consolidated dashboard** (`components/admin/FleetDashboard.tsx`) — reuses the
  existing Dashboard charts but fed by `fleet_summary` across all stores, with a
  store filter (All / specific store).
- **Store management** (`components/admin/Stores.tsx`) — create/suspend stores,
  invite staff, assign roles/memberships.
- **Central catalog push** (later phase) — edit catalog/prices once, push to
  selected stores.

### 6.2 Access control

Extend `Role` and `SCREEN_ROLES` with `superadmin`, add the new screens to the
map, and add an `isSuperAdmin(currentUser)` guard. The super-admin screens live
behind both the client guard **and** RLS, so a tampered client still can't read
another org's data.

### 6.3 Impersonation / drill-in

"Open store X" loads that store's data **read-only** into the existing Dashboard/
History/Inventory components by passing a `storeId` scope — reusing all current
UI rather than rebuilding it.

---

## 7. Migration path (don't break existing installs)

1. **Additive schema**: `store_id` is nullable at first; a migration creates one
   `stores` row for the existing project and backfills every table's `store_id`
   to it. Existing single-store terminals keep working unchanged.
2. **Client store id**: `settingsStore` gains a `storeId` (defaulting to the
   backfilled id); sync push/pull start stamping/filtering by it.
3. **Flip RLS on** once every row has a `store_id` and every terminal sends one.
4. Single-store users who never opt into multi-store see **no change**.

---

## 8. Phased rollout

| Phase | Deliverable | Notes |
|------|-------------|-------|
| **0. Foundations** ✅ | `stores` + `memberships` tables, `store_id` columns + backfill, RLS + heartbeat/summary RPCs, `storeId` in settings + backward-compatible sync scoping, fleet helpers | **Done.** No visible UI change; unlocks everything else |
| **1. Fleet board (MVP)** | Heartbeat RPC + `src/lib/fleet.ts`, `superadmin` role, read-only Fleet board of online/offline stores with today's totals | Delivers the core "check all connected stores" ask |
| **2. Consolidated reporting** | `fleet_summary` RPC, cross-store dashboard with store filter, per-store drill-in | Reuses existing Dashboard components |
| **3. Central management** | Store CRUD, staff invites/memberships, RLS enforced (flip on) | Security-hardened multi-tenant |
| **4. Central catalog push** | Edit-once, push catalog/prices/users to chosen stores | Highest effort; optional |

Phases 0–1 are the smallest slice that satisfies the request. Each phase is a
shippable PR.

---

## 9. Testable, pure pieces (fits the repo's testing style)

- `lib/fleet.ts`: `storeStatus(lastSeenAt, now)` → `'online' | 'stale' | 'offline'`
  (pure, unit-tested like `poReport`/`kitchenRouting`).
- `lib/fleetReport.ts`: fold `fleet_summary` rows into totals + per-store list
  (pure, unit-tested).
- RLS/RPC behavior covered by SQL tests / a seeded staging project.

---

## 10. Security considerations

- **RLS is mandatory** before multi-store data shares a project — it is the only
  thing preventing store A from reading store B. Client checks are convenience,
  not security.
- **Super-admin is powerful**: scope memberships to an `org_id`; never a global
  "sees all orgs" flag. Audit-log super-admin reads/writes.
- **Heartbeat can't leak data** — it only writes `last_seen_at` for the caller's
  own store (RLS-checked).
- **PII**: consolidated views should default to aggregates; per-customer data
  stays behind store-scoped drill-in.

---

## 11. Open decisions (need a call before Phase 0)

1. **One shared Supabase project (multi-tenant + RLS)** — recommended; or keep
   **one project per store** and add a separate aggregator service? The plan
   above assumes the shared-project model.
2. **Real auth**: adopt Supabase Auth users for staff (today staff are PIN
   records in a table). Super-admin needs real accounts; do we migrate staff too,
   or keep PIN-for-terminal + real-auth-for-super-admin?
3. **Realtime vs polling** for the fleet board (Realtime is nicer; polling is
   simpler and cheaper at small scale).
4. **Hosting the super-admin surface**: in the same app (role-gated) or a
   separate web build? Same app is less work and reuses components.

---

## 12. Rough effort

- Phase 0: ~1 PR (schema + migration + sync `storeId`).
- Phase 1: ~1–2 PRs (heartbeat, fleet lib + tests, Fleet board UI).
- Phase 2: ~1–2 PRs. Phase 3: ~2 PRs. Phase 4: ~2+ PRs.

MVP fleet visibility (Phases 0–1) is realistically a few focused PRs on top of
the existing sync layer, which already does auth, push/pull, and realtime — the
new work is mostly the store dimension, the heartbeat, and one new screen.
