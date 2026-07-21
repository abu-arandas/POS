import React from 'react';
import {
  User,
  Plus,
  Minus,
  Trash2,
  Tag,
  Percent,
  DollarSign,
  CreditCard,
  X,
  UserPlus,
  PauseCircle,
  Clock,
  Star,
  ShoppingCart,
  ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Customer } from '../types';
import { useCustomerStore } from '../stores/customerStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useTranslation } from 'react-i18next';

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
  onHoldOrder: () => void;
  heldCount: number;
  onOpenHeldOrders: () => void;
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
  handleCheckoutClick,
  onHoldOrder,
  heldCount,
  onOpenHeldOrders,
}: CartPanelProps) {
  const { customers } = useCustomerStore();
  const { settings } = useSettingsStore();
  const { t } = useTranslation();

  const applyLoyaltyPoints = () => {
    if (!activeCustomer) return;
    const maxPointsUse = Math.min(
      activeCustomer.points,
      Math.ceil(subtotal / settings.loyaltyPointValue),
    );
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

  const cartTotal = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

  return (
    <div
      id="cart-section"
      className="flex flex-col h-full shrink-0 relative z-10"
      style={{
        width: '300px',
        background: 'rgba(9, 14, 28, 0.97)',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* ── Customer Header ── */}
      <div
        id="cart-customer-header"
        className="shrink-0 p-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {activeCustomer ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between p-3 rounded-xl"
            style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <User size={14} className="text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-white text-xs font-bold truncate leading-tight">{activeCustomer.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Star size={9} className="text-emerald-400 fill-emerald-400" />
                  <span className="text-[10px] font-mono text-emerald-400 font-bold">
                    {activeCustomer.points} {t('register.loyaltyPointsLabel')}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => { setSelectedCustomerId(null); setDiscountType('none'); }}
              aria-label={t('register.removeCustomer')}
              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0"
            >
              <X size={13} />
            </button>
          </motion.div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <select
                value={selectedCustomerId || ''}
                onChange={(e) => setSelectedCustomerId(e.target.value || null)}
                className="w-full ps-3 pe-8 py-2 rounded-xl text-xs font-medium transition-all focus:outline-none appearance-none"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#94a3b8',
                }}
              >
                <option value="">{t('register.link')}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
            <button
              onClick={() => setAddCustomerOpen(true)}
              aria-label={t('register.newCustomer')}
              className="p-2 rounded-xl shrink-0 transition-all"
              style={{
                background: 'rgba(16,185,129,0.1)',
                border: '1px solid rgba(16,185,129,0.2)',
                color: '#34d399',
              }}
            >
              <UserPlus size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Cart Items ── */}
      <div id="cart-items-container" className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        <AnimatePresence initial={false}>
          {cart.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full flex flex-col items-center justify-center text-center py-12"
            >
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <ShoppingCart size={28} className="text-slate-600" />
              </div>
              <p className="text-slate-500 text-xs font-medium">{t('register.cartEmpty')}</p>
              <p className="text-slate-700 text-[10px] mt-1">Tap a product to add it</p>
            </motion.div>
          ) : (
            cart.map((item) => (
              <motion.div
                key={item.product.id}
                layoutId={`cart-item-${item.product.id}`}
                initial={{ opacity: 0, x: 20, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0, x: -20, height: 0 }}
                transition={{ duration: 0.22 }}
                className="flex items-center gap-2.5 p-2.5 rounded-xl group"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {/* Product thumbnail */}
                {item.product.image && (
                  <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-slate-800">
                    <img
                      src={item.product.image}
                      alt={item.product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Name + price */}
                <div className="min-w-0 flex-1">
                  <p className="text-slate-100 text-xs font-semibold truncate leading-tight">
                    {item.product.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono text-[10px] text-emerald-400 font-medium">
                      {settings.currency}{item.product.price.toFixed(2)}
                    </span>
                    <span className="text-slate-700 text-[10px]">×</span>
                    <span className="font-mono text-[10px] text-slate-400">
                      = {settings.currency}{(item.product.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Qty controls */}
                <div className="flex items-center shrink-0">
                  <div className="flex items-center rounded-lg overflow-hidden"
                    style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                    <button
                      onClick={() => updateCartQty(item.product.id, -1)}
                      className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/8 transition-colors"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="font-mono text-xs font-bold text-white px-2 min-w-[1.5rem] text-center"
                      style={{ background: 'rgba(255,255,255,0.04)' }}>
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateCartQty(item.product.id, 1)}
                      disabled={item.quantity >= item.product.stock}
                      className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/8 disabled:opacity-25 transition-colors"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.product.id)}
                    aria-label="Remove from cart"
                    className="ms-1.5 w-6 h-6 flex items-center justify-center text-slate-700 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* ── Discount Section ── */}
      <div
        id="cart-promos-box"
        className="shrink-0 px-3 py-2.5 space-y-2"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Loyalty points offer */}
        {activeCustomer && activeCustomer.points > 0 && discountType !== 'loyalty' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between p-2.5 rounded-xl"
            style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Star size={13} className="text-emerald-400 shrink-0 fill-emerald-400/30" />
              <div className="min-w-0">
                <p className="text-emerald-300 text-[11px] font-bold leading-tight">
                  {t('register.loyaltyPointsAvail')}
                </p>
                <p className="text-emerald-500 text-[10px]">
                  {t('register.save')} {settings.currency}
                  {Math.min(
                    Math.min(activeCustomer.points, Math.ceil(subtotal / settings.loyaltyPointValue)) * settings.loyaltyPointValue,
                    subtotal,
                  ).toFixed(2)}
                </p>
              </div>
            </div>
            <button
              onClick={applyLoyaltyPoints}
              className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg shrink-0 transition-colors"
              style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399' }}
            >
              {t('register.apply')}
            </button>
          </motion.div>
        )}

        {/* Active discount badge */}
        {discountType !== 'none' && !showPromoInput && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center justify-between px-3 py-2 rounded-xl"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
          >
            <span className="text-amber-400 text-[11px] font-semibold flex items-center gap-1.5">
              <Tag size={12} />
              {t('register.discount')}{' '}
              <strong>
                {discountType === 'percentage'
                  ? `${discountInput}%`
                  : discountType === 'fixed'
                  ? `${settings.currency}${discountInput}`
                  : `${loyaltyPointsToUse} pts`}
              </strong>
            </span>
            <button
              onClick={() => { setDiscountType('none'); setDiscountInput(''); setLoyaltyPointsToUse(0); }}
              aria-label="Remove discount"
              className="text-amber-500 hover:text-amber-300 transition-colors"
            >
              <X size={13} />
            </button>
          </motion.div>
        )}

        {/* Discount type buttons */}
        {(discountType === 'none' || showPromoInput) && (
          <div className="flex items-center gap-1.5">
            {!showPromoInput ? (
              <>
                <button
                  onClick={() => { setDiscountType('percentage'); setShowPromoInput(true); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#64748b',
                  }}
                >
                  <Percent size={12} />
                  <span dir="ltr">{t('register.addPercent')}</span>
                </button>
                <button
                  onClick={() => { setDiscountType('fixed'); setShowPromoInput(true); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#64748b',
                  }}
                >
                  <DollarSign size={12} />
                  {t('register.fixed')}
                </button>
              </>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full flex items-center gap-2 p-1 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(16,185,129,0.25)' }}
              >
                <input
                  type="number"
                  min="0"
                  placeholder={discountType === 'percentage' ? '0%' : '0.00'}
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  className="flex-1 text-xs bg-transparent px-2.5 focus:outline-none text-slate-200 placeholder:text-slate-600"
                  autoFocus
                />
                <button
                  onClick={handleApplyPromoCode}
                  className="text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors shrink-0"
                  style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399' }}
                >
                  {t('register.apply')}
                </button>
                <button
                  onClick={() => { setDiscountType('none'); setShowPromoInput(false); }}
                  aria-label="Cancel discount"
                  className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors shrink-0"
                >
                  <X size={13} />
                </button>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* ── Pricing Summary ── */}
      <div
        id="cart-pricing-summary"
        className="shrink-0 px-4 pt-3 pb-4 space-y-4"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="space-y-1.5">
          <div className="flex justify-between text-slate-500 text-[11px]">
            <span>{t('register.subtotal')}</span>
            <span className="font-mono">{settings.currency}{subtotal.toFixed(2)}</span>
          </div>
          {discountAmount > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex justify-between text-amber-400 text-[11px] font-medium"
            >
              <span>{t('register.discount').replace(':', '')}</span>
              <span className="font-mono">−{settings.currency}{discountAmount.toFixed(2)}</span>
            </motion.div>
          )}
          {taxAmount > 0 && (
            <div className="flex justify-between text-slate-500 text-[11px]">
              <span>{t('register.tax')} ({settings.taxRate}%)</span>
              <span className="font-mono">{settings.currency}{taxAmount.toFixed(2)}</span>
            </div>
          )}

          <div
            className="flex justify-between items-center pt-2.5"
            style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
          >
            <span className="text-slate-300 font-bold text-sm">{t('register.total')}</span>
            <motion.span
              key={totalAmount}
              initial={{ scale: 1.08, color: '#34d399' }}
              animate={{ scale: 1, color: '#34d399' }}
              className="font-mono font-bold text-2xl tracking-tight"
              style={{ color: '#34d399' }}
            >
              {settings.currency}{totalAmount.toFixed(2)}
            </motion.span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={clearCart}
            disabled={cart.length === 0}
            aria-label={t('register.clearCart')}
            className="p-2.5 rounded-xl transition-all disabled:opacity-30"
            style={{
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)',
              color: '#64748b',
            }}
          >
            <Trash2 size={15} />
          </button>
          <button
            id="hold-order-btn"
            onClick={onHoldOrder}
            disabled={cart.length === 0}
            aria-label={t('register.holdOrder')}
            className="p-2.5 rounded-xl transition-all disabled:opacity-30 flex items-center gap-1.5"
            style={{
              border: '1px solid rgba(245,158,11,0.25)',
              background: 'rgba(245,158,11,0.08)',
              color: '#fbbf24',
            }}
          >
            <PauseCircle size={15} />
            <span className="text-[11px] font-bold hidden sm:inline">{t('register.hold')}</span>
          </button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleCheckoutClick}
            disabled={cart.length === 0}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-40 focus:outline-none"
            style={{
              background: cart.length > 0
                ? 'linear-gradient(135deg, #059669, #10b981)'
                : 'linear-gradient(135deg, #334155, #475569)',
              boxShadow: cart.length > 0 ? '0 4px 20px rgba(16,185,129,0.35)' : 'none',
            }}
          >
            <CreditCard size={16} />
            <span>{t('register.checkout')}</span>
          </motion.button>
        </div>

        {/* Held orders */}
        {heldCount > 0 && (
          <motion.button
            id="open-held-orders-btn"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={onOpenHeldOrders}
            className="w-full flex items-center justify-center gap-2 py-2 text-[11px] font-semibold rounded-xl transition-all"
            style={{
              background: 'rgba(245,158,11,0.07)',
              border: '1px solid rgba(245,158,11,0.2)',
              color: '#fbbf24',
            }}
          >
            <Clock size={13} />
            {t('register.resumeHeld', { count: heldCount })}
          </motion.button>
        )}
      </div>
    </div>
  );
}
