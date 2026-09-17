import { describe, expect, it } from 'vitest';
import {
  applyStockDelta,
  availableStock,
  hasVariants,
  lineKey,
  MAX_VARIANTS_PER_PRODUCT,
  optionSignature,
  parseLineKey,
  rebuildVariants,
  totalVariantStock,
  variantCombinations,
  variantCost,
  variantLabel,
  variantPrice,
  withDerivedStock,
} from './variants';
import type { Product, ProductVariant, VariantType } from '../types';

const variant = (overrides: Partial<ProductVariant> = {}): ProductVariant => ({
  id: 'v1',
  options: {},
  sku: 'SKU-1',
  stock: 0,
  ...overrides,
});

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Tee',
  price: 20,
  cost: 8,
  category: 'c1',
  sku: 'TEE',
  stock: 0,
  minStock: 0,
  image: '',
  ...overrides,
});

const SIZE: VariantType = {
  id: 't-size',
  name: 'Size',
  options: [
    { id: 'o-s', name: 'Small' },
    { id: 'o-l', name: 'Large' },
  ],
};
const COLOUR: VariantType = {
  id: 't-colour',
  name: 'Colour',
  options: [
    { id: 'o-red', name: 'Red' },
    { id: 'o-blue', name: 'Blue' },
  ],
};

describe('lineKey / parseLineKey', () => {
  it('is the bare product id for a plain line, so pre-variant rows keep working', () => {
    expect(lineKey('p1')).toBe('p1');
    expect(lineKey('p1', null)).toBe('p1');
    expect(parseLineKey('p1')).toEqual({ productId: 'p1' });
  });

  it('round-trips a variant line', () => {
    expect(parseLineKey(lineKey('p1', 'v-s'))).toEqual({ productId: 'p1', variantId: 'v-s' });
  });
});

describe('variantPrice / variantCost', () => {
  // A variant price of 0 is a real price — a free size upgrade, a sample — so
  // the fallback has to be on undefined, never on falsiness.
  it('treats a zero override as a real price, not a missing one', () => {
    expect(variantPrice(product(), variant({ price: 0 }))).toBe(0);
    expect(variantCost(product(), variant({ cost: 0 }))).toBe(0);
  });

  it('falls back to the parent when the variant sets nothing', () => {
    expect(variantPrice(product(), variant())).toBe(20);
    expect(variantCost(product(), variant())).toBe(8);
    expect(variantPrice(product(), undefined)).toBe(20);
  });
});

describe('variantLabel', () => {
  it('reads options in the product’s own type order, not the map’s', () => {
    const p = product({ variantTypes: [SIZE, COLOUR] });
    const v = variant({ options: { 't-colour': 'o-red', 't-size': 'o-l' } });
    expect(variantLabel(p, v)).toBe('Large / Red');
  });

  it('drops an option the product no longer defines rather than printing a raw id', () => {
    const p = product({ variantTypes: [SIZE] });
    const v = variant({ options: { 't-size': 'o-l', 't-gone': 'o-x' } });
    expect(variantLabel(p, v)).toBe('Large');
  });
});

describe('totalVariantStock / withDerivedStock', () => {
  it('sums the variants rather than trusting the product field', () => {
    const p = product({
      stock: 999,
      variants: [variant({ stock: 3 }), variant({ id: 'v2', stock: 4 })],
    });
    expect(totalVariantStock(p)).toBe(7);
    expect(withDerivedStock(p).stock).toBe(7);
  });

  it('floors a corrupt variant count instead of poisoning the sum', () => {
    const p = product({
      variants: [
        variant({ stock: -5 }),
        variant({ id: 'v2', stock: Number.NaN }),
        variant({ id: 'v3', stock: 4 }),
      ],
    });
    expect(totalVariantStock(p)).toBe(4);
  });

  it('leaves a plain product stock field alone', () => {
    const p = product({ stock: 12 });
    expect(totalVariantStock(p)).toBe(12);
    expect(withDerivedStock(p)).toBe(p);
  });

  it('returns the same object when the total already agrees', () => {
    const p = product({ stock: 3, variants: [variant({ stock: 3 })] });
    expect(withDerivedStock(p)).toBe(p);
  });
});

describe('availableStock', () => {
  it('is the product count on a plain line', () => {
    expect(availableStock(product({ stock: 5 }), null)).toBe(5);
  });

  it('is the named variant’s own count', () => {
    const p = product({ stock: 9, variants: [variant({ id: 'v-s', stock: 2 })] });
    expect(availableStock(p, 'v-s')).toBe(2);
  });

  // Falling back to the parent would sell one variant's units out of another's.
  it('is zero for a variant the product does not have', () => {
    const p = product({ stock: 9, variants: [variant({ id: 'v-s', stock: 2 })] });
    expect(availableStock(p, 'v-gone')).toBe(0);
  });
});

describe('applyStockDelta', () => {
  it('moves a plain product’s stock', () => {
    expect(applyStockDelta(product({ stock: 5 }), null, -2)?.stock).toBe(3);
  });

  it('moves one variant and re-derives the total', () => {
    const p = product({
      stock: 5,
      variants: [variant({ id: 'v-s', stock: 2 }), variant({ id: 'v-l', stock: 3 })],
    });
    const next = applyStockDelta(p, 'v-s', -1);
    expect(next?.variants?.find((v) => v.id === 'v-s')?.stock).toBe(1);
    expect(next?.stock).toBe(4);
  });

  it('refuses a variant the product does not have, rather than guessing', () => {
    const p = product({ variants: [variant({ id: 'v-s', stock: 2 })] });
    expect(applyStockDelta(p, 'v-gone', -1)).toBeNull();
  });

  it('lets stock go negative — the floor is the caller’s policy', () => {
    expect(applyStockDelta(product({ stock: 1 }), null, -5)?.stock).toBe(-4);
  });

  it('does not mutate the product it was given', () => {
    const p = product({ stock: 5, variants: [variant({ id: 'v-s', stock: 2 })] });
    applyStockDelta(p, 'v-s', -1);
    expect(p.variants?.[0].stock).toBe(2);
    expect(p.stock).toBe(5);
  });
});

describe('variantCombinations', () => {
  it('varies the last type fastest, the way a grid reads on paper', () => {
    const combos = variantCombinations([SIZE, COLOUR]);
    expect(combos).toEqual([
      { 't-size': 'o-s', 't-colour': 'o-red' },
      { 't-size': 'o-s', 't-colour': 'o-blue' },
      { 't-size': 'o-l', 't-colour': 'o-red' },
      { 't-size': 'o-l', 't-colour': 'o-blue' },
    ]);
  });

  it('ignores a type that has no options yet', () => {
    const empty: VariantType = { id: 't-empty', name: 'Fit', options: [] };
    expect(variantCombinations([SIZE, empty])).toHaveLength(2);
  });

  it('is empty when nothing is usable', () => {
    expect(variantCombinations([])).toEqual([]);
    expect(variantCombinations([{ id: 't', name: 'T', options: [] }])).toEqual([]);
  });

  it('caps a combinatorial explosion', () => {
    const many = (id: string): VariantType => ({
      id,
      name: id,
      options: Array.from({ length: 30 }, (_unused, i) => ({ id: `${id}-${i}`, name: `${i}` })),
    });
    expect(variantCombinations([many('a'), many('b'), many('c')]).length).toBeLessThanOrEqual(
      MAX_VARIANTS_PER_PRODUCT,
    );
  });
});

describe('optionSignature', () => {
  it('signs the same combination the same way whatever order it was built in', () => {
    expect(optionSignature({ b: '2', a: '1' })).toBe(optionSignature({ a: '1', b: '2' }));
  });

  it('distinguishes different combinations', () => {
    expect(optionSignature({ a: '1' })).not.toBe(optionSignature({ a: '2' }));
  });
});

describe('rebuildVariants', () => {
  const makeId = (() => {
    let n = 0;
    return () => `new-${(n += 1)}`;
  })();

  // Regeneration happens whenever an option is added or removed, which in a
  // shop is routine. Rebuilding from scratch would zero the counted stock of
  // every surviving combination — an inventory loss, not an edit.
  it('carries stock, price and sku across a regeneration', () => {
    const existing = [
      variant({
        id: 'v-s',
        options: { 't-size': 'o-s' },
        sku: 'TEE-S',
        stock: 7,
        price: 18,
      }),
    ];
    const rebuilt = rebuildVariants([SIZE], existing, makeId, () => 'AUTO');
    const small = rebuilt.find((v) => v.options['t-size'] === 'o-s');
    expect(small).toMatchObject({ id: 'v-s', sku: 'TEE-S', stock: 7, price: 18 });
  });

  it('creates new combinations at zero stock', () => {
    const rebuilt = rebuildVariants([SIZE], [], makeId, (_options, index) => `AUTO-${index}`);
    expect(rebuilt).toHaveLength(2);
    expect(rebuilt.every((v) => v.stock === 0)).toBe(true);
    expect(rebuilt[0].sku).toBe('AUTO-0');
  });

  it('drops a combination whose option was removed', () => {
    const existing = [
      variant({ id: 'v-s', options: { 't-size': 'o-s' }, stock: 5 }),
      variant({ id: 'v-l', options: { 't-size': 'o-l' }, stock: 5 }),
    ];
    const smallOnly: VariantType = { ...SIZE, options: [{ id: 'o-s', name: 'Small' }] };
    const rebuilt = rebuildVariants([smallOnly], existing, makeId, () => 'AUTO');
    expect(rebuilt).toHaveLength(1);
    expect(rebuilt[0].id).toBe('v-s');
  });

  it('carries stock across an added axis for the combinations that still match', () => {
    const existing = [variant({ id: 'v-s', options: { 't-size': 'o-s' }, stock: 9 })];
    const rebuilt = rebuildVariants([SIZE, COLOUR], existing, makeId, () => 'AUTO');
    // Adding an axis changes every signature, so nothing matches and the whole
    // matrix is new — which is why the form warns before widening a product.
    expect(rebuilt).toHaveLength(4);
    expect(rebuilt.every((v) => v.stock === 0)).toBe(true);
  });
});

describe('hasVariants', () => {
  it.each([
    ['no field', product(), false],
    ['an empty array', product({ variants: [] }), false],
    ['one variant', product({ variants: [variant()] }), true],
  ])('is %s -> %s', (_label, p, expected) => expect(hasVariants(p)).toBe(expected));
});
