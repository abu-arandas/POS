import { StoreSettings } from '../types';
import { nonNegative } from './money';

/**
 * One cart line as the totals calculation sees it.
 */
export interface CheckoutItem {
  productId: string;
  productName: string;
  price: number;
  cost: number;
  quantity: number;
}

const finiteNonNegative = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

/**
 * Computes subtotal, discount, tax and total for a cart.
 *
 * Every input is clamped: negative or non-finite prices, quantities and rates
 * are treated as zero, and a discount can never exceed the order value. A
 * mistyped '150%' therefore cannot produce a negative total.
 */
export function calculateOrderTotals(
  items: CheckoutItem[],
  discountType: 'none' | 'percentage' | 'fixed' | 'loyalty',
  discountValue: number,
  settings: Pick<StoreSettings, 'taxRate' | 'loyaltyPointValue'>,
) {
  // Clamp price and quantity per line so a negative or non-finite value can
  // never subtract from the subtotal (which would yield a negative total).
  const subtotal = Number(
    items.reduce((sum, i) => sum + nonNegative(i.price) * nonNegative(i.quantity), 0).toFixed(2),
  );
  const safeDiscountValue = finiteNonNegative(discountValue);
  const safeTaxRate = finiteNonNegative(settings.taxRate);
  const safeLoyaltyPointValue = finiteNonNegative(settings.loyaltyPointValue);

  // Every discount is clamped so the recorded discount can never exceed the
  // order value (and a typo like "150%" can never make the order negative).
  let discountAmount = 0;
  if (discountType === 'percentage') {
    const pct = Math.min(100, safeDiscountValue);
    discountAmount = Number(((subtotal * pct) / 100).toFixed(2));
  } else if (discountType === 'fixed') {
    discountAmount = Math.min(safeDiscountValue, subtotal);
  } else if (discountType === 'loyalty') {
    discountAmount = Math.min(
      Number((safeDiscountValue * safeLoyaltyPointValue).toFixed(2)),
      subtotal,
    );
  }

  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = Number((taxableAmount * (safeTaxRate / 100)).toFixed(2));
  const totalAmount = Number((taxableAmount + taxAmount).toFixed(2));

  return { subtotal, discountAmount, taxableAmount, taxAmount, totalAmount };
}
