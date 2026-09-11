import { SupabaseClient } from '@supabase/supabase-js';
import { Category, Product } from '../../types';
import { fetchAllPages, isUnknownColumn, keyset, stampStoreId } from './sync-utils';

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
    // Null rather than undefined for a plain product: PostgREST omits an
    // undefined key from the upsert payload, so a product that HAD variants and
    // no longer does would keep its old matrix in the cloud row and get it back
    // on the next pull.
    variant_types: p.variantTypes ?? null,
    variants: p.variants ?? null,
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
    if (!error) return true;

    // The app updates itself; the schema does not. Until the operator runs the
    // ALTER TABLEs in src/db/schema.sql, PostgREST rejects the whole row for the
    // one column it does not know — which would stop the catalogue, the stock
    // levels and every sale's decrement from syncing over a feature the store
    // may not even use. Dropping the pair and retrying keeps inventory flowing
    // and leaves a warning pointing at the migration.
    if (!isUnknownColumn(error, 'variant_types') && !isUnknownColumn(error, 'variants')) {
      throw error;
    }
    console.warn(
      'products.variant_types/variants are missing in Supabase — pushing without them. ' +
        'Run the ALTER TABLE in src/db/schema.sql so product variants sync between terminals.',
    );
    const withoutVariants = records.map(
      ({ variant_types: _types, variants: _variants, ...rest }) => rest,
    );
    const retry = await client.from('products').upsert(withoutVariants);
    if (retry.error) throw retry.error;
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
      // Kept off the object entirely when the column is null or the database
      // predates the migration: `variants: undefined` and no key at all mean
      // the same thing to every reader, and an empty array would make
      // hasVariants() disagree with itself across a sync.
      ...(r.variant_types ? { variantTypes: r.variant_types } : {}),
      ...(r.variants ? { variants: r.variants } : {}),
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
