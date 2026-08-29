/**
 * Returns whether a quantity is safe to persist in a sale or purchase order.
 *
 * Inventory adjustments are a separate domain and may legitimately use negative
 * deltas. This predicate is intentionally scoped to line-item quantities, where
 * zero, negative, fractional, non-finite, and unsafe integers are invalid.
 */
export function isPositiveIntegerQuantity(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
