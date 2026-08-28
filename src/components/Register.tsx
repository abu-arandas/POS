import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  CreditCard,
  DollarSign,
  Smartphone,
  Gift,
  Printer,
  ScanLine,
  Share2,
  Mail,
  ChefHat,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, SaleTransaction, HeldOrder, Payment } from '../types';
import ProductGrid from './ProductGrid';
import CartPanel from './CartPanel';
import { HeldOrdersModal } from './register/HeldOrdersModal';
import { AddCustomerModal } from './register/AddCustomerModal';
import { ReceiptModal } from './register/ReceiptModal';
import { PaymentModal } from './register/PaymentModal';
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
import { notify } from '../lib/notifications';
import { askConfirmation, askText } from '../lib/dialogs';

/**
 * The register screen: product grid, cart, discounts, held orders, and the
 * checkout flow through payment to receipt. The app's primary screen.
 */
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
  const [receiptPrinted, setReceiptPrinted] = useState(false);

  // Auto-close only after the hardware transport confirms success. A failed
  // print keeps the receipt visible so the operator can retry or use a backup.
  useEffect(() => {
    if (!receiptModalOpen || !receiptPrinted) return;
    const timer = setTimeout(() => setReceiptModalOpen(false), 3000);
    return () => clearTimeout(timer);
  }, [receiptModalOpen, receiptPrinted]);

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

  const handleHoldOrder = useCallback(async () => {
    if (cart.length === 0) return;
    const label = (
      await askText(t('register.holdLabelPrompt'), new Date().toLocaleTimeString())
    )?.trim();
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
    async (order: HeldOrder) => {
      if (cart.length > 0 && !(await askConfirmation(t('register.resumeReplaceWarning')))) return;
      // Rebuild the cart from the current catalog so prices/stock are live; drop
      // any line whose product no longer exists.
      const liveProducts = useProductStore.getState().products;
      const liveMap = new Map(liveProducts.map((p) => [p.id, p]));
      const adjustedItems: string[] = [];
      const rebuilt = order.items
        .map((i) => {
          const product = liveMap.get(i.productId);
          if (!product) {
            adjustedItems.push(i.productName);
            return null;
          }
          const quantity = Math.min(i.quantity, product.stock);
          if (quantity !== i.quantity) adjustedItems.push(product.name);
          return { product, quantity };
        })
        .filter((x): x is { product: Product; quantity: number } => x !== null && x.quantity > 0);
      if (adjustedItems.length > 0) {
        setScanFeedback({
          ok: false,
          text: t('register.heldOrderAdjusted', { items: adjustedItems.join(', ') }),
        });
      }
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
      if (outcome === 'popup-blocked') notify(t('history.standardPrintBlocked'));
      else if (outcome === 'unsupported')
        notify(t('print.unsupported', { type: printerConfig.type.toUpperCase() }));
      else if (outcome === 'no-device') notify(t('print.noDevice'));
      else if (outcome === 'error') notify(t('print.error'));
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
      if (outcome.error === 'split-incomplete') notify(t('register.splitIncomplete'));
      else if (outcome.error === 'split-non-cash-overpay')
        notify(t('register.splitNonCashOverpay'));
      else if (outcome.error === 'insufficient-cash') notify(t('register.insufficientCash'));
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
    setReceiptPrinted(false);
    setCheckoutModalOpen(false);
    setReceiptModalOpen(true);
    clearCart();

    const isCashSale =
      saleMethod === 'cash' || (payments?.some((p) => p.method === 'cash') ?? false);

    if (printerConfig.autoPrintOnCheckout) {
      printReceipt(transaction, settings, printerConfig, isCashSale, receiptLayout).then(
        (outcome) => {
          notifyPrint(outcome);
          if (outcome === 'printed') setReceiptPrinted(true);
        },
      );
    } else if (isCashSale) {
      openCashDrawer(printerConfig);
    }
    if (printerConfig.kitchenTicketOnCheckout) {
      /*
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
    <div id="register-root" className="app-canvas flex flex-1 h-full overflow-hidden">
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
              scanFeedback.ok ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
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
        onRemove={async (id) => {
          if (await askConfirmation(t('register.deleteHeldConfirm', 'Delete this held order?'))) {
            removeHeldOrder(id);
          }
        }}
      />

      <PaymentModal
        open={checkoutModalOpen}
        dialogRef={checkoutModalRef}
        currency={settings.currency}
        totalAmount={totalAmount}
        paymentMethods={paymentMethodsArray}
        paymentMethod={paymentMethod}
        onSelectMethod={setPaymentMethod}
        splitMode={splitMode}
        onToggleSplit={() => {
          setSplitMode((m) => !m);
          if (!splitMode && splitPayments.length === 0) {
            setSplitPayments([
              { method: 'cash', amount: Number(Math.max(0, totalAmount).toFixed(2)) },
            ]);
          }
        }}
        splitPayments={splitPayments}
        splitRemaining={splitRemaining}
        splitPaidTotal={splitPaidTotal}
        onAddSplit={addSplitPayment}
        onUpdateSplit={updateSplitPayment}
        onRemoveSplit={removeSplitPayment}
        cashSuggestions={cashSuggestions}
        cashPaidText={cashPaidText}
        onCashPaidChange={setCashPaidText}
        cashChangeDue={cashChangeDue}
        onComplete={handleCompletePayment}
        onClose={() => setCheckoutModalOpen(false)}
      />

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
        printerConfig={printerConfig}
        receiptLayout={receiptLayout}
        showBarcode={printerConfig.showBarcode}
        actions={receiptActionsArray}
        onClose={() => setReceiptModalOpen(false)}
      />
    </div>
  );
}
