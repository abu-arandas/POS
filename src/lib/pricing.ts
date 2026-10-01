import { StoreSettings } from '../types';
import { CurrencySource, currencyDigits, roundMoney } from './money';
import { nonNegative } from './utils/validation';

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
  settings: Pick<StoreSettings, 'taxRate' | 'loyaltyPointValue'> & CurrencySource,
) {
  // Every figure below rounds to the store currency's own precision — three
  // digits for the dinar, none for the yen — not a fixed two.
  const digits = currencyDigits(settings);
  const round = (n: number) => roundMoney(n, digits);

  // Clamp price and quantity per line so a negative or non-finite value can
  // never subtract from the subtotal (which would yield a negative total).
  const subtotal = round(
    items.reduce((sum, i) => sum + nonNegative(i.price) * nonNegative(i.quantity), 0),
  );
  const safeDiscountValue = nonNegative(discountValue);
  const safeTaxRate = nonNegative(settings.taxRate);
  const safeLoyaltyPointValue = nonNegative(settings.loyaltyPointValue);

  // Every discount is clamped so the recorded discount can never exceed the
  // order value (and a typo like "150%" can never make the order negative).
  let discountAmount = 0;
  if (discountType === 'percentage') {
    const pct = Math.min(100, safeDiscountValue);
    discountAmount = round((subtotal * pct) / 100);
  } else if (discountType === 'fixed') {
    // Rounded like the other two. An operator can type 1.234 into the discount
    // box, and an unrounded discount leaves `subtotal - discount` disagreeing
    // with the unit-rounded taxable amount the tax and total are derived from —
    // so the persisted transaction contradicts its own arithmetic.
    discountAmount = round(Math.min(safeDiscountValue, subtotal));
  } else if (discountType === 'loyalty') {
    discountAmount = Math.min(round(safeDiscountValue * safeLoyaltyPointValue), subtotal);
  }

  const taxableAmount = round(Math.max(0, subtotal - discountAmount));
  const taxAmount = round(taxableAmount * (safeTaxRate / 100));
  const totalAmount = round(taxableAmount + taxAmount);

  return { subtotal, discountAmount, taxableAmount, taxAmount, totalAmount };
}
