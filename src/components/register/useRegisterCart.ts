import { useCallback, useMemo, useState } from 'react';
import type { Product, ProductVariant, StoreSettings } from '../../types';
import { calculateOrderTotals } from '../../lib/pricing';
import {
  availableStock,
  lineKey,
  variantCost,
  variantLabel,
  variantPrice,
} from '../../lib/variants';

export type RegisterDiscountType = 'none' | 'percentage' | 'fixed' | 'loyalty';

export interface RegisterCartLine {
  product: Product;
  /** The chosen variant, on a product that sells through variants. */
  variant?: ProductVariant;
  quantity: number;
}

export interface RegisterCartItem {
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  price: number;
  cost: number;
  quantity: number;
}

/**
 * What a cart line is addressed by: the product for a plain item, the product
 * and the variant together for a varianted one. Two sizes of the same shirt are
 * two lines, and everything that edits the cart names one of them.
 */
export function cartLineKey(line: Pick<RegisterCartLine, 'product' | 'variant'>): string {
  return lineKey(line.product.id, line.variant?.id);
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
  addToCart(product: Product, variant?: ProductVariant): void;
  updateCartQty(key: string, delta: number): void;
  removeFromCart(key: string): void;
  clearCart(): void;
}

/**
 * Owns the register's cart: its lines, the linked customer, the discount in
 * force, and the totals derived from them. Kept out of Register itself so
 * the pricing rules can be exercised without rendering the screen.
 */
export function useRegisterCart(settings: StoreSettings): RegisterCartResult {
  const [cart, setCart] = useState<RegisterCartLine[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<RegisterDiscountType>('none');
  const [discountInput, setDiscountInput] = useState('');
  const [loyaltyPointsToUse, setLoyaltyPointsToUse] = useState(0);
  const [showPromoInput, setShowPromoInput] = useState(false);

  const cartItems = useMemo<RegisterCartItem[]>(
    () =>
      cart.map(({ product, variant, quantity }) => ({
        productId: product.id,
        productName: product.name,
        variantId: variant?.id,
        // Resolved now, not at checkout: the variant's name has to be what the
        // operator saw on the screen when they rang it up, even if the catalogue
        // is edited (or synced over) while the sale is still open.
        variantName: variant ? variantLabel(product, variant) || undefined : undefined,
        price: variantPrice(product, variant),
        cost: variantCost(product, variant),
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

  const addToCart = useCallback((product: Product, variant?: ProductVariant) => {
    // Stock is read for the line being added, not for the product as a whole: a
    // shirt with forty smalls and no larges has plenty of stock and still
    // cannot sell a large.
    const stock = availableStock(product, variant?.id);
    if (stock <= 0) return;
    const key = lineKey(product.id, variant?.id);
    setCart((previous) => {
      const existingIndex = previous.findIndex((item) => cartLineKey(item) === key);
      if (existingIndex >= 0) {
        const existing = previous[existingIndex];
        if (existing.quantity >= stock) return previous;
        const next = [...previous];
        next[existingIndex] = { ...existing, quantity: existing.quantity + 1 };
        return next;
      }
      return [...previous, { product, variant, quantity: 1 }];
    });
  }, []);

  const updateCartQty = useCallback((key: string, delta: number) => {
    setCart((previous) =>
      previous
        .map((item) => {
          if (cartLineKey(item) !== key) return item;
          const quantity = item.quantity + delta;
          if (quantity <= 0) return null;
          if (quantity > availableStock(item.product, item.variant?.id)) return item;
          return { ...item, quantity };
        })
        .filter((item): item is RegisterCartLine => item !== null),
    );
  }, []);

  const removeFromCart = useCallback(
    (key: string) => setCart((previous) => previous.filter((item) => cartLineKey(item) !== key)),
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
