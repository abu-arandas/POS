import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Product, Category, Customer, SaleTransaction, UserAccount, OrderItem } from '../types';
import { hashPin } from './hash';

// A stored PIN is valid only if it is already a SHA-256 hex digest.
const isHashedPin = (pin: string) => /^[a-f0-9]{64}$/i.test(pin);

let supabaseInstance: SupabaseClient | null = null;
let currentUrl = '';
let currentKey = '';

// Lazy initialization of Supabase client to avoid crashes on bad keys
export function getSupabaseClient(url: string, anonKey: string): SupabaseClient | null {
  if (!url || !anonKey) {
    supabaseInstance = null;
    return null;
  }

  if (supabaseInstance && currentUrl === url && currentKey === anonKey) {
    return supabaseInstance;
  }

  try {
    currentUrl = url;
    currentKey = anonKey;
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: false,
      },
    });
    return supabaseInstance;
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    supabaseInstance = null;
    return null;
  }
}

// SQL DDL schema script that the user can execute in Supabase SQL Editor
export const SUPABASE_SCHEMA_SQL = `-- Supabase DDL Schema for POS Terminal System
-- Copy and paste this script into your Supabase SQL Editor to set up tables.

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

-- Enable Row Level Security (RLS) - For demo/unauthenticated access, we can allow public read/write or configure policies
ALTER TABLE user_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;

-- Insert default admin account if not existing (Default PIN: 1234)
-- The PIN is stored as its SHA-256 hash because the app hashes the entered PIN
-- before comparing (see src/lib/hash.ts). Storing plaintext here would make the
-- account impossible to log into. Hash below = SHA-256('1234').
INSERT INTO user_accounts (id, name, role, pin, active, created_at)
VALUES ('admin-1', 'Default Administrator', 'admin', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', TRUE, NOW())
ON CONFLICT (id) DO NOTHING;
`;

// Direct sync functions pushing local lists to Supabase and resolving updates
export async function testSupabaseConnection(url: string, anonKey: string): Promise<boolean> {
  const client = getSupabaseClient(url, anonKey);
  if (!client) return false;

  try {
    const { error } = await client.from('user_accounts').select('id').limit(1);
    if (error) {
      console.warn('Supabase test table fetch failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Supabase test connect error:', err);
    return false;
  }
}

// Push local products to Supabase
export async function pushProducts(client: SupabaseClient, products: Product[]): Promise<boolean> {
  if (products.length === 0) return true;
  try {
    const records = products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      cost: p.cost,
      category: p.category || null,
      sku: p.sku,
      stock: p.stock,
      min_stock: p.minStock,
      image: p.image,
    }));

    const { error } = await client.from('products').upsert(records);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Failed pushing products:', err);
    return false;
  }
}

// Pull products from Supabase
export async function pullProducts(client: SupabaseClient): Promise<Product[] | null> {
  try {
    const { data, error } = await client.from('products').select('*');
    if (error) throw error;
    return (data || []).map((r) => ({
      id: r.id,
      name: r.name,
      price: Number(r.price),
      cost: Number(r.cost),
      category: r.category || '',
      sku: r.sku,
      stock: Number(r.stock),
      minStock: Number(r.min_stock),
      image: r.image,
    }));
  } catch (err) {
    console.error('Failed pulling products:', err);
    return null;
  }
}

// Push local categories
export async function pushCategories(
  client: SupabaseClient,
  categories: Category[],
): Promise<boolean> {
  if (categories.length === 0) return true;
  try {
    const { error } = await client.from('categories').upsert(categories);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Failed pushing categories:', err);
    return false;
  }
}

// Pull categories
export async function pullCategories(client: SupabaseClient): Promise<Category[] | null> {
  try {
    const { data, error } = await client.from('categories').select('*');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Failed pulling categories:', err);
    return null;
  }
}

// Push local customers
export async function pushCustomers(
  client: SupabaseClient,
  customers: Customer[],
): Promise<boolean> {
  if (customers.length === 0) return true;
  try {
    const records = customers.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      points: c.points,
      created_at: c.createdAt,
    }));
    const { error } = await client.from('customers').upsert(records);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Failed pushing customers:', err);
    return false;
  }
}

// Pull customers
export async function pullCustomers(client: SupabaseClient): Promise<Customer[] | null> {
  try {
    const { data, error } = await client.from('customers').select('*');
    if (error) throw error;
    return (data || []).map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email || '',
      phone: r.phone || '',
      points: Number(r.points || 0),
      createdAt: r.created_at || new Date().toISOString().split('T')[0],
    }));
  } catch (err) {
    console.error('Failed pulling customers:', err);
    return null;
  }
}

// Push local transactions
export async function pushTransactions(
  client: SupabaseClient,
  transactions: SaleTransaction[],
): Promise<boolean> {
  if (transactions.length === 0) return true;
  try {
    const records = transactions.map((t) => ({
      id: t.id,
      date: t.date,
      items: t.items, // JSONB structure
      subtotal: t.subtotal,
      discount: t.discount,
      discount_type: t.discountType,
      discount_value: t.discountValue,
      tax: t.tax,
      total: t.total,
      payment_method: t.paymentMethod,
      cash_paid: t.cashPaid || null,
      cash_change: t.cashChange || null,
      customer_id: t.customerId || null,
      customer_name: t.customerName || null,
      status: t.status,
      refund_date: t.refundDate || null,
    }));
    const { error } = await client.from('transactions').upsert(records);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Failed pushing transactions:', err);
    return false;
  }
}

// Delete rows by id from any synced table. Used by the cloud delete-sync
// wrappers so that local deletions are propagated instead of resurrecting on
// the next Pull From Cloud.
export type SyncTable = 'products' | 'categories' | 'customers' | 'transactions' | 'user_accounts';

export async function deleteRowsSupabase(
  client: SupabaseClient,
  table: SyncTable,
  ids: string[],
): Promise<boolean> {
  if (ids.length === 0) return true;
  try {
    const { error } = await client.from(table).delete().in('id', ids);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error(`Failed deleting ${table}:`, err);
    return false;
  }
}

// Pull transactions
export async function pullTransactions(client: SupabaseClient): Promise<SaleTransaction[] | null> {
  try {
    const { data, error } = await client
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => ({
      id: r.id,
      date: r.date,
      items: r.items as OrderItem[],
      subtotal: Number(r.subtotal),
      discount: Number(r.discount),
      discountType: r.discount_type as SaleTransaction['discountType'],
      discountValue: Number(r.discount_value),
      tax: Number(r.tax),
      total: Number(r.total),
      paymentMethod: r.payment_method as SaleTransaction['paymentMethod'],
      cashPaid: r.cash_paid ? Number(r.cash_paid) : undefined,
      cashChange: r.cash_change ? Number(r.cash_change) : undefined,
      customerId: r.customer_id,
      customerName: r.customer_name,
      status: r.status as SaleTransaction['status'],
      refundDate: r.refund_date,
    }));
  } catch (err) {
    console.error('Failed pulling transactions:', err);
    return null;
  }
}

// Push local user accounts
export async function pushUserAccounts(
  client: SupabaseClient,
  accounts: UserAccount[],
): Promise<boolean> {
  if (accounts.length === 0) return true;
  try {
    const records = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      pin: a.pin,
      active: a.active,
      created_at: a.createdAt,
    }));
    const { error } = await client.from('user_accounts').upsert(records);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Failed pushing user accounts:', err);
    return false;
  }
}

// Pull user accounts
export async function pullUserAccounts(client: SupabaseClient): Promise<UserAccount[] | null> {
  try {
    const { data, error } = await client.from('user_accounts').select('*');
    if (error) throw error;
    // Older cloud data may hold plaintext PINs. The app authenticates against
    // SHA-256 hashes, so re-hash anything that isn't already a hash — otherwise
    // the pulled account can never log in and may lock the terminal out.
    return await Promise.all(
      (data || []).map(async (r) => ({
        id: r.id,
        name: r.name,
        role: r.role as UserAccount['role'],
        pin: isHashedPin(String(r.pin)) ? r.pin : await hashPin(String(r.pin)),
        active: !!r.active,
        createdAt: r.created_at,
      })),
    );
  } catch (err) {
    console.error('Failed pulling user accounts:', err);
    return null;
  }
}
