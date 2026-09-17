import type { Product } from '../types';

/**
 * Ranked product search for the register's search box.
 *
 * The grid used to filter with a bare `includes()` and render whatever survived
 * in catalogue order. That is fine for a demo menu and wrong at a counter: a
 * shop with "Latte", "Iced Latte", "Latte Macchiato" and "Chocolate Latte Cake"
 * showed them in whatever order they happened to be added, so typing the exact
 * name of the thing being ordered still meant reading four tiles and picking
 * one. Ranking puts the likeliest match first, which is what makes
 * Enter-to-add-the-top-result safe to offer.
 *
 * Pure, so the ordering can be tested without rendering a grid — the same split
 * the rest of lib/ keeps.
 */

/**
 * How well a product matched, highest first.
 *
 * The order encodes what an operator is most likely to have meant. An exact SKU
 * beats everything because a SKU is typed or scanned to name one specific
 * thing; a prefix beats a mid-word hit because people type the beginnings of
 * words; and a word-boundary hit beats a mid-word one so "milk" finds "Oat
 * Milk" before "Buttermilk Scone".
 */
const enum Rank {
  None = 0,
  SkuContains = 1,
  NameContains = 2,
  WordPrefix = 3,
  NamePrefix = 4,
  NameExact = 5,
  SkuExact = 6,
}

/** Every SKU a product can be found by: its own, plus each variant's. */
function skusOf(product: Product): string[] {
  const skus = [product.sku];
  for (const variant of product.variants ?? []) skus.push(variant.sku);
  return skus;
}

/**
 * How well one product matches a lowercased, trimmed query.
 *
 * Returns the BEST rank the product achieves on any of its fields, so a product
 * whose variant SKU matches exactly is not demoted because its name happens to
 * also contain the query somewhere.
 */
export function rankProduct(product: Product, query: string): number {
  if (!query) return Rank.None;
  const name = product.name.toLowerCase();

  for (const sku of skusOf(product)) {
    if (sku.toLowerCase() === query) return Rank.SkuExact;
  }
  if (name === query) return Rank.NameExact;
  if (name.startsWith(query)) return Rank.NamePrefix;
  // A word boundary rather than a bare indexOf: "milk" should reach "Oat Milk"
  // before "Buttermilk Scone", and only this distinguishes them.
  if (name.split(/[\s/-]+/).some((word) => word.startsWith(query))) return Rank.WordPrefix;
  if (name.includes(query)) return Rank.NameContains;
  for (const sku of skusOf(product)) {
    if (sku.toLowerCase().includes(query)) return Rank.SkuContains;
  }
  return Rank.None;
}

/**
 * The products to show for a query and a category, best match first.
 *
 * An empty query keeps the operator's own catalogue order — that arrangement is
 * deliberate (the grid is drag-reorderable) and a shop lays out its tiles the
 * way its counter works, so nothing should shuffle them until there is a query
 * to rank by.
 *
 * Ties keep catalogue order too, since `sort` is stable: two products that
 * match equally well appear in the order the shop arranged them.
 */
export function searchProducts(
  products: Product[],
  query: string,
  selectedCategory: string,
): Product[] {
  const inCategory =
    selectedCategory === 'all'
      ? products
      : products.filter((product) => product.category === selectedCategory);

  const needle = query.trim().toLowerCase();
  if (!needle) return inCategory;

  const ranked: Array<{ product: Product; rank: number }> = [];
  for (const product of inCategory) {
    const rank = rankProduct(product, needle);
    if (rank !== Rank.None) ranked.push({ product, rank });
  }

  return ranked.sort((a, b) => b.rank - a.rank).map((entry) => entry.product);
}
