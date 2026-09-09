import { SupabaseClient } from '@supabase/supabase-js';
import { Category, Product } from '../../types';
import { fetchAllPages, keyset, stampStoreId } from './sync-utils';

/**
 * One product as the `products` table stores it: camelCase to snake_case, with
 * an unset category written as SQL NULL so it satisfies the foreign key rather
 * than pointing at a category id of `''`.
 *
 * Exported because the fleet catalog push sends the same shape through an RPC.
 * A column added to the table has to be added here once, not in both callers.
 */
export function toProductRow(p: Product) {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    cost: p.cost,
    category: p.category || null,
    sku: p.sku,
    stock: p.stock,
    min_stock: p.minStock,
    image: p.image,
  };
}

/**
 * Push local products to Supabase
 */
export async function pushProducts(
  client: SupabaseClient,
  products: Product[],
  storeId?: string,
): Promise<boolean> {
  if (products.length === 0) return true;
  try {
    const records = stampStoreId(products.map(toProductRow), storeId);

    const { error } = await client.from('products').upsert(records);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Failed pushing products:', err);
    return false;
  }
}

/**
 * Pull products from Supabase
 */
export async function pullProducts(
  client: SupabaseClient,
  storeId?: string,
): Promise<Product[] | null> {
  try {
    const data = await fetchAllPages((afterId, limit) => {
      let query = keyset(client.from('products').select('*'), afterId, limit);
      if (storeId) query = query.eq('store_id', storeId);
      return query;
    });
    return data.map((r) => ({
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

/**
 * Push local categories
 */
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

/**
 * Pull categories
 */
export async function pullCategories(
  client: SupabaseClient,
  storeId?: string,
): Promise<Category[] | null> {
  try {
    const data = await fetchAllPages((afterId, limit) => {
      let query = keyset(client.from('categories').select('*'), afterId, limit);
      if (storeId) query = query.eq('store_id', storeId);
      return query;
    });
    // store_id is a sync-only column; strip it so the domain object stays clean.
    return data.map((r) => ({ id: r.id, name: r.name, color: r.color }));
  } catch (err) {
    console.error('Failed pulling categories:', err);
    return null;
  }
}
