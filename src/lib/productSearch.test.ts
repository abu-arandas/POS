import { describe, expect, it } from 'vitest';
import { rankProduct, searchProducts } from './productSearch';
import type { Product } from '../types';

const product = (name: string, overrides: Partial<Product> = {}): Product => ({
  id: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  price: 1,
  cost: 0,
  category: 'c1',
  sku: `SKU-${name.toLowerCase().replace(/\s+/g, '')}`,
  stock: 10,
  minStock: 0,
  image: '',
  ...overrides,
});

const names = (products: Product[]) => products.map((p) => p.name);

describe('rankProduct', () => {
  it('ranks an exact SKU above everything', () => {
    const p = product('Latte', { sku: 'ESP-01' });
    expect(rankProduct(p, 'esp-01')).toBeGreaterThan(rankProduct(product('Latte'), 'latte'));
  });

  it('ranks an exact name above a prefix, and a prefix above a mid-word hit', () => {
    const exact = rankProduct(product('Latte'), 'latte');
    const prefix = rankProduct(product('Latte Macchiato'), 'latte');
    const contains = rankProduct(product('Chocolate Latte Cake'), 'te c');
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(contains);
  });

  it('scores nothing for a query that does not appear', () => {
    expect(rankProduct(product('Latte'), 'zzz')).toBe(0);
  });

  it('scores nothing for an empty query', () => {
    expect(rankProduct(product('Latte'), '')).toBe(0);
  });

  it('takes a product’s best field, not its first', () => {
    // The name contains the query mid-word AND a variant SKU matches exactly;
    // the exact SKU is what the operator meant.
    const p = product('Chocolate Latte Cake', {
      sku: 'CAKE-1',
      variants: [{ id: 'v1', options: {}, sku: 'LATTE', stock: 1 }],
    });
    expect(rankProduct(p, 'latte')).toBe(rankProduct(product('X', { sku: 'LATTE' }), 'latte'));
  });
});

describe('searchProducts', () => {
  const catalogue = [
    product('Chocolate Latte Cake'),
    product('Iced Latte'),
    product('Latte Macchiato'),
    product('Latte'),
    product('Espresso', { sku: 'ESP-01' }),
  ];

  // The behaviour this exists for. Unranked, typing the exact name of the thing
  // being ordered still put three other products ahead of it.
  it('puts the exact name first', () => {
    expect(names(searchProducts(catalogue, 'latte', 'all'))[0]).toBe('Latte');
  });

  it('orders exact, then name-prefix, then the word-boundary hits', () => {
    // "Iced Latte" and "Chocolate Latte Cake" both match at a word boundary and
    // so rank equally; the tie falls back to the shop's own catalogue order,
    // which is why Chocolate (added first) precedes Iced here.
    expect(names(searchProducts(catalogue, 'latte', 'all'))).toEqual([
      'Latte',
      'Latte Macchiato',
      'Chocolate Latte Cake',
      'Iced Latte',
    ]);
  });

  it('ranks a name prefix above a match that starts a later word', () => {
    const items = [product('Iced Latte'), product('Latte Macchiato')];
    expect(names(searchProducts(items, 'latte', 'all'))).toEqual(['Latte Macchiato', 'Iced Latte']);
  });

  it('finds a product by an exact SKU and puts it first', () => {
    expect(names(searchProducts(catalogue, 'esp-01', 'all'))[0]).toBe('Espresso');
  });

  it('matches a variant SKU', () => {
    const shirt = product('Tee', {
      variants: [
        { id: 'v1', options: {}, sku: 'TEE-S', stock: 1 },
        { id: 'v2', options: {}, sku: 'TEE-L', stock: 1 },
      ],
    });
    expect(names(searchProducts([shirt, ...catalogue], 'tee-l', 'all'))).toEqual(['Tee']);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(names(searchProducts(catalogue, '  LATTE  ', 'all'))[0]).toBe('Latte');
  });

  it('drops everything that does not match', () => {
    expect(searchProducts(catalogue, 'zzz', 'all')).toEqual([]);
  });

  // A word boundary rather than a bare indexOf: "milk" should reach the milk
  // before the scone that merely contains the letters.
  it('prefers a word start to letters buried inside a word', () => {
    const items = [product('Buttermilk Scone'), product('Oat Milk')];
    expect(names(searchProducts(items, 'milk', 'all'))).toEqual(['Oat Milk', 'Buttermilk Scone']);
  });

  describe('category filter', () => {
    const mixed = [
      product('Latte', { category: 'drinks' }),
      product('Latte Cake', { category: 'food' }),
    ];

    it('narrows to the selected category', () => {
      expect(names(searchProducts(mixed, 'latte', 'food'))).toEqual(['Latte Cake']);
    });

    it('applies the category with no query at all', () => {
      expect(names(searchProducts(mixed, '', 'drinks'))).toEqual(['Latte']);
    });
  });

  describe('the operator’s own ordering', () => {
    // The grid is drag-reorderable and a shop lays its tiles out the way its
    // counter works, so nothing may shuffle them until there is a query.
    it('is preserved exactly when there is no query', () => {
      expect(names(searchProducts(catalogue, '', 'all'))).toEqual(names(catalogue));
      expect(names(searchProducts(catalogue, '   ', 'all'))).toEqual(names(catalogue));
    });

    it('breaks ties in catalogue order rather than arbitrarily', () => {
      const ties = [product('Tea Green'), product('Tea Black'), product('Tea Mint')];
      expect(names(searchProducts(ties, 'tea', 'all'))).toEqual(names(ties));
    });
  });
});
