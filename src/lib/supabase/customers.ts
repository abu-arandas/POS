import { SupabaseClient } from '@supabase/supabase-js';
import { Customer } from '../../types';
import { fetchAllPages, keyset, stampStoreId } from './sync-utils';

/**
 * Push local customers
 */
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

/**
 * Pull customers
 */
export async function pullCustomers(
  client: SupabaseClient,
  storeId?: string,
): Promise<Customer[] | null> {
  try {
    const data = await fetchAllPages((afterId, limit) => {
      let query = keyset(client.from('customers').select('*'), afterId, limit);
      if (storeId) query = query.eq('store_id', storeId);
      return query;
    });
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
