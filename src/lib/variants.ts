import type { Product, ProductVariant, VariantType, OrderItem, RefundedItem } from '../types';
import { nonNegative } from './utils/validation';

/**
 * A product's sellable units live in one of two places: on the product itself,
 * or split across its variants. Everything that has to work either way goes
 * through this module, so the rest of the app can keep asking "what does this
 * line cost, and how many are there" without branching on it.
 *
 * The rule that keeps the other twenty-odd call sites honest: for a product
 * with variants, `product.stock` is the SUM of its variants' stock, maintained
 * here on every write. Low-stock alerts, the inventory table, dashboards,
 * purchase orders and the cloud row keep reading the single number they always
 * read, and it keeps being true.
 */

/** Separates the two halves of a composite cart/refund line key. */
const KEY_SEPARATOR = '::';

/** Variants a single product may carry. A guard against a combinatorial form. */
export const MAX_VARIANTS_PER_PRODUCT = 200;

/** Whether this product sells through variants rather than as a single unit. */
export function hasVariants(product: Pick<Product, 'variants'>): boolean {
  return (product.variants?.length ?? 0) > 0;
}

/** The variant with this id, or undefined — including for a plain product. */
export function findVariant(
  product: Pick<Product, 'variants'>,
  variantId: string | null | undefined,
): ProductVariant | undefined {
  if (!variantId) return undefined;
  return product.variants?.find((variant) => variant.id === variantId);
}

/**
 * The identity of a cart line, a sold line, and a returned line.
 *
 * Two lines of the same product in different sizes are different things to
 * merge, to price, to decrement and to refund, so `productId` alone stopped
 * being an identity the moment variants existed. Plain products keep their bare
 * product id as the key, which is what lets pre-variant transactions,
 * refundedItems rows and held orders keep working untouched.
 */
export function lineKey(productId: string, variantId?: string | null): string {
  return variantId ? `${productId}${KEY_SEPARATOR}${variantId}` : productId;
}

/** Splits a composite key back into its parts. */
export function parseLineKey(key: string): { productId: string; variantId?: string } {
  const at = key.indexOf(KEY_SEPARATOR);
  if (at < 0) return { productId: key };
  return {
    productId: key.slice(0, at),
    variantId: key.slice(at + KEY_SEPARATOR.length),
  };
}

/** The line key of a sold line. */
export function orderItemKey(item: Pick<OrderItem, 'productId' | 'variantId'>): string {
  return lineKey(item.productId, item.variantId);
}

/** The line key of a returned line. */
export function refundedItemKey(item: Pick<RefundedItem, 'productId' | 'variantId'>): string {
  return lineKey(item.productId, item.variantId);
}

/**
 * The human name of a variant — "Large / Oat" — built from its option names in
 * the product's own type order, so two variants never read the same way round
 * differently.
 *
 * An option the product no longer defines is dropped rather than rendered as a
 * raw id: a receipt saying "Large / opt-7f3a" is worse than one saying "Large".
 */
export function variantLabel(
  product: Pick<Product, 'variantTypes'>,
  variant: Pick<ProductVariant, 'options'>,
): string {
  const names: string[] = [];
  for (const type of product.variantTypes ?? []) {
    const optionId = variant.options[type.id];
    const option = type.options.find((candidate) => candidate.id === optionId);
    if (option) names.push(option.name);
  }
  return names.join(' / ');
}

/** The label for a variant id, or '' when the product has no such variant. */
export function variantLabelById(
  product: Pick<Product, 'variantTypes' | 'variants'>,
  variantId: string | null | undefined,
): string {
  const variant = findVariant(product, variantId);
  return variant ? variantLabel(product, variant) : '';
}

/**
 * What a line sells for. A variant price of 0 is a real price (a free size
 * upgrade, a sample), so the fallback is on `undefined`, never on falsiness.
 */
export function variantPrice(
  product: Pick<Product, 'price'>,
  variant?: Pick<ProductVariant, 'price'>,
): number {
  return variant?.price ?? product.price;
}

/** What a line cost to buy, same fallback rule as the price. */
export function variantCost(
  product: Pick<Product, 'cost'>,
  variant?: Pick<ProductVariant, 'cost'>,
): number {
  return variant?.cost ?? product.cost;
}

/** The variant's own image, falling back to the product's. */
export function variantImage(
  product: Pick<Product, 'image'>,
  variant?: Pick<ProductVariant, 'image'>,
): string {
  return variant?.image || product.image;
}

/** The variant's own SKU, falling back to the product's. */
export function variantSku(
  product: Pick<Product, 'sku'>,
  variant?: Pick<ProductVariant, 'sku'>,
): string {
  return variant?.sku || product.sku;
}

/**
 * Units on hand for a product, counted from its variants where it has them.
 *
 * Negative and non-finite variant stock is floored at 0 rather than summed as
 * written: one corrupt row must not make a whole product look understocked, and
 * NaN anywhere in the sum poisons every comparison downstream of it.
 */
export function totalVariantStock(product: Pick<Product, 'variants' | 'stock'>): number {
  if (!product.variants || product.variants.length === 0) return product.stock;
  return product.variants.reduce((sum, variant) => sum + Math.floor(nonNegative(variant.stock)), 0);
}

/**
 * The product with its `stock` trued up to the sum of its variants. Every write
 * that touches variant stock ends here, which is the whole reason the rest of
 * the app can keep treating `product.stock` as the answer.
 */
export function withDerivedStock<T extends Product>(product: T): T {
  if (!hasVariants(product)) return product;
  const derived = totalVariantStock(product);
  return derived === product.stock ? product : { ...product, stock: derived };
}

/**
 * Sellable units for one line: the variant's own stock when a variant is named,
 * the product's otherwise.
 *
 * A named variant the product does not have returns 0 — not the product's
 * stock. Falling back would let a sale for a deleted variant draw on the pooled
 * total of the ones that remain.
 */
export function availableStock(
  product: Pick<Product, 'variants' | 'stock'>,
  variantId?: string | null,
): number {
  if (!variantId) return product.stock;
  const variant = findVariant(product, variantId);
  return variant ? Math.floor(nonNegative(variant.stock)) : 0;
}

/**
 * The product after `delta` units moved on one line. Returns null when the line
 * names a variant the product does not have — the caller has to refuse the
 * movement rather than apply it somewhere arbitrary.
 *
 * Stock is allowed to land wherever the arithmetic puts it, negatives included;
 * refusing to go below zero is the caller's policy (adjustStock has one,
 * commitSale has another) and belongs where the reason for it lives.
 */
export function applyStockDelta<T extends Product>(
  product: T,
  variantId: string | null | undefined,
  delta: number,
): T | null {
  if (!variantId) return { ...product, stock: product.stock + delta };
  const variants = product.variants ?? [];
  const index = variants.findIndex((variant) => variant.id === variantId);
  if (index < 0) return null;
  const next = [...variants];
  next[index] = { ...next[index], stock: next[index].stock + delta };
  return withDerivedStock({ ...product, variants: next });
}

/**
 * Every combination across the given types, as option-id maps.
 *
 * Ordered with the LAST type varying fastest, which is how a size-by-colour
 * grid reads on paper: Small/Red, Small/Blue, Large/Red, Large/Blue. A type
 * with no options contributes nothing — three sizes and a colour axis still
 * being filled in is three variants, not zero.
 */
export function variantCombinations(types: VariantType[]): Array<Record<string, string>> {
  const usable = types.filter((type) => type.options.length > 0);
  if (usable.length === 0) return [];
  let combinations: Array<Record<string, string>> = [{}];
  for (const type of usable) {
    const next: Array<Record<string, string>> = [];
    for (const partial of combinations) {
      for (const option of type.options) {
        next.push({ ...partial, [type.id]: option.id });
      }
    }
    combinations = next;
    if (combinations.length > MAX_VARIANTS_PER_PRODUCT) {
      return combinations.slice(0, MAX_VARIANTS_PER_PRODUCT);
    }
  }
  return combinations;
}

/**
 * A stable string for one combination of options, used to recognise a variant
 * across a regeneration of the matrix. Sorted by type id so the same
 * combination signs the same way whatever order it was assembled in.
 */
export function optionSignature(options: Record<string, string>): string {
  return Object.keys(options)
    .sort()
    .map((typeId) => `${typeId}=${options[typeId]}`)
    .join('|');
}

/**
 * Rebuilds a product's variant matrix for a new set of types, carrying over the
 * SKU, price, cost, image and — above all — the STOCK of every combination that
 * still exists.
 *
 * Regeneration happens whenever an option is added or removed in the product
 * form, which in a shop is routine (a new colour lands, a size is discontinued).
 * Rebuilding from scratch each time would zero the counted stock of every
 * surviving combination, so matching by option signature is not an optimisation
 * here; it is the difference between an edit and an inventory loss.
 */
export function rebuildVariants(
  types: VariantType[],
  existing: ProductVariant[],
  makeId: () => string,
  defaultSku: (options: Record<string, string>, index: number) => string,
): ProductVariant[] {
  const bySignature = new Map(
    existing.map((variant) => [optionSignature(variant.options), variant] as const),
  );
  return variantCombinations(types).map((options, index) => {
    const carried = bySignature.get(optionSignature(options));
    if (carried) return { ...carried, options };
    return { id: makeId(), options, sku: defaultSku(options, index), stock: 0 };
  });
}
