import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

// The SQL scripts are the access-control layer. Nothing in the TypeScript suite
// exercises them, and a database is not available here, so these checks read the
// scripts themselves and assert the properties that must not regress. They are
// deliberately blunt — a grep with a reason attached — and they exist because
// each property below is one line away from being lost in an edit, with no
// symptom until a terminal reads something it should not.
//
// src/db/verify-policies.sql is the other half: run that against a live database
// to confirm the server actually ended up the way the scripts describe.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sql = (name: string) => readFileSync(join(REPO_ROOT, 'src', 'db', name), 'utf8');

const schema = sql('schema.sql');
const multiStore = sql('multi-store-schema.sql');
const enforce = sql('multi-store-rls-enforce.sql');

/** Strips `--` comments so prose about SQL is never mistaken for SQL. */
const statements = (text: string) =>
  text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

const schemaSql = statements(schema);
const multiStoreSql = statements(multiStore);
const enforceSql = statements(enforce);

describe('the PIN hash never becomes readable', () => {
  // RLS filters rows, not columns, so the blanket `USING (TRUE)` policy on
  // user_accounts is not what keeps the hash private — these grants are. Put
  // `pin` in a SELECT grant and every device account in the fleet can read
  // every staff hash and brute-force 4-digit PINs offline at its leisure.
  //
  // Checked over the WHOLE statement rather than the column list inside the
  // parentheses, because schema.sql builds its grants with `format()` and a
  // `user_cols` variable: a `|| ', pin'` tacked onto the argument list is
  // exactly how the hash would get exposed, and it lives outside the
  // parentheses where a narrower check never looks.
  const selectGrantStatements = (text: string) =>
    text
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => /GRANT\s+SELECT\s*\(/i.test(statement))
      .filter((statement) => /user_accounts/i.test(statement));

  it('grants SELECT on user_accounts by column, never including pin', () => {
    for (const [name, text] of [
      ['schema.sql', schemaSql],
      ['multi-store-schema.sql', multiStoreSql],
    ] as const) {
      const grants = selectGrantStatements(text);
      expect(grants.length, `${name} should grant SELECT column-wise`).toBeGreaterThan(0);
      for (const statement of grants) {
        expect(statement, `${name} SELECT grant`).not.toMatch(/\bpin\b/);
      }
    }
  });

  it('builds the readable-column list without pin', () => {
    // The same list feeds the grant above and the user_accounts_public view.
    const assignments = [...schemaSql.matchAll(/user_cols\s*:=[\s\S]*?END;/g)].map((m) => m[0]);
    expect(assignments.length).toBeGreaterThan(0);
    for (const assignment of assignments) expect(assignment).not.toMatch(/\bpin\b/);
  });

  it('never grants SELECT on the whole user_accounts table', () => {
    // A table-wide grant carries every column, pin included, and would make the
    // column-wise grants above decorative.
    for (const text of [schemaSql, multiStoreSql]) {
      expect(text).not.toMatch(/GRANT\s+SELECT\s+ON\s+(?:TABLE\s+)?[\w.]*user_accounts\b/i);
      expect(text).not.toMatch(/GRANT\s+ALL\s+ON\s+(?:TABLE\s+)?[\w.]*user_accounts\b/i);
    }
  });

  it('revokes everything from client roles before re-granting', () => {
    expect(schemaSql).toMatch(/REVOKE ALL ON TABLE public\.user_accounts FROM anon, authenticated/);
  });

  it('keeps pin out of the public projection', () => {
    const views = [
      ...schema.matchAll(/user_accounts_public[\s\S]*?FROM\s+public\.user_accounts/gi),
      ...multiStore.matchAll(/user_accounts_public[\s\S]*?FROM\s+public\.user_accounts/gi),
    ].map((match) => match[0]);

    expect(views.length).toBeGreaterThan(0);
    for (const view of views) expect(view).not.toMatch(/\bpin\b/);
  });

  it('checks credentials only through the SECURITY DEFINER RPC', () => {
    for (const text of [schemaSql, multiStoreSql]) {
      const fn = text.match(/CREATE OR REPLACE FUNCTION public\.verify_login[\s\S]*?\$\$;/)?.[0];
      expect(fn).toBeDefined();
      expect(fn).toMatch(/SECURITY DEFINER/);
      expect(fn).toMatch(/SET search_path = public/);
      // The declared return type is the whole contract: whatever the body reads,
      // only these non-secret columns can leave the database.
      expect(fn).toMatch(
        /RETURNS TABLE \(id TEXT, name TEXT, role TEXT, active BOOLEAN, created_at TIMESTAMPTZ\)/,
      );
      expect(fn).not.toMatch(/RETURN QUERY[^;]*matched\.pin/);
    }
  });
});

describe('the login throttle cannot be aimed at one account', () => {
  // Keying failures on the account name alone meant five requests naming a
  // staff member — and staff names are on the lock screen — suspended that
  // account's cloud login for everyone, from anywhere.
  it('keys the escalating throttle on the caller as well as the name', () => {
    for (const text of [schemaSql, multiStoreSql]) {
      expect(text).toMatch(/attempt_key\s*:?=[^;]*login_client_key\(\)/);
      expect(text).toMatch(/global_key\s*:?=/);
    }
  });

  it('derives the caller from request headers, never trusting them for authorization', () => {
    const fn = schema.match(
      /CREATE OR REPLACE FUNCTION public\.login_client_key[\s\S]*?\$\$;/,
    )?.[0];
    expect(fn).toBeDefined();
    expect(fn).toMatch(/request\.headers/);
    // A header is not an identity: the function must not be SECURITY DEFINER and
    // must not be reachable as a general-purpose helper by clients.
    expect(fn).not.toMatch(/SECURITY DEFINER/);
    expect(schemaSql).toMatch(/REVOKE ALL ON FUNCTION public\.login_client_key\(\) FROM PUBLIC/);
  });

  it('takes the two attempt locks in the same order in both scripts', () => {
    // Opposite orders across two callers guessing the same name is a deadlock,
    // which Postgres resolves by aborting one — a routine login turned error.
    for (const text of [schemaSql, multiStoreSql]) {
      const callerLock = text.indexOf('la.scope_key = attempt_key FOR UPDATE');
      const nameLock = text.indexOf('la.scope_key = global_key  FOR UPDATE');
      expect(callerLock).toBeGreaterThan(-1);
      expect(nameLock).toBeGreaterThan(callerLock);
    }
  });

  it('keeps both scripts on the same throttle constants', () => {
    // The two bodies are duplicated on purpose (each file is pasted whole into
    // the SQL editor), so the thing to guard is that they do not drift.
    const knobs = (text: string) =>
      [
        ...text.matchAll(
          /(free_attempts|global_attempts|global_cool_off|streak_reset)\s+CONSTANT\s+\w+\s*:=\s*([^;]+);/g,
        ),
      ]
        .map((match) => `${match[1]}=${match[2].trim()}`)
        .sort();

    expect(knobs(schemaSql)).toEqual(knobs(multiStoreSql));
    expect(knobs(schemaSql)).toHaveLength(4);
  });

  it('clears both counters on a successful login', () => {
    for (const text of [schemaSql, multiStoreSql]) {
      expect(text).toMatch(
        /DELETE FROM login_attempts la WHERE la\.scope_key IN \(attempt_key, global_key\)/,
      );
    }
  });

  it('creates both ledger rows before locking them', () => {
    // SELECT ... FOR UPDATE on a row that does not exist locks nothing, so a
    // burst of first-ever failures against a fresh key would each read "no
    // row", each compute failures = 1, and the last write would win. Measured
    // on Postgres 16 before this insert: 9 of 16 concurrent attempts counted.
    for (const text of [schemaSql, multiStoreSql]) {
      const preInsert = text.indexOf('ON CONFLICT ON CONSTRAINT login_attempts_pkey DO NOTHING');
      const firstLock = text.indexOf('la.scope_key = attempt_key FOR UPDATE');
      expect(preInsert).toBeGreaterThan(-1);
      expect(preInsert).toBeLessThan(firstLock);
    }
  });

  it('keeps the attempt ledger unreachable from any client', () => {
    expect(schemaSql).toMatch(/ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY/);
    expect(schemaSql).toMatch(/REVOKE ALL ON TABLE login_attempts FROM anon, authenticated/);
    expect(schemaSql).not.toMatch(/CREATE POLICY[^;]*ON login_attempts/i);
  });
});

describe('a store-scoped database never gets the blanket policies back', () => {
  // Postgres ORs permissive policies together, so one surviving `USING (TRUE)`
  // makes every store-scoped policy decorative — and re-running schema.sql is
  // the documented upgrade path, so this has to hold across a re-run.
  const blanketPolicyNames = [
    ...schemaSql.matchAll(/CREATE POLICY %I ON %I[^;]*?,\s*'([^']+)'/g),
    ...schemaSql.matchAll(/CREATE POLICY "([^"]+)" ON \w+/g),
  ].map((match) => match[1]);

  it('creates blanket policies only under a guard', () => {
    expect(blanketPolicyNames.length).toBeGreaterThan(0);
    expect(schemaSql).toMatch(/public\.pos_rls_mode\(\)\s*=\s*'store-scoped'/);
    expect(schemaSql).toMatch(/IF store_enforced THEN[\s\S]*?RETURN;/);
  });

  it('drops every blanket policy it creates when store scoping is enforced', () => {
    for (const name of new Set(blanketPolicyNames)) {
      expect(enforceSql, `multi-store-rls-enforce.sql must drop "${name}"`).toContain(`'${name}'`);
    }
  });

  it('removes a blanket policy that survived onto a store-scoped database', () => {
    // Not creating them is not enough. An older copy of this script, run after
    // the fleet migration, recreates them — and one survivor ORs with the
    // store-scoped policies and makes them decorative.
    const guard = schemaSql.slice(schemaSql.indexOf('IF store_enforced THEN'));
    expect(guard).toMatch(/DROP POLICY IF EXISTS %I ON %I/);
    expect(guard).toMatch(/Removed blanket policy/);
  });

  it('leaves a table with no store-scoped policy alone, loudly', () => {
    // Dropping a blanket policy from a table with nothing to fall back on locks
    // every terminal out of its own data mid-trade — a worse failure than the
    // one being closed. That table is reported instead.
    const guard = schemaSql.slice(schemaSql.indexOf('IF store_enforced THEN'));
    expect(guard).toMatch(/RAISE WARNING/);
    expect(guard).toMatch(/multi-store-rls-enforce\.sql/);
  });

  it('records the mode as a fact rather than leaving it to be inferred', () => {
    expect(enforceSql).toMatch(/INSERT INTO pos_schema_state[\s\S]*?'store-scoped'/);
    expect(schemaSql).toMatch(/CREATE TABLE IF NOT EXISTS pos_schema_state/);
  });

  it('still honours the original policy-name signal, for databases enforced earlier', () => {
    // Belt and braces: a database that was enforced before pos_schema_state
    // existed has no recorded mode, and must not be treated as single-store.
    expect(schemaSql).toMatch(/scoped_policy/);
    expect(schemaSql).toMatch(
      /store_enforced := public\.pos_rls_mode\(\) = 'store-scoped' OR scoped_policy/,
    );
  });

  it('keeps the deployment state out of reach of clients', () => {
    expect(schemaSql).toMatch(/ALTER TABLE pos_schema_state ENABLE ROW LEVEL SECURITY/);
    expect(schemaSql).toMatch(/REVOKE ALL ON TABLE pos_schema_state FROM anon, authenticated/);
    expect(schemaSql).not.toMatch(/CREATE POLICY[^;]*ON pos_schema_state/i);
  });

  it('puts the mode back when the enforcement is rolled back', () => {
    expect(enforce).toMatch(/rls_mode = 'single-store'/);
  });
});

describe('the demo escape hatch stays shut', () => {
  it('leaves the RLS-disabling block commented out', () => {
    // Uncommented, this hands every row — PIN hashes included — to the anon key
    // that ships inside the client bundle.
    expect(schemaSql).not.toMatch(/ALTER TABLE \w+\s+DISABLE ROW LEVEL SECURITY/i);
    expect(schema).toMatch(/-- ALTER TABLE user_accounts DISABLE ROW LEVEL SECURITY;/);
  });

  it('enables RLS on every synced table', () => {
    for (const table of ['user_accounts', 'categories', 'products', 'customers', 'transactions']) {
      expect(schemaSql).toMatch(new RegExp(`ALTER TABLE ${table}\\s+ENABLE ROW LEVEL SECURITY`));
    }
  });
});
