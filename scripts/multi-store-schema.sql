-- ============================================================
-- Multi-store / super-admin foundations  (Phase 0 — additive)
-- Run AFTER scripts/schema.sql, in the Supabase SQL Editor.
--
-- This is additive and backward compatible: it introduces a store dimension,
-- backfills every existing row into a single "default" store, and leaves the
-- single-store terminal flow working unchanged. RLS for the new tables is
-- included; flipping RLS on for the existing data tables (products, etc.) is a
-- later phase, once every terminal stamps a store_id (see docs/super-admin-plan.md).
-- Safe to re-run.
-- ============================================================

-- 1. Stores + memberships -------------------------------------------------
CREATE TABLE IF NOT EXISTS stores (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL,
  name         TEXT NOT NULL,
  address      TEXT,
  timezone     TEXT NOT NULL DEFAULT 'UTC',
  currency     TEXT NOT NULL DEFAULT '$',
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  last_seen_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id   TEXT NOT NULL,
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,  -- NULL = org-wide (super-admin)
  role     TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'manager', 'cashier'))
);

-- One membership per user per organization and store (org-wide rows collapse
-- to a sentinel key). This has to be a unique INDEX, not a PRIMARY KEY: a PK
-- constraint accepts only bare column names, so the COALESCE expression would be
-- invalid in a primary-key declaration.
DROP INDEX IF EXISTS memberships_user_store_key;
CREATE UNIQUE INDEX memberships_user_store_key
  ON memberships (user_id, org_id, COALESCE(store_id, '__org__'));

-- 2. store_id on every synced table (nullable → backfilled below) ---------
ALTER TABLE products      ADD COLUMN IF NOT EXISTS store_id TEXT REFERENCES stores(id);
ALTER TABLE categories    ADD COLUMN IF NOT EXISTS store_id TEXT REFERENCES stores(id);
ALTER TABLE customers     ADD COLUMN IF NOT EXISTS store_id TEXT REFERENCES stores(id);
ALTER TABLE transactions  ADD COLUMN IF NOT EXISTS store_id TEXT REFERENCES stores(id);
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS store_id TEXT REFERENCES stores(id);

-- 3. Backfill: create one default store and attach all existing rows to it.
INSERT INTO stores (id, org_id, name)
VALUES ('store-default', 'org-default', 'Main Store')
ON CONFLICT (id) DO NOTHING;

UPDATE products      SET store_id = 'store-default' WHERE store_id IS NULL;
UPDATE categories    SET store_id = 'store-default' WHERE store_id IS NULL;
UPDATE customers     SET store_id = 'store-default' WHERE store_id IS NULL;
UPDATE transactions  SET store_id = 'store-default' WHERE store_id IS NULL;
UPDATE user_accounts SET store_id = 'store-default' WHERE store_id IS NULL;

-- Staff names are unique within a store, while the same name may exist in a
-- different store in the organization. Remove the single-store index if the
-- base schema created it before this additive migration ran.
DROP INDEX IF EXISTS user_accounts_name_unique;
CREATE UNIQUE INDEX IF NOT EXISTS user_accounts_store_name_unique
  ON user_accounts (store_id, name);

-- Upgrade older name-keyed attempt ledgers before installing the scoped RPC.
ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS scope_key TEXT;
UPDATE login_attempts SET scope_key = COALESCE(scope_key, '__legacy__:' || name);
ALTER TABLE login_attempts ALTER COLUMN scope_key SET NOT NULL;
ALTER TABLE login_attempts DROP CONSTRAINT IF EXISTS login_attempts_pkey;
ALTER TABLE login_attempts ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (scope_key);

-- Replace the single-store login routine with a compatible three-argument form.
-- The third argument has a default, so existing two-argument callers continue to
-- work until a terminal is configured with a store id; scoped callers must match
-- the account's store_id. The old two-argument routine is removed so it cannot be
-- used to bypass store isolation after this migration.
DROP FUNCTION IF EXISTS public.verify_login(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.verify_login(
  p_name TEXT,
  p_pin_hash TEXT,
  p_store_id TEXT DEFAULT NULL
)
RETURNS TABLE (id TEXT, name TEXT, role TEXT, active BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  free_attempts CONSTANT INTEGER  := 5;
  streak_reset  CONSTANT INTERVAL := INTERVAL '30 minutes';
  att           login_attempts%ROWTYPE;
  matched       user_accounts%ROWTYPE;
  attempt_key   TEXT;
  cool_off      INTERVAL;
BEGIN
  attempt_key := COALESCE('__store__:' || p_store_id, '__unscoped__:') || p_name;
  SELECT * INTO att FROM login_attempts la WHERE la.scope_key = attempt_key FOR UPDATE;

  IF att.locked_until IS NOT NULL AND att.locked_until > NOW() THEN
    RETURN;
  END IF;

  IF att.scope_key IS NOT NULL AND att.last_failure < NOW() - streak_reset THEN
    att.failures := 0;
  END IF;

  SELECT * INTO matched
  FROM user_accounts ua
  WHERE ua.name = p_name
    AND ua.pin = p_pin_hash
    AND ua.active = TRUE
    AND (p_store_id IS NULL OR ua.store_id = p_store_id)
  LIMIT 1;

  IF FOUND THEN
    DELETE FROM login_attempts la WHERE la.scope_key = attempt_key;
    RETURN QUERY SELECT matched.id, matched.name, matched.role, matched.active, matched.created_at;
    RETURN;
  END IF;

  cool_off := CASE
    WHEN COALESCE(att.failures, 0) + 1 <  free_attempts THEN NULL
    WHEN COALESCE(att.failures, 0) + 1 =  free_attempts THEN INTERVAL '30 seconds'
    WHEN COALESCE(att.failures, 0) + 1 =  free_attempts + 1 THEN INTERVAL '1 minute'
    WHEN COALESCE(att.failures, 0) + 1 =  free_attempts + 2 THEN INTERVAL '2 minutes'
    WHEN COALESCE(att.failures, 0) + 1 =  free_attempts + 3 THEN INTERVAL '5 minutes'
    ELSE INTERVAL '15 minutes'
  END;


  -- Prune before writing. verify_login is granted to `anon`, the name is
  -- caller-supplied and arbitrary, and a row is only ever deleted when that
  -- exact name later logs in successfully. So every distinct name anyone ever
  -- fails against leaves a row behind for good: whoever holds the public key
  -- can grow this table without limit just by cycling names, and the honest
  -- case leaks rows too (a typo'd name, a since-deleted account). Dropping
  -- streaks past the reset window bounds the table to the names actually seen
  -- in the last streak_reset. It cannot forgive a live lockout — rows still
  -- inside their cool-off are excluded.
  --
  -- FOR UPDATE SKIP LOCKED, not a bare DELETE: this transaction already holds a
  -- lock on its own row from the SELECT above, so two concurrent logins whose
  -- rows are both stale would each block trying to delete the other's and
  -- deadlock, which Postgres resolves by aborting one — turning a routine login
  -- into an error. Skipping rows another transaction holds makes that
  -- impossible; a row skipped now is simply pruned by the next caller. LIMIT
  -- keeps one login from paying for a large backlog in a single call.
  DELETE FROM login_attempts la
   WHERE la.scope_key IN (
     SELECT sub.scope_key
       FROM login_attempts sub
      WHERE sub.last_failure < NOW() - streak_reset
        AND (sub.locked_until IS NULL OR sub.locked_until <= NOW())
      LIMIT 100
      FOR UPDATE SKIP LOCKED
   );

  INSERT INTO login_attempts AS la (scope_key, name, failures, locked_until, last_failure)
  VALUES (attempt_key, p_name, COALESCE(att.failures, 0) + 1,
          CASE WHEN cool_off IS NULL THEN NULL ELSE NOW() + cool_off END, NOW())
  ON CONFLICT ON CONSTRAINT login_attempts_pkey DO UPDATE
    SET failures     = EXCLUDED.failures,
        locked_until = EXCLUDED.locked_until,
        last_failure = EXCLUDED.last_failure;

  RETURN;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_login(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_login(TEXT, TEXT, TEXT) TO anon, authenticated;

-- Extend the non-secret user projection with its store scope after the additive
-- column exists. The PIN hash remains excluded from the view.
CREATE OR REPLACE VIEW public.user_accounts_public
WITH (security_invoker = true) AS
SELECT id, name, role, active, created_at, store_id
FROM public.user_accounts;

-- The base schema intentionally grants only non-secret user columns. Add the
-- migration column to those grants so store-scoped cloud upserts keep working.
GRANT SELECT (id, name, role, active, created_at, store_id) ON TABLE public.user_accounts TO authenticated;
GRANT INSERT (id, name, role, pin, active, created_at, store_id) ON TABLE public.user_accounts TO authenticated;
GRANT UPDATE (id, name, role, pin, active, created_at, store_id) ON TABLE public.user_accounts TO authenticated;

-- 4. Indexes for the fleet queries ---------------------------------------
CREATE INDEX IF NOT EXISTS idx_transactions_store_date ON transactions (store_id, date);
CREATE INDEX IF NOT EXISTS idx_products_store           ON products (store_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user         ON memberships (user_id);

-- Every store_id column added in section 2 is filtered on by a pull in
-- src/lib/supabase.ts, but only products and transactions were indexed, so
-- pullCategories() and pullCustomers() scanned the whole table on a fleet
-- database and got slower with every store added to the org.
CREATE INDEX IF NOT EXISTS idx_categories_store ON categories (store_id);
CREATE INDEX IF NOT EXISTS idx_customers_store  ON customers (store_id);

-- The fleet console filters both of these by org_id — listStores() and
-- listMemberships() in src/lib/fleetClient.ts. memberships was indexed by
-- user_id only, which serves the access predicates but not the console's
-- listing, and stores had no index beyond its primary key.
CREATE INDEX IF NOT EXISTS idx_stores_org      ON stores (org_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org ON memberships (org_id);

-- memberships.store_id REFERENCES stores(id) ON DELETE CASCADE, and Postgres
-- does not index a foreign key for you. Deleting a store had to scan
-- memberships to find the rows to cascade.
CREATE INDEX IF NOT EXISTS idx_memberships_store ON memberships (store_id);

-- 5. Access predicates (SECURITY DEFINER so policies can call them) --------
--
-- Every SECURITY DEFINER function here pins `SET search_path` (matching
-- verify_login in schema.sql). A definer function that inherits the caller's
-- search_path is the classic Postgres privilege-escalation vector: anyone able
-- to create objects in a schema that sorts earlier can shadow `memberships` or
-- `stores` and make the predicate return TRUE. These two functions ARE the
-- multi-store authorization boundary, so they are the last place to leave it
-- mutable. (Supabase's linter flags this as `function_search_path_mutable`.)
CREATE OR REPLACE FUNCTION is_superadmin(p_org TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.user_id = auth.uid() AND m.org_id = p_org
      AND m.role = 'superadmin' AND m.store_id IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION has_store_access(p_store TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.user_id = auth.uid()
      AND (
        m.store_id = p_store
        OR (m.store_id IS NULL
            AND m.org_id = (SELECT s.org_id FROM stores s WHERE s.id = p_store))
      )
  );
$$;

-- 6. RLS on the new tables ------------------------------------------------
ALTER TABLE stores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- Every policy names `TO authenticated`, matching the blanket policies in
-- schema.sql. A policy with no TO clause defaults to TO PUBLIC, which includes
-- the `anon` role that ships in the client bundle. The predicates below all
-- resolve auth.uid() (NULL for anon), so anon is already refused on the merits —
-- but the role clause is the cheap outer guard, and dropping it means a future
-- predicate change is one edit away from exposing rows to the public key.
DROP POLICY IF EXISTS stores_read ON stores;
CREATE POLICY stores_read ON stores FOR SELECT TO authenticated
  USING (has_store_access(id));

DROP POLICY IF EXISTS stores_write ON stores;
CREATE POLICY stores_write ON stores FOR ALL TO authenticated
  USING (is_superadmin(org_id))
  WITH CHECK (is_superadmin(org_id));

DROP POLICY IF EXISTS memberships_self_read ON memberships;
CREATE POLICY memberships_self_read ON memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_superadmin(org_id));

DROP POLICY IF EXISTS memberships_admin_write ON memberships;
CREATE POLICY memberships_admin_write ON memberships FOR ALL TO authenticated
  USING (is_superadmin(org_id))
  WITH CHECK (is_superadmin(org_id));

-- 7. Atomic membership mutations -----------------------------------------
-- The client must not perform delete-then-insert over two HTTP requests: an
-- interrupted reassignment would otherwise remove the user's only membership.
-- These invoker functions execute both statements in the caller's transaction;
-- the existing memberships_admin_write policy remains the authorization gate.
CREATE OR REPLACE FUNCTION public.set_membership(
  p_user_id UUID,
  p_org_id TEXT,
  p_store_id TEXT,
  p_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  DELETE FROM memberships
  WHERE user_id = p_user_id
    AND org_id = p_org_id
    AND store_id IS NOT DISTINCT FROM p_store_id;

  INSERT INTO memberships (user_id, org_id, store_id, role)
  VALUES (p_user_id, p_org_id, p_store_id, p_role);
END;
$$;
REVOKE ALL ON FUNCTION public.set_membership(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_membership(UUID, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_membership(
  p_user_id UUID,
  p_org_id TEXT,
  p_store_id TEXT
)
RETURNS VOID
LANGUAGE SQL
SECURITY INVOKER
SET search_path = public
AS $$
  DELETE FROM memberships
  WHERE user_id = p_user_id
    AND org_id = p_org_id
    AND store_id IS NOT DISTINCT FROM p_store_id;
$$;
REVOKE ALL ON FUNCTION public.remove_membership(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_membership(UUID, TEXT, TEXT) TO authenticated;

-- 7b. Atomic catalog push ------------------------------------------------
-- Same reasoning as section 7, one level up: the fleet console pushed a
-- catalog as two HTTP requests, categories then products. A category upsert
-- that succeeded followed by a product upsert that failed left the target
-- store holding categories whose products never arrived, and the caller saw
-- only `false` — no way to tell "nothing was written" from "half of it was".
--
-- A plpgsql body runs in the caller's transaction, so both statements commit
-- or roll back together. Categories still go first: products.category is a FK
-- to categories(id), and by the second statement the new rows exist in the
-- transaction.
--
-- SECURITY INVOKER, like set_membership above: the per-table policies from
-- multi-store-rls-enforce.sql (has_store_access(store_id)) remain the
-- authorization gate. This deliberately neither widens nor narrows who may
-- write a catalog — it is exactly the authorization the two direct upserts
-- already had, and re-implementing it here would be one more thing to drift.
CREATE OR REPLACE FUNCTION public.push_store_catalog(
  p_store_id TEXT,
  p_categories JSONB,
  p_products JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- categories.id and products.id are globally unique: store_id is a plain
  -- column, not part of the key. So an upsert keyed on id alone reaches across
  -- store boundaries — a payload carrying an id that already belongs to another
  -- store would update that store's row, and writing store_id in the DO UPDATE
  -- would move it wholesale. Moving a category is the worse half: products left
  -- behind in the original store keep a category reference that now points into
  -- a different store.
  --
  -- planCatalogPush never produces such a payload (it mints fresh ids and
  -- otherwise reuses the target store's own), but this is an authenticated RPC
  -- and the callers are not the only thing that can reach it. So a collision is
  -- refused outright rather than resolved: raising here aborts the whole push,
  -- which is the same all-or-nothing guarantee the rest of this function gives.
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(p_categories, '[]'::jsonb)) AS c(id TEXT)
    JOIN categories existing ON existing.id = c.id
    WHERE existing.store_id IS DISTINCT FROM p_store_id
  ) THEN
    RAISE EXCEPTION
      'push_store_catalog: a category id in this payload already belongs to a different store than %',
      p_store_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(p_products, '[]'::jsonb)) AS p(id TEXT)
    JOIN products existing ON existing.id = p.id
    WHERE existing.store_id IS DISTINCT FROM p_store_id
  ) THEN
    RAISE EXCEPTION
      'push_store_catalog: a product id in this payload already belongs to a different store than %',
      p_store_id;
  END IF;

  -- store_id is set on insert but never in the DO UPDATE: past the guard above
  -- an existing row is already scoped to p_store_id, so re-writing it could only
  -- ever change a scope, never establish the right one.
  INSERT INTO categories (id, name, color, store_id)
  SELECT c.id, c.name, c.color, p_store_id
  FROM jsonb_to_recordset(COALESCE(p_categories, '[]'::jsonb))
    AS c(id TEXT, name TEXT, color TEXT)
  ON CONFLICT (id) DO UPDATE
    SET name  = EXCLUDED.name,
        color = EXCLUDED.color;

  INSERT INTO products (id, name, price, cost, category, sku, stock, min_stock, image, store_id)
  SELECT p.id, p.name, p.price, p.cost, NULLIF(p.category, ''), p.sku,
         p.stock, p.min_stock, p.image, p_store_id
  FROM jsonb_to_recordset(COALESCE(p_products, '[]'::jsonb))
    AS p(id TEXT, name TEXT, price NUMERIC, cost NUMERIC, category TEXT,
         sku TEXT, stock INTEGER, min_stock INTEGER, image TEXT)
  ON CONFLICT (id) DO UPDATE
    SET name      = EXCLUDED.name,
        price     = EXCLUDED.price,
        cost      = EXCLUDED.cost,
        category  = EXCLUDED.category,
        sku       = EXCLUDED.sku,
        stock     = EXCLUDED.stock,
        min_stock = EXCLUDED.min_stock,
        image     = EXCLUDED.image;
END;
$$;
REVOKE ALL ON FUNCTION public.push_store_catalog(TEXT, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.push_store_catalog(TEXT, JSONB, JSONB) TO authenticated;

-- 8. Heartbeat: a terminal marks its store "seen". Only its own store, and
--    only if it has access to it (RLS-checked inside the function body).
CREATE OR REPLACE FUNCTION store_heartbeat(p_store TEXT)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT has_store_access(p_store) THEN
    RAISE EXCEPTION 'no access to store %', p_store;
  END IF;
  UPDATE stores SET last_seen_at = NOW() WHERE id = p_store;
END;
$$;

-- 8. Fleet summary: per-store rollup for the super-admin board, since a
--    timestamp. SECURITY INVOKER so it is still RLS-scoped to the caller's
--    memberships (a super-admin sees the whole org; others see their store).
CREATE OR REPLACE FUNCTION fleet_summary(p_org TEXT, p_since TIMESTAMPTZ)
RETURNS TABLE (
  store_id     TEXT,
  store_name   TEXT,
  revenue      NUMERIC,
  orders       BIGINT,
  last_seen_at TIMESTAMPTZ
) LANGUAGE SQL STABLE SECURITY INVOKER AS $$
  SELECT s.id, s.name,
         COALESCE(SUM(t.total - COALESCE(t.refunded_amount, 0)) FILTER (WHERE t.date >= p_since), 0),
         COALESCE(COUNT(t.id)  FILTER (WHERE t.date >= p_since), 0),
         s.last_seen_at
  FROM stores s
  LEFT JOIN transactions t
    ON t.store_id = s.id AND t.status <> 'refunded'
  WHERE s.org_id = p_org
  GROUP BY s.id, s.name, s.last_seen_at
  ORDER BY s.name;
$$;

-- 8b. Fleet daily: per-store, per-day revenue + order counts over a window, for
--     the consolidated cross-store reporting dashboard (Phase 2). Days are
--     bucketed in each store's own timezone so a store's "day" matches its local
--     books. SECURITY INVOKER so it stays RLS-scoped to the caller's memberships.
--     Days with no sales are omitted (the client fills gaps).
CREATE OR REPLACE FUNCTION fleet_daily(p_org TEXT, p_since TIMESTAMPTZ)
RETURNS TABLE (
  store_id   TEXT,
  store_name TEXT,
  day        DATE,
  revenue    NUMERIC,
  orders     BIGINT
) LANGUAGE SQL STABLE SECURITY INVOKER AS $$
  SELECT s.id, s.name,
         (date_trunc('day', t.date AT TIME ZONE s.timezone))::date AS day,
         COALESCE(SUM(t.total - COALESCE(t.refunded_amount, 0)), 0),
         COUNT(t.id)
  FROM stores s
  JOIN transactions t
    ON t.store_id = s.id AND t.status <> 'refunded' AND t.date >= p_since
  WHERE s.org_id = p_org
  GROUP BY s.id, s.name, day
  ORDER BY day, s.name;
$$;

-- 9. Realtime for the fleet board (live online/offline transitions).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE stores;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
