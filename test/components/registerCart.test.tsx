import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/stores/settingsStore';
import { useRegisterCart } from '../../src/components/register/useRegisterCart';
import type { Product } from '../../src/types';

const product: Product = {
  id: 'p-1',
  name: 'Coffee',
  price: 10,
  cost: 4,
  category: 'cat-1',
  sku: 'COF-1',
  stock: 3,
  minStock: 1,
  image: '',
};

describe('useRegisterCart', () => {
  it('adds, increments, caps, and removes cart lines using live stock limits', () => {
    const { result } = renderHook(() => useRegisterCart(DEFAULT_SETTINGS));

    act(() => {
      result.current.addToCart(product);
      result.current.addToCart(product);
      result.current.addToCart(product);
      result.current.addToCart(product);
    });

    expect(result.current.cart).toHaveLength(1);
    expect(result.current.cart[0].quantity).toBe(3);

    act(() => result.current.updateCartQty(product.id, 1));
    expect(result.current.cart[0].quantity).toBe(3);

    act(() => result.current.removeFromCart(product.id));
    expect(result.current.cart).toEqual([]);
  });

  it('derives totals and cash change from the cart state', () => {
    const { result } = renderHook(() => useRegisterCart(DEFAULT_SETTINGS));

    act(() => result.current.addToCart(product));
    expect(result.current.cartItems).toEqual([
      {
        productId: product.id,
        productName: product.name,
        price: product.price,
        cost: product.cost,
        quantity: 1,
      },
    ]);
    expect(result.current.subtotal).toBe(10);
    expect(result.current.totalAmount).toBe(10.85);
    expect(result.current.cashChangeDue('12')).toBe(1.15);
    expect(result.current.cashChangeDue('9')).toBe(0);

    act(() => {
      result.current.setDiscountType('fixed');
      result.current.setDiscountInput('2');
    });
    expect(result.current.discountValue).toBe(2);
    expect(result.current.discountAmount).toBe(2);
    expect(result.current.totalAmount).toBe(8.68);
  });

  it('clears cart, customer, and discount state together', () => {
    const { result } = renderHook(() => useRegisterCart(DEFAULT_SETTINGS));

    act(() => {
      result.current.addToCart(product);
      result.current.setSelectedCustomerId('customer-1');
      result.current.setDiscountType('percentage');
      result.current.setDiscountInput('10');
      result.current.setLoyaltyPointsToUse(5);
      result.current.setShowPromoInput(true);
    });
    act(() => result.current.clearCart());

    expect(result.current.cart).toEqual([]);
    expect(result.current.selectedCustomerId).toBeNull();
    expect(result.current.discountType).toBe('none');
    expect(result.current.discountInput).toBe('');
    expect(result.current.loyaltyPointsToUse).toBe(0);
    expect(result.current.showPromoInput).toBe(false);
  });
});
