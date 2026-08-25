-- ============================================================
-- Supabase DDL Schema for POS Terminal System  (secure by default)
-- Run this in your Supabase SQL Editor:
--   Dashboard → SQL Editor → New Query → Paste & Run
-- ============================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create User Accounts Table
CREATE TABLE IF NOT EXISTS user_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier')),
  pin TEXT NOT NULL,                       -- versioned PBKDF2 hash of the PIN, never plaintext
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Staff names are authentication identifiers in the terminal UI. Enforce
-- uniqueness in single-store mode; the multi-store migration replaces this with
-- a (store_id, name) index after adding the store dimension.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_accounts' AND column_name = 'store_id'
  ) THEN
    EXECUTE 'DROP INDEX IF EXISTS user_accounts_name_unique';
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS user_accounts_store_name_unique ON user_accounts (store_id, name)';
  ELSE
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS user_accounts_name_unique ON user_accounts (name)';
  END IF;
END $$;

-- 3. Create Categories Table
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL
);

-- 4. Create Products Table
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  cost NUMERIC NOT NULL,
  category TEXT REFERENCES categories(id) ON DELETE SET NULL,
  sku TEXT NOT NULL,
  stock INTEGER NOT NULL,
  min_stock INTEGER NOT NULL,
  image TEXT NOT NULL
);

-- 5. Create Customers Table
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  points INTEGER DEFAULT 0,
  created_at TEXT
);

-- 6. Create Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  items JSONB NOT NULL,
  subtotal NUMERIC NOT NULL,
  discount NUMERIC NOT NULL,
  discount_type TEXT NOT NULL,
  discount_value NUMERIC NOT NULL,
  tax NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  payment_method TEXT NOT NULL,
  payments JSONB,                          -- tender breakdown for split payments
  cash_paid NUMERIC,
  cash_change NUMERIC,
  customer_id TEXT,
  customer_name TEXT,
  operator_id TEXT,                        -- staff member who rang up the sale
  operator_name TEXT,
  points_earned NUMERIC,                   -- loyalty points awarded at sale time
  status TEXT NOT NULL CHECK (status IN ('completed', 'partial', 'refunded')),
  refunded_items JSONB,                    -- cumulative returned quantities (partial refunds)
  refunded_amount NUMERIC,                 -- cumulative currency refunded
  refund_date TIMESTAMP WITH TIME ZONE,
  refund_authorized_by TEXT,               -- staff member who authorized the refund
  shift_id TEXT                            -- the register shift this sale belongs to
);

-- 6b. Upgrading an existing database? These add the columns introduced after
--     the initial schema (no-ops on a fresh install):
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS operator_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS operator_name TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS points_earned NUMERIC;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS refund_authorized_by TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payments JSONB;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS refunded_items JSONB;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shift_id TEXT;
-- Allow the new 'partial' refund status (the CHECK is recreated to include it):
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
  CHECK (status IN ('completed', 'partial', 'refunded'));

-- 7. Login RPC
-- ============================================================
-- SECURITY DEFINER so it can validate credentials even when RLS hides
-- user_accounts from client roles. It returns only non-secret fields — the PIN
-- hash never leaves the database. The client sends a versioned PBKDF2-derived
-- candidate; see src/lib/hash.ts for the format and legacy migration behavior.
-- This lets you keep user_accounts unreadable by clients while still supporting
-- the PIN lockscreen against the cloud copy.
-- Failed-attempt ledger backing the throttle below. Not readable by clients:
-- only the SECURITY DEFINER function touches it.
CREATE TABLE IF NOT EXISTS login_attempts (
  scope_key     TEXT CONSTRAINT login_attempts_pkey PRIMARY KEY,
  name          TEXT NOT NULL,
  failures      INTEGER NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  last_failure  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Upgrade the original name-keyed ledger without carrying its collision-prone
-- primary key forward. Existing counters remain under a legacy scope key.
ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS scope_key TEXT;
UPDATE login_attempts SET scope_key = COALESCE(scope_key, '__legacy__:' || name);
ALTER TABLE login_attempts ALTER COLUMN scope_key SET NOT NULL;
ALTER TABLE login_attempts DROP CONSTRAINT IF EXISTS login_attempts_pkey;
ALTER TABLE login_attempts ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (scope_key);
ALTER TABLE login_attempts ALTER COLUMN name SET NOT NULL;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: RLS with zero policies denies every client. verify_login()
-- reaches it as SECURITY DEFINER (the owner bypasses RLS).

-- verify_login is granted to `anon`, so anyone holding the public key that ships
-- in the client bundle can call it. A 4-digit PIN is only 10,000 combinations,
-- so without a throttle the whole space is walkable over the open internet.
-- Failures are counted per login scope key and, past a threshold, the function
-- refuses to check the PIN at all for a cool-off window.
--
-- These mirror src/lib/pinThrottle.ts, which throttles the on-device keypad.
--
-- Known trade-off: because a failure is recorded for whatever name was supplied,
-- someone holding the anon key can deliberately lock a named account out of
-- CLOUD login, and staff names are visible on the terminal's lock screen. That
-- is the accepted cost of a per-account throttle without a request identity to
-- key on. It degrades rather than denies — PIN login continues to work offline
-- against the locally persisted users, which is the normal path — and the
-- lockout self-clears on the ladder above. Rotate the anon key if you see it
-- being abused.
CREATE OR REPLACE FUNCTION public.verify_login(p_name TEXT, p_pin_hash TEXT)
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
  attempt_key := '__single__:' || p_name;
  -- FOR UPDATE serializes concurrent guesses against the same account. Without
  -- the lock, N parallel calls all read the same `failures` and all write
  -- back the same +1, so a scripted attacker firing requests concurrently
  -- burns far more than five attempts per rung and the escalation ladder never
  -- really bites. Losers of the race block here until the winner commits, then
  -- read the updated count. (No row yet = nothing to lock; the INSERT below
  -- takes the primary-key lock instead.)
  SELECT * INTO att FROM login_attempts la WHERE la.scope_key = attempt_key FOR UPDATE;

  -- Still inside a cool-off: refuse without even looking at the PIN, so a
  -- locked-out account leaks nothing about which guesses are close.
  IF att.locked_until IS NOT NULL AND att.locked_until > NOW() THEN
    RETURN;
  END IF;

  -- A streak that has gone quiet is forgotten (an honest mistyped PIN days ago
  -- shouldn't count against today).
  IF att.scope_key IS NOT NULL AND att.last_failure < NOW() - streak_reset THEN
    att.failures := 0;
  END IF;

  SELECT * INTO matched
  FROM user_accounts ua
  WHERE ua.name = p_name AND ua.pin = p_pin_hash AND ua.active = TRUE
  LIMIT 1;

  IF FOUND THEN
    DELETE FROM login_attempts la WHERE la.scope_key = attempt_key;
    RETURN QUERY SELECT matched.id, matched.name, matched.role, matched.active, matched.created_at;
    RETURN;
  END IF;

  -- Wrong PIN: record it and escalate the cool-off once past the free attempts.
  cool_off := CASE
    WHEN COALESCE(att.failures, 0) + 1 <  free_attempts THEN NULL
    WHEN COALESCE(att.failures, 0) + 1 =  free_attempts THEN INTERVAL '30 seconds'
    WHEN COALESCE(att.failures, 0) + 1 =  free_attempts + 1 THEN INTERVAL '1 minute'
    WHEN COALESCE(att.failures, 0) + 1 =  free_attempts + 2 THEN INTERVAL '2 minutes'
    WHEN COALESCE(att.failures, 0) + 1 =  free_attempts + 3 THEN INTERVAL '5 minutes'
    ELSE INTERVAL '15 minutes'
  END;

  -- Conflict target is named by constraint, not by column: `name` is also an
  -- OUT column of this function, so `ON CONFLICT (name)` is ambiguous between
  -- the PL/pgSQL variable and the table column and fails at runtime.
  INSERT INTO login_attempts AS la (scope_key, name, failures, locked_until, last_failure)
  VALUES (attempt_key, p_name, COALESCE(att.failures, 0) + 1,
          CASE WHEN cool_off IS NULL THEN NULL ELSE NOW() + cool_off END, NOW())
  ON CONFLICT ON CONSTRAINT login_attempts_pkey DO UPDATE
    SET failures     = EXCLUDED.failures,
        locked_until = EXCLUDED.locked_until,
        last_failure = EXCLUDED.last_failure;

  RETURN; -- no rows = rejected
END;
$$;
REVOKE ALL ON FUNCTION public.verify_login(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_login(TEXT, TEXT) TO anon, authenticated;

-- Public user-account projection. The PIN hash is intentionally absent; clients
-- use verify_login() for credential checks and only receive non-secret fields.
-- security_invoker keeps the caller's RLS and column privileges in force.
CREATE OR REPLACE VIEW public.user_accounts_public
WITH (security_invoker = true) AS
SELECT id, name, role, active, created_at
FROM public.user_accounts;

REVOKE ALL ON TABLE public.user_accounts FROM anon, authenticated;
GRANT SELECT (id, name, role, active, created_at) ON TABLE public.user_accounts TO authenticated;
GRANT INSERT (id, name, role, pin, active, created_at) ON TABLE public.user_accounts TO authenticated;
GRANT UPDATE (id, name, role, pin, active, created_at) ON TABLE public.user_accounts TO authenticated;
GRANT DELETE ON TABLE public.user_accounts TO authenticated;
GRANT SELECT ON public.user_accounts_public TO authenticated;
REVOKE ALL ON public.user_accounts_public FROM anon;

-- 8. Row Level Security (RECOMMENDED — secure by default)
-- ============================================================
-- RLS is ENABLED and access is granted only to the `authenticated` role. The
-- public `anon` key that ships in the client bundle therefore CANNOT read or
-- write any row on its own. A terminal must establish an authenticated session
-- (a Supabase Auth "device" account — supabase.auth.signInWithPassword) before
-- syncing. Rotate/disable that account to cut off a compromised terminal.
--
-- Terminal PIN login still works offline against the locally persisted users;
-- against the cloud it goes through verify_login() above, so PIN hashes are
-- never exposed to clients.
-- ============================================================
ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions  ENABLE ROW LEVEL SECURITY;

-- Postgres has no CREATE POLICY IF NOT EXISTS, so each policy is dropped first.
-- Without this, re-running the script (the documented upgrade path — see the
-- README) aborts here, and because the SQL editor runs the file in one
-- transaction the new ALTER TABLE … ADD COLUMN statements above roll back too.
--
-- These policies are blanket `USING (TRUE)`: any authenticated terminal may
-- touch any row. That is correct for a single-store install, but it must NOT be
-- (re)created once multi-store RLS is enforced — Postgres ORs permissive
-- policies together, so a blanket policy silently reopens cross-store access and
-- makes the store-scoped policies meaningless. The guard below detects the
-- enforced setup (scripts/multi-store-rls-enforce.sql creates products_read) and
-- leaves it alone, so re-running this script stays safe on a fleet deployment.
DO $$
DECLARE
  tbl            text;
  store_enforced boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'products_read'
  ) INTO store_enforced;

  IF store_enforced THEN
    RAISE NOTICE 'Store-scoped RLS detected — leaving the blanket staff policies out.';
    RETURN;
  END IF;

  FOREACH tbl IN ARRAY ARRAY['categories', 'products', 'customers', 'transactions']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'staff full access', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE)',
      'staff full access', tbl);
  END LOOP;

  -- User accounts: authenticated staff can manage only the explicitly granted
  -- non-secret columns; the PIN column is used only by verify_login().
  DROP POLICY IF EXISTS "staff manage users" ON user_accounts;
  DROP POLICY IF EXISTS "staff read users" ON user_accounts;
  DROP POLICY IF EXISTS "staff insert users" ON user_accounts;
  DROP POLICY IF EXISTS "staff update users" ON user_accounts;
  DROP POLICY IF EXISTS "staff delete users" ON user_accounts;
  CREATE POLICY "staff read users" ON user_accounts
    FOR SELECT TO authenticated USING (TRUE);
  CREATE POLICY "staff insert users" ON user_accounts
    FOR INSERT TO authenticated WITH CHECK (TRUE);
  CREATE POLICY "staff update users" ON user_accounts
    FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);
  CREATE POLICY "staff delete users" ON user_accounts
    FOR DELETE TO authenticated USING (TRUE);
END $$;

-- 8b. DEMO / PROTOTYPE ONLY — anon read/write without auth.
-- ============================================================
-- ⚠️  Uncommenting this exposes EVERY row (including PIN hashes) to anyone with
-- the public anon key. Use only for a throwaway local demo, never in production.
-- ------------------------------------------------------------
-- ALTER TABLE user_accounts DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE categories    DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE products      DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE customers     DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE transactions  DISABLE ROW LEVEL SECURITY;

-- 8c. Realtime (optional but recommended for multi-terminal live sync)
-- ============================================================
-- Add the synced tables to the supabase_realtime publication so the app's
-- realtime subscription (src/lib/realtimeSync.ts) receives change events and
-- mirrors another terminal's writes automatically. Safe to re-run.
-- Each ADD gets its own exception block. With a single block around all five,
-- the first already-published table aborts the block and the remaining tables
-- are silently skipped — leaving live sync half-configured.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['products', 'categories', 'customers', 'transactions', 'user_accounts']
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- already in the publication; nothing to do.
    END;
  END LOOP;
END $$;

-- 9. Initial staff accounts
-- No default account is inserted here. Production terminals create their first
-- administrator through the lock-screen setup flow, which prevents a public PIN
-- from becoming a forgotten production credential. Optional development
-- fixtures remain in src/stores/authStore.ts behind import.meta.env.DEV.
