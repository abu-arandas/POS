import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Product } from '../../src/types';

// Deletes fan out to cloud sync when it is enabled; stub it so these store-level
// tests stay local and synchronous.
vi.mock('../../src/lib/sync', () => ({
  deleteProductsCloudIfEnabled: vi.fn(),
  deleteCategoriesCloudIfEnabled: vi.fn(),
}));

import { useProductStore } from '../../src/stores/productStore';

const payload = (over: Partial<Omit<Product, 'id'>> = {}): Omit<Product, 'id'> => ({
  name: 'Latte',
  price: 4.5,
  cost: 1,
  category: 'coffee',
  sku: 'LAT-1',
  stock: 10,
  minStock: 2,
  image: 'bg-amber-500',
  ...over,
});

describe('useProductStore', () => {
  beforeEach(() => {
    useProductStore.setState({ products: [], categories: [] });
  });

  it('adds a product with a generated id and returns it', () => {
    const p = useProductStore.getState().handleAddProduct(payload());
    expect(p.id).toMatch(/^prod-/);
    expect(useProductStore.getState().products).toEqual([p]);
  });

  it('updates a product in place by id', () => {
    const p = useProductStore.getState().handleAddProduct(payload());
    useProductStore.getState().handleUpdateProduct({ ...p, price: 5 });
    expect(useProductStore.getState().products[0].price).toBe(5);
    expect(useProductStore.getState().products).toHaveLength(1);
  });

  it('deletes a product by id', () => {
    const p = useProductStore.getState().handleAddProduct(payload());
    useProductStore.getState().handleDeleteProduct(p.id);
    expect(useProductStore.getState().products).toEqual([]);
  });

  it('reorders products, and is a no-op for an unknown id', () => {
    const a = useProductStore.getState().handleAddProduct(payload({ name: 'A' }));
    useProductStore.getState().handleAddProduct(payload({ name: 'B' }));
    const c = useProductStore.getState().handleAddProduct(payload({ name: 'C' }));
    // Move A into C's slot.
    useProductStore.getState().reorderProducts(a.id, c.id);
    expect(useProductStore.getState().products.map((p) => p.name)).toEqual(['B', 'C', 'A']);

    const before = useProductStore.getState().products.map((p) => p.id);
    useProductStore.getState().reorderProducts('missing', c.id);
    expect(useProductStore.getState().products.map((p) => p.id)).toEqual(before);
  });

  it('refuses to delete a category still referenced by a product', () => {
    const cat = useProductStore.getState().handleAddCategory('Hot Drinks', '#ff0000');
    useProductStore.getState().handleAddProduct(payload({ category: cat.id }));

    expect(useProductStore.getState().handleDeleteCategory(cat.id)).toBe(false);
    expect(useProductStore.getState().categories).toContainEqual(cat);
  });

  it('adds a category with a slugified id and deletes it', () => {
    const cat = useProductStore.getState().handleAddCategory('Hot Drinks', '#ff0000');
    expect(cat.name).toBe('Hot Drinks');
    expect(cat.id).toMatch(/^cat-hot-drin-/); // slug lowercased, spaces → '-', truncated to 8 chars
    expect(useProductStore.getState().categories).toEqual([cat]);

    useProductStore.getState().handleDeleteCategory(cat.id);
    expect(useProductStore.getState().categories).toEqual([]);
  });
});
