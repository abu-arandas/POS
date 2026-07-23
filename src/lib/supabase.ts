import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Product, Category, Customer, SaleTransaction, UserAccount, OrderItem } from '../types';
import { hashPin } from './hash';

// A stored PIN is valid only if it is already a SHA-256 hex digest.
const isHashedPin = (pin: string) => /^[a-f0-9]{64}$/i.test(pin);

// Adds store_id to each outgoing record when a store scope is configured.
// A no-op in single-store mode (empty storeId), so existing deployments push
// exactly the same payload as before. Pure and unit-tested.
export function stampStoreId<T extends object>(records: T[], storeId?: string): T[] {
  if (!storeId) return records;
  return records.map((r) => ({ ...r, store_id: storeId }));
}

let supabaseInstance: SupabaseClient | null = null;
let currentUrl = '';
let currentKey = '';
// Email the current client instance is signed in as ('' = anonymous).
let authedEmail = '';

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
    authedEmail = ''; // new client starts anonymous
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

// Signs the client in with a Supabase Auth "device" account so it operates as an
// authenticated role (required when RLS is enabled). No-op when no credentials
// are configured — the client stays anonymous exactly as before. Cached per
// client instance so we only hit the auth endpoint once.
export async function signInDevice(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<boolean> {
  if (!email || !password) return true; // anonymous mode
  if (authedEmail === email) return true; // already signed in on this client
  try {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      console.warn('Supabase device sign-in failed:', error.message);
      authedEmail = '';
      return false;
    }
    authedEmail = email;
    return true;
  } catch (err) {
    console.error('Supabase device sign-in error:', err);
    authedEmail = '';
    return false;
  }
}

// The canonical DDL lives in scripts/schema.sql — run it in the Supabase SQL
// editor before enabling sync.

// Validates a staff login against the cloud via the SECURITY DEFINER
// verify_login RPC (see scripts/schema.sql). Returns the account's non-secret
// fields on success, or null. The PIN hash never leaves the database on the
// return path — only the caller's SHA-256(entered PIN) is sent.
export async function verifyLoginCloud(
  client: SupabaseClient,
  name: string,
  pinHash: string,
): Promise<UserAccount | null> {
  try {
    const { data, error } = await client.rpc('verify_login', {
      p_name: name,
      p_pin_hash: pinHash,
    });
    if (error) {
      console.warn('Cloud verify_login failed:', error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      role: row.role as UserAccount['role'],
      active: !!row.active,
      createdAt: row.created_at,
      pin: pinHash, // keep the verified hash so the local record can log in offline next time
    };
  } catch (err) {
    console.error('Cloud verify_login error:', err);
    return null;
  }
}

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
export async function pushProducts(
  client: SupabaseClient,
  products: Product[],
  storeId?: string,
): Promise<boolean> {
  if (products.length === 0) return true;
  try {
    const records = stampStoreId(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        cost: p.cost,
        category: p.category || null,
        sku: p.sku,
        stock: p.stock,
        min_stock: p.minStock,
        image: p.image,
      })),
      storeId,
    );

    const { error } = await client.from('products').upsert(records);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Failed pushing products:', err);
    return false;
  }
}

// Pull products from Supabase
export async function pullProducts(
  client: SupabaseClient,
  storeId?: string,
): Promise<Product[] | null> {
  try {
    let query = client.from('products').select('*');
    if (storeId) query = query.eq('store_id', storeId);
    const { data, error } = await query;
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
  storeId?: string,
): Promise<boolean> {
  if (categories.length === 0) return true;
  try {
    const { error } = await client.from('categories').upsert(stampStoreId(categories, storeId));
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Failed pushing categories:', err);
    return false;
  }
}

// Pull categories
export async function pullCategories(
  client: SupabaseClient,
  storeId?: string,
): Promise<Category[] | null> {
  try {
    let query = client.from('categories').select('*');
    if (storeId) query = query.eq('store_id', storeId);
    const { data, error } = await query;
    if (error) throw error;
    // store_id is a sync-only column; strip it so the domain object stays clean.
    return (data || []).map((r) => ({ id: r.id, name: r.name, color: r.color }));
  } catch (err) {
    console.error('Failed pulling categories:', err);
    return null;
  }
}

// Push local customers
export async function pushCustomers(
  client: SupabaseClient,
  customers: Customer[],
  storeId?: string,
): Promise<boolean> {
  if (customers.length === 0) return true;
  try {
    const records = stampStoreId(
      customers.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        points: c.points,
        created_at: c.createdAt,
      })),
      storeId,
    );
    const { error } = await client.from('customers').upsert(records);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Failed pushing customers:', err);
    return false;
  }
}

// Pull customers
export async function pullCustomers(
  client: SupabaseClient,
  storeId?: string,
): Promise<Customer[] | null> {
  try {
    let query = client.from('customers').select('*');
    if (storeId) query = query.eq('store_id', storeId);
    const { data, error } = await query;
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
  storeId?: string,
): Promise<boolean> {
  if (transactions.length === 0) return true;
  try {
    const records = stampStoreId(transactions.map((t) => ({
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
      payments: t.payments ?? null,
      cash_paid: t.cashPaid ?? null,
      cash_change: t.cashChange ?? null,
      customer_id: t.customerId || null,
      customer_name: t.customerName || null,
      operator_id: t.operatorId || null,
      operator_name: t.operatorName || null,
      points_earned: t.pointsEarned ?? null,
      status: t.status,
      refunded_items: t.refundedItems ?? null,
      refunded_amount: t.refundedAmount ?? null,
      refund_date: t.refundDate || null,
      refund_authorized_by: t.refundAuthorizedBy || null,
      shift_id: t.shiftId || null,
    })), storeId);
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
export async function pullTransactions(
  client: SupabaseClient,
  storeId?: string,
): Promise<SaleTransaction[] | null> {
  try {
    let query = client.from('transactions').select('*').order('date', { ascending: false });
    if (storeId) query = query.eq('store_id', storeId);
    const { data, error } = await query;
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
      payments: (r.payments as SaleTransaction['payments']) ?? undefined,
      cashPaid: r.cash_paid != null ? Number(r.cash_paid) : undefined,
      cashChange: r.cash_change != null ? Number(r.cash_change) : undefined,
      customerId: r.customer_id,
      customerName: r.customer_name,
      operatorId: r.operator_id ?? null,
      operatorName: r.operator_name ?? null,
      pointsEarned: r.points_earned != null ? Number(r.points_earned) : undefined,
      status: r.status as SaleTransaction['status'],
      refundedItems: (r.refunded_items as SaleTransaction['refundedItems']) ?? undefined,
      refundedAmount: r.refunded_amount != null ? Number(r.refunded_amount) : undefined,
      refundDate: r.refund_date,
      refundAuthorizedBy: r.refund_authorized_by ?? null,
      shiftId: r.shift_id ?? null,
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
  storeId?: string,
): Promise<boolean> {
  if (accounts.length === 0) return true;
  try {
    const records = stampStoreId(
      accounts.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        pin: a.pin,
        active: a.active,
        created_at: a.createdAt,
      })),
      storeId,
    );
    const { error } = await client.from('user_accounts').upsert(records);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Failed pushing user accounts:', err);
    return false;
  }
}

// Pull user accounts
export async function pullUserAccounts(
  client: SupabaseClient,
  storeId?: string,
): Promise<UserAccount[] | null> {
  try {
    let query = client.from('user_accounts').select('*');
    if (storeId) query = query.eq('store_id', storeId);
    const { data, error } = await query;
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
