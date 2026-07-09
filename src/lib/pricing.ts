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
  settings: Pick<StoreSettings, 'taxRate' | 'loyaltyPointValue'>
) {
  const subtotal = Number(items.reduce((sum, i) => sum + (i.price * i.quantity), 0).toFixed(2));
  
  let discountAmount = 0;
  if (discountType === 'percentage') {
    discountAmount = Number(((subtotal * discountValue) / 100).toFixed(2));
  } else if (discountType === 'fixed') {
    discountAmount = Math.min(discountValue, subtotal);
  } else if (discountType === 'loyalty') {
    discountAmount = Number((discountValue * settings.loyaltyPointValue).toFixed(2));
  }
  
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = Number((taxableAmount * (settings.taxRate / 100)).toFixed(2));
  const totalAmount = Number((taxableAmount + taxAmount).toFixed(2));

  return { subtotal, discountAmount, taxableAmount, taxAmount, totalAmount };
}
