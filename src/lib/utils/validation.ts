/**
 * Clamp a numeric input to a safe, non-negative, finite value before it feeds a
 * monetary total. Anything that is not a positive finite number becomes 0.
 */
export function nonNegative(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Returns whether a line-item quantity is a positive safe integer. Inventory
 * adjustments are a separate domain and may legitimately use negative deltas.
 */
export function isPositiveIntegerQuantity(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
