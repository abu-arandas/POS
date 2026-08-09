// Pure planning for central catalog push (Phase 4). A super-admin edits one
// store's catalog and pushes it to others. DOM-free and deterministic so it
// unit-tests like the other lib/* helpers; the Supabase reads/writes live in
// ./fleetClient.
//
// Design notes that make this safe:
//  - Products/categories have global single-column ids tagged with store_id, so
//    a "copy" into another store is a NEW row with a NEW id — never a shared id.
//  - Matching between stores is by business key (SKU, else name), never by
//    internal id, which is store-scoped.
//  - Category references are remapped from source ids to the target store's own
//    category ids (matched by name, created on demand).
//  - Stock is per-store inventory and is NEVER pushed (new products land at 0).
//  - The plan only ADDS products/categories and UPDATES prices — it never
//    deletes, so a push can't wipe a store's catalog.

import { Product, Category } from '../types';

export interface CatalogPushOptions {
  addNewProducts: boolean;
  updatePrices: boolean;
  pushCategories: boolean;
}

export interface CatalogPushPlan {
  categoriesToUpsert: Category[]; // new categories for the target (fresh ids)
  productsToUpsert: Product[]; // new products (fresh ids) + price/cost updates (target ids)
  summary: {
    categoriesAdded: number;
    productsAdded: number;
    pricesUpdated: number;
    unchanged: number;
  };
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Business key for cross-store product matching: SKU if present, else name.
export function productKey(p: Product): string {
  const sku = p.sku?.trim();
  return sku ? `sku:${norm(sku)}` : `name:${norm(p.name)}`;
}

export function categoryKey(name: string): string {
  return norm(name);
}

// Computes exactly what to write into one target store to reconcile it toward
// the source catalog, honoring the options. `genId` mints target-scoped ids
// (injected so tests can pass a deterministic generator).
export function planCatalogPush(
  source: { products: Product[]; categories: Category[] },
  target: { products: Product[]; categories: Category[] },
  options: CatalogPushOptions,
  genId: (kind: 'product' | 'category') => string,
): CatalogPushPlan {
  const categoriesToUpsert: Category[] = [];

  // 1. Reconcile categories → a map from source category id to target id.
  const targetCatByName = new Map<string, string>();
  for (const c of target.categories) targetCatByName.set(categoryKey(c.name), c.id);

  const srcCatIdToTargetId = new Map<string, string>();
  for (const c of source.categories) {
    const key = categoryKey(c.name);
    const existing = targetCatByName.get(key);
    if (existing) {
      srcCatIdToTargetId.set(c.id, existing);
    } else if (options.pushCategories) {
      const newId = genId('category');
      const created: Category = { id: newId, name: c.name.trim(), color: c.color };
      categoriesToUpsert.push(created);
      targetCatByName.set(key, newId); // so repeats in source don't double-create
      srcCatIdToTargetId.set(c.id, newId);
    }
    // else: leave unmapped → products land with no category
  }

  // 2. Reconcile products by business key.
  const targetByKey = new Map<string, Product>();
  for (const p of target.products) targetByKey.set(productKey(p), p);

  const productsToUpsert: Product[] = [];
  let productsAdded = 0;
  let pricesUpdated = 0;
  let unchanged = 0;

  for (const sp of source.products) {
    const key = productKey(sp);
    const match = targetByKey.get(key);
    const targetCat = srcCatIdToTargetId.get(sp.category) ?? '';

    if (!match) {
      if (options.addNewProducts) {
        productsToUpsert.push({
          id: genId('product'),
          name: sp.name,
          price: sp.price,
          cost: sp.cost,
          category: targetCat,
          sku: sp.sku,
          stock: 0, // inventory is per-store; never carried over
          minStock: sp.minStock,
          image: sp.image,
        });
        productsAdded += 1;
      }
    } else if (options.updatePrices && (match.price !== sp.price || match.cost !== sp.cost)) {
      productsToUpsert.push({ ...match, price: sp.price, cost: sp.cost });
      pricesUpdated += 1;
    } else {
      unchanged += 1;
    }
  }

  return {
    categoriesToUpsert,
    productsToUpsert,
    summary: {
      categoriesAdded: categoriesToUpsert.length,
      productsAdded,
      pricesUpdated,
      unchanged,
    },
  };
}
