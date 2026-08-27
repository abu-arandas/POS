import { useCallback, useMemo, memo } from 'react';
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
import { safeImageUrl } from '../lib/imageUrl';

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

const CartPanel = ({
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
}: CartPanelProps) => {
  const customers = useCustomerStore((s) => s.customers);
  const settings = useSettingsStore((s) => s.settings);
  const { t } = useTranslation();

  // Redemption is only meaningful when a point is worth something. Production
  // defaults ship loyaltyPointValue: 0, which made this divide by zero —
  // Infinity for a non-empty cart (offering a redemption worth $0.00) and NaN
  // for an empty one, which rendered as a literal "NaN pts" discount badge.
  const loyaltyEnabled = settings.loyaltyPointValue > 0;

  const applyLoyaltyPoints = useCallback(() => {
    if (!activeCustomer || !loyaltyEnabled) return;
    const maxPointsUse = Math.min(
      activeCustomer.points,
      Math.ceil(subtotal / settings.loyaltyPointValue),
    );
    setDiscountType('loyalty');
    setLoyaltyPointsToUse(maxPointsUse);
    setShowPromoInput(false);
  }, [
    activeCustomer,
    loyaltyEnabled,
    subtotal,
    settings.loyaltyPointValue,
    setDiscountType,
    setLoyaltyPointsToUse,
    setShowPromoInput,
  ]);

  const handleApplyPromoCode = useCallback(() => {
    const val = parseFloat(discountInput);
    if (!isNaN(val) && val > 0) {
      setShowPromoInput(false);
    }
  }, [discountInput, setShowPromoInput]);

  const loyaltySavings = useMemo(() => {
    if (!activeCustomer || !loyaltyEnabled) return 0;
    return Math.min(
      Math.min(activeCustomer.points, Math.ceil(subtotal / settings.loyaltyPointValue)) *
        settings.loyaltyPointValue,
      subtotal,
    );
  }, [activeCustomer, loyaltyEnabled, subtotal, settings.loyaltyPointValue]);

  return (
    <aside
      id="cart-section"
      aria-label={t('register.checkout')}
      className="flex flex-col h-full shrink-0 relative z-10 w-[300px] border-s"
      style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
    >
      {/* ── Customer Header ── */}
      <div
        id="cart-customer-header"
        className="shrink-0 p-3 border-b border-slate-200 dark:border-slate-800/60"
      >
        {activeCustomer ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <User size={14} className="text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-slate-900 dark:text-white text-xs font-bold truncate leading-tight">
                  {activeCustomer.name}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Star size={9} className="text-emerald-400 fill-emerald-400" />
                  <span className="text-[10px] font-mono text-emerald-400 font-bold">
                    {activeCustomer.points} {t('register.loyaltyPointsLabel')}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedCustomerId(null);
                setDiscountType('none');
              }}
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
                aria-label={t('register.link')}
                className="w-full ps-3 pe-8 py-2 rounded-xl text-xs font-medium transition-all focus:outline-none appearance-none bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 text-slate-400"
              >
                <option value="">{t('register.link')}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
              />
            </div>
            <button
              onClick={() => setAddCustomerOpen(true)}
              aria-label={t('register.newCustomer')}
              className="p-2 rounded-xl shrink-0 transition-all bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
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
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50">
                <ShoppingCart size={28} className="text-slate-600" />
              </div>
              <p className="text-slate-500 text-xs font-medium">{t('register.cartEmpty')}</p>
              <p className="text-slate-700 text-[10px] mt-1">{t('register.tapToAdd')}</p>
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
                className="flex items-center gap-2.5 p-2.5 rounded-xl group bg-slate-100/70 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/40 hover:bg-slate-800/50 transition-colors"
              >
                {/* Product thumbnail */}
                {safeImageUrl(item.product.image) && (
                  <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800">
                    <img
                      src={safeImageUrl(item.product.image)}
                      alt={item.product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Name + price */}
                <div className="min-w-0 flex-1">
                  <p className="text-slate-800 dark:text-slate-100 text-xs font-semibold truncate leading-tight">
                    {item.product.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono text-[10px] text-emerald-400 font-medium">
                      {settings.currency}
                      {item.product.price.toFixed(2)}
                    </span>
                    <span className="text-slate-700 text-[10px]">×</span>
                    <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                      = {settings.currency}
                      {(item.product.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Qty controls */}
                <div className="flex items-center shrink-0">
                  <div className="flex items-center rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700/60">
                    <button
                      onClick={() => updateCartQty(item.product.id, -1)}
                      aria-label={`${t('register.decreaseQty')} — ${item.product.name}`}
                      className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white/8 transition-colors"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white px-2 min-w-[1.5rem] text-center bg-slate-100 dark:bg-slate-800/40">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateCartQty(item.product.id, 1)}
                      disabled={item.quantity >= item.product.stock}
                      aria-label={`${t('register.increaseQty')} — ${item.product.name}`}
                      className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white/8 disabled:opacity-25 transition-colors"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.product.id)}
                    aria-label={`${t('register.removeFromCart')} — ${item.product.name}`}
                    className="ms-1.5 w-6 h-6 flex items-center justify-center text-slate-700 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
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
        className="shrink-0 px-3 py-2.5 space-y-2 border-t border-slate-200 dark:border-slate-800/60"
      >
        {/* Loyalty points offer */}
        {loyaltyEnabled &&
          activeCustomer &&
          activeCustomer.points > 0 &&
          discountType !== 'loyalty' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Star size={13} className="text-emerald-400 shrink-0 fill-emerald-400/30" />
                <div className="min-w-0">
                  <p className="text-emerald-300 text-[11px] font-bold leading-tight">
                    {t('register.loyaltyPointsAvail')}
                  </p>
                  <p className="text-emerald-500 text-[10px]">
                    {t('register.save')} {settings.currency}
                    {loyaltySavings.toFixed(2)}
                  </p>
                </div>
              </div>
              <button
                onClick={applyLoyaltyPoints}
                className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg shrink-0 transition-colors bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
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
            className="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20"
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
              onClick={() => {
                setDiscountType('none');
                setDiscountInput('');
                setLoyaltyPointsToUse(0);
              }}
              aria-label={t('register.removeDiscount')}
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
                  onClick={() => {
                    setDiscountType('percentage');
                    setShowPromoInput(true);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 text-slate-400 hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                >
                  <Percent size={12} />
                  <span dir="ltr">{t('register.addPercent')}</span>
                </button>
                <button
                  onClick={() => {
                    setDiscountType('fixed');
                    setShowPromoInput(true);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 text-slate-400 hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                >
                  <DollarSign size={12} />
                  {t('register.fixed')}
                </button>
              </>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full flex items-center gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/40 border border-emerald-500/30"
              >
                <input
                  type="number"
                  min="0"
                  placeholder={discountType === 'percentage' ? '0%' : '0.00'}
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  aria-label={t('register.discount').replace(':', '')}
                  className="flex-1 text-xs bg-transparent px-2.5 focus:outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-600"
                  autoFocus
                />
                <button
                  onClick={handleApplyPromoCode}
                  className="text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors shrink-0 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                >
                  {t('register.apply')}
                </button>
                <button
                  onClick={() => {
                    setDiscountType('none');
                    setShowPromoInput(false);
                  }}
                  aria-label={t('register.cancelDiscount')}
                  className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors shrink-0"
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
        className="shrink-0 px-4 pt-3 pb-4 space-y-4 border-t border-slate-200 dark:border-slate-800/60"
      >
        <div className="space-y-1.5">
          <div className="flex justify-between text-slate-500 text-[11px]">
            <span>{t('register.subtotal')}</span>
            <span className="font-mono">
              {settings.currency}
              {subtotal.toFixed(2)}
            </span>
          </div>
          {discountAmount > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex justify-between text-amber-400 text-[11px] font-medium"
            >
              <span>{t('register.discount').replace(':', '')}</span>
              <span className="font-mono">
                −{settings.currency}
                {discountAmount.toFixed(2)}
              </span>
            </motion.div>
          )}
          {taxAmount > 0 && (
            <div className="flex justify-between text-slate-500 text-[11px]">
              <span>
                {t('register.tax')} ({settings.taxRate}%)
              </span>
              <span className="font-mono">
                {settings.currency}
                {taxAmount.toFixed(2)}
              </span>
            </div>
          )}

          <div
            className="flex justify-between items-center pt-2.5 border-t border-slate-200 dark:border-slate-800/60"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="text-slate-600 dark:text-slate-300 font-bold text-sm">
              {t('register.total')}
            </span>
            <motion.span
              key={totalAmount}
              initial={{ scale: 1.08, color: '#34d399' }}
              animate={{ scale: 1, color: '#34d399' }}
              className="font-mono font-bold text-2xl tracking-tight text-emerald-400"
            >
              {settings.currency}
              {totalAmount.toFixed(2)}
            </motion.span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={clearCart}
            disabled={cart.length === 0}
            aria-label={t('register.clearCart')}
            className="p-2.5 rounded-xl transition-all disabled:opacity-30 border border-slate-200 dark:border-slate-700/50 bg-slate-100 dark:bg-slate-800/40 text-slate-400 hover:bg-slate-800 hover:text-rose-400"
          >
            <Trash2 size={15} />
          </button>
          <button
            id="hold-order-btn"
            onClick={onHoldOrder}
            disabled={cart.length === 0}
            aria-label={t('register.holdOrder')}
            className="p-2.5 rounded-xl transition-all disabled:opacity-30 flex items-center gap-1.5 border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
          >
            <PauseCircle size={15} />
            <span className="text-[11px] font-bold hidden sm:inline">{t('register.hold')}</span>
          </button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleCheckoutClick}
            disabled={cart.length === 0}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-40 ${
              cart.length > 0
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 shadow-lg shadow-emerald-500/25 hover:from-emerald-500 hover:to-emerald-400'
                : 'bg-gradient-to-r from-slate-700 to-slate-800'
            }`}
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
            className="w-full flex items-center justify-center gap-2 py-2 text-[11px] font-semibold rounded-xl transition-all bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20"
          >
            <Clock size={13} />
            {t('register.resumeHeld', { count: heldCount })}
          </motion.button>
        )}
      </div>
    </aside>
  );
};

export default memo(CartPanel);
