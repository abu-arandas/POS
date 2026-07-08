import React, { useState, useMemo } from 'react';
import { 
  Search, User, Plus, Minus, Trash2, Tag, Percent, 
  CreditCard, DollarSign, Smartphone, Gift, Check, X, Printer, UserPlus, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Category, Customer, StoreSettings, SaleTransaction } from '../types';

interface RegisterProps {
  products: Product[];
  categories: Category[];
  customers: Customer[];
  settings: StoreSettings;
  onCheckout: (
    items: Array<{ productId: string; productName: string; price: number; cost: number; quantity: number }>,
    customerId: string | null,
    discountType: 'none' | 'percentage' | 'fixed' | 'loyalty',
    discountValue: number,
    paymentMethod: 'cash' | 'card' | 'mobile' | 'gift',
    cashPaid?: number,
    cashChange?: number
  ) => SaleTransaction | null;
  onAddCustomer: (name: string, phone: string, email: string) => Customer;
}

export default function Register({ products, categories, customers, settings, onCheckout, onAddCustomer }: RegisterProps) {
  // Navigation & Search State
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Cart State
  const [cart, setCart] = useState<Array<{ product: Product; quantity: number }>>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  
  // Discount State
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'fixed' | 'loyalty'>('none');
  const [discountInput, setDiscountInput] = useState<string>('');
  const [loyaltyPointsToUse, setLoyaltyPointsToUse] = useState<number>(0);
  const [showPromoInput, setShowPromoInput] = useState<boolean>(false);

  // Modals & Popups State
  const [checkoutModalOpen, setCheckoutModalOpen] = useState<boolean>(false);
  const [addCustomerOpen, setAddCustomerOpen] = useState<boolean>(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState<boolean>(false);
  const [activeReceipt, setActiveReceipt] = useState<SaleTransaction | null>(null);

  // Customer Form State
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custEmail, setCustEmail] = useState('');

  // Payment Calculation State
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'mobile' | 'gift'>('card');
  const [cashPaidText, setCashPaidText] = useState<string>('');

  // Filters
  const filteredProducts = useMemo(() => {
    return products.filter(prod => {
      const matchesCategory = selectedCategory === 'all' || prod.category === selectedCategory;
      const matchesSearch = prod.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            prod.sku.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  const activeCustomer = useMemo(() => {
    return customers.find(c => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  // Pricing calculations
  const subtotal = useMemo(() => {
    return Number(cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0).toFixed(2));
  }, [cart]);

  const discountAmount = useMemo(() => {
    if (discountType === 'percentage') {
      const val = parseFloat(discountInput) || 0;
      return Number(((subtotal * val) / 100).toFixed(2));
    }
    if (discountType === 'fixed') {
      const val = parseFloat(discountInput) || 0;
      return Math.min(val, subtotal);
    }
    if (discountType === 'loyalty') {
      return Number((loyaltyPointsToUse * settings.loyaltyPointValue).toFixed(2));
    }
    return 0;
  }, [discountType, discountInput, loyaltyPointsToUse, subtotal, settings.loyaltyPointValue]);

  const taxableAmount = useMemo(() => {
    return Math.max(0, subtotal - discountAmount);
  }, [subtotal, discountAmount]);

  const taxAmount = useMemo(() => {
    return Number((taxableAmount * (settings.taxRate / 100)).toFixed(2));
  }, [taxableAmount, settings.taxRate]);

  const totalAmount = useMemo(() => {
    return Number((taxableAmount + taxAmount).toFixed(2));
  }, [taxableAmount, taxAmount]);

  // Cash suggestions
  const cashSuggestions = useMemo(() => {
    if (totalAmount <= 0) return [];
    const exact = totalAmount;
    const next5 = Math.ceil(exact / 5) * 5;
    const next10 = Math.ceil(exact / 10) * 10;
    const next20 = Math.ceil(exact / 20) * 20;
    const next50 = Math.ceil(exact / 50) * 50;

    const options = new Set<number>();
    options.add(Number(exact.toFixed(2)));
    if (next5 > exact) options.add(next5);
    if (next10 > exact && next10 !== next5) options.add(next10);
    if (next20 > exact && next20 !== next10) options.add(next20);
    if (next50 > exact && next50 !== next20) options.add(next50);
    options.add(100);

    return Array.from(options).filter(o => o >= exact).slice(0, 5);
  }, [totalAmount]);

  const cashChangeDue = useMemo(() => {
    const paid = parseFloat(cashPaidText) || 0;
    if (paid < totalAmount) return 0;
    return Number((paid - totalAmount).toFixed(2));
  }, [cashPaidText, totalAmount]);

  // Cart operations
  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.product.id === product.id);
    const availableStock = product.stock;

    if (availableStock <= 0) return; // Out of stock

    if (existing) {
      if (existing.quantity >= availableStock) {
        // Can't sell more than active stock
        return;
      }
      setCart(cart.map(item => 
        item.product.id === product.id 
          ? { ...item, quantity: item.quantity + 1 } 
          : item
      ));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
  };

  const updateCartQty = (productId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.product.id === productId) {
        const newQty = item.quantity + delta;
        const availableStock = item.product.stock;
        if (newQty <= 0) return null;
        if (newQty > availableStock) return item; // limit to stock
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(Boolean) as Array<{ product: Product; quantity: number }>);
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setSelectedCustomerId(null);
    setDiscountType('none');
    setDiscountInput('');
    setLoyaltyPointsToUse(0);
    setShowPromoInput(false);
  };

  // Customer handles
  const handleAddNewCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) return;
    const newCust = onAddCustomer(custName, custPhone, custEmail);
    setSelectedCustomerId(newCust.id);
    setCustName('');
    setCustPhone('');
    setCustEmail('');
    setAddCustomerOpen(false);
  };

  const applyLoyaltyPoints = () => {
    if (!activeCustomer) return;
    const maxPointsUse = Math.min(activeCustomer.points, Math.ceil(subtotal / settings.loyaltyPointValue));
    setDiscountType('loyalty');
    setLoyaltyPointsToUse(maxPointsUse);
    setShowPromoInput(false);
  };

  const handleApplyPromoCode = () => {
    const val = parseFloat(discountInput);
    if (!isNaN(val) && val > 0) {
      setShowPromoInput(false);
    }
  };

  const handleCheckoutClick = () => {
    if (cart.length === 0) return;
    setPaymentMethod('card');
    setCashPaidText('');
    setCheckoutModalOpen(true);
  };

  const handleCompletePayment = () => {
    const paidValue = paymentMethod === 'cash' ? parseFloat(cashPaidText) || 0 : undefined;
    
    if (paymentMethod === 'cash') {
      if (!paidValue || paidValue < totalAmount) {
        alert('Insufficient cash paid!');
        return;
      }
    }

    const orderItems = cart.map(item => ({
      productId: item.product.id,
      productName: item.product.name,
      price: item.product.price,
      cost: item.product.cost,
      quantity: item.quantity,
      total: Number((item.product.price * item.quantity).toFixed(2))
    }));

    const transaction = onCheckout(
      orderItems,
      selectedCustomerId,
      discountType,
      discountType === 'loyalty' ? loyaltyPointsToUse : (parseFloat(discountInput) || 0),
      paymentMethod,
      paidValue,
      paymentMethod === 'cash' ? cashChangeDue : undefined
    );

    if (transaction) {
      setActiveReceipt(transaction);
      setCheckoutModalOpen(false);
      setReceiptModalOpen(true);
      clearCart();
    }
  };

  return (
    <div id="register-root" className="flex flex-1 h-screen overflow-hidden bg-slate-50">
      
      {/* LEFT COLUMN: Catalog / Product Browse */}
      <div id="catalog-section" className="flex-1 flex flex-col min-w-0 p-6 overflow-hidden">
        
        {/* Header Search & Category pills */}
        <div id="catalog-controls" className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-4 mb-6">
          <div className="flex items-center space-x-3 bg-slate-100 px-3 py-2.5 rounded-xl border border-slate-200/50">
            <Search size={18} className="text-slate-400" />
            <input
              id="product-search-input"
              type="text"
              placeholder="Search products by name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent border-none text-slate-800 text-sm focus:outline-none placeholder-slate-400"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div id="category-pills" className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              id="category-pill-all"
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150 shrink-0 ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              All Products
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                id={`category-pill-${cat.id}`}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150 shrink-0 ${
                  selectedCategory === cat.id
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Products Grid */}
        <div id="products-grid-container" className="flex-1 overflow-y-auto pr-1">
          {filteredProducts.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center">
              <span className="text-4xl">☕</span>
              <p className="mt-2 text-sm text-slate-500 font-medium">No products match your search</p>
            </div>
          ) : (
            <div id="products-grid" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredProducts.map(prod => {
                const isLowStock = prod.stock <= prod.minStock && prod.stock > 0;
                const isOutOfStock = prod.stock === 0;
                const cartQty = cart.find(item => item.product.id === prod.id)?.quantity || 0;
                const isLimitReached = cartQty >= prod.stock;

                return (
                  <motion.div
                    key={prod.id}
                    layoutId={`prod-card-${prod.id}`}
                    id={`prod-card-${prod.id}`}
                    onClick={() => !isOutOfStock && addToCart(prod)}
                    whileTap={{ scale: isOutOfStock ? 1 : 0.97 }}
                    className={`relative bg-white rounded-2xl border transition-all duration-150 cursor-pointer overflow-hidden shadow-sm flex flex-col justify-between ${
                      isOutOfStock
                        ? 'border-slate-200 opacity-60 cursor-not-allowed'
                        : isLimitReached
                        ? 'border-emerald-500 ring-2 ring-emerald-500/10'
                        : 'border-slate-200/80 hover:border-slate-300 hover:shadow-md'
                    }`}
                  >
                    {/* Badge */}
                    <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
                      {isOutOfStock && (
                        <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Out of Stock
                        </span>
                      )}
                      {!isOutOfStock && isLowStock && (
                        <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                          Only {prod.stock} Left
                        </span>
                      )}
                      {cartQty > 0 && (
                        <span className="bg-emerald-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                          {cartQty} in Cart
                        </span>
                      )}
                    </div>

                    {/* Image or emoji placeholder */}
                    <div className="relative aspect-square w-full bg-slate-100 flex items-center justify-center">
                      {prod.image ? (
                        <img
                          src={prod.image}
                          alt={prod.name}
                          className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-3xl">☕</span>
                      )}
                    </div>

                    {/* Details */}
                    <div className="p-3 bg-white flex-1 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-mono font-bold text-slate-400 block uppercase mb-0.5">
                          {categories.find(c => c.id === prod.category)?.name || 'General'}
                        </span>
                        <h3 className="font-sans font-semibold text-slate-800 text-xs sm:text-sm tracking-tight line-clamp-2 h-10 leading-snug">
                          {prod.name}
                        </h3>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          {settings.currency}{prod.price.toFixed(2)}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          SKU: {prod.sku.split('-').pop()}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Interactive Cart & Checkout Panel */}
      <div id="cart-section" className="w-96 bg-white border-l border-slate-200/80 shadow-2xl flex flex-col h-full shrink-0">
        
        {/* Customer Selector Header */}
        <div id="cart-customer-header" className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className={`p-2 rounded-xl shrink-0 ${activeCustomer ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
              <User size={18} />
            </div>
            <div className="overflow-hidden">
              {activeCustomer ? (
                <>
                  <p className="font-sans font-semibold text-slate-800 text-xs sm:text-sm truncate leading-tight">
                    {activeCustomer.name}
                  </p>
                  <p className="text-[10px] font-mono text-emerald-600 flex items-center gap-1 mt-0.5">
                    <span className="font-bold">{activeCustomer.points}</span> loyalty points
                  </p>
                </>
              ) : (
                <>
                  <p className="font-sans font-semibold text-slate-700 text-xs leading-none">Walk-In Customer</p>
                  <p className="text-[10px] font-sans text-slate-400 mt-1">Select a member to award points</p>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-1 shrink-0">
            {activeCustomer ? (
              <button
                onClick={() => { setSelectedCustomerId(null); setDiscountType('none'); }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors"
                title="Remove customer"
              >
                <X size={14} />
              </button>
            ) : (
              <div className="flex items-center gap-1">
                {/* Simple Customer Dropdown */}
                <select
                  id="select-customer-dropdown"
                  value={selectedCustomerId || ''}
                  onChange={(e) => setSelectedCustomerId(e.target.value || null)}
                  className="bg-white border border-slate-200 rounded-lg text-xs font-medium px-2 py-1 text-slate-600 focus:outline-none focus:border-emerald-500 max-w-[100px]"
                >
                  <option value="">Link Customer</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => setAddCustomerOpen(true)}
                  className="p-1 bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 rounded-lg transition-colors"
                  title="Add customer shortcut"
                >
                  <UserPlus size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Cart items list */}
        <div id="cart-items-container" className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-12">
              <span className="text-4xl mb-2">🛒</span>
              <p className="text-xs text-slate-500 font-mono">CART IS EMPTY</p>
              <p className="text-[10px] text-slate-400 mt-1">Click products to register items</p>
            </div>
          ) : (
            cart.map(item => (
              <motion.div
                key={item.product.id}
                layoutId={`cart-item-${item.product.id}`}
                className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-2.5 shadow-sm"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <h4 className="font-sans font-medium text-slate-800 text-xs truncate leading-snug">
                    {item.product.name}
                  </h4>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="font-mono text-[11px] text-slate-500">
                      {settings.currency}{item.product.price.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400">•</span>
                    <span className="font-mono text-[11px] text-slate-400">
                      Total: {settings.currency}{(item.product.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Adjuster controls */}
                <div className="flex items-center space-x-2.5 shrink-0">
                  <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm">
                    <button
                      onClick={() => updateCartQty(item.product.id, -1)}
                      className="p-1 hover:bg-slate-50 text-slate-500 transition-colors rounded-l-lg"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="font-mono text-xs font-bold text-slate-800 px-2.5 min-w-[20px] text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateCartQty(item.product.id, 1)}
                      disabled={item.quantity >= item.product.stock}
                      className="p-1 hover:bg-slate-50 text-slate-500 disabled:opacity-30 transition-colors rounded-r-lg"
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  <button
                    onClick={() => removeFromCart(item.product.id)}
                    className="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg hover:bg-rose-50/50 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Promo & Loyalty Discount Box */}
        <div id="cart-promos-box" className="p-4 border-t border-slate-100 bg-slate-50/60 space-y-2.5">
          {/* Quick Loyalty apply */}
          {activeCustomer && activeCustomer.points > 0 && discountType !== 'loyalty' && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 flex items-center justify-between">
              <div className="flex items-start space-x-2">
                <Info size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                <div className="text-[11px] text-emerald-800">
                  <span className="font-bold">Loyalty Points discount available</span>
                  <p className="text-[10px] text-emerald-600">Apply up to {Math.min(activeCustomer.points, Math.ceil(subtotal / settings.loyaltyPointValue))} points for a {settings.currency}{(Math.min(activeCustomer.points, Math.ceil(subtotal / settings.loyaltyPointValue)) * settings.loyaltyPointValue).toFixed(2)} discount</p>
                </div>
              </div>
              <button
                onClick={applyLoyaltyPoints}
                className="text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg shadow-sm transition-colors shrink-0"
              >
                Apply
              </button>
            </div>
          )}

          {/* Active Discount badge */}
          {discountType !== 'none' && (
            <div className="flex items-center justify-between bg-amber-50 border border-amber-200/50 rounded-xl p-2 px-3 text-xs">
              <span className="text-amber-800 font-medium flex items-center gap-1.5">
                <Tag size={13} />
                Discount Applied: <strong className="font-bold">{discountType === 'percentage' ? `${discountInput}%` : discountType === 'fixed' ? `${settings.currency}${discountInput}` : `${loyaltyPointsToUse} Points`}</strong>
              </span>
              <button
                onClick={() => { setDiscountType('none'); setDiscountInput(''); setLoyaltyPointsToUse(0); }}
                className="text-amber-500 hover:text-amber-700"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Manual Discount Toggle buttons */}
          {discountType === 'none' && (
            <div className="flex items-center gap-2">
              {!showPromoInput ? (
                <>
                  <button
                    onClick={() => { setDiscountType('percentage'); setShowPromoInput(true); }}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-xl py-1.5 text-xs font-semibold transition-colors"
                  >
                    <Percent size={12} /> Add % Discount
                  </button>
                  <button
                    onClick={() => { setDiscountType('fixed'); setShowPromoInput(true); }}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-xl py-1.5 text-xs font-semibold transition-colors"
                  >
                    <DollarSign size={12} /> Fixed Discount
                  </button>
                </>
              ) : (
                <div className="w-full flex items-center space-x-2 bg-white border border-slate-200 rounded-xl p-1 shadow-inner">
                  <input
                    id="discount-input-field"
                    type="number"
                    min="0"
                    placeholder={discountType === 'percentage' ? "Discount % (e.g. 10)" : "Discount Value $ (e.g. 5)"}
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    className="flex-1 text-xs border-none bg-transparent px-2.5 focus:outline-none"
                  />
                  <button
                    onClick={handleApplyPromoCode}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-3 py-1.5 rounded-lg"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => { setDiscountType('none'); setShowPromoInput(false); }}
                    className="p-1.5 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Totals & Checkout Button */}
        <div id="cart-pricing-summary" className="p-4 border-t border-slate-100 bg-slate-50 space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-slate-500 text-xs">
              <span>Subtotal</span>
              <span className="font-mono">{settings.currency}{subtotal.toFixed(2)}</span>
            </div>
            
            {discountAmount > 0 && (
              <div className="flex justify-between text-amber-600 text-xs font-medium">
                <span>Discount</span>
                <span className="font-mono">-{settings.currency}{discountAmount.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-500 text-xs">
              <span>Tax ({settings.taxRate}%)</span>
              <span className="font-mono">{settings.currency}{taxAmount.toFixed(2)}</span>
            </div>

            <div className="flex justify-between text-slate-800 font-bold text-sm pt-1 border-t border-slate-200">
              <span>Total</span>
              <span className="font-mono text-slate-950 text-base">{settings.currency}{totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              id="clear-cart-btn"
              onClick={clearCart}
              disabled={cart.length === 0}
              className="px-3 py-3 border border-slate-200 hover:bg-slate-100 disabled:opacity-40 text-slate-500 hover:text-slate-700 rounded-xl transition-colors shrink-0"
              title="Clear entire cart"
            >
              <Trash2 size={16} />
            </button>
            <button
              id="checkout-trigger-btn"
              onClick={handleCheckoutClick}
              disabled={cart.length === 0}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-sans font-bold text-sm py-3 px-4 rounded-xl flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/10 hover:shadow-emerald-600/20 active:scale-98 transition-all"
            >
              <CreditCard size={16} />
              <span>Charge {settings.currency}{totalAmount.toFixed(2)}</span>
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: Checkout/Payment Dialog */}
      <AnimatePresence>
        {checkoutModalOpen && (
          <div id="payment-modal" className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col border border-slate-200"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="font-sans font-bold text-slate-800 text-base">Select Payment Method</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">Amount to pay: {settings.currency}{totalAmount.toFixed(2)}</p>
                </div>
                <button
                  onClick={() => setCheckoutModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 bg-white border border-slate-200 rounded-lg shadow-sm"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                
                {/* Method selector grid */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { id: 'card', label: 'Card', icon: CreditCard, color: 'text-blue-600 bg-blue-50 border-blue-200 active:bg-blue-100' },
                    { id: 'cash', label: 'Cash', icon: DollarSign, color: 'text-emerald-600 bg-emerald-50 border-emerald-200 active:bg-emerald-100' },
                    { id: 'mobile', label: 'Mobile', icon: Smartphone, color: 'text-purple-600 bg-purple-50 border-purple-200 active:bg-purple-100' },
                    { id: 'gift', label: 'Gift Card', icon: Gift, color: 'text-amber-600 bg-amber-50 border-amber-200 active:bg-amber-100' },
                  ].map(m => {
                    const MIcon = m.icon;
                    const isSel = paymentMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        id={`pay-method-${m.id}`}
                        onClick={() => setPaymentMethod(m.id as any)}
                        className={`flex flex-col items-center justify-center p-4 rounded-2xl border text-center transition-all ${
                          isSel 
                            ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10 ring-2 ring-slate-900/5' 
                            : 'border-slate-200 hover:border-slate-300 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <MIcon size={20} className={isSel ? 'text-emerald-400' : m.color.split(' ')[0]} />
                        <span className="text-xs font-semibold mt-2">{m.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Conditional Cash Handling */}
                {paymentMethod === 'cash' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="space-y-4 pt-4 border-t border-slate-100"
                  >
                    <div>
                      <label className="text-xs font-semibold text-slate-500 block mb-2 font-mono uppercase tracking-wider">
                        Quick Cash Pay
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {cashSuggestions.map(val => (
                          <button
                            key={val}
                            id={`cash-suggest-${val}`}
                            onClick={() => setCashPaidText(val.toFixed(2))}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 px-3.5 py-1.5 rounded-xl font-mono text-xs font-bold transition-all"
                          >
                            {settings.currency}{val.toFixed(2)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-500 block mb-1.5">Cash Tendered ({settings.currency})</label>
                        <div className="flex items-center border border-slate-200 rounded-xl p-1 bg-slate-50 shadow-inner">
                          <span className="font-mono text-slate-400 pl-2 font-bold">{settings.currency}</span>
                          <input
                            id="cash-tendered-input"
                            type="number"
                            step="0.01"
                            min={totalAmount}
                            placeholder="Enter amount paid"
                            value={cashPaidText}
                            onChange={(e) => setCashPaidText(e.target.value)}
                            className="flex-1 bg-transparent border-none text-slate-800 text-sm font-mono font-bold px-2 py-1 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-slate-500 block mb-1.5">Change Due</label>
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2 flex items-center justify-between">
                          <span className="text-emerald-800 text-xs font-semibold uppercase font-mono">Return</span>
                          <span className="font-mono text-emerald-700 font-bold text-base">
                            {settings.currency}{cashChangeDue.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Checkout Actions */}
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                <button
                  onClick={() => setCheckoutModalOpen(false)}
                  className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  id="pay-confirm-btn"
                  onClick={handleCompletePayment}
                  disabled={paymentMethod === 'cash' && (!parseFloat(cashPaidText) || parseFloat(cashPaidText) < totalAmount)}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-sans font-bold text-xs sm:text-sm rounded-xl flex items-center gap-1.5 shadow-lg shadow-emerald-600/10"
                >
                  <Check size={16} />
                  <span>Complete Order</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: Add Customer Popup */}
      <AnimatePresence>
        {addCustomerOpen && (
          <div id="add-customer-modal" className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-sm w-full p-6 border border-slate-200 shadow-2xl space-y-4"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-sans font-bold text-slate-800 text-base flex items-center gap-2">
                  <UserPlus size={18} className="text-emerald-500" />
                  Quick Customer Signup
                </h3>
                <button onClick={() => setAddCustomerOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleAddNewCustomer} className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Full Name *</label>
                  <input
                    id="new-customer-name"
                    type="text"
                    required
                    placeholder="e.g. John Doe"
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Phone Number</label>
                  <input
                    id="new-customer-phone"
                    type="tel"
                    placeholder="e.g. 555-0100"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Email Address</label>
                  <input
                    id="new-customer-email"
                    type="email"
                    placeholder="e.g. john@example.com"
                    value={custEmail}
                    onChange={(e) => setCustEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAddCustomerOpen(false)}
                    className="px-4 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-sm"
                  >
                    Save & Link
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: Checkout Success / Receipt View */}
      <AnimatePresence>
        {receiptModalOpen && activeReceipt && (
          <div id="receipt-modal" className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col border border-slate-200"
            >
              {/* Success Banner */}
              <div className="bg-emerald-500 text-slate-950 p-6 text-center space-y-2 flex flex-col items-center">
                <div className="bg-white/20 p-2.5 rounded-full text-white">
                  <Check size={28} className="stroke-[3]" />
                </div>
                <h3 className="font-sans font-bold text-white text-base">Payment Successful!</h3>
                <p className="text-emerald-100 text-xs">Receipt {activeReceipt.id} registered</p>
              </div>

              {/* Thermal Receipt Body */}
              <div className="p-6 flex-1 overflow-y-auto max-h-[380px] bg-slate-50">
                <div id="thermal-receipt" className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 font-mono text-xs text-slate-700">
                  <div className="text-center border-b border-dashed border-slate-200 pb-3">
                    <h4 className="font-bold text-slate-900 text-sm uppercase tracking-tight">{settings.storeName}</h4>
                    <p className="text-[10px] text-slate-400 mt-1">{settings.storeAddress}</p>
                    <p className="text-[10px] text-slate-400">{settings.storePhone}</p>
                  </div>

                  <div className="space-y-1 text-[10px] border-b border-dashed border-slate-200 pb-3">
                    <div className="flex justify-between">
                      <span>DATE:</span>
                      <span>{new Date(activeReceipt.date).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>RECEIPT:</span>
                      <span>{activeReceipt.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>OPERATOR:</span>
                      <span>Admin</span>
                    </div>
                    {activeReceipt.customerName && (
                      <div className="flex justify-between text-emerald-600 font-bold">
                        <span>MEMBER:</span>
                        <span>{activeReceipt.customerName}</span>
                      </div>
                    )}
                  </div>

                  {/* Items list */}
                  <div className="space-y-1.5 border-b border-dashed border-slate-200 pb-3">
                    {activeReceipt.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span className="truncate max-w-[150px]">{item.quantity}x {item.productName}</span>
                        <span>{settings.currency}{item.total.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Pricing block */}
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>SUBTOTAL:</span>
                      <span>{settings.currency}{activeReceipt.subtotal.toFixed(2)}</span>
                    </div>
                    {activeReceipt.discount > 0 && (
                      <div className="flex justify-between text-amber-600">
                        <span>DISCOUNT:</span>
                        <span>-{settings.currency}{activeReceipt.discount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>TAX ({settings.taxRate}%):</span>
                      <span>{settings.currency}{activeReceipt.tax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-900 font-bold pt-1.5 border-t border-slate-100">
                      <span>TOTAL PAID:</span>
                      <span>{settings.currency}{activeReceipt.total.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="border-t border-dashed border-slate-200 pt-3 space-y-1 text-[10px]">
                    <div className="flex justify-between">
                      <span>METHOD:</span>
                      <span className="uppercase font-bold">{activeReceipt.paymentMethod}</span>
                    </div>
                    {activeReceipt.paymentMethod === 'cash' && (
                      <>
                        <div className="flex justify-between">
                          <span>CASH TENDERED:</span>
                          <span>{settings.currency}{(activeReceipt.cashPaid || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-slate-900 font-bold">
                          <span>CHANGE:</span>
                          <span>{settings.currency}{(activeReceipt.cashChange || 0).toFixed(2)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="text-center pt-3 border-t border-dashed border-slate-200 text-[10px] text-slate-400">
                    <p>THANK YOU FOR YOUR VISIT</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                <button
                  onClick={() => alert('Receipt printing is mock triggered!')}
                  className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold"
                >
                  <Printer size={14} />
                  <span>Print Receipt</span>
                </button>
                <button
                  id="new-sale-btn"
                  onClick={() => setReceiptModalOpen(false)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-md shadow-slate-900/10"
                >
                  New Sale
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
