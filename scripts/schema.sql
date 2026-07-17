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
  pin TEXT NOT NULL,                       -- SHA-256 hash of the PIN, never plaintext
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

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
-- hash never leaves the database. The client sends SHA-256(entered PIN); see
-- src/lib/hash.ts. This lets you keep user_accounts unreadable by clients while
-- still supporting the PIN lockscreen against the cloud copy.
CREATE OR REPLACE FUNCTION public.verify_login(p_name TEXT, p_pin_hash TEXT)
RETURNS TABLE (id TEXT, name TEXT, role TEXT, active BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, role, active, created_at
  FROM public.user_accounts
  WHERE name = p_name AND pin = p_pin_hash AND active = TRUE
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.verify_login(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_login(TEXT, TEXT) TO anon, authenticated;

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

CREATE POLICY "staff full access" ON categories   FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "staff full access" ON products      FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "staff full access" ON customers     FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "staff full access" ON transactions  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
-- user_accounts: manageable by authenticated staff; anon logs in via verify_login() only.
CREATE POLICY "staff manage users" ON user_accounts FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

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
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE products;
  ALTER PUBLICATION supabase_realtime ADD TABLE categories;
  ALTER PUBLICATION supabase_realtime ADD TABLE customers;
  ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
  ALTER PUBLICATION supabase_realtime ADD TABLE user_accounts;
EXCEPTION WHEN duplicate_object THEN
  -- Tables already in the publication; nothing to do.
  NULL;
END $$;

-- 9. Seed the default admin (PIN 1234, stored as its SHA-256 hash)
INSERT INTO user_accounts (id, name, role, pin, active, created_at)
VALUES ('admin-1', 'Default Administrator', 'admin',
        '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', TRUE, NOW())
ON CONFLICT (id) DO NOTHING;
