-- ============================================================
-- Access-control contract check  (read-only — safe to run any time)
--
-- Run this in your Supabase SQL Editor after applying src/db/schema.sql, and
-- again after src/db/multi-store-schema.sql and src/db/multi-store-rls-enforce.sql
-- if you run a fleet. It changes nothing; it asserts that the database actually
-- enforces what those scripts intend, and raises with a list of what does not.
--
-- Reading the scripts is not the same as checking the database. Grants and
-- policies accumulate: an older schema version, a hand-run GRANT, a Supabase
-- default privilege, a half-applied migration, or an "ALTER TABLE … DISABLE ROW
-- LEVEL SECURITY" left over from a demo all leave the files saying one thing and
-- the server doing another. This is the check that notices.
--
--   Dashboard → SQL Editor → New Query → Paste & Run
--
-- A clean run prints "All access-control checks passed".
-- ============================================================

DO $$
DECLARE
  problems  text[] := ARRAY[]::text[];
  mode      text;
  n         bigint;
  stores_n  bigint;
  tbl       text;
  synced    CONSTANT text[] :=
    ARRAY['products', 'categories', 'customers', 'transactions', 'user_accounts'];
BEGIN
  -- 1. The PIN hash must not be readable by any client role. RLS does not gate
  --    columns, so this is decided by the column grants alone: if `pin` appears
  --    in a SELECT grant, every authenticated device account can read every
  --    staff hash and brute-force 4-digit PINs offline, whatever the policies
  --    say. Reads are supposed to go through user_accounts_public.
  SELECT count(*) INTO n
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'user_accounts'
    AND column_name = 'pin'
    AND privilege_type = 'SELECT'
    AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  IF n > 0 THEN
    problems := problems || 'user_accounts.pin is SELECT-able by a client role'::text;
  END IF;

  -- A table-wide grant would give `pin` along with everything else.
  SELECT count(*) INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'user_accounts'
    AND privilege_type = 'SELECT'
    AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  IF n > 0 THEN
    problems := problems || 'user_accounts has a table-wide SELECT grant (that includes pin)'::text;
  END IF;

  -- 2. The public projection must not carry the hash either.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_accounts_public' AND column_name = 'pin'
  ) THEN
    problems := problems || 'user_accounts_public exposes a pin column'::text;
  END IF;

  -- 3. The anon key ships inside the client bundle, so `anon` must reach no
  --    application data. Its only entry point is verify_login().
  --
  --    Supabase's default privileges grant every role in `public` to anon, and
  --    that is expected: on the data tables it is RLS that denies them, because
  --    no policy names anon and a role matching no policy is refused every row.
  --    So what is checked here is that no policy lets anon back in — plus, on
  --    the four objects the scripts revoke explicitly, that the revoke held.
  SELECT count(*) INTO n
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = ANY (synced)
    AND (roles && ARRAY['anon', 'public']::name[]);
  IF n > 0 THEN
    problems := problems || format('%s policy/policies grant the anon role access', n);
  END IF;

  SELECT count(*) INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('user_accounts', 'user_accounts_public', 'login_attempts',
                       'pos_schema_state')
    AND grantee IN ('anon', 'PUBLIC');
  IF n > 0 THEN
    problems := problems || format(
      '%s grant(s) to anon/PUBLIC survive on tables the schema revokes', n);
  END IF;

  -- 4. RLS on, everywhere. A DISABLE left over from the demo block in
  --    schema.sql §8b opens every row to the anon key.
  FOREACH tbl IN ARRAY synced || ARRAY['login_attempts', 'pos_schema_state'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = 'public' AND c.relname = tbl AND NOT c.relrowsecurity
    ) THEN
      problems := problems || format('row level security is disabled on %s', tbl);
    END IF;
  END LOOP;

  -- 5. The throttle ledger and the deployment state are server-side bookkeeping.
  --    A policy on either would make them client-visible; login_attempts would
  --    then tell an attacker exactly when each cool-off expires, and
  --    pos_schema_state decides whether blanket policies get re-created.
  SELECT count(*) INTO n
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename IN ('login_attempts', 'pos_schema_state');
  IF n > 0 THEN
    problems := problems || 'login_attempts / pos_schema_state have policies (they must have none)'::text;
  END IF;

  -- 6. verify_login must stay SECURITY DEFINER: it is the only reason the PIN
  --    column can be checked at all while staying unreadable to clients.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname = 'verify_login' AND NOT p.prosecdef
  ) THEN
    problems := problems || 'verify_login is not SECURITY DEFINER'::text;
  END IF;

  -- 7. On a store-scoped deployment, a single blanket policy silently restores
  --    cross-store access to every terminal — Postgres ORs permissive policies
  --    together, so `USING (TRUE)` beside a store-scoped policy wins.
  mode := public.pos_rls_mode();
  IF mode = 'store-scoped' THEN
    SELECT count(*) INTO n
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (synced)
      AND permissive = 'PERMISSIVE'
      AND (COALESCE(qual, 'true') = 'true' AND COALESCE(with_check, qual, 'true') = 'true');
    IF n > 0 THEN
      problems := problems || format(
        '%s blanket USING (TRUE) policy/policies survive on a store-scoped database', n);
    END IF;

    FOREACH tbl IN ARRAY synced LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = tbl
          AND column_name = 'store_id' AND is_nullable = 'YES'
      ) THEN
        problems := problems || format('%s.store_id is still nullable', tbl);
      END IF;
    END LOOP;
  END IF;

  -- A database holding several stores must not authenticate across them.
  --
  -- Guarded on the table EXISTING, not just on its contents: `stores` is created
  -- by multi-store-schema.sql, and this script is documented to run against a
  -- base-schema install too — where an unguarded reference aborts the whole
  -- verifier with "relation \"stores\" does not exist". The nested IF matters as
  -- much as the test: plpgsql prepares a statement on first execution, so a
  -- `stores` query in a branch that is never entered is never parsed, whereas
  -- folding both halves into one condition would parse it every time.
  IF to_regclass('public.stores') IS NOT NULL THEN
    SELECT count(*) INTO stores_n FROM stores;
  ELSE
    stores_n := 0;
  END IF;

  IF stores_n > 1 THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'pos_store_count'
    ) THEN
      problems := problems || 'pos_store_count() is missing: re-run src/db/multi-store-schema.sql'::text;
    ELSE
      -- Structural first, and separately, because the two failures have
      -- different fixes and the behavioural probe below cannot even run while
      -- the overload exists: a two-argument call against both candidates is
      -- ambiguous, and Postgres raises that instead of answering.
      IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'verify_login' AND p.pronargs = 2
      ) THEN
        problems := problems ||
          'the unscoped two-argument verify_login is present on a multi-store database (re-run src/db/schema.sql)'::text;
      ELSIF NOT EXISTS (
        -- Read, never called.
        --
        -- The obvious check is to offer a real account's own credentials
        -- without naming its store and see whether a row comes back. It must
        -- not be done: verify_login records a FAILED attempt on every refusal,
        -- so a script whose header promises it is read-only would write one
        -- failure per staff account per run, and five runs would put every
        -- account's cloud login into cool-off. Worse, it does that damage
        -- exactly when the database is CORRECT — a broken one returns a row,
        -- which clears the ledger instead.
        --
        -- So the guard is confirmed by the mechanism it is built on rather than
        -- by its behaviour: a routine whose body never consults
        -- pos_store_count() cannot be refusing the unscoped case, whatever its
        -- signature looks like. That also catches the case the two-argument
        -- check above cannot — a three-argument routine from before this guard
        -- existed, or one hand-edited since.
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'verify_login' AND p.pronargs = 3
          AND p.prosrc LIKE '%pos_store_count%'
      ) THEN
        problems := problems ||
          'verify_login does not consult pos_store_count(), so it still authenticates without a store id (re-run src/db/multi-store-schema.sql)'::text;
      END IF;
    END IF;
  END IF;

  IF array_length(problems, 1) > 0 THEN
    RAISE EXCEPTION E'Access-control contract violated:\n  - %', array_to_string(problems, E'\n  - ');
  END IF;

  RAISE NOTICE 'All access-control checks passed (rls_mode = %).', mode;
END $$;

-- ============================================================
-- The rest is informational: run it to SEE the access model rather than just be
-- told it is intact.
-- ============================================================

-- Which user_accounts columns each client role may touch. `pin` must appear for
-- INSERT/UPDATE only (a PIN set on one terminal has to reach the others) and
-- never for SELECT.
SELECT grantee, privilege_type, string_agg(column_name, ', ' ORDER BY column_name) AS columns
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'user_accounts'
  AND grantee IN ('anon', 'authenticated')
GROUP BY grantee, privilege_type
ORDER BY grantee, privilege_type;

-- Every policy in force, with its predicate. On a single-store install these are
-- the blanket `true` staff policies; on a fleet they are has_store_access(...).
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
