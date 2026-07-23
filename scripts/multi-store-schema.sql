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
  role     TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'manager', 'cashier')),
  -- One membership per user per store (org-wide rows collapse to a sentinel key).
  PRIMARY KEY (user_id, COALESCE(store_id, '__org__'))
);

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

-- 4. Indexes for the fleet queries ---------------------------------------
CREATE INDEX IF NOT EXISTS idx_transactions_store_date ON transactions (store_id, date);
CREATE INDEX IF NOT EXISTS idx_products_store           ON products (store_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user         ON memberships (user_id);

-- 5. Access predicates (SECURITY DEFINER so policies can call them) --------
CREATE OR REPLACE FUNCTION is_superadmin(p_org TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.user_id = auth.uid() AND m.org_id = p_org
      AND m.role = 'superadmin' AND m.store_id IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION has_store_access(p_store TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER AS $$
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

DROP POLICY IF EXISTS stores_read ON stores;
CREATE POLICY stores_read ON stores FOR SELECT
  USING (has_store_access(id));

DROP POLICY IF EXISTS stores_write ON stores;
CREATE POLICY stores_write ON stores FOR ALL
  USING (is_superadmin(org_id))
  WITH CHECK (is_superadmin(org_id));

DROP POLICY IF EXISTS memberships_self_read ON memberships;
CREATE POLICY memberships_self_read ON memberships FOR SELECT
  USING (user_id = auth.uid() OR is_superadmin(org_id));

DROP POLICY IF EXISTS memberships_admin_write ON memberships;
CREATE POLICY memberships_admin_write ON memberships FOR ALL
  USING (is_superadmin(org_id))
  WITH CHECK (is_superadmin(org_id));

-- 7. Heartbeat: a terminal marks its store "seen". Only its own store, and
--    only if it has access to it (RLS-checked inside the function body).
CREATE OR REPLACE FUNCTION store_heartbeat(p_store TEXT)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER AS $$
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
