import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  CreditCard,
  DollarSign,
  Smartphone,
  Gift,
  Check,
  X,
  Printer,
  UserPlus,
  ShoppingBag,
  ScanLine,
  Clock,
  Trash2,
  Play,
  Share2,
  Mail,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, SaleTransaction, HeldOrder, Payment, PaymentMethod } from '../types';
import ProductGrid from './ProductGrid';
import CartPanel from './CartPanel';
import { useProductStore } from '../stores/productStore';
import { useCustomerStore } from '../stores/customerStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useTransactionStore } from '../stores/transactionStore';
import { useAuthStore } from '../stores/authStore';
import { useHeldOrderStore } from '../stores/heldOrderStore';
import { useShiftStore } from '../stores/shiftStore';
import { calculateOrderTotals } from '../lib/pricing';
import { syncToCloudIfEnabled } from '../lib/sync';
import { buildSaleTransaction, CheckoutRequest } from '../lib/checkout';
import { printReceipt, openCashDrawer, HardwarePrintOutcome } from '../lib/hardwarePrint';
import { shareReceipt, emailReceipt } from '../lib/digitalReceipt';
import { useBarcodeScanner } from '../lib/useBarcodeScanner';
import { useTranslation } from 'react-i18next';

export default function Register() {
  const { t } = useTranslation();
  const { handleUpdateProduct } = useProductStore();
  const { customers, handleAddCustomer, updateCustomerPoints } = useCustomerStore();
  const { settings, printerConfig } = useSettingsStore();
  const { addTransaction } = useTransactionStore();
  const { currentUser } = useAuthStore();
  const { heldOrders, holdOrder, removeHeldOrder } = useHeldOrderStore();
  const currentShiftId = useShiftStore((s) => s.currentShiftId);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const [cart, setCart] = useState<Array<{ product: Product; quantity: number }>>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'fixed' | 'loyalty'>(
    'none',
  );
  const [discountInput, setDiscountInput] = useState<string>('');
  const [loyaltyPointsToUse, setLoyaltyPointsToUse] = useState<number>(0);
  const [showPromoInput, setShowPromoInput] = useState<boolean>(false);

  const [checkoutModalOpen, setCheckoutModalOpen] = useState<boolean>(false);
  const [addCustomerOpen, setAddCustomerOpen] = useState<boolean>(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState<boolean>(false);
  const [activeReceipt, setActiveReceipt] = useState<SaleTransaction | null>(null);

  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custEmail, setCustEmail] = useState('');

  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'mobile' | 'gift'>('card');
  const [cashPaidText, setCashPaidText] = useState<string>('');

  const [splitMode, setSplitMode] = useState(false);
  const [splitPayments, setSplitPayments] = useState<Payment[]>([]);

  const [heldModalOpen, setHeldModalOpen] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const activeCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId],
  );

  const cartItems = useMemo(
    () =>
      cart.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        price: item.product.price,
        cost: item.product.cost,
        quantity: item.quantity,
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

    const options = new Set<number>();
    options.add(Number(exact.toFixed(2)));
    if (next5 > exact) options.add(next5);
    if (next10 > exact && next10 !== next5) options.add(next10);
    if (next20 > exact && next20 !== next10) options.add(next20);
    if (next50 > exact && next50 !== next20) options.add(next50);
    options.add(100);

    return Array.from(options)
      .filter((o) => o >= exact)
      .slice(0, 5);
  }, [totalAmount]);

  const cashChangeDue = useMemo(() => {
    const paid = parseFloat(cashPaidText) || 0;
    if (paid < totalAmount) return 0;
    return Number((paid - totalAmount).toFixed(2));
  }, [cashPaidText, totalAmount]);

  // Functional updates so rapid clicks / scans never race on a stale cart.
  const addToCart = useCallback((product: Product) => {
    if (product.stock <= 0) return;
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const updateCartQty = (productId: string, delta: number) => {
    setCart(
      (prev) =>
        prev
          .map((item) => {
            if (item.product.id === productId) {
              const newQty = item.quantity + delta;
              if (newQty <= 0) return null;
              if (newQty > item.product.stock) return item;
              return { ...item, quantity: newQty };
            }
            return item;
          })
          .filter(Boolean) as Array<{ product: Product; quantity: number }>,
    );
  };

  const removeFromCart = (productId: string) =>
    setCart((prev) => prev.filter((item) => item.product.id !== productId));

  const clearCart = () => {
    setCart([]);
    setSelectedCustomerId(null);
    setDiscountType('none');
    setDiscountInput('');
    setLoyaltyPointsToUse(0);
    setShowPromoInput(false);
  };

  // Barcode scan: match a product by exact SKU and add it, with brief feedback.
  const handleScan = useCallback(
    (code: string) => {
      const norm = code.trim().toLowerCase();
      const product = useProductStore.getState().products.find((p) => p.sku.toLowerCase() === norm);
      if (!product) {
        setScanFeedback({ ok: false, text: t('register.scanNotFound', { code }) });
      } else if (product.stock <= 0) {
        setScanFeedback({ ok: false, text: `${product.name} — ${t('register.outOfStock')}` });
      } else {
        addToCart(product);
        setScanFeedback({ ok: true, text: product.name });
      }
    },
    [addToCart, t],
  );

  useBarcodeScanner({
    onScan: handleScan,
    enabled: !checkoutModalOpen && !addCustomerOpen && !receiptModalOpen && !heldModalOpen,
  });

  useEffect(() => {
    if (!scanFeedback) return;
    const timer = setTimeout(() => setScanFeedback(null), 1800);
    return () => clearTimeout(timer);
  }, [scanFeedback]);

  const handleHoldOrder = () => {
    if (cart.length === 0) return;
    const label = window
      .prompt(t('register.holdLabelPrompt'), new Date().toLocaleTimeString())
      ?.trim();
    if (label === undefined || label === null) return; // cancelled
    holdOrder({
      label: label || new Date().toLocaleTimeString(),
      items: cart.map((i) => ({
        productId: i.product.id,
        productName: i.product.name,
        price: i.product.price,
        cost: i.product.cost,
        quantity: i.quantity,
      })),
      customerId: selectedCustomerId,
      discountType,
      discountInput,
      loyaltyPointsToUse,
      operatorName: currentUser?.name ?? null,
    });
    clearCart();
  };

  const resumeHeldOrder = (order: HeldOrder) => {
    if (cart.length > 0 && !window.confirm(t('register.resumeReplaceWarning'))) return;
    // Rebuild the cart from the current catalog so prices/stock are live; drop
    // any line whose product no longer exists.
    const liveProducts = useProductStore.getState().products;
    const rebuilt = order.items
      .map((i) => {
        const product = liveProducts.find((p) => p.id === i.productId);
        return product ? { product, quantity: Math.min(i.quantity, product.stock) } : null;
      })
      .filter((x): x is { product: Product; quantity: number } => x !== null && x.quantity > 0);
    setCart(rebuilt);
    setSelectedCustomerId(order.customerId);
    setDiscountType(order.discountType);
    setDiscountInput(order.discountInput);
    setLoyaltyPointsToUse(order.loyaltyPointsToUse);
    setShowPromoInput(false);
    removeHeldOrder(order.id);
    setHeldModalOpen(false);
  };

  const handleAddNewCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) return;
    const newCust = handleAddCustomer(custName, custPhone, custEmail);
    setSelectedCustomerId(newCust.id);
    setCustName('');
    setCustPhone('');
    setCustEmail('');
    setAddCustomerOpen(false);
  };

  const handleCheckoutClick = () => {
    if (cart.length === 0) return;
    setPaymentMethod('card');
    setCashPaidText('');
    setSplitMode(false);
    setSplitPayments([]);
    setCheckoutModalOpen(true);
  };

  const splitPaidTotal = useMemo(
    () => splitPayments.reduce((s, p) => s + (p.amount || 0), 0),
    [splitPayments],
  );
  const splitRemaining = Number((totalAmount - splitPaidTotal).toFixed(2));

  const addSplitPayment = () => {
    const remaining = Math.max(0, splitRemaining);
    setSplitPayments((prev) => [...prev, { method: 'cash', amount: Number(remaining.toFixed(2)) }]);
  };
  const updateSplitPayment = (idx: number, patch: Partial<Payment>) =>
    setSplitPayments((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  const removeSplitPayment = (idx: number) =>
    setSplitPayments((prev) => prev.filter((_, i) => i !== idx));

  const handleCompletePayment = () => {
    const req: CheckoutRequest = {
      cartItems,
      subtotal,
      discountType,
      discountValue,
      discountAmount,
      taxAmount,
      totalAmount,
      paymentMethod,
      splitMode,
      splitPayments,
      cashPaidText,
      cashChangeDue,
      selectedCustomerId,
      activeCustomerName: activeCustomer?.name || null,
      currentUser,
      currentShiftId,
      settings,
    };

    const outcome = buildSaleTransaction(req);
    if (!outcome.success) {
      if (outcome.error === 'split-incomplete') alert(t('register.splitIncomplete'));
      else if (outcome.error === 'split-non-cash-overpay') alert(t('register.splitNonCashOverpay'));
      else if (outcome.error === 'insufficient-cash') alert(t('register.insufficientCash'));
      return;
    }

    const { transaction, pointsDelta } = outcome;
    const saleMethod = transaction.paymentMethod;
    const payments = transaction.payments;

    // Decrement stock on the LIVE product records. The cart holds snapshots
    // from add-to-cart time; writing those back would silently revert any
    // price/name/stock edit made while the sale was open.
    const liveProducts = useProductStore.getState().products;
    const updatedProducts: Product[] = [];
    cart.forEach((item) => {
      const live = liveProducts.find((p) => p.id === item.product.id);
      if (!live) return; // product deleted mid-sale; nothing to decrement
      const updated = { ...live, stock: Math.max(0, live.stock - item.quantity) };
      handleUpdateProduct(updated);
      updatedProducts.push(updated);
    });

    // Update customer points
    let updatedCustomer = null;
    if (selectedCustomerId) {
      updateCustomerPoints(selectedCustomerId, pointsDelta);
      updatedCustomer = useCustomerStore
        .getState()
        .customers.find((c) => c.id === selectedCustomerId);
    }

    addTransaction(transaction);
    syncToCloudIfEnabled(
      updatedProducts,
      undefined,
      updatedCustomer ? [updatedCustomer] : undefined,
      [transaction],
    );

    setActiveReceipt(transaction);
    setCheckoutModalOpen(false);
    setReceiptModalOpen(true);
    clearCart();

    const isCashSale =
      saleMethod === 'cash' || (payments?.some((p) => p.method === 'cash') ?? false);

    if (printerConfig.autoPrintOnCheckout) {
      printReceipt(transaction, settings, printerConfig, isCashSale).then(notifyPrint);
    } else if (isCashSale) {
      openCashDrawer(printerConfig);
    }
  };

  const notifyPrint = (outcome: HardwarePrintOutcome) => {
    if (outcome === 'popup-blocked') alert(t('history.standardPrintBlocked'));
    else if (outcome === 'unsupported')
      alert(t('print.unsupported', { type: printerConfig.type.toUpperCase() }));
    else if (outcome === 'no-device') alert(t('print.noDevice'));
    else if (outcome === 'error') alert(t('print.error'));
  };

  const handlePrintActiveReceipt = async () => {
    if (!activeReceipt) return;
    notifyPrint(await printReceipt(activeReceipt, settings, printerConfig, false));
  };

  return (
    <div
      id="register-root"
      className="flex flex-1 h-full overflow-hidden"
      style={{ background: '#020617' }}
    >
      <ProductGrid
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        cart={cart}
        addToCart={addToCart}
      />
      <CartPanel
        cart={cart}
        updateCartQty={updateCartQty}
        removeFromCart={removeFromCart}
        clearCart={clearCart}
        activeCustomer={activeCustomer}
        selectedCustomerId={selectedCustomerId}
        setSelectedCustomerId={setSelectedCustomerId}
        setAddCustomerOpen={setAddCustomerOpen}
        discountType={discountType}
        setDiscountType={setDiscountType}
        discountInput={discountInput}
        setDiscountInput={setDiscountInput}
        loyaltyPointsToUse={loyaltyPointsToUse}
        setLoyaltyPointsToUse={setLoyaltyPointsToUse}
        showPromoInput={showPromoInput}
        setShowPromoInput={setShowPromoInput}
        subtotal={subtotal}
        discountAmount={discountAmount}
        taxAmount={taxAmount}
        totalAmount={totalAmount}
        handleCheckoutClick={handleCheckoutClick}
        onHoldOrder={handleHoldOrder}
        heldCount={heldOrders.length}
        onOpenHeldOrders={() => setHeldModalOpen(true)}
      />

      {/* Barcode scan feedback toast */}
      <AnimatePresence>
        {scanFeedback && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] ring-1 ring-black/5 text-sm font-semibold tracking-wide ${
              scanFeedback.ok ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
            }`}
          >
            <ScanLine size={18} className="opacity-90" />
            <span>{scanFeedback.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Held orders modal */}
      <AnimatePresence>
        {heldModalOpen && (
          <div
            id="held-orders-modal"
            className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 24 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className="modal-card max-w-md w-full overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-5 flex justify-between items-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <h3 className="font-sans font-bold text-white text-base flex items-center gap-2.5">
                  <div className="p-1.5 bg-amber-500/15 rounded-xl text-amber-400">
                    <Clock size={16} />
                  </div>
                  {t('register.heldOrders')}
                  <span className="badge badge-amber ms-1">{heldOrders.length}</span>
                </h3>
                <button
                  onClick={() => setHeldModalOpen(false)}
                  aria-label="Close"
                  className="p-1.5 text-slate-500 hover:text-white hover:bg-white/8 rounded-xl transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-4 overflow-y-auto space-y-2.5">
                {heldOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                    <PauseCircle size={36} className="opacity-20 mb-3" />
                    <p className="font-mono text-xs">{t('register.noHeldOrders')}</p>
                  </div>
                ) : (
                  heldOrders.map((order) => {
                    const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
                    const orderTotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
                    return (
                      <div
                        key={order.id}
                        className="group flex items-center justify-between gap-3 rounded-2xl p-3.5 transition-all"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-sans font-bold text-slate-100 text-sm truncate">
                            {order.label}
                          </p>
                          <p className="text-[10px] font-mono text-slate-500 mt-1">
                            {itemCount} {t('register.itemsLower')}{' '}
                            <span className="mx-1.5 opacity-40">•</span>
                            {settings.currency}{orderTotal.toFixed(2)}
                            {order.operatorName && (
                              <><span className="mx-1.5 opacity-40">•</span>{order.operatorName}</>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => resumeHeldOrder(order)}
                            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-colors"
                            style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)' }}
                          >
                            <Play size={12} className="fill-current" /> {t('register.resume')}
                          </button>
                          <button
                            onClick={() => removeHeldOrder(order.id)}
                            aria-label={t('register.deleteHeld')}
                            className="p-1.5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {checkoutModalOpen && (
          <div
            id="payment-modal"
            className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 28 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 28 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
              className="modal-card max-w-lg w-full overflow-hidden flex flex-col"
            >
              <div className="p-5 flex justify-between items-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div>
                  <h3 className="font-sans font-bold text-white text-lg">
                    {t('register.selectPaymentMethod')}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-1 flex items-center gap-2">
                    {t('register.amountToPay')}
                    <span className="font-bold text-xl text-emerald-400 tracking-tight font-mono">
                      {settings.currency}{totalAmount.toFixed(2)}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => setCheckoutModalOpen(false)}
                  aria-label="Close"
                  className="p-1.5 text-slate-500 hover:text-white hover:bg-white/8 rounded-xl transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 space-y-5">
                <button
                  id="split-toggle-btn"
                  onClick={() => {
                    setSplitMode((m) => !m);
                    if (!splitMode && splitPayments.length === 0) {
                      setSplitPayments([
                        { method: 'cash', amount: Number(Math.max(0, totalAmount).toFixed(2)) },
                      ]);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: splitMode ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)',
                    border: splitMode ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.08)',
                    color: splitMode ? '#34d399' : '#64748b',
                  }}
                >
                  <CreditCard size={14} />
                  {splitMode ? t('register.singlePayment') : t('register.splitPayment')}
                </button>

                {!splitMode && (
                  <div className="grid grid-cols-4 gap-2.5">
                    {(
                      [
                        { id: 'card', label: t('register.payCard'), icon: CreditCard, activeClass: 'active-card' },
                        { id: 'cash', label: t('register.payCash'), icon: DollarSign, activeClass: 'active-cash' },
                        { id: 'mobile', label: t('register.payMobile'), icon: Smartphone, activeClass: 'active-mobile' },
                        { id: 'gift', label: t('register.payGift'), icon: Gift, activeClass: 'active-gift' },
                      ] as const
                    ).map((m) => {
                      const MIcon = m.icon;
                      const isSel = paymentMethod === m.id;
                      return (
                        <motion.button
                          key={m.id}
                          id={`pay-method-${m.id}`}
                          onClick={() => setPaymentMethod(m.id)}
                          whileTap={{ scale: 0.93 }}
                          className={`pay-method-btn ${isSel ? m.activeClass : ''}`}
                        >
                          <MIcon size={20} />
                          <span>{m.label}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {splitMode && (
                  <div className="space-y-2.5">
                    {splitPayments.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="flex-1 flex items-center rounded-xl overflow-hidden transition-all"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
                          <select
                            value={p.method}
                            onChange={(e) => updateSplitPayment(idx, { method: e.target.value as PaymentMethod })}
                            className="bg-transparent text-xs font-semibold ps-3 pe-7 py-3 text-slate-300 focus:outline-none cursor-pointer"
                            style={{ borderRight: '1px solid rgba(255,255,255,0.08)' }}
                          >
                            <option value="cash">{t('register.payCash')}</option>
                            <option value="card">{t('register.payCard')}</option>
                            <option value="mobile">{t('register.payMobile')}</option>
                            <option value="gift">{t('register.payGift')}</option>
                          </select>
                          <div className="flex-1 flex items-center px-3">
                            <span className="font-mono text-slate-500 font-bold text-sm">{settings.currency}</span>
                            <input
                              type="number" step="0.01" min="0"
                              value={p.amount || ''}
                              onChange={(e) => updateSplitPayment(idx, { amount: parseFloat(e.target.value) || 0 })}
                              className="flex-1 bg-transparent text-white text-base font-mono font-bold px-2 py-2.5 focus:outline-none w-full"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => removeSplitPayment(idx)}
                          disabled={splitPayments.length <= 1}
                          aria-label="Remove payment"
                          className="p-2.5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl disabled:opacity-25 transition-colors"
                          style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={addSplitPayment}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                        style={{ color: '#34d399', border: '1px dashed rgba(16,185,129,0.35)' }}
                      >
                        + {t('register.addPayment')}
                      </button>
                      <span
                        className={`text-xs font-mono font-bold px-3 py-1.5 rounded-lg badge ${
                          Math.abs(splitRemaining) < 0.005 ? 'badge-emerald' : 'badge-amber'
                        }`}
                      >
                        {splitRemaining > 0.005
                          ? `${t('register.remaining')}: ${settings.currency}${splitRemaining.toFixed(2)}`
                          : splitRemaining < -0.005
                            ? `${t('register.changeDue')}: ${settings.currency}${Math.abs(splitRemaining).toFixed(2)}`
                            : t('register.splitBalanced')}
                      </span>
                    </div>
                  </div>
                )}

                <AnimatePresence mode="wait">
                  {!splitMode && paymentMethod === 'cash' && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-4 pt-4 overflow-hidden"
                      style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
                    >
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-2 uppercase tracking-wider">
                          {t('register.quickCashPay')}
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {cashSuggestions.map((val) => (
                            <motion.button
                              key={val}
                              whileTap={{ scale: 0.93 }}
                              onClick={() => setCashPaidText(val.toFixed(2))}
                              className="font-mono text-sm font-bold px-3.5 py-2 rounded-xl transition-all"
                              style={{
                                background: cashPaidText === val.toFixed(2) ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)',
                                border: cashPaidText === val.toFixed(2) ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.09)',
                                color: cashPaidText === val.toFixed(2) ? '#34d399' : '#94a3b8',
                              }}
                            >
                              {settings.currency}{val.toFixed(2)}
                            </motion.button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-600 block mb-1.5 uppercase tracking-wider">
                            {t('register.cashTendered')}
                          </label>
                          <div className="flex items-center rounded-xl overflow-hidden transition-all"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <span className="font-mono text-slate-500 ps-3 font-bold text-sm">{settings.currency}</span>
                            <input
                              type="number" step="0.01" min={totalAmount} placeholder="0.00"
                              value={cashPaidText}
                              onChange={(e) => setCashPaidText(e.target.value)}
                              className="flex-1 bg-transparent text-white text-xl font-mono font-bold px-2 py-2.5 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-600 block mb-1.5 uppercase tracking-wider">
                            {t('register.changeDue')}
                          </label>
                          <div className="rounded-xl px-4 flex items-center justify-between" style={{ height: '48px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
                            <span className="text-emerald-600 text-[10px] font-bold uppercase tracking-wider">{t('register.returnAmount')}</span>
                            <span className="font-mono text-emerald-400 font-bold text-xl">
                              {settings.currency}{cashChangeDue.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="p-4 flex items-center gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <button
                  onClick={() => setCheckoutModalOpen(false)}
                  className="px-5 py-3 rounded-xl text-sm font-bold transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#64748b' }}
                >
                  {t('register.cancel')}
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCompletePayment}
                  disabled={
                    splitMode
                      ? splitPaidTotal < totalAmount - 0.005
                      : paymentMethod === 'cash' && totalAmount > 0 && (parseFloat(cashPaidText) || 0) < totalAmount
                  }
                  className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                  style={{
                    background: 'linear-gradient(135deg, #059669, #10b981)',
                    color: 'white',
                    boxShadow: '0 4px 20px rgba(16,185,129,0.35)',
                  }}
                >
                  <Check size={17} strokeWidth={2.5} />
                  <span>{t('register.completeOrder')}</span>
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addCustomerOpen && (
          <div
            id="add-customer-modal"
            className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 24 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
              className="modal-card max-w-sm w-full p-6 space-y-5"
            >
              <div className="flex justify-between items-center pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <h3 className="font-sans font-bold text-white text-base flex items-center gap-2.5">
                  <div className="p-1.5 rounded-xl" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
                    <UserPlus size={16} />
                  </div>
                  {t('register.newCustomer')}
                </h3>
                <button
                  onClick={() => setAddCustomerOpen(false)}
                  aria-label="Close"
                  className="p-1.5 text-slate-500 hover:text-white hover:bg-white/8 rounded-xl transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleAddNewCustomer} className="space-y-4">
                {[{
                  label: t('register.fullName'), type: 'text', value: custName, onChange: setCustName, placeholder: 'e.g. John Doe', required: true,
                }, {
                  label: t('register.phoneNumber'), type: 'tel', value: custPhone, onChange: setCustPhone, placeholder: 'e.g. 555-0100', required: false,
                }, {
                  label: t('register.emailAddress'), type: 'email', value: custEmail, onChange: setCustEmail, placeholder: 'e.g. john@example.com', required: false,
                }].map(({ label, type, value, onChange, placeholder, required }) => (
                  <div key={label}>
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">{label}</label>
                    <input
                      type={type}
                      required={required}
                      placeholder={placeholder}
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white focus:outline-none transition-all placeholder:text-slate-600"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
                      onFocus={(e) => { e.target.style.borderColor = '#10b981'; e.target.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.12)'; }}
                      onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.09)'; e.target.style.boxShadow = 'none'; }}
                    />
                  </div>
                ))}

                <div className="flex justify-end gap-2.5 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                  <button
                    type="button"
                    onClick={() => setAddCustomerOpen(false)}
                    className="px-5 py-2.5 text-sm font-bold rounded-xl transition-colors"
                    style={{ color: '#64748b', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    {t('register.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 text-sm font-bold text-white rounded-xl transition-all active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #059669, #10b981)', boxShadow: '0 4px 14px rgba(16,185,129,0.3)' }}
                  >
                    {t('register.saveLink')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {receiptModalOpen && activeReceipt && (
          <div
            id="receipt-modal"
            className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.88, opacity: 0, y: 32 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.88, opacity: 0, y: 32 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="max-w-sm w-full overflow-hidden flex flex-col rounded-3xl"
              style={{ background: '#0a0f1e', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 32px 80px rgba(0,0,0,0.8)' }}
            >
              <div className="bg-linear-to-br from-emerald-500 to-emerald-600 text-white p-8 pb-10 text-center flex flex-col items-center relative overflow-hidden">
                {/* Decorative background circle */}
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
                <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-black opacity-10 rounded-full blur-xl"></div>

                <motion.div
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', damping: 12, delay: 0.1 }}
                  className="bg-white/20 p-3 rounded-full text-white shadow-inner mb-4 backdrop-blur-sm z-10"
                >
                  <Check size={36} strokeWidth={3} />
                </motion.div>
                <h3 className="font-sans font-bold text-white text-2xl tracking-tight z-10 mb-1.5">
                  {t('register.paymentSuccessful')}
                </h3>
                <p className="text-emerald-100 text-[11px] uppercase tracking-wider font-bold bg-black/15 px-3.5 py-1 rounded-full z-10 shadow-sm border border-white/10">
                  {t('register.receipt')} {activeReceipt.id}
                </p>
              </div>

              <div className="px-6 pb-6 pt-0 flex-1 overflow-y-auto max-h-105 relative -mt-4 z-20">
                <div
                  id="thermal-receipt"
                  className="bg-white dark:bg-slate-950 border-x border-slate-200 dark:border-slate-800 border-y-[6px] border-y-slate-200 dark:border-y-slate-800 border-dashed rounded-xl p-6 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] space-y-4 font-mono text-xs text-slate-700 dark:text-slate-300"
                >
                  <div className="text-center border-b border-dashed border-slate-300 dark:border-slate-700 pb-4">
                    <div className="flex justify-center mb-3">
                      {settings.storeLogo ? (
                        <img
                          src={settings.storeLogo}
                          alt="Logo"
                          className="h-8 w-auto object-contain grayscale opacity-80 dark:invert"
                        />
                      ) : (
                        <ShoppingBag size={28} className="text-slate-800 dark:text-slate-200" />
                      )}
                    </div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-base uppercase tracking-widest">
                      {settings.storeName}
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-2">{settings.storeAddress}</p>
                    <p className="text-[10px] text-slate-500">{settings.storePhone}</p>
                  </div>

                  <div className="space-y-1.5 text-[10px] border-b border-dashed border-slate-300 dark:border-slate-700 pb-4">
                    <div className="flex justify-between">
                      <span>DATE:</span>
                      <span>{new Date(activeReceipt.date).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('register.receipt').toUpperCase()}:</span>
                      <span>{activeReceipt.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('register.operator')}:</span>
                      <span>{activeReceipt.operatorName || '—'}</span>
                    </div>
                    {activeReceipt.customerName && (
                      <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-bold mt-1">
                        <span>{t('register.member')}:</span>
                        <span>{activeReceipt.customerName}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 border-b border-dashed border-slate-300 dark:border-slate-700 pb-4">
                    {activeReceipt.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start gap-4">
                        <span className="flex-1 pr-2">
                          <span className="opacity-70 mr-1">{item.quantity}x</span>
                          {item.productName}
                        </span>
                        <span className="shrink-0 font-bold">
                          {settings.currency}
                          {item.total.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span>{t('register.subtotal').toUpperCase()}:</span>
                      <span>
                        {settings.currency}
                        {activeReceipt.subtotal.toFixed(2)}
                      </span>
                    </div>
                    {activeReceipt.discount > 0 && (
                      <div className="flex justify-between text-amber-700 dark:text-amber-400">
                        <span>{t('register.discount').toUpperCase()}</span>
                        <span>
                          -{settings.currency}
                          {activeReceipt.discount.toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>{t('register.tax').toUpperCase()}:</span>
                      <span>
                        {settings.currency}
                        {activeReceipt.tax.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-900 dark:text-white font-bold pt-3 border-t border-slate-300 dark:border-slate-700 mt-2 text-sm">
                      <span>{t('register.totalPaid')}:</span>
                      <span>
                        {settings.currency}
                        {activeReceipt.total.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-4 space-y-1.5 text-[10px]">
                    <div className="flex justify-between">
                      <span>{t('register.method')}:</span>
                      <span className="uppercase font-bold">{activeReceipt.paymentMethod}</span>
                    </div>
                    {activeReceipt.paymentMethod === 'cash' && (
                      <>
                        <div className="flex justify-between">
                          <span>{t('register.cashTenderedReceipt')}:</span>
                          <span>
                            {settings.currency}
                            {(activeReceipt.cashPaid || 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-900 dark:text-white font-bold">
                          <span>{t('register.change')}:</span>
                          <span>
                            {settings.currency}
                            {(activeReceipt.cashChange || 0).toFixed(2)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="text-center pt-5 border-t border-dashed border-slate-300 dark:border-slate-700 text-[10px] text-slate-400 dark:text-slate-500">
                    <p className="tracking-widest">{t('register.thankYou')}</p>
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center gap-2">
                  {[{
                    icon: Printer, label: t('register.print'), onClick: handlePrintActiveReceipt,
                  }, {
                    icon: Share2, label: t('register.share'),
                    onClick: async () => { const r = await shareReceipt(activeReceipt, settings); if (r === 'copied') setScanFeedback({ ok: true, text: t('register.copied') }); },
                  }, {
                    icon: Mail, label: t('register.email'),
                    onClick: () => { const email = activeReceipt?.customerId ? customers.find((c) => c.id === activeReceipt.customerId)?.email : undefined; emailReceipt(activeReceipt, settings, email || undefined); },
                  }].map(({ icon: Icon, label, onClick }) => (
                    <button
                      key={label}
                      onClick={onClick}
                      className="flex-1 flex justify-center items-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all group"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#34d399'; e.currentTarget.style.borderColor = 'rgba(16,185,129,0.3)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                    >
                      <Icon size={14} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setReceiptModalOpen(false)}
                  className="w-full py-3.5 rounded-xl text-sm font-bold text-slate-950 transition-all active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #10b981, #34d399)', boxShadow: '0 4px 16px rgba(16,185,129,0.3)' }}
                >
                  {t('register.newSale')}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
