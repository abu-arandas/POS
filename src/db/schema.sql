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
  stock INTEGER NOT NULL,               -- for a varianted product: the sum of variants.stock
  min_stock INTEGER NOT NULL,
  image TEXT NOT NULL,
  variant_types JSONB,                  -- the axes the product varies along (Size, Colour, …)
  variants JSONB                        -- the sellable combinations, each with its own sku/stock
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
  tax_rate NUMERIC,                        -- rate charged at sale time, for reprints
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
-- Left NULL on existing rows on purpose: the rate they were charged at is not
-- recoverable (tax is rounded to the cent, so several rates fit the same
-- amount), and those receipts reprint without a percentage rather than with a
-- guessed one.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tax_rate NUMERIC;
-- Product variants. JSONB rather than two side tables: a variant is only ever
-- read as part of its product (the register pulls the whole catalogue, the till
-- works offline against a local copy), it is written whole by the product form,
-- and nothing queries across variants of different products. Two tables would
-- buy referential integrity this app cannot use and cost every catalogue read a
-- pair of joins plus a client-side regroup.
--
-- Both stay NULL on existing rows, which is exactly what a product with no
-- variants is — no backfill, and no behaviour change for a store that never
-- adds one.
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_types JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variants JSONB;

-- Allow the new 'partial' refund status (the CHECK is recreated to include it):
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
  CHECK (status IN ('completed', 'partial', 'refunded'));

-- 6c. Indexes
-- ============================================================
-- Postgres creates an index for a PRIMARY KEY and a UNIQUE constraint and for
-- nothing else — notably NOT for a foreign key. Until this section the only
-- indexes here were those implicit ones, so a single-store install (the default,
-- and the path the README documents) ran every one of these as a sequential
-- scan. The multi-store migration added indexes for the fleet queries and left
-- the base schema without them.
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date DESC);

-- pullTransactions() orders by date with no store filter until the multi-store
-- migration runs. (That migration adds (store_id, date), which serves the
-- scoped query; this one still serves the unscoped ORDER BY.)

CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);

-- products.category REFERENCES categories(id) ON DELETE SET NULL. On every
-- category delete Postgres must find the referencing product rows, and with no
-- index on the referencing column that is a full scan of products. Deleting a
-- category is a normal operator action in Inventory, not a rare migration.

-- 6d. Deployment state
-- ============================================================
-- Which access model this database is running under. Section 8 below installs
-- blanket `USING (TRUE)` policies that are correct for a single-store install
-- and catastrophic for a fleet one — Postgres ORs permissive policies together,
-- so re-creating a blanket policy on a store-scoped database silently restores
-- cross-store access to every terminal.
--
-- Re-running this script is the documented upgrade path, so "do not re-create
-- them" has to survive a re-run. That used to be decided by probing for a policy
-- by name (`products_read`), which couples this file to one identifier inside
-- another migration: rename it, apply that migration partially, or apply it in a
-- different order, and this script quietly concludes "single store" and reopens
-- the fleet. The mode is recorded as a fact instead, by the migration that
-- changes it.
CREATE TABLE IF NOT EXISTS pos_schema_state (
  id         BOOLEAN PRIMARY KEY DEFAULT TRUE CONSTRAINT pos_schema_state_single_row CHECK (id),
  rls_mode   TEXT NOT NULL DEFAULT 'single-store'
             CHECK (rls_mode IN ('single-store', 'store-scoped')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO pos_schema_state (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

-- Deployment state is server-side bookkeeping, not application data: no client
-- role may read it and none may change it. RLS with zero policies denies every
-- client; the REVOKE removes Supabase's default table grants.
ALTER TABLE pos_schema_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pos_schema_state FROM anon, authenticated;

-- Reads the recorded mode, treating a database upgraded from before this table
-- existed as single-store (section 8's caller ORs in the legacy policy probe, so
-- such a database is still detected correctly).
CREATE OR REPLACE FUNCTION public.pos_rls_mode()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT rls_mode FROM pos_schema_state WHERE id), 'single-store');
$$;
REVOKE ALL ON FUNCTION public.pos_rls_mode() FROM PUBLIC;

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
-- RLS with no policies already denies every client, but Supabase's default
-- privileges hand new public-schema tables to anon and authenticated, so the
-- grant exists until it is taken away. Two independent denials, because this
-- table records exactly when each account's cool-off expires.
REVOKE ALL ON TABLE login_attempts FROM anon, authenticated;
-- Backs the opportunistic prune inside verify_login() below.
CREATE INDEX IF NOT EXISTS idx_login_attempts_last_failure ON login_attempts (last_failure);
-- No policies: RLS with zero policies denies every client. verify_login()
-- reaches it as SECURITY DEFINER (the owner bypasses RLS).

-- Who is asking. PostgREST publishes the request's headers to the function it
-- calls, which is the only caller identity this database gets: Supabase
-- terminates TLS at the edge and reaches Postgres through a pooler, so
-- inet_client_addr() is the pooler, identical for every terminal on earth.
--
-- A forwarded-for header is not an authenticated identity and is not treated as
-- one — nothing is authorized by it. It is used only to decide WHOSE failures
-- count against WHOSE throttle, which is a strict improvement over counting
-- them all against the account name: a caller who spoofs the header only moves
-- their own failures onto another bucket, and a caller who omits it lands in the
-- shared `unknown` bucket that behaves exactly as the old name-only throttle
-- did. Real rate limiting belongs at the gateway; see the note below.
CREATE OR REPLACE FUNCTION public.login_client_key()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  headers JSON;
  fwd     TEXT;
BEGIN
  BEGIN
    headers := NULLIF(current_setting('request.headers', TRUE), '')::json;
  EXCEPTION WHEN OTHERS THEN
    headers := NULL;
  END;

  IF headers IS NOT NULL THEN
    -- The left-most entry of x-forwarded-for is the original client as seen by
    -- the edge. cf-connecting-ip is single-valued and preferred where present.
    fwd := COALESCE(
      NULLIF(headers ->> 'cf-connecting-ip', ''),
      NULLIF(btrim(split_part(COALESCE(headers ->> 'x-forwarded-for', ''), ',', 1)), '')
    );
  END IF;

  RETURN COALESCE(fwd, host(inet_client_addr()), 'unknown');
END;
$$;
REVOKE ALL ON FUNCTION public.login_client_key() FROM PUBLIC;

-- verify_login is granted to `anon`, so anyone holding the public key that ships
-- in the client bundle can call it. A 4-digit PIN is only 10,000 combinations,
-- so without a throttle the whole space is walkable over the open internet.
-- Failures are counted per login scope key and, past a threshold, the function
-- refuses to check the PIN at all for a cool-off window.
--
-- These mirror src/lib/pinThrottle.ts, which throttles the on-device keypad.
--
-- Two throttles, because one cannot do both jobs:
--
--   * Per (caller, account name), on the escalating ladder below. This is the
--     one that bites in practice. Keying it on the caller is what stopped a
--     lockout being weaponisable: failures from whoever is guessing now land on
--     THEIR bucket, so the shop's own terminal — a different caller — keeps
--     logging in throughout. Previously five requests naming a staff member
--     (and staff names are visible on the lock screen) locked that account out
--     of cloud login for everyone.
--   * Per account name, ten times more tolerant and with a flat cool-off. This
--     is the backstop against guessing spread across many callers, which the
--     per-caller throttle alone cannot see. It can still be tripped
--     deliberately, but it now costs an attacker ~50 requests per 15 minutes
--     instead of 5, and a successful login for that name clears it.
--
-- The caller key is forgeable, so an attacker who varies the header gets a
-- fresh per-caller bucket every request and only this backstop stands in the
-- way. Measured on Postgres 16, that buys them a one-off burst of 50 guesses
-- instead of 5 — and nothing after it: the name counter keeps climbing while
-- the attack continues, so it never falls back below the threshold, and the
-- guess that follows each expired cool-off immediately re-locks for another 15
-- minutes. The sustained rate is therefore 4 guesses an hour, exactly what the
-- old name-only ladder converged to, or roughly 2,500 hours to walk a 4-digit
-- PIN. The trade is 45 extra guesses once, against a lockout that used to be
-- aimable at a named account with five requests. Retune `global_attempts` if
-- you would rather have the burst back: lower it and the backstop trips sooner
-- for an attacker and for the honest tills of a busy store alike.
--
-- Residual, and worth stating plainly: an attacker willing to spend those
-- requests can still suspend CLOUD login for one named account. It degrades
-- rather than denies — PIN login continues to work offline against the locally
-- persisted users, which is the normal path — and the lockout self-clears.
-- A public anon key is not a meaningful attacker identity, so the real fix for
-- a store under sustained abuse is a rate limit in front of Postgres: Supabase
-- gateway limits, or fronting this RPC with an Edge Function. Rotate the anon
-- key if you see it being abused, and alert on repeated lockouts (the
-- login_attempts table records them).
CREATE OR REPLACE FUNCTION public.verify_login(p_name TEXT, p_pin_hash TEXT)
RETURNS TABLE (id TEXT, name TEXT, role TEXT, active BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  free_attempts   CONSTANT INTEGER  := 5;
  global_attempts CONSTANT INTEGER  := 50;
  global_cool_off CONSTANT INTERVAL := INTERVAL '15 minutes';
  streak_reset    CONSTANT INTERVAL := INTERVAL '30 minutes';
  att             login_attempts%ROWTYPE;
  glob            login_attempts%ROWTYPE;
  matched         user_accounts%ROWTYPE;
  attempt_key     TEXT;
  global_key      TEXT;
  cool_off        INTERVAL;
  global_lock     TIMESTAMPTZ;
BEGIN
  attempt_key := '__single__:' || public.login_client_key() || '|' || p_name;
  global_key  := '__name__:' || p_name;
  -- FOR UPDATE serializes concurrent guesses against the same account. Without
  -- the lock, N parallel calls all read the same `failures` and all write
  -- back the same +1, so a scripted attacker firing requests concurrently
  -- burns far more than five attempts per rung and the escalation ladder never
  -- really bites. Losers of the race block here until the winner commits, then
  -- read the updated count. (No row yet = nothing to lock; the INSERT below
  -- takes the primary-key lock instead.)
  --
  -- Always caller-scoped row first, name-scoped row second. Two callers guessing
  -- the same name would otherwise be able to take the two locks in opposite
  -- orders and deadlock, which Postgres resolves by aborting one — turning a
  -- routine login into an error.
  -- Make sure both ledger rows exist before trying to lock them. A
  -- SELECT ... FOR UPDATE that matches no row locks nothing: N concurrent
  -- first-ever failures against a fresh key would each read "no row", each
  -- compute failures = 1, and the last write would win — so a burst against a
  -- name nobody has failed against yet counts as a single attempt, which is
  -- exactly the burst the name-scoped backstop exists to catch. The INSERT
  -- takes the primary-key lock instead, so the losers block here and then read
  -- the winner's count. DO NOTHING leaves any existing counter untouched, and a
  -- successful login deletes both rows again.
  INSERT INTO login_attempts AS la (scope_key, name, failures, last_failure)
  VALUES (attempt_key, p_name, 0, NOW()),
         (global_key,  p_name, 0, NOW())
  ON CONFLICT ON CONSTRAINT login_attempts_pkey DO NOTHING;

  SELECT * INTO att  FROM login_attempts la WHERE la.scope_key = attempt_key FOR UPDATE;
  SELECT * INTO glob FROM login_attempts la WHERE la.scope_key = global_key  FOR UPDATE;

  -- Still inside a cool-off: refuse without even looking at the PIN, so a
  -- locked-out account leaks nothing about which guesses are close.
  IF att.locked_until IS NOT NULL AND att.locked_until > NOW() THEN
    RETURN;
  END IF;
  IF glob.locked_until IS NOT NULL AND glob.locked_until > NOW() THEN
    RETURN;
  END IF;

  -- A streak that has gone quiet is forgotten (an honest mistyped PIN days ago
  -- shouldn't count against today).
  IF att.scope_key IS NOT NULL AND att.last_failure < NOW() - streak_reset THEN
    att.failures := 0;
  END IF;
  IF glob.scope_key IS NOT NULL AND glob.last_failure < NOW() - streak_reset THEN
    glob.failures := 0;
  END IF;

  SELECT * INTO matched
  FROM user_accounts ua
  WHERE ua.name = p_name AND ua.pin = p_pin_hash AND ua.active = TRUE
  LIMIT 1;

  IF FOUND THEN
    -- A correct PIN is proof a real operator is at a terminal, so it clears the
    -- name's backstop too — otherwise a burst of guesses would keep the shop
    -- locked out of cloud login even while staff are signing in successfully.
    DELETE FROM login_attempts la WHERE la.scope_key IN (attempt_key, global_key);
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

  global_lock := CASE
    WHEN COALESCE(glob.failures, 0) + 1 >= global_attempts THEN NOW() + global_cool_off
    ELSE NULL
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
  VALUES
    (attempt_key, p_name, COALESCE(att.failures, 0) + 1,
     CASE WHEN cool_off IS NULL THEN NULL ELSE NOW() + cool_off END, NOW()),
    (global_key,  p_name, COALESCE(glob.failures, 0) + 1, global_lock, NOW())
  ON CONFLICT ON CONSTRAINT login_attempts_pkey DO UPDATE
    SET failures     = EXCLUDED.failures,
        locked_until = EXCLUDED.locked_until,
        last_failure = EXCLUDED.last_failure;

  RETURN; -- no rows = rejected
END;
$$;
REVOKE ALL ON FUNCTION public.verify_login(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_login(TEXT, TEXT) TO anon, authenticated;

-- ...but not on a database that has moved to multi-store.
--
-- multi-store-schema.sql DROPs this two-argument routine on purpose: its body
-- knows nothing about stores, so it matches a staff name and PIN in ANY of them.
-- Re-running this script is the documented upgrade path, and the CREATE above
-- put that routine straight back — beside the store-scoped three-argument one
-- rather than replacing it, because Postgres overloads on the signature. The
-- database was then carrying both a scoped login and the unscoped one it had
-- been migrated away from, and which of the two a two-argument call resolves to
-- is a question nobody should have to ask about an authentication routine.
--
-- Keyed on the three-argument form existing, not on pos_schema_state: that row
-- is written by multi-store-rls-enforce.sql, so a database that has taken the
-- store dimension but not yet flipped RLS on still reads as 'single-store'
-- while carrying exactly the overload this removes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    -- Matched on the argument COUNT. pg_get_function_identity_arguments spells
    -- the parameter NAMES out too ('p_name text, p_pin_hash text, ...'), so
    -- comparing it against a bare type list silently never matches and this
    -- guard quietly does nothing.
    WHERE n.nspname = 'public' AND p.proname = 'verify_login' AND p.pronargs = 3
  ) THEN
    DROP FUNCTION IF EXISTS public.verify_login(TEXT, TEXT);
    RAISE NOTICE 'Store-scoped verify_login present: removed the unscoped two-argument form.';
  END IF;
END $$;

-- Public user-account projection. The PIN hash is intentionally absent; clients
-- use verify_login() for credential checks and only receive non-secret fields.
-- security_invoker keeps the caller's RLS and column privileges in force.
--
-- Both the view and the column grants below are store_id-aware, for the same
-- reason the unique index at the top of this file and the policies further down
-- are: re-running this script is the documented upgrade path, and on a fleet
-- deployment multi-store-schema.sql has already widened both to include
-- store_id. A fixed five-column projection here broke that re-run twice over.
--
--   * CREATE OR REPLACE VIEW cannot drop a column, so replacing the six-column
--     view with a five-column one raised "cannot drop columns from view" — and
--     because the SQL editor runs the file as one transaction, the whole
--     re-run rolled back, including the ALTER TABLE … ADD COLUMN statements
--     above that are the entire point of re-running it.
--   * REVOKE ALL followed by grants that omit store_id would have stripped the
--     column privileges multi-store-schema.sql relies on, so store-scoped
--     upserts would start failing on a database that had been working.
DO $$
DECLARE
  has_store_id boolean;
  user_cols    text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_accounts' AND column_name = 'store_id'
  ) INTO has_store_id;

  user_cols := CASE WHEN has_store_id
    THEN 'id, name, role, active, created_at, store_id'
    ELSE 'id, name, role, active, created_at'
  END;

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.user_accounts_public WITH (security_invoker = true) AS '
    'SELECT %s FROM public.user_accounts', user_cols);

  EXECUTE 'REVOKE ALL ON TABLE public.user_accounts FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON TABLE public.user_accounts TO authenticated', user_cols);
  EXECUTE format(
    'GRANT INSERT (%s) ON TABLE public.user_accounts TO authenticated', user_cols || ', pin');
  EXECUTE format(
    'GRANT UPDATE (%s) ON TABLE public.user_accounts TO authenticated', user_cols || ', pin');
  EXECUTE 'GRANT DELETE ON TABLE public.user_accounts TO authenticated';
  EXECUTE 'GRANT SELECT ON public.user_accounts_public TO authenticated';
  EXECUTE 'REVOKE ALL ON public.user_accounts_public FROM anon';
END $$;

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
-- makes the store-scoped policies meaningless.
--
-- The guard reads the mode recorded in pos_schema_state (section 6d), which
-- src/db/multi-store-rls-enforce.sql sets when it enforces store scoping. It
-- also still honours the original signal — the existence of a store-scoped
-- policy — so a database enforced before that table existed, or one where the
-- enforcement migration was applied only in part, is recognised too. Either
-- signal on its own is enough to keep the blanket policies out: on this
-- question the safe answer is the sticky one.
DO $$
DECLARE
  tbl            text;
  pol            text;
  store_enforced boolean;
  scoped_policy  boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('products', 'categories', 'customers', 'transactions', 'user_accounts')
      AND policyname LIKE '%\_read' ESCAPE '\'
  ) INTO scoped_policy;

  store_enforced := public.pos_rls_mode() = 'store-scoped' OR scoped_policy;

  IF store_enforced THEN
    -- Not creating them is not enough: one may already be there. An older copy
    -- of this script, run after the fleet migration, would have recreated them;
    -- so would a hand-run statement. Postgres ORs permissive policies together,
    -- so a single survivor makes every store-scoped policy on that table
    -- decorative, and nothing surfaces it until a terminal reads another
    -- store's rows. Re-running this script is the documented upgrade path, so
    -- let it be the thing that cleans that up.
    --
    -- Per table, and only where the store-scoped policies are actually present:
    -- dropping a table's blanket policy when it has nothing to fall back on
    -- would lock every terminal out of its own data mid-trade, which is a worse
    -- failure than the one being closed. A table in that state is reported
    -- instead, because it needs multi-store-rls-enforce.sql re-run, not this.
    FOREACH tbl IN ARRAY ARRAY['categories', 'products', 'customers', 'transactions', 'user_accounts']
    LOOP
      IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = tbl
          AND policyname LIKE tbl || '\_%' ESCAPE '\'
      ) THEN
        FOREACH pol IN ARRAY ARRAY['staff full access', 'staff manage users', 'staff read users',
                                   'staff insert users', 'staff update users', 'staff delete users']
        LOOP
          IF EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = tbl AND policyname = pol
          ) THEN
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol, tbl);
            RAISE NOTICE 'Removed blanket policy "%" from % — it reopened cross-store access.', pol, tbl;
          END IF;
        END LOOP;
      ELSE
        RAISE WARNING 'Store-scoped mode, but % has no store-scoped policy. Leaving its blanket policy in place so terminals keep working — re-run src/db/multi-store-rls-enforce.sql.', tbl;
      END IF;
    END LOOP;

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

  -- User accounts. These policies decide which ROWS an authenticated terminal
  -- may touch; which COLUMNS it may touch is decided by the column grants above,
  -- and the two are ANDed. That is why `USING (TRUE)` here does not expose the
  -- PIN hash: `pin` is absent from the SELECT grant, so `select pin`,
  -- `select *`, a `where pin = …` probe and a `returning pin` are each refused
  -- with "permission denied" no matter what this policy says. Reads go through
  -- user_accounts_public.
  --
  -- `pin` IS in the INSERT/UPDATE grants, because a PIN set on one terminal has
  -- to reach the others. Every terminal shares one Supabase device account, so
  -- the database cannot tell an admin's terminal from a cashier's: a device
  -- credential can therefore overwrite any staff PIN hash, and role enforcement
  -- for that is in the app (only admins reach the user editor). Treat the device
  -- account as the store's credential, scope it per store, and rotate it when a
  -- terminal is lost. src/db/verify-policies.sql checks these grants against a
  -- live database.
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
