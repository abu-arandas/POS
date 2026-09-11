import { describe, it, expect } from 'vitest';
import type { Product, ProductVariant, VariantType } from '../../src/types';
import {
  MAX_VARIANTS_PER_PRODUCT,
  applyStockDelta,
  availableStock,
  findVariant,
  hasVariants,
  lineKey,
  optionSignature,
  orderItemKey,
  parseLineKey,
  rebuildVariants,
  refundedItemKey,
  totalVariantStock,
  variantCombinations,
  variantCost,
  variantImage,
  variantLabel,
  variantLabelById,
  variantPrice,
  variantSku,
  withDerivedStock,
} from '../../src/lib/variants';

const size: VariantType = {
  id: 'vt-size',
  name: 'Size',
  options: [
    { id: 'o-s', name: 'Small' },
    { id: 'o-l', name: 'Large' },
  ],
};
const colour: VariantType = {
  id: 'vt-colour',
  name: 'Colour',
  options: [
    { id: 'o-red', name: 'Red' },
    { id: 'o-blue', name: 'Blue' },
  ],
};

const variant = (over: Partial<ProductVariant> = {}): ProductVariant => ({
  id: 'v1',
  options: { 'vt-size': 'o-l', 'vt-colour': 'o-red' },
  sku: 'TEE-L-RED',
  stock: 4,
  ...over,
});

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Tee',
  price: 10,
  cost: 4,
  category: 'c1',
  sku: 'TEE',
  stock: 0,
  minStock: 1,
  image: 'bg-slate-100',
  ...over,
});

const varianted = (variants: ProductVariant[]) =>
  withDerivedStock(product({ variantTypes: [size, colour], variants }));

describe('line identity', () => {
  it('keeps a plain product addressed by its own id', () => {
    // The whole backwards-compatibility story rests on this: transactions,
    // refundedItems rows and held orders written before variants existed carry
    // bare product ids, and must keep resolving.
    expect(lineKey('p1')).toBe('p1');
    expect(lineKey('p1', undefined)).toBe('p1');
    expect(lineKey('p1', '')).toBe('p1');
    expect(parseLineKey('p1')).toEqual({ productId: 'p1' });
  });

  it('round-trips a variant line', () => {
    const key = lineKey('p1', 'v9');
    expect(key).not.toBe('p1');
    expect(parseLineKey(key)).toEqual({ productId: 'p1', variantId: 'v9' });
  });

  it('separates two variants of one product', () => {
    expect(lineKey('p1', 'v1')).not.toBe(lineKey('p1', 'v2'));
  });

  it('reads the same key off a sold line and a returned one', () => {
    expect(orderItemKey({ productId: 'p1', variantId: 'v1' })).toBe(
      refundedItemKey({ productId: 'p1', variantId: 'v1' }),
    );
    expect(orderItemKey({ productId: 'p1' })).toBe(refundedItemKey({ productId: 'p1' }));
  });
});

describe('naming a variant', () => {
  it('reads the options in the product’s own type order', () => {
    // Built with colour first; the label still says size first, because that
    // is the order the product declares.
    const v = variant({ options: { 'vt-colour': 'o-blue', 'vt-size': 'o-s' } });
    expect(variantLabel({ variantTypes: [size, colour] }, v)).toBe('Small / Blue');
  });

  it('drops an option the product no longer defines rather than printing an id', () => {
    const v = variant({ options: { 'vt-size': 'o-l', 'vt-colour': 'o-gone' } });
    expect(variantLabel({ variantTypes: [size, colour] }, v)).toBe('Large');
  });

  it('returns nothing for a variant the product does not have', () => {
    expect(variantLabelById(varianted([variant()]), 'nope')).toBe('');
    expect(variantLabelById(varianted([variant()]), undefined)).toBe('');
  });
});

describe('money and media fall back to the product', () => {
  it('uses the product price when the variant sets none', () => {
    expect(variantPrice(product(), variant())).toBe(10);
    expect(variantCost(product(), variant())).toBe(4);
  });

  it('honours a variant price of zero instead of treating it as unset', () => {
    // A free size upgrade is a real price. Falling back on falsiness would
    // charge the customer the parent's price for it.
    expect(variantPrice(product(), variant({ price: 0 }))).toBe(0);
    expect(variantCost(product(), variant({ cost: 0 }))).toBe(0);
  });

  it('prefers the variant’s own sku and image where it has them', () => {
    expect(variantSku(product(), variant())).toBe('TEE-L-RED');
    expect(variantImage(product(), variant({ image: 'x.png' }))).toBe('x.png');
    expect(variantImage(product(), variant())).toBe('bg-slate-100');
  });
});

describe('stock', () => {
  it('derives the product total from its variants', () => {
    const p = varianted([variant({ id: 'v1', stock: 4 }), variant({ id: 'v2', stock: 6 })]);
    expect(p.stock).toBe(10);
    expect(totalVariantStock(p)).toBe(10);
  });

  it('leaves a plain product’s stock exactly as it is', () => {
    const p = withDerivedStock(product({ stock: 7 }));
    expect(p.stock).toBe(7);
    expect(hasVariants(p)).toBe(false);
  });

  it('floors a corrupt variant count instead of poisoning the total', () => {
    const p = varianted([
      variant({ id: 'v1', stock: 5 }),
      variant({ id: 'v2', stock: -3 }),
      variant({ id: 'v3', stock: Number.NaN }),
    ]);
    expect(p.stock).toBe(5);
  });

  it('reports a named variant’s own count, not the pooled total', () => {
    const p = varianted([variant({ id: 'v1', stock: 4 }), variant({ id: 'v2', stock: 6 })]);
    expect(availableStock(p, 'v1')).toBe(4);
    expect(availableStock(p, undefined)).toBe(10);
  });

  it('reports zero for a variant the product no longer has', () => {
    // Never the parent total: falling back would let a sale for a deleted
    // variant draw on the units of the ones that remain.
    const p = varianted([variant({ id: 'v1', stock: 4 })]);
    expect(availableStock(p, 'deleted')).toBe(0);
    expect(findVariant(p, 'deleted')).toBeUndefined();
  });
});

describe('applying a stock movement', () => {
  it('moves one variant and re-derives the product total', () => {
    const p = varianted([variant({ id: 'v1', stock: 4 }), variant({ id: 'v2', stock: 6 })]);
    const next = applyStockDelta(p, 'v1', -3)!;
    expect(availableStock(next, 'v1')).toBe(1);
    expect(availableStock(next, 'v2')).toBe(6);
    expect(next.stock).toBe(7);
  });

  it('refuses a movement against a variant that is gone', () => {
    const p = varianted([variant({ id: 'v1', stock: 4 })]);
    expect(applyStockDelta(p, 'missing', -1)).toBeNull();
  });

  it('moves a plain product’s own count', () => {
    expect(applyStockDelta(product({ stock: 5 }), null, -2)!.stock).toBe(3);
  });

  it('leaves the original untouched', () => {
    const p = varianted([variant({ id: 'v1', stock: 4 })]);
    applyStockDelta(p, 'v1', -4);
    expect(availableStock(p, 'v1')).toBe(4);
    expect(p.stock).toBe(4);
  });

  it('lets a count go negative, leaving the floor to the caller', () => {
    // adjustStock and commitSale each have their own rule about refusing a
    // negative; encoding one of them here would silently impose it on both.
    expect(applyStockDelta(product({ stock: 1 }), null, -5)!.stock).toBe(-4);
  });
});

describe('the combination matrix', () => {
  it('varies the last type fastest, the way a grid reads', () => {
    expect(variantCombinations([size, colour])).toEqual([
      { 'vt-size': 'o-s', 'vt-colour': 'o-red' },
      { 'vt-size': 'o-s', 'vt-colour': 'o-blue' },
      { 'vt-size': 'o-l', 'vt-colour': 'o-red' },
      { 'vt-size': 'o-l', 'vt-colour': 'o-blue' },
    ]);
  });

  it('ignores a type that has no options yet', () => {
    // Half-entered in the form: three sizes and an empty colour axis is three
    // variants, not none.
    const empty: VariantType = { id: 'vt-new', name: '', options: [] };
    expect(variantCombinations([size, empty])).toHaveLength(2);
    expect(variantCombinations([empty])).toEqual([]);
  });

  it('caps a combinatorial explosion', () => {
    const many = (n: number, prefix: string): VariantType => ({
      id: `vt-${prefix}`,
      name: prefix,
      options: Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, name: `${i}` })),
    });
    const combinations = variantCombinations([many(20, 'a'), many(20, 'b'), many(20, 'c')]);
    expect(combinations.length).toBeLessThanOrEqual(MAX_VARIANTS_PER_PRODUCT);
  });

  it('signs a combination the same however it was assembled', () => {
    expect(optionSignature({ a: '1', b: '2' })).toBe(optionSignature({ b: '2', a: '1' }));
    expect(optionSignature({ a: '1' })).not.toBe(optionSignature({ a: '2' }));
  });
});

describe('rebuilding the matrix', () => {
  let counter = 0;
  const makeId = () => `gen-${(counter += 1)}`;
  const defaultSku = (_o: Record<string, string>, index: number) => `TEE-${index}`;

  it('carries the stock of every surviving combination across', () => {
    // The point of the whole function: adding a colour must not zero the
    // counted stock of the combinations that already existed.
    const existing = rebuildVariants([size, colour], [], makeId, defaultSku).map((v, i) => ({
      ...v,
      stock: (i + 1) * 10,
    }));

    const wider: VariantType = {
      ...colour,
      options: [...colour.options, { id: 'o-green', name: 'Green' }],
    };
    const rebuilt = rebuildVariants([size, wider], existing, makeId, defaultSku);

    expect(rebuilt).toHaveLength(6);
    for (const before of existing) {
      const after = rebuilt.find(
        (v) => optionSignature(v.options) === optionSignature(before.options),
      );
      expect(after).toBeDefined();
      expect(after!.id).toBe(before.id);
      expect(after!.stock).toBe(before.stock);
      expect(after!.sku).toBe(before.sku);
    }
    expect(rebuilt.filter((v) => v.stock === 0)).toHaveLength(2); // the new greens
  });

  it('drops the rows whose options no longer exist', () => {
    const existing = rebuildVariants([size, colour], [], makeId, defaultSku);
    const narrowed: VariantType = { ...colour, options: [colour.options[0]] };
    const rebuilt = rebuildVariants([size, narrowed], existing, makeId, defaultSku);
    expect(rebuilt).toHaveLength(2);
    expect(rebuilt.every((v) => v.options['vt-colour'] === 'o-red')).toBe(true);
  });

  it('keeps a carried variant’s price and cost', () => {
    const existing = rebuildVariants([size], [], makeId, defaultSku).map((v) => ({
      ...v,
      price: 12,
      cost: 5,
    }));
    const rebuilt = rebuildVariants([size], existing, makeId, defaultSku);
    expect(rebuilt.every((v) => v.price === 12 && v.cost === 5)).toBe(true);
  });
});
