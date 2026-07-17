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
import { shortId } from '../lib/ids';
import { summarizeTenders } from '../lib/payments';
import { printReceipt, HardwarePrintOutcome } from '../lib/hardwarePrint';
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
    setCart((prev) =>
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
      const product = useProductStore
        .getState()
        .products.find((p) => p.sku.toLowerCase() === norm);
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
    let saleMethod: PaymentMethod;
    let payments: Payment[] | undefined;
    let paidValue: number | undefined;
    let changeDue: number | undefined;

    if (splitMode) {
      const clean = splitPayments.filter((p) => (p.amount || 0) > 0);
      const tenders = summarizeTenders(clean, totalAmount);
      if (clean.length === 0 || !tenders.coversTotal) {
        alert(t('register.splitIncomplete'));
        return;
      }
      payments = clean;
      saleMethod = tenders.dominantMethod;
      // cashPaid is the CASH tender only (not the card/mobile lines), so the
      // receipt's "cash paid" and the Z-report drawer math stay correct.
      paidValue = tenders.cashTendered > 0 ? tenders.cashTendered : undefined;
      changeDue = tenders.cashTendered > 0 ? tenders.cashChange : undefined;
    } else {
      paidValue = paymentMethod === 'cash' ? parseFloat(cashPaidText) || 0 : undefined;
      // A fully-discounted ($0) sale needs no tendered cash.
      if (paymentMethod === 'cash' && totalAmount > 0 && (paidValue ?? 0) < totalAmount) {
        alert(t('register.insufficientCash'));
        return;
      }
      // A sale fully covered by redeemed points is a points redemption, not a $0
      // card charge. Any other $0 total (e.g. a 100% promo) keeps its chosen method.
      saleMethod = totalAmount <= 0 && discountType === 'loyalty' ? 'loyalty' : paymentMethod;
      changeDue = saleMethod === 'cash' ? cashChangeDue : undefined;
    }

    // Globally-unique receipt ID: TX-<8 hex>. Avoids the previous TX-{max+1}
    // scheme, which collided when two terminals shared one cloud database.
    const nextId = `TX-${shortId().toUpperCase()}`;

    const pointsEarned = selectedCustomerId
      ? Math.floor(totalAmount * settings.loyaltyPointsRate)
      : undefined;

    const transaction: SaleTransaction = {
      id: nextId,
      date: new Date().toISOString(),
      items: cartItems.map((item) => ({
        ...item,
        total: Number((item.price * item.quantity).toFixed(2)),
      })),
      subtotal,
      discount: discountAmount,
      discountType,
      discountValue,
      tax: taxAmount,
      total: totalAmount,
      paymentMethod: saleMethod,
      payments: payments && payments.length > 1 ? payments : undefined,
      cashPaid: paidValue,
      cashChange: changeDue,
      customerId: selectedCustomerId,
      customerName: activeCustomer?.name || null,
      operatorId: currentUser?.id ?? null,
      operatorName: currentUser?.name ?? null,
      pointsEarned,
      status: 'completed',
      shiftId: currentShiftId,
    };

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
      let pointsDelta = pointsEarned ?? 0;
      if (discountType === 'loyalty') pointsDelta -= discountValue;
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

    if (printerConfig.autoPrintOnCheckout) {
      printReceipt(transaction, settings, printerConfig).then(notifyPrint);
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
    notifyPrint(await printReceipt(activeReceipt, settings, printerConfig));
  };

  return (
    <div
      id="register-root"
      className="flex flex-1 h-full overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-300"
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
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-2xl text-sm font-semibold ${
              scanFeedback.ok
                ? 'bg-emerald-600 text-white'
                : 'bg-rose-600 text-white'
            }`}
          >
            <ScanLine size={16} />
            <span>{scanFeedback.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Held orders modal */}
      <AnimatePresence>
        {heldModalOpen && (
          <div
            id="held-orders-modal"
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 max-h-[80vh]"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                <h3 className="font-sans font-bold text-slate-800 dark:text-white text-lg flex items-center gap-2">
                  <Clock size={20} className="text-emerald-500" />
                  {t('register.heldOrders')} ({heldOrders.length})
                </h3>
                <button
                  onClick={() => setHeldModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-4 overflow-y-auto space-y-2">
                {heldOrders.length === 0 ? (
                  <p className="text-center text-slate-400 font-mono text-xs py-10">
                    {t('register.noHeldOrders')}
                  </p>
                ) : (
                  heldOrders.map((order) => {
                    const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
                    const orderTotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
                    return (
                      <div
                        key={order.id}
                        className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-3"
                      >
                        <div className="min-w-0">
                          <p className="font-sans font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">
                            {order.label}
                          </p>
                          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                            {itemCount} {t('register.itemsLower')} • {settings.currency}
                            {orderTotal.toFixed(2)}
                            {order.operatorName ? ` • ${order.operatorName}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => resumeHeldOrder(order)}
                            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
                          >
                            <Play size={13} /> {t('register.resume')}
                          </button>
                          <button
                            onClick={() => removeHeldOrder(order.id)}
                            className="p-2 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                            title={t('register.deleteHeld')}
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
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                <div>
                  <h3 className="font-sans font-bold text-slate-800 dark:text-white text-lg">
                    {t('register.selectPaymentMethod')}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                    {t('register.amountToPay')}{' '}
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {settings.currency}
                      {totalAmount.toFixed(2)}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => setCheckoutModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-6 space-y-6">
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
                  className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    splitMode
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <CreditCard size={14} />
                  {splitMode ? t('register.singlePayment') : t('register.splitPayment')}
                </button>

                {!splitMode && (
                  <div className="grid grid-cols-4 gap-3">
                    {(
                      [
                        {
                          id: 'card',
                          label: t('register.payCard'),
                        icon: CreditCard,
                        color: 'text-blue-600 dark:text-blue-400',
                        bg: 'bg-blue-50 dark:bg-blue-900/20',
                      },
                      {
                        id: 'cash',
                        label: t('register.payCash'),
                        icon: DollarSign,
                        color: 'text-emerald-600 dark:text-emerald-400',
                        bg: 'bg-emerald-50 dark:bg-emerald-900/20',
                      },
                      {
                        id: 'mobile',
                        label: t('register.payMobile'),
                        icon: Smartphone,
                        color: 'text-purple-600 dark:text-purple-400',
                        bg: 'bg-purple-50 dark:bg-purple-900/20',
                      },
                      {
                        id: 'gift',
                        label: t('register.payGift'),
                        icon: Gift,
                        color: 'text-amber-600 dark:text-amber-400',
                        bg: 'bg-amber-50 dark:bg-amber-900/20',
                      },
                    ] as const
                  ).map((m) => {
                    const MIcon = m.icon;
                    const isSel = paymentMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        id={`pay-method-${m.id}`}
                        onClick={() => setPaymentMethod(m.id)}
                        className={`flex flex-col items-center justify-center p-4 rounded-2xl border text-center transition-all duration-200 ${
                          isSel
                            ? 'border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transform scale-105'
                            : `border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 ${m.bg} ${m.color}`
                        }`}
                      >
                        <MIcon size={24} className={isSel ? 'text-white' : m.color} />
                        <span
                          className={`text-xs font-semibold mt-2 ${isSel ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}
                        >
                          {m.label}
                        </span>
                      </button>
                    );
                  })}
                  </div>
                )}

                {splitMode && (
                  <div className="space-y-3">
                    {splitPayments.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={p.method}
                          onChange={(e) =>
                            updateSplitPayment(idx, { method: e.target.value as PaymentMethod })
                          }
                          className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold px-2 py-2 text-slate-700 dark:text-slate-200 focus:outline-none"
                        >
                          <option value="cash">{t('register.payCash')}</option>
                          <option value="card">{t('register.payCard')}</option>
                          <option value="mobile">{t('register.payMobile')}</option>
                          <option value="gift">{t('register.payGift')}</option>
                        </select>
                        <div className="flex-1 flex items-center border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 px-2">
                          <span className="font-mono text-slate-400 text-sm">
                            {settings.currency}
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={p.amount || ''}
                            onChange={(e) =>
                              updateSplitPayment(idx, { amount: parseFloat(e.target.value) || 0 })
                            }
                            className="flex-1 bg-transparent border-none text-slate-800 dark:text-slate-100 text-sm font-mono px-1 py-2 focus:outline-none w-full"
                          />
                        </div>
                        <button
                          onClick={() => removeSplitPayment(idx)}
                          disabled={splitPayments.length <= 1}
                          className="p-2 text-slate-400 hover:text-rose-500 disabled:opacity-30"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={addSplitPayment}
                        className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        + {t('register.addPayment')}
                      </button>
                      <span
                        className={`text-xs font-mono font-bold ${
                          Math.abs(splitRemaining) < 0.005
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
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
                      className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800 overflow-hidden"
                    >
                      <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2 font-mono uppercase tracking-wider">
                          {t('register.quickCashPay')}
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {cashSuggestions.map((val) => (
                            <button
                              key={val}
                              onClick={() => setCashPaidText(val.toFixed(2))}
                              className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all shadow-sm"
                            >
                              {settings.currency}
                              {val.toFixed(2)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">
                            {t('register.cashTendered')} ({settings.currency})
                          </label>
                          <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-xl p-1 bg-slate-50 dark:bg-slate-950 shadow-inner">
                            <span className="font-mono text-slate-400 dark:text-slate-500 ps-3 font-bold">
                              {settings.currency}
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min={totalAmount}
                              placeholder="0.00"
                              value={cashPaidText}
                              onChange={(e) => setCashPaidText(e.target.value)}
                              className="flex-1 bg-transparent border-none text-slate-800 dark:text-slate-100 text-lg font-mono font-bold px-2 py-1 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">
                            {t('register.changeDue')}
                          </label>
                          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2 flex items-center justify-between h-[46px]">
                            <span className="text-emerald-800 dark:text-emerald-400 text-xs font-semibold uppercase font-mono">
                              {t('register.returnAmount')}
                            </span>
                            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold text-lg">
                              {settings.currency}
                              {cashChangeDue.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
                <button
                  onClick={() => setCheckoutModalOpen(false)}
                  className="px-6 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
                >
                  {t('register.cancel')}
                </button>
                <button
                  onClick={handleCompletePayment}
                  disabled={
                    splitMode
                      ? splitPaidTotal < totalAmount - 0.005
                      : paymentMethod === 'cash' &&
                        totalAmount > 0 &&
                        (parseFloat(cashPaidText) || 0) < totalAmount
                  }
                  className="px-8 py-3 bg-linear-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:from-slate-400 disabled:to-slate-400 text-white font-sans font-bold text-sm rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition-all transform active:scale-95"
                >
                  <Check size={18} />
                  <span>{t('register.completeOrder')}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addCustomerOpen && (
          <div
            id="add-customer-modal"
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-sans font-bold text-slate-800 dark:text-white text-lg flex items-center gap-2">
                  <UserPlus size={20} className="text-emerald-500" />
                  {t('register.newCustomer')}
                </h3>
                <button
                  onClick={() => setAddCustomerOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-full transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleAddNewCustomer} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    {t('register.fullName')}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. John Doe"
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-inner"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    {t('register.phoneNumber')}
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 555-0100"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-inner"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    {t('register.emailAddress')}
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. john@example.com"
                    value={custEmail}
                    onChange={(e) => setCustEmail(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-inner"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setAddCustomerOpen(false)}
                    className="px-5 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                  >
                    {t('register.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/20 transition-all transform active:scale-95"
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
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800"
            >
              <div className="bg-linear-to-br from-emerald-500 to-emerald-600 text-white p-8 text-center space-y-3 flex flex-col items-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 15 }}
                  className="bg-white/20 p-3 rounded-full text-white shadow-inner mb-2"
                >
                  <Check size={32} className="stroke-3" />
                </motion.div>
                <h3 className="font-sans font-bold text-white text-xl tracking-tight">
                  {t('register.paymentSuccessful')}
                </h3>
                <p className="text-emerald-100 text-sm font-mono bg-black/10 px-3 py-1 rounded-full">
                  {t('register.receipt')} {activeReceipt.id}
                </p>
              </div>

              <div className="p-6 flex-1 overflow-y-auto max-h-[380px] bg-slate-50 dark:bg-slate-950">
                <div
                  id="thermal-receipt"
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4 font-mono text-xs text-slate-700 dark:text-slate-300"
                >
                  <div className="text-center border-b border-dashed border-slate-300 dark:border-slate-700 pb-4">
                    <div className="flex justify-center mb-3">
                      {settings.storeLogo ? (
                        <img
                          src={settings.storeLogo}
                          alt="Logo"
                          className="h-[28px] w-auto object-contain"
                        />
                      ) : (
                        <ShoppingBag size={28} className="text-slate-800 dark:text-slate-200" />
                      )}
                    </div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-base uppercase tracking-widest">
                      {settings.storeName}
                    </h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">
                      {settings.storeAddress}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {settings.storePhone}
                    </p>
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
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold mt-1">
                        <span>{t('register.member')}:</span>
                        <span>{activeReceipt.customerName}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 border-b border-dashed border-slate-300 dark:border-slate-700 pb-4">
                    {activeReceipt.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span className="truncate max-w-[160px]">
                          {item.quantity}x {item.productName}
                        </span>
                        <span>
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
                      <div className="flex justify-between text-amber-600 dark:text-amber-400">
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
                    <div className="flex justify-between text-slate-900 dark:text-white font-bold pt-2 border-t border-slate-200 dark:border-slate-800 mt-2 text-sm">
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

                  <div className="text-center pt-4 border-t border-dashed border-slate-300 dark:border-slate-700 text-[10px] text-slate-400 dark:text-slate-500">
                    <p>{t('register.thankYou')}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrintActiveReceipt}
                    className="flex-1 flex justify-center items-center gap-2 px-3 py-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors shadow-sm"
                  >
                    <Printer size={15} />
                    <span>{t('register.print')}</span>
                  </button>
                  <button
                    onClick={async () => {
                      const r = await shareReceipt(activeReceipt, settings);
                      if (r === 'copied') setScanFeedback({ ok: true, text: t('register.copied') });
                    }}
                    className="flex-1 flex justify-center items-center gap-2 px-3 py-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors shadow-sm"
                  >
                    <Share2 size={15} />
                    <span>{t('register.share')}</span>
                  </button>
                  <button
                    onClick={() =>
                      emailReceipt(activeReceipt, settings, activeCustomer?.email || undefined)
                    }
                    className="flex-1 flex justify-center items-center gap-2 px-3 py-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors shadow-sm"
                  >
                    <Mail size={15} />
                    <span>{t('register.email')}</span>
                  </button>
                </div>
                <button
                  onClick={() => setReceiptModalOpen(false)}
                  className="w-full px-4 py-3 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 rounded-xl text-sm font-bold shadow-md shadow-slate-900/10 transition-colors"
                >
                  {t('register.newSale')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
