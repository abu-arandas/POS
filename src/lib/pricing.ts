import { StoreSettings } from '../types';

export interface CheckoutItem {
  productId: string;
  productName: string;
  price: number;
  cost: number;
  quantity: number;
}

export function calculateOrderTotals(
  items: CheckoutItem[],
  discountType: 'none' | 'percentage' | 'fixed' | 'loyalty',
  discountValue: number,
  settings: Pick<StoreSettings, 'taxRate' | 'loyaltyPointValue'>,
) {
  const subtotal = Number(items.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2));

  // Every discount is clamped so the recorded discount can never exceed the
  // order value (and a typo like "150%" can never go negative).
  let discountAmount = 0;
  if (discountType === 'percentage') {
    const pct = Math.min(100, Math.max(0, discountValue));
    discountAmount = Number(((subtotal * pct) / 100).toFixed(2));
  } else if (discountType === 'fixed') {
    discountAmount = Math.min(Math.max(0, discountValue), subtotal);
  } else if (discountType === 'loyalty') {
    discountAmount = Math.min(
      Number((discountValue * settings.loyaltyPointValue).toFixed(2)),
      subtotal,
    );
  }

  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = Number((taxableAmount * (settings.taxRate / 100)).toFixed(2));
  const totalAmount = Number((taxableAmount + taxAmount).toFixed(2));

  return { subtotal, discountAmount, taxableAmount, taxAmount, totalAmount };
}
