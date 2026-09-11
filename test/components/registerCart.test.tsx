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

const tee: Product = {
  id: 'p-2',
  name: 'Tee',
  price: 20,
  cost: 8,
  category: 'cat-1',
  sku: 'TEE',
  stock: 3,
  minStock: 1,
  image: '',
  variantTypes: [
    {
      id: 'vt-size',
      name: 'Size',
      options: [
        { id: 'o-s', name: 'Small' },
        { id: 'o-l', name: 'Large' },
      ],
    },
  ],
  variants: [
    { id: 'v-s', options: { 'vt-size': 'o-s' }, sku: 'TEE-S', stock: 2 },
    { id: 'v-l', options: { 'vt-size': 'o-l' }, sku: 'TEE-L', price: 25, stock: 1 },
  ],
};

const small = tee.variants![0];
const large = tee.variants![1];

describe('useRegisterCart with variants', () => {
  it('keeps two variants of one product as two lines', () => {
    const { result } = renderHook(() => useRegisterCart(DEFAULT_SETTINGS));

    act(() => {
      result.current.addToCart(tee, small);
      result.current.addToCart(tee, large);
    });

    expect(result.current.cart).toHaveLength(2);
    expect(result.current.cartItems.map((i) => i.variantId)).toEqual(['v-s', 'v-l']);
  });

  it('prices and names each line from its own variant', () => {
    const { result } = renderHook(() => useRegisterCart(DEFAULT_SETTINGS));

    act(() => {
      result.current.addToCart(tee, small);
      result.current.addToCart(tee, large);
    });

    // Small inherits the product's price; Large sets its own.
    expect(result.current.cartItems).toEqual([
      {
        productId: 'p-2',
        productName: 'Tee',
        variantId: 'v-s',
        variantName: 'Small',
        price: 20,
        cost: 8,
        quantity: 1,
      },
      {
        productId: 'p-2',
        productName: 'Tee',
        variantId: 'v-l',
        variantName: 'Large',
        price: 25,
        cost: 8,
        quantity: 1,
      },
    ]);
    expect(result.current.subtotal).toBe(45);
  });

  it('caps each line at its own variant’s stock, not the product’s', () => {
    const { result } = renderHook(() => useRegisterCart(DEFAULT_SETTINGS));

    act(() => {
      // Only one Large exists, though the product holds three units.
      result.current.addToCart(tee, large);
      result.current.addToCart(tee, large);
      result.current.addToCart(tee, large);
    });

    expect(result.current.cart).toHaveLength(1);
    expect(result.current.cart[0].quantity).toBe(1);

    act(() => result.current.updateCartQty('p-2::v-l', 1));
    expect(result.current.cart[0].quantity).toBe(1);
  });

  it('refuses a variant with nothing left while the product still has stock', () => {
    const { result } = renderHook(() => useRegisterCart(DEFAULT_SETTINGS));
    const soldOut = { ...large, id: 'v-gone', stock: 0 };

    act(() => result.current.addToCart({ ...tee, variants: [small, soldOut] }, soldOut));

    expect(result.current.cart).toEqual([]);
  });

  it('edits and removes the named line, leaving the other variant alone', () => {
    const { result } = renderHook(() => useRegisterCart(DEFAULT_SETTINGS));

    act(() => {
      result.current.addToCart(tee, small);
      result.current.addToCart(tee, small);
      result.current.addToCart(tee, large);
    });

    act(() => result.current.updateCartQty('p-2::v-s', -1));
    expect(result.current.cart.map((line) => line.quantity)).toEqual([1, 1]);

    act(() => result.current.removeFromCart('p-2::v-l'));
    expect(result.current.cart).toHaveLength(1);
    expect(result.current.cart[0].variant?.id).toBe('v-s');
  });

  it('still addresses a plain product by its bare id', () => {
    const { result } = renderHook(() => useRegisterCart(DEFAULT_SETTINGS));

    act(() => result.current.addToCart(product));
    act(() => result.current.updateCartQty('p-1', 1));
    expect(result.current.cart[0].quantity).toBe(2);

    act(() => result.current.removeFromCart('p-1'));
    expect(result.current.cart).toEqual([]);
  });
});
