import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  CreditCard,
  DollarSign,
  Smartphone,
  Gift,
  Check,
  X,
  Printer,
  ScanLine,
  Share2,
  Mail,
  ChefHat,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, SaleTransaction, HeldOrder, Payment, PaymentMethod } from '../types';
import ProductGrid from './ProductGrid';
import CartPanel from './CartPanel';
import { HeldOrdersModal } from './register/HeldOrdersModal';
import { AddCustomerModal } from './register/AddCustomerModal';
import { ReceiptModal } from './register/ReceiptModal';
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
import {
  printReceipt,
  printKitchenTickets,
  openCashDrawer,
  HardwarePrintOutcome,
} from '../lib/hardwarePrint';
import { shareReceipt, emailReceipt } from '../lib/digitalReceipt';
import { useBarcodeScanner } from '../lib/useBarcodeScanner';
import { useModalA11y } from '../lib/useModalA11y';
import { useTranslation } from 'react-i18next';

export default function Register() {
  const { t } = useTranslation();
  const handleUpdateProduct = useProductStore((s) => s.handleUpdateProduct);
  const customers = useCustomerStore((s) => s.customers);
  const handleAddCustomer = useCustomerStore((s) => s.handleAddCustomer);
  const updateCustomerPoints = useCustomerStore((s) => s.updateCustomerPoints);
  const settings = useSettingsStore((s) => s.settings);
  const printerConfig = useSettingsStore((s) => s.printerConfig);
  const scannerConfig = useSettingsStore((s) => s.scannerConfig);
  const emailTemplate = useSettingsStore((s) => s.emailTemplate);
  const kitchenStations = useSettingsStore((s) => s.kitchenStations);
  const receiptLayout = useSettingsStore((s) => s.receiptLayout);
  const kitchenLayout = useSettingsStore((s) => s.kitchenLayout);
  const addTransaction = useTransactionStore((s) => s.addTransaction);
  const currentUser = useAuthStore((s) => s.currentUser);
  const heldOrders = useHeldOrderStore((s) => s.heldOrders);
  const holdOrder = useHeldOrderStore((s) => s.holdOrder);
  const removeHeldOrder = useHeldOrderStore((s) => s.removeHeldOrder);
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

  // Auto-close receipt modal if auto-printing is enabled
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (receiptModalOpen && printerConfig.autoPrintOnCheckout) {
      timer = setTimeout(() => {
        setReceiptModalOpen(false);
      }, 3000);
    }
    return () => clearTimeout(timer);
  }, [receiptModalOpen, printerConfig.autoPrintOnCheckout]);

  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custEmail, setCustEmail] = useState('');

  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'mobile' | 'gift'>('card');
  const [cashPaidText, setCashPaidText] = useState<string>('');

  const [splitMode, setSplitMode] = useState(false);
  const [splitPayments, setSplitPayments] = useState<Payment[]>([]);

  const [heldModalOpen, setHeldModalOpen] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const heldModalRef = useModalA11y(heldModalOpen, () => setHeldModalOpen(false));
  const checkoutModalRef = useModalA11y(checkoutModalOpen, () => setCheckoutModalOpen(false));
  const addCustomerModalRef = useModalA11y(addCustomerOpen, () => setAddCustomerOpen(false));
  const receiptModalRef = useModalA11y(receiptModalOpen, () => setReceiptModalOpen(false));

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
      const existingIndex = prev.findIndex((item) => item.product.id === product.id);
      if (existingIndex >= 0) {
        const existing = prev[existingIndex];
        if (existing.quantity >= product.stock) return prev;
        const newCart = [...prev];
        newCart[existingIndex] = { ...existing, quantity: existing.quantity + 1 };
        return newCart;
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const updateCartQty = useCallback((productId: string, delta: number) => {
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
  }, []);

  const removeFromCart = useCallback(
    (productId: string) => setCart((prev) => prev.filter((item) => item.product.id !== productId)),
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
    enabled:
      scannerConfig.enabled &&
      !checkoutModalOpen &&
      !addCustomerOpen &&
      !receiptModalOpen &&
      !heldModalOpen,
    minLength: scannerConfig.minLength,
    maxInterKeyMs: scannerConfig.maxInterKeyMs,
  });

  useEffect(() => {
    if (!scanFeedback) return;
    const timer = setTimeout(() => setScanFeedback(null), 1800);
    return () => clearTimeout(timer);
  }, [scanFeedback]);

  const handleHoldOrder = useCallback(() => {
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
  }, [
    cart,
    selectedCustomerId,
    discountType,
    discountInput,
    loyaltyPointsToUse,
    currentUser,
    holdOrder,
    clearCart,
    t,
  ]);

  const resumeHeldOrder = useCallback(
    (order: HeldOrder) => {
      if (cart.length > 0 && !window.confirm(t('register.resumeReplaceWarning'))) return;
      // Rebuild the cart from the current catalog so prices/stock are live; drop
      // any line whose product no longer exists.
      const liveProducts = useProductStore.getState().products;
      const liveMap = new Map(liveProducts.map((p) => [p.id, p]));
      const rebuilt = order.items
        .map((i) => {
          const product = liveMap.get(i.productId);
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
    },
    [cart, removeHeldOrder, t],
  );

  const handleAddNewCustomer = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!custName.trim()) return;
      const newCust = handleAddCustomer(custName, custPhone, custEmail);
      setSelectedCustomerId(newCust.id);
      setCustName('');
      setCustPhone('');
      setCustEmail('');
      setAddCustomerOpen(false);
    },
    [custName, custPhone, custEmail, handleAddCustomer],
  );

  const handleCheckoutClick = useCallback(() => {
    if (cart.length === 0) return;
    setPaymentMethod('card');
    setCashPaidText('');
    setSplitMode(false);
    setSplitPayments([]);
    setCheckoutModalOpen(true);
  }, [cart]);

  const splitPaidTotal = useMemo(
    () => splitPayments.reduce((s, p) => s + (p.amount || 0), 0),
    [splitPayments],
  );
  const splitRemaining = Number((totalAmount - splitPaidTotal).toFixed(2));

  const addSplitPayment = useCallback(() => {
    const remaining = Math.max(0, splitRemaining);
    setSplitPayments((prev) => [...prev, { method: 'cash', amount: Number(remaining.toFixed(2)) }]);
  }, [splitRemaining]);
  const updateSplitPayment = useCallback(
    (idx: number, patch: Partial<Payment>) =>
      setSplitPayments((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p))),
    [],
  );
  const removeSplitPayment = useCallback(
    (idx: number) => setSplitPayments((prev) => prev.filter((_, i) => i !== idx)),
    [],
  );

  const notifyPrint = useCallback(
    (outcome: HardwarePrintOutcome) => {
      if (outcome === 'popup-blocked') alert(t('history.standardPrintBlocked'));
      else if (outcome === 'unsupported')
        alert(t('print.unsupported', { type: printerConfig.type.toUpperCase() }));
      else if (outcome === 'no-device') alert(t('print.noDevice'));
      else if (outcome === 'error') alert(t('print.error'));
    },
    [t, printerConfig],
  );

  const handleCompletePayment = useCallback(() => {
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
    const liveMap = new Map(liveProducts.map((p) => [p.id, p]));
    const updatedProducts: Product[] = [];
    cart.forEach((item) => {
      const live = liveMap.get(item.product.id);
      if (!live) return; // product deleted mid-sale; nothing to decrement
      const updated = { ...live, stock: Math.max(0, live.stock - item.quantity) };
      handleUpdateProduct(updated);
      updatedProducts.push(updated);
    });

    // Update customer points
    let updatedCustomer = null;
    if (selectedCustomerId) {
      updateCustomerPoints(selectedCustomerId, pointsDelta);
      const customerState = useCustomerStore.getState().customers;
      const custMap = new Map(customerState.map((c) => [c.id, c]));
      updatedCustomer = custMap.get(selectedCustomerId) || null;
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
      printReceipt(transaction, settings, printerConfig, isCashSale, receiptLayout).then(
        notifyPrint,
      );
    } else if (isCashSale) {
      openCashDrawer(printerConfig);
    }
    if (printerConfig.kitchenTicketOnCheckout) {
      /*
        ⚡ Bolt Optimization:
        Pre-computed product map to change O(N^2) category lookups in the kitchen
        ticket loop into O(N) map build + O(1) loop lookups.
      */
      const products = useProductStore.getState().products;
      const prodMap = new Map(products.map((p) => [p.id, p]));
      const catOf = (productId: string) => prodMap.get(productId)?.category;
      printKitchenTickets(
        transaction,
        settings,
        printerConfig,
        kitchenStations,
        catOf,
        kitchenLayout,
      ).then(notifyPrint);
    }
  }, [
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
    activeCustomer,
    currentUser,
    currentShiftId,
    settings,
    cart,
    handleUpdateProduct,
    updateCustomerPoints,
    addTransaction,
    printerConfig,
    kitchenStations,
    receiptLayout,
    kitchenLayout,
    clearCart,
    t,
    notifyPrint,
  ]);

  const handlePrintActiveReceipt = useCallback(async () => {
    if (!activeReceipt) return;
    notifyPrint(await printReceipt(activeReceipt, settings, printerConfig, false, receiptLayout));
  }, [activeReceipt, settings, printerConfig, receiptLayout, notifyPrint]);

  const handlePrintKitchenTicket = useCallback(async () => {
    if (!activeReceipt) return;
    /*
      ⚡ Bolt Optimization:
      Pre-computed product map to change O(N^2) category lookups in the kitchen
      ticket loop into O(N) map build + O(1) loop lookups.
    */
    const products = useProductStore.getState().products;
    const prodMap = new Map(products.map((p) => [p.id, p]));
    const catOf = (productId: string) => prodMap.get(productId)?.category;
    notifyPrint(
      await printKitchenTickets(
        activeReceipt,
        settings,
        printerConfig,
        kitchenStations,
        catOf,
        kitchenLayout,
      ),
    );
  }, [activeReceipt, settings, printerConfig, kitchenStations, kitchenLayout, notifyPrint]);

  const paymentMethodsArray = useMemo(
    () =>
      [
        { id: 'card', label: t('register.payCard'), icon: CreditCard, activeClass: 'active-card' },
        { id: 'cash', label: t('register.payCash'), icon: DollarSign, activeClass: 'active-cash' },
        {
          id: 'mobile',
          label: t('register.payMobile'),
          icon: Smartphone,
          activeClass: 'active-mobile',
        },
        { id: 'gift', label: t('register.payGift'), icon: Gift, activeClass: 'active-gift' },
      ] as const,
    [t],
  );

  const addCustomerFieldsArray = useMemo(
    () => [
      {
        label: t('register.fullName'),
        type: 'text',
        value: custName,
        onChange: setCustName,
        placeholder: 'e.g. John Doe',
        required: true,
      },
      {
        label: t('register.phoneNumber'),
        type: 'tel',
        value: custPhone,
        onChange: setCustPhone,
        placeholder: 'e.g. 555-0100',
        required: false,
      },
      {
        label: t('register.emailAddress'),
        type: 'email',
        value: custEmail,
        onChange: setCustEmail,
        placeholder: 'e.g. john@example.com',
        required: false,
      },
    ],
    [t, custName, custPhone, custEmail],
  );

  const receiptActionsArray = useMemo(
    () => [
      { icon: Printer, label: t('register.print'), onClick: handlePrintActiveReceipt },
      { icon: ChefHat, label: t('register.kitchen'), onClick: handlePrintKitchenTicket },
      {
        icon: Share2,
        label: t('register.share'),
        onClick: async () => {
          if (!activeReceipt) return;
          const r = await shareReceipt(activeReceipt, settings);
          if (r === 'copied') setScanFeedback({ ok: true, text: t('register.copied') });
        },
      },
      {
        icon: Mail,
        label: t('register.email'),
        onClick: () => {
          if (!activeReceipt) return;
          const email = activeReceipt.customerId
            ? customers.find((c) => c.id === activeReceipt.customerId)?.email
            : undefined;
          emailReceipt(activeReceipt, settings, email || undefined, emailTemplate);
        },
      },
    ],
    [
      t,
      handlePrintActiveReceipt,
      handlePrintKitchenTicket,
      activeReceipt,
      settings,
      customers,
      emailTemplate,
    ],
  );

  return (
    <div
      id="register-root"
      className="flex flex-1 h-full overflow-hidden"
      style={{ background: 'var(--app-bg)' }}
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
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] ring-1 ring-black/5 text-sm font-semibold tracking-wide ${
              scanFeedback.ok
                ? 'bg-emerald-600 text-slate-900 dark:text-white'
                : 'bg-rose-600 text-slate-900 dark:text-white'
            }`}
          >
            <ScanLine size={18} className="opacity-90" />
            <span>{scanFeedback.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <HeldOrdersModal
        open={heldModalOpen}
        dialogRef={heldModalRef}
        heldOrders={heldOrders}
        currency={settings.currency}
        onClose={() => setHeldModalOpen(false)}
        onResume={resumeHeldOrder}
        onRemove={removeHeldOrder}
      />

      <AnimatePresence>
        {checkoutModalOpen && (
          <div
            id="payment-modal"
            className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4"
          >
            <motion.div
              ref={checkoutModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="payment-modal-title"
              tabIndex={-1}
              initial={{ scale: 0.9, opacity: 0, y: 28 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 28 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
              className="modal-card max-w-lg w-full overflow-hidden flex flex-col"
            >
              <div
                className="p-5 flex justify-between items-center"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
              >
                <div>
                  <h3
                    id="payment-modal-title"
                    className="font-sans font-bold text-slate-900 dark:text-white text-lg"
                  >
                    {t('register.selectPaymentMethod')}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-1 flex items-center gap-2">
                    {t('register.amountToPay')}
                    <span className="font-bold text-xl text-emerald-400 tracking-tight font-mono">
                      {settings.currency}
                      {totalAmount.toFixed(2)}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => setCheckoutModalOpen(false)}
                  aria-label={t('register.close')}
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
                    border: splitMode
                      ? '1px solid rgba(16,185,129,0.35)'
                      : '1px solid rgba(255,255,255,0.08)',
                    color: splitMode ? '#34d399' : '#64748b',
                  }}
                >
                  <CreditCard size={14} />
                  {splitMode ? t('register.singlePayment') : t('register.splitPayment')}
                </button>

                {!splitMode && (
                  <div className="grid grid-cols-4 gap-2.5">
                    {paymentMethodsArray.map((m) => {
                      const MIcon = m.icon;
                      const isSel = paymentMethod === m.id;
                      return (
                        <motion.button
                          key={m.id}
                          id={`pay-method-${m.id}`}
                          onClick={() => setPaymentMethod(m.id)}
                          whileTap={{ scale: 0.93 }}
                          aria-pressed={isSel}
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
                        <div
                          className="flex-1 flex items-center rounded-xl overflow-hidden transition-all"
                          style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.09)',
                          }}
                        >
                          <select
                            value={p.method}
                            onChange={(e) =>
                              updateSplitPayment(idx, { method: e.target.value as PaymentMethod })
                            }
                            aria-label={t('register.method')}
                            className="bg-transparent text-xs font-semibold ps-3 pe-7 py-3 text-slate-600 dark:text-slate-300 focus:outline-none cursor-pointer"
                            style={{ borderRight: '1px solid rgba(255,255,255,0.08)' }}
                          >
                            <option value="cash">{t('register.payCash')}</option>
                            <option value="card">{t('register.payCard')}</option>
                            <option value="mobile">{t('register.payMobile')}</option>
                            <option value="gift">{t('register.payGift')}</option>
                          </select>
                          <div className="flex-1 flex items-center px-3">
                            <span className="font-mono text-slate-500 font-bold text-sm">
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
                              aria-label={t('register.amountToPay')}
                              className="flex-1 bg-transparent text-slate-900 dark:text-white text-base font-mono font-bold px-2 py-2.5 focus:outline-none w-full"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => removeSplitPayment(idx)}
                          disabled={splitPayments.length <= 1}
                          aria-label={t('register.removePayment')}
                          className="p-2.5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl disabled:opacity-25 transition-colors"
                          style={{
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'rgba(255,255,255,0.04)',
                          }}
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
                                background:
                                  cashPaidText === val.toFixed(2)
                                    ? 'rgba(16,185,129,0.2)'
                                    : 'rgba(255,255,255,0.05)',
                                border:
                                  cashPaidText === val.toFixed(2)
                                    ? '1px solid rgba(16,185,129,0.4)'
                                    : '1px solid rgba(255,255,255,0.09)',
                                color: cashPaidText === val.toFixed(2) ? '#34d399' : '#94a3b8',
                              }}
                            >
                              {settings.currency}
                              {val.toFixed(2)}
                            </motion.button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="cash-tendered-input"
                            className="text-[10px] font-bold text-slate-600 block mb-1.5 uppercase tracking-wider"
                          >
                            {t('register.cashTendered')}
                          </label>
                          <div
                            className="flex items-center rounded-xl overflow-hidden transition-all"
                            style={{
                              background: 'rgba(255,255,255,0.05)',
                              border: '1px solid rgba(255,255,255,0.1)',
                            }}
                          >
                            <span className="font-mono text-slate-500 ps-3 font-bold text-sm">
                              {settings.currency}
                            </span>
                            <input
                              id="cash-tendered-input"
                              type="number"
                              step="0.01"
                              min={totalAmount}
                              placeholder="0.00"
                              value={cashPaidText}
                              onChange={(e) => setCashPaidText(e.target.value)}
                              aria-label={t('register.cashTendered')}
                              className="flex-1 bg-transparent text-slate-900 dark:text-white text-xl font-mono font-bold px-2 py-2.5 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-600 block mb-1.5 uppercase tracking-wider">
                            {t('register.changeDue')}
                          </label>
                          <div
                            className="rounded-xl px-4 flex items-center justify-between"
                            style={{
                              height: '48px',
                              background: 'rgba(16,185,129,0.1)',
                              border: '1px solid rgba(16,185,129,0.25)',
                            }}
                          >
                            <span className="text-emerald-600 text-[10px] font-bold uppercase tracking-wider">
                              {t('register.returnAmount')}
                            </span>
                            <span className="font-mono text-emerald-400 font-bold text-xl">
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

              <div
                className="p-4 flex items-center gap-3"
                style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
              >
                <button
                  onClick={() => setCheckoutModalOpen(false)}
                  className="px-5 py-3 rounded-xl text-sm font-bold transition-colors"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    color: '#64748b',
                  }}
                >
                  {t('register.cancel')}
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCompletePayment}
                  disabled={
                    splitMode
                      ? splitPaidTotal < totalAmount - 0.005
                      : paymentMethod === 'cash' &&
                        totalAmount > 0 &&
                        (parseFloat(cashPaidText) || 0) < totalAmount
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

      <AddCustomerModal
        open={addCustomerOpen}
        dialogRef={addCustomerModalRef}
        fields={addCustomerFieldsArray}
        onSubmit={handleAddNewCustomer}
        onClose={() => setAddCustomerOpen(false)}
      />

      <ReceiptModal
        open={receiptModalOpen}
        dialogRef={receiptModalRef}
        receipt={activeReceipt}
        settings={settings}
        showBarcode={printerConfig.showBarcode}
        actions={receiptActionsArray}
        onClose={() => setReceiptModalOpen(false)}
      />
    </div>
  );
}
