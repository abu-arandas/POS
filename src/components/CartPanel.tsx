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
  Receipt,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Customer } from '../types';
import { useCustomerStore } from '../stores/customerStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useTranslation } from 'react-i18next';
import { safeImageUrl } from '../lib/imageUrl';
import { availableStock, variantImage, variantLabel, variantPrice } from '../lib/variants';
import { calculateModifierPriceDelta, formatModifierSummary } from '../lib/modifiers';
import { cartLineKey, type RegisterCartLine } from './register/useRegisterCart';

interface CartPanelProps {
  cart: RegisterCartLine[];
  updateCartQty: (key: string, delta: number) => void;
  removeFromCart: (key: string) => void;
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
  /** Tabs still owing money on this terminal. */
  openTabCount: number;
  onOpenTabs: () => void;
}

/**
 * The register's running order: line items and their quantities, the linked
 * customer, the discount in force, and the totals. Owns no cart state of its
 * own — every edit goes back to the register through a callback.
 */
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
  openTabCount,
  onOpenTabs,
}: CartPanelProps) => {
  const customers = useCustomerStore((s) => s.customers);
  const settings = useSettingsStore((s) => s.settings);
  const showProductImages = useSettingsStore((s) => s.showProductImages);
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
      className="app-panel flex flex-col h-full shrink-0 relative z-10 w-72 border-s border-border bg-card"
    >
      {/* ── Customer Header ── */}
      <div id="cart-customer-header" className="shrink-0 p-3 border-b border-border">
        {activeCustomer ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40 border border-border"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-7 rounded-lg bg-foreground text-background flex items-center justify-center font-bold text-xs shrink-0">
                <User size={13} />
              </div>
              <div className="min-w-0">
                <p className="text-foreground text-xs font-semibold truncate leading-tight">
                  {activeCustomer.name}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Star size={9} className="text-muted-foreground fill-muted-foreground/30" />
                  <span className="text-[10px] font-mono text-muted-foreground font-medium">
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
              className="p-1 text-muted-foreground hover:text-destructive rounded-md hover:bg-muted transition-colors shrink-0"
            >
              <X size={13} />
            </button>
          </motion.div>
        ) : (
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <select
                value={selectedCustomerId || ''}
                onChange={(e) => setSelectedCustomerId(e.target.value || null)}
                aria-label={t('register.link')}
                className="input-shell w-full ps-2.5 pe-7 py-1.5 rounded-lg text-xs font-medium focus:outline-none appearance-none"
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
                className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
            </div>
            <button
              onClick={() => setAddCustomerOpen(true)}
              aria-label={t('register.newCustomer')}
              className="p-1.5 rounded-lg shrink-0 transition-colors border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <UserPlus size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Cart Items ── */}
      <div id="cart-items-container" className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
        <AnimatePresence initial={false}>
          {cart.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full flex flex-col items-center justify-center text-center py-10"
            >
              <div className="size-12 rounded-xl flex items-center justify-center mb-3 bg-muted/40 border border-border">
                <ShoppingCart size={20} className="text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-xs font-medium">{t('register.cartEmpty')}</p>
              <p className="text-muted-foreground/70 text-[11px] mt-0.5">
                {t('register.tapToAdd')}
              </p>
            </motion.div>
          ) : (
            cart.map((item) => {
              const key = cartLineKey(item);
              const label = item.variant ? variantLabel(item.product, item.variant) : '';
              const modDelta = calculateModifierPriceDelta(item.modifiers);
              const modSummary = formatModifierSummary(item.modifiers);
              const unitPrice = variantPrice(item.product, item.variant) + modDelta;
              const lineStock = availableStock(item.product, item.variant?.id);
              const displayName = label ? `${item.product.name} — ${label}` : item.product.name;
              const thumbnail = safeImageUrl(variantImage(item.product, item.variant));
              return (
                <motion.div
                  key={key}
                  layoutId={`cart-item-${key}`}
                  initial={{ opacity: 0, x: 12, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: 'auto' }}
                  exit={{ opacity: 0, x: -12, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-center gap-2 p-2 rounded-lg group bg-card border border-border hover:border-foreground/20 transition-colors"
                >
                  {/* Product thumbnail */}
                  {showProductImages && thumbnail && (
                    <div className="size-8 rounded-md overflow-hidden shrink-0 bg-muted border border-border/50">
                      <img src={thumbnail} alt={displayName} className="size-full object-cover" />
                    </div>
                  )}

                  {/* Name + price */}
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground text-xs font-medium truncate leading-tight">
                      {item.product.name}
                    </p>
                    {label && (
                      <p className="text-[10px] font-normal text-muted-foreground truncate leading-tight mt-0.5">
                        {label}
                      </p>
                    )}
                    {modSummary && (
                      <p className="text-[10px] font-mono text-muted-foreground truncate leading-tight mt-0.5">
                        +{modSummary}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {settings.currency}
                        {unitPrice.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground/60 text-[10px]">×</span>
                      <span className="font-mono text-[10px] font-semibold text-foreground">
                        {settings.currency}
                        {(unitPrice * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Qty controls */}
                  <div className="flex items-center shrink-0">
                    <div className="flex items-center rounded-md overflow-hidden border border-border bg-background">
                      <button
                        onClick={() => updateCartQty(key, -1)}
                        aria-label={`${t('register.decreaseQty')} — ${displayName}`}
                        className="size-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Minus size={10} />
                      </button>
                      <span className="font-mono text-xs font-medium text-foreground px-1.5 min-w-[1.25rem] text-center bg-muted/20">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateCartQty(key, 1)}
                        disabled={item.quantity >= lineStock}
                        aria-label={`${t('register.increaseQty')} — ${displayName}`}
                        className="size-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-25 transition-colors"
                      >
                        <Plus size={10} />
                      </button>
                    </div>
                    <button
                      onClick={() => removeFromCart(key)}
                      aria-label={`${t('register.removeFromCart')} — ${displayName}`}
                      className="ms-1 size-5 flex items-center justify-center text-muted-foreground hover:text-destructive rounded transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* ── Discount Section ── */}
      <div id="cart-promos-box" className="shrink-0 px-3 py-2 space-y-1.5 border-t border-border">
        {/* Loyalty points offer */}
        {loyaltyEnabled &&
          activeCustomer &&
          activeCustomer.points > 0 &&
          discountType !== 'loyalty' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-border"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Star
                  size={12}
                  className="text-muted-foreground shrink-0 fill-muted-foreground/30"
                />
                <div className="min-w-0">
                  <p className="text-foreground text-[11px] font-medium leading-tight">
                    {t('register.loyaltyPointsAvail')}
                  </p>
                  <p className="text-muted-foreground text-[10px]">
                    {t('register.save')} {settings.currency}
                    {loyaltySavings.toFixed(2)}
                  </p>
                </div>
              </div>
              <button
                onClick={applyLoyaltyPoints}
                className="text-[10px] font-semibold px-2 py-1 rounded-md shrink-0 transition-colors bg-foreground text-background"
              >
                {t('register.apply')}
              </button>
            </motion.div>
          )}

        {/* Active discount badge */}
        {discountType !== 'none' && !showPromoInput && (
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-muted/60 border border-border"
          >
            <span className="text-foreground text-xs font-medium flex items-center gap-1.5">
              <Tag size={11} className="text-muted-foreground" />
              {t('register.discount')}{' '}
              <strong className="font-semibold">
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
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={12} />
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
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-colors border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <Percent size={11} />
                  <span dir="ltr">{t('register.addPercent')}</span>
                </button>
                <button
                  onClick={() => {
                    setDiscountType('fixed');
                    setShowPromoInput(true);
                  }}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-colors border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <DollarSign size={11} />
                  {t('register.fixed')}
                </button>
              </>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full flex items-center gap-1.5 p-1 rounded-lg border border-border bg-card"
              >
                <input
                  type="number"
                  min="0"
                  placeholder={discountType === 'percentage' ? '0%' : '0.00'}
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  aria-label={t('register.discount').replace(':', '')}
                  className="flex-1 text-xs bg-transparent px-2 focus:outline-none text-foreground placeholder:text-muted-foreground"
                  autoFocus
                />
                <button
                  onClick={handleApplyPromoCode}
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors shrink-0 bg-foreground text-background"
                >
                  {t('register.apply')}
                </button>
                <button
                  onClick={() => {
                    setDiscountType('none');
                    setShowPromoInput(false);
                  }}
                  aria-label={t('register.cancelDiscount')}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <X size={12} />
                </button>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* ── Pricing Summary ── */}
      <div
        id="cart-pricing-summary"
        className="shrink-0 px-3 pt-2.5 pb-3 space-y-3 border-t border-border"
      >
        <div className="space-y-1">
          <div className="flex justify-between text-muted-foreground text-xs">
            <span>{t('register.subtotal')}</span>
            <span className="font-mono num text-foreground font-medium">
              {settings.currency}
              {subtotal.toFixed(2)}
            </span>
          </div>
          {discountAmount > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex justify-between text-amber-600 dark:text-amber-400 text-xs font-medium"
            >
              <span>{t('register.discount').replace(':', '')}</span>
              <span className="font-mono num">
                −{settings.currency}
                {discountAmount.toFixed(2)}
              </span>
            </motion.div>
          )}
          {taxAmount > 0 && (
            <div className="flex justify-between text-muted-foreground text-xs">
              <span>
                {t('register.tax')} ({settings.taxRate}%)
              </span>
              <span className="font-mono num text-foreground font-medium">
                {settings.currency}
                {taxAmount.toFixed(2)}
              </span>
            </div>
          )}

          <div
            className="flex justify-between items-center pt-2 border-t border-border"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="text-foreground font-semibold text-sm">{t('register.total')}</span>
            <motion.span
              key={totalAmount}
              initial={{ scale: 1.05 }}
              animate={{ scale: 1 }}
              className="font-mono font-bold text-xl tracking-tight text-foreground num"
            >
              {settings.currency}
              {totalAmount.toFixed(2)}
            </motion.span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={clearCart}
            disabled={cart.length === 0}
            aria-label={t('register.clearCart')}
            className="p-2.5 rounded-xl transition-colors disabled:opacity-30 border border-border bg-card text-muted-foreground hover:bg-muted hover:text-destructive"
          >
            <Trash2 size={14} />
          </button>
          <button
            id="hold-order-btn"
            onClick={onHoldOrder}
            disabled={cart.length === 0}
            aria-label={t('register.holdOrder')}
            className="p-2.5 rounded-xl transition-colors disabled:opacity-30 flex items-center gap-1 border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <PauseCircle size={14} />
            <span className="text-xs font-medium hidden sm:inline">{t('register.hold')}</span>
          </button>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleCheckoutClick}
            disabled={cart.length === 0}
            className="btn-primary flex-1 py-2.5 rounded-xl font-semibold text-xs transition-all disabled:opacity-30 flex items-center justify-center gap-2 shadow-xs"
          >
            <CreditCard size={14} />
            <span>{t('register.checkout')}</span>
          </motion.button>
        </div>

        {/* Open tabs. Unlike held orders this is shown even at zero, because
            it is also how a tab is STARTED — and a control that only appears
            once one exists is a feature nobody discovers. */}
        <motion.button
          id="open-tabs-btn"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={onOpenTabs}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg transition-colors border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <Receipt size={12} />
          {openTabCount > 0
            ? t('register.openTabsCount', { count: openTabCount })
            : t('register.openTabs')}
        </motion.button>

        {/* Held orders */}
        {heldCount > 0 && (
          <motion.button
            id="open-held-orders-btn"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={onOpenHeldOrders}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg transition-colors border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <Clock size={12} />
            {t('register.resumeHeld', { count: heldCount })}
          </motion.button>
        )}
      </div>
    </aside>
  );
};

export default memo(CartPanel);
