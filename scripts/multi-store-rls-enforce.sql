-- ============================================================
-- Multi-store RLS enforcement  (Phase 3 — OPT-IN, run deliberately)
--
-- This is the "flip RLS on" step from docs/super-admin-plan.md §7. It turns the
-- store dimension from advisory into ENFORCED: after running this, a terminal
-- can only read/write rows for stores its Supabase user is a member of, and a
-- super-admin (org-wide membership) can read/write the whole org — decided by
-- the database, not the client.
--
-- DO NOT run this until ALL of the following are true, or you WILL lock terminals
-- out of their own data:
--   1. scripts/multi-store-schema.sql has been applied (stores, memberships,
--      store_id columns, is_superadmin / has_store_access predicates exist).
--   2. Every row in every data table has a non-null store_id (the schema script
--      backfills existing rows to 'store-default'; verify no NULLs remain).
--   3. Every terminal is configured with its Store ID (Settings) so new pushes
--      stamp store_id, AND each terminal's Supabase device user has a membership
--      row for that store (any role). Super-admins have an org-wide membership
--      (store_id IS NULL).
--
-- Idempotent and reversible (see the rollback block at the bottom). Safe to
-- re-run. Applies to the five synced tables.
-- ============================================================

-- 0. Guard: refuse to proceed if any data row is still missing a store_id.
DO $$
DECLARE
  n bigint;
BEGIN
  SELECT
    (SELECT count(*) FROM products      WHERE store_id IS NULL) +
    (SELECT count(*) FROM categories    WHERE store_id IS NULL) +
    (SELECT count(*) FROM customers     WHERE store_id IS NULL) +
    (SELECT count(*) FROM transactions  WHERE store_id IS NULL) +
    (SELECT count(*) FROM user_accounts WHERE store_id IS NULL)
  INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'Refusing to enable RLS: % row(s) still have a NULL store_id. Backfill them first.', n;
  END IF;
END $$;

-- 1. Enforce store_id going forward so a mis-configured terminal cannot write
--    unscoped rows once RLS is on.
ALTER TABLE products      ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE categories    ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE customers     ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE transactions  ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE user_accounts ALTER COLUMN store_id SET NOT NULL;

-- 2. Enable RLS + store-scoped policies on each table. A single helper predicate
--    (has_store_access, defined in multi-store-schema.sql) does the work: true
--    for a member of that store and for an org-wide super-admin.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['products', 'categories', 'customers', 'transactions', 'user_accounts']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_read', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (has_store_access(store_id))',
      tbl || '_read', tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_insert', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (has_store_access(store_id))',
      tbl || '_insert', tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_update', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE USING (has_store_access(store_id)) WITH CHECK (has_store_access(store_id))',
      tbl || '_update', tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_delete', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (has_store_access(store_id))',
      tbl || '_delete', tbl);
  END LOOP;
END $$;

-- ============================================================
-- ROLLBACK (uncomment and run to undo, e.g. to return to advisory mode):
-- DO $$
-- DECLARE tbl text;
-- BEGIN
--   FOREACH tbl IN ARRAY ARRAY['products','categories','customers','transactions','user_accounts']
--   LOOP
--     EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_read', tbl);
--     EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_insert', tbl);
--     EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_update', tbl);
--     EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_delete', tbl);
--     EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', tbl);
--   END LOOP;
-- END $$;
-- ============================================================
