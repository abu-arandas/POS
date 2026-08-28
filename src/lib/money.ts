/**
 * Clamp a numeric input to a safe, non-negative, finite value before it feeds a
 * monetary total. A negative, NaN, or Infinite price or quantity must never
 * reduce a total — a crafted negative quantity could otherwise produce a
 * negative (i.e. refundable / payable-out) order total. Anything that is not a
 * positive finite number becomes 0.
 */
export function nonNegative(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}
