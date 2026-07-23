import { describe, it, expect } from 'vitest';
import { planCatalogPush, productKey, categoryKey, CatalogPushOptions } from '../../src/lib/catalogPush';
import { Product, Category } from '../../src/types';

const P = (over: Partial<Product>): Product => ({
  id: 'x',
  name: 'Item',
  price: 1,
  cost: 0.5,
  category: 'c1',
  sku: '',
  stock: 5,
  minStock: 2,
  image: 'bg-slate-500',
  ...over,
});

const C = (over: Partial<Category>): Category => ({ id: 'c1', name: 'Cat', color: 'bg-red-500', ...over });

const ALL: CatalogPushOptions = { addNewProducts: true, updatePrices: true, pushCategories: true };

// Deterministic id generator for assertions.
function counter() {
  let n = 0;
  return (kind: 'product' | 'category') => `${kind}-${(n += 1)}`;
}

describe('productKey / categoryKey', () => {
  it('keys by sku when present, else by name, normalized', () => {
    expect(productKey(P({ sku: ' ABC-1 ' }))).toBe('sku:abc-1');
    expect(productKey(P({ sku: '', name: 'Iced  Latte ' }))).toBe('name:iced latte');
    expect(categoryKey(' Hot Drinks ')).toBe('hot drinks');
  });
});

describe('planCatalogPush', () => {
  const source = {
    categories: [C({ id: 'sc1', name: 'Drinks', color: 'bg-blue-500' })],
    products: [
      P({ id: 'sp1', name: 'Latte', sku: 'L1', price: 4, cost: 1, category: 'sc1' }),
      P({ id: 'sp2', name: 'Mocha', sku: 'M1', price: 5, cost: 1.5, category: 'sc1' }),
    ],
  };

  it('adds missing products with fresh ids, zero stock, and remapped category', () => {
    const target = { categories: [], products: [] };
    const plan = planCatalogPush(source, target, ALL, counter());
    // one category created, then two products
    expect(plan.summary).toEqual({ categoriesAdded: 1, productsAdded: 2, pricesUpdated: 0, unchanged: 0 });
    const cat = plan.categoriesToUpsert[0];
    expect(cat.name).toBe('Drinks');
    // products reference the newly created target category id, not the source id
    expect(plan.productsToUpsert.every((p) => p.category === cat.id)).toBe(true);
    // inventory never carried over
    expect(plan.productsToUpsert.every((p) => p.stock === 0)).toBe(true);
    // fresh ids, not the source ids
    expect(plan.productsToUpsert.map((p) => p.id)).not.toContain('sp1');
  });

  it('matches existing products by sku and updates only changed prices', () => {
    const target = {
      categories: [C({ id: 'tc1', name: 'Drinks', color: 'bg-blue-500' })],
      products: [
        P({ id: 'tp1', name: 'Latte (old)', sku: 'L1', price: 3, cost: 1, category: 'tc1' }),
        P({ id: 'tp2', name: 'Mocha', sku: 'M1', price: 5, cost: 1.5, category: 'tc1' }),
      ],
    };
    const plan = planCatalogPush(source, target, ALL, counter());
    expect(plan.summary).toEqual({ categoriesAdded: 0, productsAdded: 0, pricesUpdated: 1, unchanged: 1 });
    const updated = plan.productsToUpsert[0];
    expect(updated.id).toBe('tp1'); // keeps the target's id
    expect(updated.price).toBe(4); // updated from source
    expect(updated.name).toBe('Latte (old)'); // name is NOT overwritten on a price update
  });

  it('honors options: prices off, adds off', () => {
    const target = {
      categories: [C({ id: 'tc1', name: 'Drinks' })],
      products: [P({ id: 'tp1', name: 'Latte', sku: 'L1', price: 3, category: 'tc1' })],
    };
    const noPrices = planCatalogPush(source, target, { ...ALL, updatePrices: false }, counter());
    expect(noPrices.summary.pricesUpdated).toBe(0);
    const noAdds = planCatalogPush(source, target, { ...ALL, addNewProducts: false }, counter());
    expect(noAdds.summary.productsAdded).toBe(0);
  });

  it('leaves products category-less when pushCategories is off and no name match exists', () => {
    const target = { categories: [], products: [] };
    const plan = planCatalogPush(source, target, { ...ALL, pushCategories: false }, counter());
    expect(plan.categoriesToUpsert).toEqual([]);
    expect(plan.productsToUpsert.every((p) => p.category === '')).toBe(true);
  });

  it('does not double-create a category shared by several source products', () => {
    const src = {
      categories: [C({ id: 'sc1', name: 'Drinks' }), C({ id: 'sc2', name: 'Drinks' })],
      products: [],
    };
    const plan = planCatalogPush(src, { categories: [], products: [] }, ALL, counter());
    expect(plan.categoriesToUpsert).toHaveLength(1);
  });
});
