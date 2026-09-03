import { useCallback, useMemo, useState } from 'react';
import type { Product, StoreSettings } from '../../types';
import { calculateOrderTotals } from '../../lib/pricing';

export type RegisterDiscountType = 'none' | 'percentage' | 'fixed' | 'loyalty';

export interface RegisterCartLine {
  product: Product;
  quantity: number;
}

export interface RegisterCartItem {
  productId: string;
  productName: string;
  price: number;
  cost: number;
  quantity: number;
}

export interface RegisterCartResult {
  cart: RegisterCartLine[];
  setCart: React.Dispatch<React.SetStateAction<RegisterCartLine[]>>;
  selectedCustomerId: string | null;
  setSelectedCustomerId: React.Dispatch<React.SetStateAction<string | null>>;
  discountType: RegisterDiscountType;
  setDiscountType: React.Dispatch<React.SetStateAction<RegisterDiscountType>>;
  discountInput: string;
  setDiscountInput: React.Dispatch<React.SetStateAction<string>>;
  loyaltyPointsToUse: number;
  setLoyaltyPointsToUse: React.Dispatch<React.SetStateAction<number>>;
  showPromoInput: boolean;
  setShowPromoInput: React.Dispatch<React.SetStateAction<boolean>>;
  cartItems: RegisterCartItem[];
  discountValue: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  cashSuggestions: number[];
  cashChangeDue(cashPaidText: string): number;
  addToCart(product: Product): void;
  updateCartQty(productId: string, delta: number): void;
  removeFromCart(productId: string): void;
  clearCart(): void;
}

export function useRegisterCart(settings: StoreSettings): RegisterCartResult {
  const [cart, setCart] = useState<RegisterCartLine[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<RegisterDiscountType>('none');
  const [discountInput, setDiscountInput] = useState('');
  const [loyaltyPointsToUse, setLoyaltyPointsToUse] = useState(0);
  const [showPromoInput, setShowPromoInput] = useState(false);

  const cartItems = useMemo<RegisterCartItem[]>(
    () =>
      cart.map(({ product, quantity }) => ({
        productId: product.id,
        productName: product.name,
        price: product.price,
        cost: product.cost,
        quantity,
      })),
    [cart],
  );

  const discountValue =
    discountType === 'loyalty' ? loyaltyPointsToUse : parseFloat(discountInput) || 0;
  const { subtotal, discountAmount, taxAmount, totalAmount } = useMemo(
    () => calculateOrderTotals(cartItems, discountType, discountValue, settings),
    [cartItems, discountType, discountValue, settings],
  );

  const cashSuggestions = useMemo(() => {
    if (totalAmount <= 0) return [];
    const exact = totalAmount;
    const next5 = Math.ceil(exact / 5) * 5;
    const next10 = Math.ceil(exact / 10) * 10;
    const next20 = Math.ceil(exact / 20) * 20;
    const next50 = Math.ceil(exact / 50) * 50;
    const options = new Set<number>([Number(exact.toFixed(2))]);
    if (next5 > exact) options.add(next5);
    if (next10 > exact && next10 !== next5) options.add(next10);
    if (next20 > exact && next20 !== next10) options.add(next20);
    if (next50 > exact && next50 !== next20) options.add(next50);
    options.add(100);
    return Array.from(options)
      .filter((option) => option >= exact)
      .slice(0, 5);
  }, [totalAmount]);

  const cashChangeDue = useCallback(
    (cashPaidText: string) => {
      const paid = parseFloat(cashPaidText) || 0;
      if (paid < totalAmount) return 0;
      return Number((paid - totalAmount).toFixed(2));
    },
    [totalAmount],
  );

  const addToCart = useCallback((product: Product) => {
    if (product.stock <= 0) return;
    setCart((previous) => {
      const existingIndex = previous.findIndex((item) => item.product.id === product.id);
      if (existingIndex >= 0) {
        const existing = previous[existingIndex];
        if (existing.quantity >= product.stock) return previous;
        const next = [...previous];
        next[existingIndex] = { ...existing, quantity: existing.quantity + 1 };
        return next;
      }
      return [...previous, { product, quantity: 1 }];
    });
  }, []);

  const updateCartQty = useCallback((productId: string, delta: number) => {
    setCart((previous) =>
      previous
        .map((item) => {
          if (item.product.id !== productId) return item;
          const quantity = item.quantity + delta;
          if (quantity <= 0) return null;
          if (quantity > item.product.stock) return item;
          return { ...item, quantity };
        })
        .filter((item): item is RegisterCartLine => item !== null),
    );
  }, []);

  const removeFromCart = useCallback(
    (productId: string) =>
      setCart((previous) => previous.filter((item) => item.product.id !== productId)),
    [],
  );

  const clearCart = useCallback(() => {
    setCart([]);
    setSelectedCustomerId(null);
    setDiscountType('none');
    setDiscountInput('');
    setLoyaltyPointsToUse(0);
    setShowPromoInput(false);
  }, []);

  return {
    cart,
    setCart,
    selectedCustomerId,
    setSelectedCustomerId,
    discountType,
    setDiscountType,
    discountInput,
    setDiscountInput,
    loyaltyPointsToUse,
    setLoyaltyPointsToUse,
    showPromoInput,
    setShowPromoInput,
    cartItems,
    discountValue,
    subtotal,
    discountAmount,
    taxAmount,
    totalAmount,
    cashSuggestions,
    cashChangeDue,
    addToCart,
    updateCartQty,
    removeFromCart,
    clearCart,
  };
}
