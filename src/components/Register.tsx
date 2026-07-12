import React, { useState, useMemo } from 'react';
import { CreditCard, DollarSign, Smartphone, Gift, Check, X, Printer, UserPlus, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, SaleTransaction } from '../types';
import ProductGrid from './ProductGrid';
import CartPanel from './CartPanel';
import { useProductStore } from '../stores/productStore';
import { useCustomerStore } from '../stores/customerStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useTransactionStore } from '../stores/transactionStore';
import { calculateOrderTotals } from '../lib/pricing';
import { syncToCloudIfEnabled } from '../lib/sync';

export default function Register() {
  const { products, categories, handleUpdateProduct } = useProductStore();
  const { customers, handleAddCustomer, updateCustomerPoints } = useCustomerStore();
  const { settings, printerConfig } = useSettingsStore();
  const { transactions, addTransaction } = useTransactionStore();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  const [cart, setCart] = useState<Array<{ product: Product; quantity: number }>>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'fixed' | 'loyalty'>('none');
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

  const activeCustomer = useMemo(() => customers.find(c => c.id === selectedCustomerId) || null, [customers, selectedCustomerId]);

  const cartItems = useMemo(() => cart.map(item => ({
    productId: item.product.id,
    productName: item.product.name,
    price: item.product.price,
    cost: item.product.cost,
    quantity: item.quantity
  })), [cart]);

  const discountValue = discountType === 'loyalty' ? loyaltyPointsToUse : (parseFloat(discountInput) || 0);

  const { subtotal, discountAmount, taxAmount, totalAmount } = useMemo(() => 
    calculateOrderTotals(cartItems, discountType, discountValue, settings),
  [cartItems, discountType, discountValue, settings]);

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

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.product.id === product.id);
    if (product.stock <= 0) return;

    if (existing) {
      if (existing.quantity >= product.stock) return;
      setCart(cart.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
  };

  const updateCartQty = (productId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.product.id === productId) {
        const newQty = item.quantity + delta;
        if (newQty <= 0) return null;
        if (newQty > item.product.stock) return item;
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(Boolean) as Array<{ product: Product; quantity: number }>);
  };

  const removeFromCart = (productId: string) => setCart(cart.filter(item => item.product.id !== productId));

  const clearCart = () => {
    setCart([]);
    setSelectedCustomerId(null);
    setDiscountType('none');
    setDiscountInput('');
    setLoyaltyPointsToUse(0);
    setShowPromoInput(false);
  };

  const handleAddNewCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) return;
    const newCust = handleAddCustomer(custName, custPhone, custEmail);
    setSelectedCustomerId(newCust.id);
    setCustName(''); setCustPhone(''); setCustEmail('');
    setAddCustomerOpen(false);
  };

  const handleCheckoutClick = () => {
    if (cart.length === 0) return;
    setPaymentMethod('card');
    setCashPaidText('');
    setCheckoutModalOpen(true);
  };

  const handleCompletePayment = () => {
    const paidValue = paymentMethod === 'cash' ? parseFloat(cashPaidText) || 0 : undefined;
    if (paymentMethod === 'cash' && (!paidValue || paidValue < totalAmount)) {
      alert('Insufficient cash paid!');
      return;
    }

    let nextId = 'TX-10001';
    if (transactions.length > 0) {
      const maxId = Math.max(...transactions.map(t => parseInt(t.id.split('-').pop() || '10000')));
      nextId = `TX-${maxId + 1}`;
    }

    const transaction: SaleTransaction = {
      id: nextId,
      date: new Date().toISOString(),
      items: cartItems.map(item => ({ ...item, total: Number((item.price * item.quantity).toFixed(2)) })),
      subtotal, discount: discountAmount, discountType, discountValue,
      tax: taxAmount, total: totalAmount,
      paymentMethod, cashPaid: paidValue, cashChange: paymentMethod === 'cash' ? cashChangeDue : undefined,
      customerId: selectedCustomerId, customerName: activeCustomer?.name || null,
      status: 'completed'
    };

    // Update stocks
    const updatedProducts: Product[] = [];
    cart.forEach(item => {
      const updated = { ...item.product, stock: Math.max(0, item.product.stock - item.quantity) };
      handleUpdateProduct(updated);
      updatedProducts.push(updated);
    });

    // Update customer points
    let updatedCustomer = null;
    if (selectedCustomerId) {
      const pointsGained = Math.floor(totalAmount * settings.loyaltyPointsRate);
      let pointsDelta = pointsGained;
      if (discountType === 'loyalty') pointsDelta -= discountValue;
      updateCustomerPoints(selectedCustomerId, pointsDelta);
      updatedCustomer = useCustomerStore.getState().customers.find(c => c.id === selectedCustomerId);
    }

    addTransaction(transaction);
    syncToCloudIfEnabled(updatedProducts, undefined, updatedCustomer ? [updatedCustomer] : undefined, [transaction]);

    setActiveReceipt(transaction);
    setCheckoutModalOpen(false);
    setReceiptModalOpen(true);
    clearCart();
  };

  return (
    <div id="register-root" className="flex flex-1 h-full overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
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
      />

      <AnimatePresence>
        {checkoutModalOpen && (
          <div id="payment-modal" className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                <div>
                  <h3 className="font-sans font-bold text-slate-800 dark:text-white text-lg">Select Payment Method</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-mono mt-0.5">Amount to pay: <span className="font-bold text-emerald-600 dark:text-emerald-400">{settings.currency}{totalAmount.toFixed(2)}</span></p>
                </div>
                <button
                  onClick={() => setCheckoutModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { id: 'card', label: 'Card', icon: CreditCard, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
                    { id: 'cash', label: 'Cash', icon: DollarSign, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
                    { id: 'mobile', label: 'Mobile', icon: Smartphone, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20' },
                    { id: 'gift', label: 'Gift Card', icon: Gift, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
                  ].map(m => {
                    const MIcon = m.icon;
                    const isSel = paymentMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        id={`pay-method-${m.id}`}
                        onClick={() => setPaymentMethod(m.id as any)}
                        className={`flex flex-col items-center justify-center p-4 rounded-2xl border text-center transition-all duration-200 ${
                          isSel 
                            ? 'border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transform scale-105' 
                            : `border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 ${m.bg} ${m.color}`
                        }`}
                      >
                        <MIcon size={24} className={isSel ? 'text-white' : m.color} />
                        <span className={`text-xs font-semibold mt-2 ${isSel ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>{m.label}</span>
                      </button>
                    );
                  })}
                </div>

                <AnimatePresence mode="wait">
                  {paymentMethod === 'cash' && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800 overflow-hidden"
                    >
                      <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2 font-mono uppercase tracking-wider">
                          Quick Cash Pay
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {cashSuggestions.map(val => (
                            <button
                              key={val}
                              onClick={() => setCashPaidText(val.toFixed(2))}
                              className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all shadow-sm"
                            >
                              {settings.currency}{val.toFixed(2)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">Cash Tendered ({settings.currency})</label>
                          <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-xl p-1 bg-slate-50 dark:bg-slate-950 shadow-inner">
                            <span className="font-mono text-slate-400 dark:text-slate-500 pl-3 font-bold">{settings.currency}</span>
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
                          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">Change Due</label>
                          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2 flex items-center justify-between h-[46px]">
                            <span className="text-emerald-800 dark:text-emerald-400 text-xs font-semibold uppercase font-mono">Return</span>
                            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold text-lg">
                              {settings.currency}{cashChangeDue.toFixed(2)}
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
                  Cancel
                </button>
                <button
                  onClick={handleCompletePayment}
                  disabled={paymentMethod === 'cash' && (!parseFloat(cashPaidText) || parseFloat(cashPaidText) < totalAmount)}
                  className="px-8 py-3 bg-linear-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:from-slate-400 disabled:to-slate-400 text-white font-sans font-bold text-sm rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition-all transform active:scale-95"
                >
                  <Check size={18} />
                  <span>Complete Order</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addCustomerOpen && (
          <div id="add-customer-modal" className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-sans font-bold text-slate-800 dark:text-white text-lg flex items-center gap-2">
                  <UserPlus size={20} className="text-emerald-500" />
                  New Customer
                </h3>
                <button onClick={() => setAddCustomerOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-full transition-colors">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleAddNewCustomer} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">Full Name *</label>
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
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="e.g. 555-0100"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-inner"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">Email Address</label>
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
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/20 transition-all transform active:scale-95"
                  >
                    Save & Link
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {receiptModalOpen && activeReceipt && (
          <div id="receipt-modal" className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
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
                <h3 className="font-sans font-bold text-white text-xl tracking-tight">Payment Successful!</h3>
                <p className="text-emerald-100 text-sm font-mono bg-black/10 px-3 py-1 rounded-full">Receipt {activeReceipt.id}</p>
              </div>

              <div className="p-6 flex-1 overflow-y-auto max-h-[380px] bg-slate-50 dark:bg-slate-950">
                <div id="thermal-receipt" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                  <div className="text-center border-b border-dashed border-slate-300 dark:border-slate-700 pb-4">
                    <div className="flex justify-center mb-3">
                      {settings.storeLogo ? (
                        <img src={settings.storeLogo} alt="Logo" className="h-[28px] w-auto object-contain" />
                      ) : (
                        <ShoppingBag size={28} className="text-slate-800 dark:text-slate-200" />
                      )}
                    </div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-base uppercase tracking-widest">{settings.storeName}</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">{settings.storeAddress}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{settings.storePhone}</p>
                  </div>

                  <div className="space-y-1.5 text-[10px] border-b border-dashed border-slate-300 dark:border-slate-700 pb-4">
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
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold mt-1">
                        <span>MEMBER:</span>
                        <span>{activeReceipt.customerName}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 border-b border-dashed border-slate-300 dark:border-slate-700 pb-4">
                    {activeReceipt.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span className="truncate max-w-[160px]">{item.quantity}x {item.productName}</span>
                        <span>{settings.currency}{item.total.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span>SUBTOTAL:</span>
                      <span>{settings.currency}{activeReceipt.subtotal.toFixed(2)}</span>
                    </div>
                    {activeReceipt.discount > 0 && (
                      <div className="flex justify-between text-amber-600 dark:text-amber-400">
                        <span>DISCOUNT:</span>
                        <span>-{settings.currency}{activeReceipt.discount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-900 dark:text-white font-bold pt-2 border-t border-slate-200 dark:border-slate-800 mt-2 text-sm">
                      <span>TOTAL PAID:</span>
                      <span>{settings.currency}{activeReceipt.total.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-4 space-y-1.5 text-[10px]">
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
                        <div className="flex justify-between text-slate-900 dark:text-white font-bold">
                          <span>CHANGE:</span>
                          <span>{settings.currency}{(activeReceipt.cashChange || 0).toFixed(2)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="text-center pt-4 border-t border-dashed border-slate-300 dark:border-slate-700 text-[10px] text-slate-400 dark:text-slate-500">
                    <p>THANK YOU FOR YOUR VISIT</p>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4">
                <button
                  onClick={() => alert('Receipt printing is mock triggered!')}
                  className="flex-1 flex justify-center items-center gap-2 px-4 py-3 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold transition-colors shadow-sm"
                >
                  <Printer size={16} />
                  <span>Print</span>
                </button>
                <button
                  onClick={() => setReceiptModalOpen(false)}
                  className="flex-1 px-4 py-3 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 rounded-xl text-sm font-bold shadow-md shadow-slate-900/10 transition-colors"
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
