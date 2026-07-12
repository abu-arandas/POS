import React from 'react';
import { User, Plus, Minus, Trash2, Tag, Percent, DollarSign, CreditCard, Info, X, UserPlus } from 'lucide-react';
import { motion } from 'motion/react';
import { Product, Customer } from '../types';
import { useCustomerStore } from '../stores/customerStore';
import { useSettingsStore } from '../stores/settingsStore';

interface CartPanelProps {
  cart: Array<{ product: Product; quantity: number }>;
  updateCartQty: (productId: string, delta: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  activeCustomer: Customer | null;
  selectedCustomerId: string | null;
  setSelectedCustomerId: (id: string | null) => void;
  setAddCustomerOpen: (open: boolean) => void;
  discountType: 'none' | 'percentage' | 'fixed' | 'loyalty';
  setDiscountType: (type: 'none' | 'percentage' | 'fixed' | 'loyalty') => void;
  discountInput: string;
  setDiscountInput: (val: string) => void;
  loyaltyPointsToUse: number;
  setLoyaltyPointsToUse: (pts: number) => void;
  showPromoInput: boolean;
  setShowPromoInput: (show: boolean) => void;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  handleCheckoutClick: () => void;
}

export default function CartPanel({
  cart,
  updateCartQty,
  removeFromCart,
  clearCart,
  activeCustomer,
  selectedCustomerId,
  setSelectedCustomerId,
  setAddCustomerOpen,
  discountType,
  setDiscountType,
  discountInput,
  setDiscountInput,
  loyaltyPointsToUse,
  setLoyaltyPointsToUse,
  showPromoInput,
  setShowPromoInput,
  subtotal,
  discountAmount,
  taxAmount,
  totalAmount,
  handleCheckoutClick
}: CartPanelProps) {
  const { customers } = useCustomerStore();
  const { settings } = useSettingsStore();

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

  return (
    <div id="cart-section" className="w-96 glass dark:glass-dark border-l border-slate-200/50 dark:border-slate-800/50 shadow-2xl flex flex-col h-full shrink-0 relative z-10 transition-colors duration-300">
      <div id="cart-customer-header" className="p-4 border-b border-slate-200/50 dark:border-slate-800/50 bg-white/40 dark:bg-slate-900/40 flex items-center justify-between">
        <div className="flex items-center space-x-3 overflow-hidden">
          <div className={`p-2 rounded-xl shrink-0 transition-colors ${activeCustomer ? 'bg-emerald-500 shadow-lg shadow-emerald-500/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
            <User size={18} />
          </div>
          <div className="overflow-hidden">
            {activeCustomer ? (
              <>
                <p className="font-sans font-semibold text-slate-800 dark:text-slate-100 text-sm truncate leading-tight">
                  {activeCustomer.name}
                </p>
                <p className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                  <span className="font-bold">{activeCustomer.points}</span> loyalty points
                </p>
              </>
            ) : (
              <>
                <p className="font-sans font-semibold text-slate-700 dark:text-slate-300 text-xs leading-none">Walk-In Customer</p>
                <p className="text-[10px] font-sans text-slate-500 dark:text-slate-500 mt-1">Select a member to award points</p>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-1 shrink-0">
          {activeCustomer ? (
            <button
              onClick={() => { setSelectedCustomerId(null); setDiscountType('none'); }}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
              title="Remove customer"
            >
              <X size={14} />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <select
                value={selectedCustomerId || ''}
                onChange={(e) => setSelectedCustomerId(e.target.value || null)}
                className="bg-white/50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 rounded-lg text-xs font-medium px-2 py-1 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-emerald-500 max-w-[100px]"
              >
                <option value="">Link</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                onClick={() => setAddCustomerOpen(true)}
                className="p-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 rounded-lg transition-colors"
                title="Add customer shortcut"
              >
                <UserPlus size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div id="cart-items-container" className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-50 py-12">
            <span className="text-5xl mb-3 animate-float">🛒</span>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tracking-wider">CART IS EMPTY</p>
          </div>
        ) : (
          cart.map(item => (
            <motion.div
              key={item.product.id}
              layoutId={`cart-item-${item.product.id}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center justify-between bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 rounded-xl p-2.5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="min-w-0 flex-1 pr-2">
                <h4 className="font-sans font-semibold text-slate-800 dark:text-slate-200 text-xs truncate leading-snug">
                  {item.product.name}
                </h4>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    {settings.currency}{item.product.price.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-300 dark:text-slate-600">•</span>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    Total: {settings.currency}{(item.product.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2.5 shrink-0">
                <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
                  <button
                    onClick={() => updateCartQty(item.product.id, -1)}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors rounded-l-lg"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 px-2.5 min-w-[20px] text-center">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateCartQty(item.product.id, 1)}
                    disabled={item.quantity >= item.product.stock}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 disabled:opacity-30 transition-colors rounded-r-lg"
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <button
                  onClick={() => removeFromCart(item.product.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      <div id="cart-promos-box" className="p-4 border-t border-slate-200/50 dark:border-slate-800/50 bg-white/30 dark:bg-slate-900/30 space-y-2.5 backdrop-blur-md">
        {activeCustomer && activeCustomer.points > 0 && discountType !== 'loyalty' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2.5 flex items-center justify-between shadow-inner">
            <div className="flex items-start space-x-2">
              <Info size={14} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div className="text-[11px] text-emerald-800 dark:text-emerald-200">
                <span className="font-bold">Loyalty Points Available</span>
                <p className="text-[10px] text-emerald-600/80 dark:text-emerald-300/80 mt-0.5">Save {settings.currency}{(Math.min(activeCustomer.points, Math.ceil(subtotal / settings.loyaltyPointValue)) * settings.loyaltyPointValue).toFixed(2)}</p>
              </div>
            </div>
            <button
              onClick={applyLoyaltyPoints}
              className="text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1.5 rounded-lg shadow-sm transition-colors shrink-0"
            >
              Apply
            </button>
          </motion.div>
        )}

        {discountType !== 'none' && !showPromoInput && (
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-xl p-2 px-3 text-xs">
            <span className="text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5">
              <Tag size={13} />
              Discount: <strong className="font-bold">{discountType === 'percentage' ? `${discountInput}%` : discountType === 'fixed' ? `${settings.currency}${discountInput}` : `${loyaltyPointsToUse} Points`}</strong>
            </span>
            <button
              onClick={() => { setDiscountType('none'); setDiscountInput(''); setLoyaltyPointsToUse(0); }}
              className="text-amber-500 hover:text-amber-600 dark:hover:text-amber-300"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}

        {(discountType === 'none' || showPromoInput) && (
          <div className="flex items-center gap-2">
            {!showPromoInput ? (
              <>
                <button
                  onClick={() => { setDiscountType('percentage'); setShowPromoInput(true); }}
                  className="flex-1 flex items-center justify-center gap-1.5 border border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl py-1.5 text-xs font-semibold transition-colors shadow-sm"
                >
                  <Percent size={12} /> Add %
                </button>
                <button
                  onClick={() => { setDiscountType('fixed'); setShowPromoInput(true); }}
                  className="flex-1 flex items-center justify-center gap-1.5 border border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl py-1.5 text-xs font-semibold transition-colors shadow-sm"
                >
                  <DollarSign size={12} /> Fixed
                </button>
              </>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full flex items-center space-x-2 bg-white dark:bg-slate-900 border border-emerald-500/30 rounded-xl p-1 shadow-inner">
                <input
                  type="number"
                  min="0"
                  placeholder={discountType === 'percentage' ? "Discount %" : "Discount $"}
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  className="flex-1 text-xs border-none bg-transparent px-2.5 focus:outline-none text-slate-800 dark:text-slate-200"
                  autoFocus
                />
                <button
                  onClick={handleApplyPromoCode}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors"
                >
                  Apply
                </button>
                <button
                  onClick={() => { setDiscountType('none'); setShowPromoInput(false); }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <X size={14} />
                </button>
              </motion.div>
            )}
          </div>
        )}
      </div>

      <div id="cart-pricing-summary" className="p-5 border-t border-slate-200/50 dark:border-slate-800/50 bg-white/50 dark:bg-slate-900/50 space-y-4 backdrop-blur-md">
        <div className="space-y-2">
          <div className="flex justify-between text-slate-500 dark:text-slate-400 text-xs">
            <span>Subtotal</span>
            <span className="font-mono">{settings.currency}{subtotal.toFixed(2)}</span>
          </div>
          
          {discountAmount > 0 && (
            <div className="flex justify-between text-amber-600 dark:text-amber-400 text-xs font-medium">
              <span>Discount</span>
              <span className="font-mono">-{settings.currency}{discountAmount.toFixed(2)}</span>
            </div>
          )}

          <div className="flex justify-between text-slate-800 dark:text-slate-100 font-bold text-sm pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
            <span>Total</span>
            <span className="font-mono text-xl text-emerald-600 dark:text-emerald-400 tracking-tight">{settings.currency}{totalAmount.toFixed(2)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={clearCart}
            disabled={cart.length === 0}
            className="px-3 py-3 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-500 dark:text-slate-400 rounded-xl transition-colors shrink-0"
            title="Clear entire cart"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={handleCheckoutClick}
            disabled={cart.length === 0}
            className="flex-1 bg-linear-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:from-slate-400 disabled:to-slate-400 text-white font-sans font-bold text-sm py-3 px-4 rounded-xl flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/25 transition-all transform active:scale-95"
          >
            <CreditCard size={18} />
            <span>Checkout</span>
          </button>
        </div>
      </div>
    </div>
  );
}
