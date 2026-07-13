-- ============================================================
-- Supabase DDL Schema for POS Terminal System
-- Run this FIRST in your Supabase SQL Editor:
-- Dashboard → SQL Editor → New Query → Paste & Run
-- ============================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create User Accounts Table
CREATE TABLE IF NOT EXISTS user_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier')),
  pin TEXT NOT NULL,
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
  cash_paid NUMERIC,
  cash_change NUMERIC,
  customer_id TEXT,
  customer_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('completed', 'refunded')),
  refund_date TIMESTAMP WITH TIME ZONE
);

-- 7. Row Level Security
-- ============================================================
-- ⚠️  SECURITY WARNING
-- The statements below DISABLE RLS so the app can read/write with only the
-- public anon key. This means ANYONE who obtains the anon key (it ships in the
-- client bundle) can read and modify EVERY row — including user_accounts and
-- their PIN hashes. This is acceptable ONLY for a local demo/prototype.
--
-- For any real deployment: adopt Supabase Auth, keep RLS ENABLED, and add
-- policies scoped to authenticated staff, e.g.
--     ALTER TABLE products ENABLE ROW LEVEL SECURITY;
--     CREATE POLICY "staff read"  ON products FOR SELECT TO authenticated USING (true);
--     CREATE POLICY "staff write" ON products FOR ALL    TO authenticated USING (true) WITH CHECK (true);
-- and NEVER expose user_accounts / PIN hashes to the anon role.
-- ============================================================
ALTER TABLE user_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories    DISABLE ROW LEVEL SECURITY;
ALTER TABLE products      DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers     DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions  DISABLE ROW LEVEL SECURITY;
