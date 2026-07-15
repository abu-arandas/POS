import React, { useState, useMemo } from 'react';
import {
  Search,
  History as HistoryIcon,
  Calendar,
  Printer,
  RotateCcw,
  ChevronRight,
  CreditCard,
  DollarSign,
  Smartphone,
  Gift,
  X,
  Check,
  AlertTriangle,
  ShieldCheck,
  Lock,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { SaleTransaction, Product, Customer } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { hashPin } from '../lib/hash';
import { useTransactionStore } from '../stores/transactionStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { useProductStore } from '../stores/productStore';
import { useCustomerStore } from '../stores/customerStore';
import { syncToCloudIfEnabled } from '../lib/sync';
import { useTranslation } from 'react-i18next';

export default function History() {
  const { t } = useTranslation();
  const { transactions, refundTransaction, deleteTransactions } = useTransactionStore();
  const { settings, printerConfig } = useSettingsStore();
  const { currentUser, users } = useAuthStore();
  const { handleUpdateProduct } = useProductStore();
  const { updateCustomerPoints } = useCustomerStore();

  // Filters & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | '7days' | 'custom'>(
    'all',
  );
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'refunded'>('all');

  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Active Selected Transaction for Receipt View
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

  // Bulk Selection
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Passcode Challenge Modal for Refunds
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [pendingRefundTxId, setPendingRefundTxId] = useState<string | null>(null);
  const [overridePin, setOverridePin] = useState('');
  const [overrideError, setOverrideError] = useState('');

  const activeTransaction = useMemo(() => {
    return transactions.find((t) => t.id === selectedTxId) || null;
  }, [transactions, selectedTxId]);

  // Filters logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Search matches
      const matchesSearch =
        tx.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (tx.customerName && tx.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        tx.paymentMethod.toLowerCase().includes(searchQuery.toLowerCase());

      // Status matches
      const matchesStatus = statusFilter === 'all' || tx.status === statusFilter;

      // Date matches
      let matchesDate = true;
      const txDate = new Date(tx.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (dateFilter === 'today') {
        matchesDate = txDate >= today;
      } else if (dateFilter === 'yesterday') {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        matchesDate = txDate >= yesterday && txDate < today;
      } else if (dateFilter === '7days') {
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);
        matchesDate = txDate >= sevenDaysAgo;
      } else if (dateFilter === 'custom') {
        const start = customStartDate ? new Date(customStartDate) : null;
        const end = customEndDate ? new Date(customEndDate) : null;

        if (start && end) {
          matchesDate = txDate >= start && txDate <= end;
        } else if (start) {
          matchesDate = txDate >= start;
        } else if (end) {
          matchesDate = txDate <= end;
        }
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [transactions, searchQuery, dateFilter, statusFilter, customStartDate, customEndDate]);

  // Processes a refund: marks the transaction refunded, returns items to stock,
  // reverses the loyalty points that were awarded/redeemed, and syncs the changes.
  const processRefund = (tx: SaleTransaction) => {
    if (tx.status === 'refunded') return;

    // Return purchased quantities back to catalog stock levels.
    const updatedProducts: Product[] = [];
    tx.items.forEach((item) => {
      const prod = useProductStore.getState().products.find((p) => p.id === item.productId);
      if (prod) {
        const updated = { ...prod, stock: prod.stock + item.quantity };
        handleUpdateProduct(updated);
        updatedProducts.push(updated);
      }
    });

    // Reverse the loyalty-point movement from the original sale: remove the
    // points earned and refund the points that were redeemed as a discount.
    let updatedCustomer: Customer | undefined;
    if (tx.customerId) {
      const pointsEarned = Math.floor(tx.total * settings.loyaltyPointsRate);
      let reverseDelta = -pointsEarned;
      if (tx.discountType === 'loyalty') reverseDelta += tx.discountValue;
      if (reverseDelta !== 0) updateCustomerPoints(tx.customerId, reverseDelta);
      updatedCustomer = useCustomerStore.getState().customers.find((c) => c.id === tx.customerId);
    }

    const refundDate = new Date().toISOString();
    refundTransaction(tx.id, refundDate);

    syncToCloudIfEnabled(
      updatedProducts.length > 0 ? updatedProducts : undefined,
      undefined,
      updatedCustomer ? [updatedCustomer] : undefined,
      [{ ...tx, status: 'refunded', refundDate }],
    );
  };

  // Refund handler
  const handleRefundClick = (tx: SaleTransaction) => {
    if (currentUser?.role === 'cashier') {
      // Cashiers require manager override passcode
      setPendingRefundTxId(tx.id);
      setOverridePin('');
      setOverrideError('');
      setShowOverrideModal(true);
    } else {
      if (confirm(t('history.refundConfirm', { id: tx.id }))) {
        processRefund(tx);
      }
    }
  };

  const handleAuthorizeOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    setOverrideError('');

    const hashedPin = await hashPin(overridePin);
    const authorizedUser = users.find(
      (u) => u.pin === hashedPin && u.active && (u.role === 'manager' || u.role === 'admin'),
    );
    if (authorizedUser) {
      const pendingTx = transactions.find((tx) => tx.id === pendingRefundTxId);
      if (pendingTx) {
        processRefund(pendingTx);
        alert(
          t('history.refundAuthorized', { name: authorizedUser.name, role: authorizedUser.role }),
        );
      }
      setShowOverrideModal(false);
      setPendingRefundTxId(null);
      setOverridePin('');
    } else {
      setOverrideError(t('history.invalidPasscode'));
      setOverridePin('');
    }
  };

  const handlePrintReceipt = (tx: SaleTransaction) => {
    if (printerConfig.type === 'system') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const rollWidth = printerConfig.paperSize === '58mm' ? '58mm' : '80mm';

        printWindow.document.write(`
          <html>
            <head>
              <title>POS Receipt ${tx.id}</title>
              <style>
                body {
                  font-family: 'Courier New', Courier, monospace;
                  width: ${rollWidth};
                  padding: 8px;
                  margin: 0;
                  font-size: 11px;
                  color: #000;
                  line-height: 1.3;
                }
                .center { text-align: center; }
                .bold { font-weight: bold; }
                .text-lg { font-size: 14px; font-weight: bold; }
                .divider { border-top: 1px dashed #000; margin: 8px 0; }
                .logo { text-align: center; margin-bottom: 8px; }
                .logo svg { width: 32px; height: 32px; }
                .flex-row { display: flex; justify-content: space-between; }
                .mt-1 { margin-top: 4px; }
              </style>
            </head>
            <body onload="window.print(); window.close();">
              <div class="logo">
                ${settings.storeLogo ? `<img src="${settings.storeLogo}" style="max-height: 40px; width: auto;" />` : `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`}
              </div>
              <div class="center bold">${settings.storeName}</div>
              <div class="center">${settings.storeAddress}</div>
              <div class="center">Phone: ${settings.storePhone}</div>
              <div class="divider"></div>
              
              <div class="flex-row">
                <span>DATE:</span>
                <span>${new Date(tx.date).toLocaleString()}</span>
              </div>
              <div class="flex-row">
                <span>RECEIPT:</span>
                <span class="bold">${tx.id}</span>
              </div>
              ${
                tx.operatorName
                  ? `
              <div class="flex-row">
                <span>OPERATOR:</span>
                <span>${tx.operatorName}</span>
              </div>
              `
                  : ''
              }
              ${
                tx.customerName
                  ? `
              <div class="flex-row bold">
                <span>MEMBER:</span>
                <span>${tx.customerName}</span>
              </div>
              `
                  : ''
              }
              
              <div class="divider"></div>
              
              <div class="bold">ITEMS:</div>
              ${tx.items
                .map(
                  (item) => `
                <div class="flex-row">
                  <span>${item.quantity}x ${item.productName}</span>
                  <span>${settings.currency}${item.total.toFixed(2)}</span>
                </div>
              `,
                )
                .join('')}
              
              <div class="divider"></div>
              
              <div class="flex-row">
                <span>SUBTOTAL:</span>
                <span>${settings.currency}${tx.subtotal.toFixed(2)}</span>
              </div>
              ${
                tx.discount > 0
                  ? `
              <div class="flex-row">
                <span>DISCOUNT:</span>
                <span>-${settings.currency}${tx.discount.toFixed(2)}</span>
              </div>
              `
                  : ''
              }
              <div class="flex-row">
                <span>TAX:</span>
                <span>${settings.currency}${tx.tax.toFixed(2)}</span>
              </div>
              <div class="flex-row text-lg">
                <span>TOTAL PAID:</span>
                <span>${settings.currency}${tx.total.toFixed(2)}</span>
              </div>
              
              <div class="divider"></div>
              
              <div class="flex-row">
                <span>METHOD:</span>
                <span class="bold uppercase">${tx.paymentMethod}</span>
              </div>
              ${
                tx.paymentMethod === 'cash'
                  ? `
              <div class="flex-row">
                <span>CASH PAID:</span>
                <span>${settings.currency}${tx.cashPaid?.toFixed(2)}</span>
              </div>
              <div class="flex-row bold">
                <span>CHANGE:</span>
                <span>${settings.currency}${tx.cashChange?.toFixed(2)}</span>
              </div>
              `
                  : ''
              }
              
              <div class="divider"></div>
              
              <div class="center bold uppercase">${tx.status}</div>
              ${
                tx.refundDate
                  ? `
              <div class="center text-rose-600">REFUND: ${new Date(tx.refundDate).toLocaleDateString()}</div>
              `
                  : ''
              }
              
              <div class="divider"></div>
              
              <div class="center">${printerConfig.footerMessage || 'Thank you for your business!'}</div>
              <div class="center mt-1" style="font-size: 8px; letter-spacing: 2px; color: #444;">
                ||||| ||| ||| |||| | | |||| |||
              </div>
              <div class="center" style="font-size: 8px;">* AUTH-${tx.id} *</div>
            </body>
          </html>
        `);
        printWindow.document.close();
      } else {
        alert(t('history.standardPrintBlocked'));
      }
    } else {
      alert(t('history.escPosPrintMessage', { type: printerConfig.type.toUpperCase() }));
    }
  };

  const handleToggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedTxIds(filteredTransactions.map((tx) => tx.id));
    } else {
      setSelectedTxIds([]);
    }
  };

  const handleToggleTx = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTxIds((prev) =>
      prev.includes(id) ? prev.filter((txId) => txId !== id) : [...prev, id],
    );
  };

  const handleBulkDelete = () => {
    setShowDeleteModal(true);
  };

  const confirmBulkDelete = () => {
    deleteTransactions(selectedTxIds);
    setSelectedTxIds([]);
    if (selectedTxId && selectedTxIds.includes(selectedTxId)) {
      setSelectedTxId(null);
    }
    setShowDeleteModal(false);
  };

  const handleBulkPrint = () => {
    if (printerConfig.type === 'system') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const rollWidth = printerConfig.paperSize === '58mm' ? '58mm' : '80mm';
        const txsToPrint = transactions.filter((t) => selectedTxIds.includes(t.id));

        const receiptsHtml = txsToPrint
          .map(
            (tx) => `
          <div class="receipt">
            <div class="logo">
              ${settings.storeLogo ? `<img src="${settings.storeLogo}" style="max-height: 40px; width: auto;" />` : `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`}
            </div>
            <div class="center bold">${settings.storeName}</div>
            <div class="center">${settings.storeAddress}</div>
            <div class="center">Phone: ${settings.storePhone}</div>
            <div class="divider"></div>
            
            <div class="flex-row">
              <span>DATE:</span>
              <span>${new Date(tx.date).toLocaleString()}</span>
            </div>
            <div class="flex-row">
              <span>RECEIPT:</span>
              <span class="bold">${tx.id}</span>
            </div>
            ${
              tx.customerName
                ? `
            <div class="flex-row bold">
              <span>MEMBER:</span>
              <span>${tx.customerName}</span>
            </div>
            `
                : ''
            }
            
            <div class="divider"></div>
            
            <div class="bold">ITEMS:</div>
            ${tx.items
              .map(
                (item) => `
              <div class="flex-row">
                <span>${item.quantity}x ${item.productName}</span>
                <span>${settings.currency}${item.total.toFixed(2)}</span>
              </div>
            `,
              )
              .join('')}
            
            <div class="divider"></div>
            
            <div class="flex-row">
              <span>SUBTOTAL:</span>
              <span>${settings.currency}${tx.subtotal.toFixed(2)}</span>
            </div>
            ${
              tx.discount > 0
                ? `
            <div class="flex-row">
              <span>DISCOUNT:</span>
              <span>-${settings.currency}${tx.discount.toFixed(2)}</span>
            </div>
            `
                : ''
            }
            <div class="flex-row text-lg">
              <span>TOTAL PAID:</span>
              <span>${settings.currency}${tx.total.toFixed(2)}</span>
            </div>
            
            <div class="divider"></div>
            
            <div class="flex-row">
              <span>METHOD:</span>
              <span class="bold uppercase">${tx.paymentMethod}</span>
            </div>
            ${
              tx.paymentMethod === 'cash'
                ? `
            <div class="flex-row">
              <span>CASH PAID:</span>
              <span>${settings.currency}${tx.cashPaid?.toFixed(2)}</span>
            </div>
            <div class="flex-row bold">
              <span>CHANGE:</span>
              <span>${settings.currency}${tx.cashChange?.toFixed(2)}</span>
            </div>
            `
                : ''
            }
            
            <div class="divider"></div>
            
            <div class="center bold uppercase">${tx.status}</div>
            ${
              tx.refundDate
                ? `
            <div class="center text-rose-600">REFUND: ${new Date(tx.refundDate).toLocaleDateString()}</div>
            `
                : ''
            }
            
            <div class="divider"></div>
            
            <div class="center">${printerConfig.footerMessage || 'Thank you for your business!'}</div>
            <div class="center mt-1" style="font-size: 8px; letter-spacing: 2px; color: #444;">
              ||||| ||| ||| |||| | | |||| |||
            </div>
            <div class="center" style="font-size: 8px;">* AUTH-${tx.id} *</div>
          </div>
        `,
          )
          .join('<div class="page-break"></div>');

        printWindow.document.write(`
          <html>
            <head>
              <title>POS Bulk Receipts</title>
              <style>
                body {
                  font-family: 'Courier New', Courier, monospace;
                  width: ${rollWidth};
                  padding: 8px;
                  margin: 0;
                  font-size: 11px;
                  color: #000;
                  line-height: 1.3;
                }
                .receipt { margin-bottom: 20px; }
                .center { text-align: center; }
                .bold { font-weight: bold; }
                .text-lg { font-size: 14px; font-weight: bold; }
                .divider { border-top: 1px dashed #000; margin: 8px 0; }
                .logo { text-align: center; margin-bottom: 8px; }
                .logo svg { width: 32px; height: 32px; }
                .flex-row { display: flex; justify-content: space-between; }
                .mt-1 { margin-top: 4px; }
                @media print {
                  .page-break { page-break-after: always; }
                }
              </style>
            </head>
            <body onload="window.print(); window.close();">
              ${receiptsHtml}
            </body>
          </html>
        `);
        printWindow.document.close();
      } else {
        alert(t('history.standardPrintBlocked'));
      }
    } else {
      alert(t('history.escPosPrintMessage', { type: printerConfig.type.toUpperCase() }));
    }
  };

  const getPaymentIcon = (method: SaleTransaction['paymentMethod']) => {
    switch (method) {
      case 'card':
        return <CreditCard size={13} className="text-blue-500" />;
      case 'cash':
        return <DollarSign size={13} className="text-emerald-500" />;
      case 'mobile':
        return <Smartphone size={13} className="text-purple-500" />;
      case 'gift':
        return <Gift size={13} className="text-amber-500" />;
    }
  };

  return (
    <div
      id="history-root"
      className="flex-1 flex h-screen overflow-hidden bg-transparent p-6 text-slate-800 dark:text-slate-100"
    >
      {/* LEFT COLUMN: Transaction List (2/3 width) */}
      <div
        id="transaction-list-section"
        className="flex-1 flex flex-col min-w-0 pe-6 overflow-hidden"
      >
        {/* Header */}
        <div id="history-header" className="mb-6 shrink-0">
          <h2 className="font-sans font-extrabold tracking-tight text-slate-900 text-xl sm:text-2xl flex items-center gap-2">
            <HistoryIcon className="text-emerald-500" /> {t('history.transactionLogs')}
          </h2>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5">{t('history.auditPastOrders')}</p>
        </div>

        {/* Filters */}
        <div
          id="history-filters"
          className="glass dark:glass-dark p-4 rounded-2xl border border-white/20 dark:border-white/10 shadow-lg space-y-4 mb-6 shrink-0 backdrop-blur-md"
        >
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 flex items-center space-x-2 bg-slate-100 px-3 py-2 rounded-xl border border-slate-200/40">
              <Search size={16} className="text-slate-400" />
              <input
                id="history-search-input"
                type="text"
                placeholder={t('history.searchReceipts')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent border-none text-slate-800 text-xs focus:outline-none placeholder-slate-400"
              />
            </div>

            <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 shrink-0">
              {[
                { id: 'all', label: t('history.allDates') },
                { id: 'today', label: t('history.today') },
                { id: 'yesterday', label: t('history.yesterday') },
                { id: '7days', label: t('history.last7Days') },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setDateFilter(opt.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all shrink-0 ${
                    dateFilter === opt.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <select
              id="history-status-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold px-3 py-1.5 text-slate-600 focus:outline-none focus:border-emerald-500 shrink-0"
            >
              <option value="all">{t('history.allStatuses')}</option>
              <option value="completed">{t('history.paidCompleted')}</option>
              <option value="refunded">{t('history.refundedReturned')}</option>
            </select>
          </div>

          <div className="flex items-center space-x-3 pt-1 w-full">
            <div className="flex-1 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50 px-4 py-1.5 rounded-xl">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  {t('history.from')}
                </span>
                <input
                  type="datetime-local"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-transparent border-none text-xs text-slate-700 focus:outline-none font-mono"
                />
              </div>

              <div className="flex-1 px-4 flex items-center justify-center">
                <div className="h-px bg-slate-300 w-full max-w-[100px]"></div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  {t('history.to')}
                </span>
                <input
                  type="datetime-local"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-transparent border-none text-xs text-slate-700 focus:outline-none font-mono"
                />
              </div>
            </div>

            <button
              onClick={() => setDateFilter('custom')}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm shrink-0 ${
                dateFilter === 'custom'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-white'
              }`}
            >
              {t('history.applyFilter')}
            </button>
          </div>
        </div>

        {selectedTxIds.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl flex justify-between items-center mb-6 shrink-0 shadow-sm transition-all animate-in fade-in slide-in-from-top-2">
            <span className="text-emerald-800 font-bold text-xs px-2">
              {selectedTxIds.length} {t('history.transactionsSelected')}
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleBulkPrint}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-colors"
              >
                <Printer size={14} /> {t('history.printSelected')}
              </button>
              <button
                onClick={handleBulkDelete}
                className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-colors"
              >
                <Trash2 size={14} /> {t('history.deleteSelected')}
              </button>
            </div>
          </div>
        )}

        {/* Transactions Table */}
        <div
          id="history-table-container"
          className="flex-1 glass dark:glass-dark border border-white/20 dark:border-white/10 rounded-2xl shadow-lg overflow-hidden flex flex-col backdrop-blur-md"
        >
          <div className="flex-1 overflow-y-auto">
            <table id="history-table" className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-white/40 dark:bg-slate-900/40 text-slate-500 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wider font-mono border-b border-slate-200/50 dark:border-slate-700/50 backdrop-blur-sm">
                  <th className="py-3 px-4 w-[40px] text-center">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                      checked={
                        filteredTransactions.length > 0 &&
                        selectedTxIds.length === filteredTransactions.length
                      }
                      onChange={handleToggleSelectAll}
                    />
                  </th>
                  <th className="py-3 px-2 w-[120px]">{t('history.receiptId')}</th>
                  <th className="py-3 px-4 w-1/4">{t('history.timestamp')}</th>
                  <th className="py-3 px-4 w-1/4">{t('history.customer')}</th>
                  <th className="py-3 px-3 w-1/8 text-center">{t('history.items')}</th>
                  <th className="py-3 px-4 w-1/8 text-right">{t('history.total')}</th>
                  <th className="py-3 px-4 w-1/8 text-center">{t('history.payment')}</th>
                  <th className="py-3 px-4 w-[100px] text-center">{t('history.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-700/50 text-xs font-sans text-slate-700 dark:text-slate-200">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-12 text-center text-slate-400 font-medium font-mono"
                    >
                      {t('history.noHistoricalTransactions')}
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx) => {
                    const isRefunded = tx.status === 'refunded';
                    const isSelected = tx.id === selectedTxId;

                    return (
                      <tr
                        key={tx.id}
                        id={`history-row-${tx.id}`}
                        onClick={() => setSelectedTxId(tx.id)}
                        className={`hover:bg-slate-50/50 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-slate-100/80 hover:bg-slate-100/80'
                            : isRefunded
                              ? 'opacity-70'
                              : ''
                        }`}
                      >
                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                            checked={selectedTxIds.includes(tx.id)}
                            onChange={(e) => {
                              handleToggleTx(tx.id, e as unknown as React.MouseEvent);
                            }}
                          />
                        </td>
                        <td className="py-3 px-2 font-mono font-bold text-slate-900">{tx.id}</td>
                        <td className="py-3 px-4 text-slate-500 font-mono">
                          {new Date(tx.date).toLocaleDateString()} &bull;{' '}
                          {new Date(tx.date).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700 truncate">
                          {tx.customerName || (
                            <span className="text-slate-400 font-normal">
                              {t('history.walkIn')}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold bg-slate-50/40">
                          {tx.items.reduce((sum, item) => sum + item.quantity, 0)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          {settings.currency}
                          {tx.total.toFixed(2)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1 font-mono uppercase text-[10px] text-slate-500">
                            {getPaymentIcon(tx.paymentMethod)}
                            <span>{tx.paymentMethod}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              isRefunded
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {isRefunded ? t('history.refunded') : t('history.paid')}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {/* Table Footer */}
          <div className="px-4 py-2.5 border-t border-slate-200/50 dark:border-slate-700/50 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm text-[10px] text-slate-500 dark:text-slate-400 font-mono flex justify-between shrink-0">
            <span>
              {t('history.filteredCount')} {filteredTransactions.length} {t('history.sales')}
            </span>
            <span>
              {t('history.totalValue')} {settings.currency}
              {filteredTransactions
                .reduce((sum, t) => sum + (t.status === 'completed' ? t.total : 0), 0)
                .toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Thermal Receipt Viewer (1/3 width) */}
      <div
        id="receipt-view-section"
        className="w-80 glass dark:glass-dark border border-white/20 dark:border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden shrink-0 backdrop-blur-md"
      >
        {activeTransaction ? (
          <>
            {/* Header Status */}
            <div
              className={`p-4 border-b flex items-center justify-between ${
                activeTransaction.status === 'refunded'
                  ? 'bg-rose-50 border-rose-100 text-rose-800'
                  : 'bg-emerald-50 border-emerald-100 text-emerald-800'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Check
                  size={16}
                  className={
                    activeTransaction.status === 'refunded' ? 'text-rose-600' : 'text-emerald-600'
                  }
                />
                <span className="font-sans font-bold text-xs">
                  {activeTransaction.status === 'refunded'
                    ? t('history.transactionRefunded')
                    : t('history.transactionPaid')}
                </span>
              </div>
              <button
                onClick={() => setSelectedTxId(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable Receipt Body */}
            <div className="flex-1 p-5 overflow-y-auto bg-slate-100 flex flex-col justify-between">
              {/* Receipts Mockup Card */}
              <div
                id="audit-receipt-mockup"
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4 font-mono text-xs text-slate-700"
              >
                <div className="text-center border-b border-dashed border-slate-200 pb-3">
                  <div className="flex justify-center mb-2">
                    {settings.storeLogo ? (
                      <img
                        src={settings.storeLogo}
                        alt="Logo"
                        className="h-[24px] w-auto object-contain"
                      />
                    ) : (
                      <ShoppingBag size={24} className="text-slate-800" />
                    )}
                  </div>
                  <h4 className="font-bold text-slate-900 text-[11px] uppercase tracking-tight">
                    {settings.storeName}
                  </h4>
                  <p className="text-[9px] text-slate-400 mt-0.5">{settings.storeAddress}</p>
                  <p className="text-[9px] text-slate-400">{settings.storePhone}</p>
                </div>

                <div className="space-y-1 text-[10px] border-b border-dashed border-slate-200 pb-3">
                  <div className="flex justify-between">
                    <span>{t('history.date')}</span>
                    <span>{new Date(activeTransaction.date).toLocaleString()}</span>
                  </div>
                  {activeTransaction.status === 'refunded' && activeTransaction.refundDate && (
                    <div className="flex justify-between text-rose-600">
                      <span>{t('history.refunded').toUpperCase()}:</span>
                      <span>{new Date(activeTransaction.refundDate).toLocaleDateString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>{t('history.receipt')}</span>
                    <span>{activeTransaction.id}</span>
                  </div>
                  {activeTransaction.operatorName && (
                    <div className="flex justify-between">
                      <span>{t('history.operator')}</span>
                      <span>{activeTransaction.operatorName}</span>
                    </div>
                  )}
                  {activeTransaction.customerName && (
                    <div className="flex justify-between text-emerald-600 font-bold">
                      <span>{t('history.member')}</span>
                      <span>{activeTransaction.customerName}</span>
                    </div>
                  )}
                </div>

                {/* Items */}
                <div className="space-y-1 pb-3 border-b border-dashed border-slate-200">
                  {activeTransaction.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-[11px]">
                      <span className="truncate max-w-[130px]">
                        {item.quantity}x {item.productName}
                      </span>
                      <span>
                        {settings.currency}
                        {item.total.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Pricing Block */}
                <div className="space-y-1 pb-3 border-b border-dashed border-slate-200">
                  <div className="flex justify-between">
                    <span>{t('history.subtotal')}</span>
                    <span>
                      {settings.currency}
                      {activeTransaction.subtotal.toFixed(2)}
                    </span>
                  </div>
                  {activeTransaction.discount > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span>{t('history.discount')}</span>
                      <span>
                        -{settings.currency}
                        {activeTransaction.discount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-500">
                    <span>{t('history.tax')}</span>
                    <span>
                      {settings.currency}
                      {activeTransaction.tax.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-950 font-bold pt-1.5 border-t border-slate-100 text-sm">
                    <span>{t('history.totalPaid')}</span>
                    <span>
                      {settings.currency}
                      {activeTransaction.total.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Payment block */}
                <div className="space-y-1 text-[10px]">
                  <div className="flex justify-between">
                    <span>{t('history.payMethod')}</span>
                    <span className="uppercase font-bold">{activeTransaction.paymentMethod}</span>
                  </div>
                  {activeTransaction.paymentMethod === 'cash' && (
                    <>
                      <div className="flex justify-between">
                        <span>{t('history.cashPaid')}</span>
                        <span>
                          {settings.currency}
                          {(activeTransaction.cashPaid || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-950 font-bold">
                        <span>{t('history.cashChange')}</span>
                        <span>
                          {settings.currency}
                          {(activeTransaction.cashChange || 0).toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Simulated Barcode */}
                <div className="text-center pt-3 border-t border-dashed border-slate-200 space-y-1.5">
                  <div className="font-mono text-[10px] tracking-[4px] text-slate-400 select-none overflow-hidden h-4 flex items-center justify-center leading-none">
                    ||| | |||| ||| || | |||| || ||| | |||
                  </div>
                  <span className="text-[9px] text-slate-400 font-mono">
                    {t('history.auth')} {activeTransaction.id}
                  </span>
                </div>
              </div>

              {/* Refund trigger */}
              <div className="pt-4 mt-auto">
                {activeTransaction.status === 'completed' ? (
                  <button
                    id="refund-action-btn"
                    onClick={() => handleRefundClick(activeTransaction)}
                    className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-sans font-bold text-xs py-2.5 rounded-xl flex items-center justify-center space-x-1.5 transition-colors shadow-sm"
                  >
                    <RotateCcw size={14} />
                    <span>{t('history.refundThisSale')}</span>
                  </button>
                ) : (
                  <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl flex items-start gap-2">
                    <AlertTriangle size={14} className="text-rose-600 mt-0.5 shrink-0" />
                    <div className="text-[10px] text-rose-800 leading-normal">
                      <span className="font-bold">{t('history.returnedInventoryLocked')}</span>
                      <p className="mt-0.5">{t('history.returnedInventoryMsg')}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Print trigger footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100">
              <button
                onClick={() => handlePrintReceipt(activeTransaction)}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-sans font-bold text-xs py-2.5 rounded-xl flex items-center justify-center space-x-1.5 transition-colors shadow-md shadow-slate-900/10"
              >
                <Printer size={14} />
                <span>{t('history.printCopyReceipt')}</span>
              </button>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <span className="text-4xl mb-2">🧾</span>
            <h4 className="font-sans font-bold text-slate-700 text-sm">
              {t('history.noReceiptSelected')}
            </h4>
            <p className="text-xs text-slate-400 max-w-[200px] mt-1">
              {t('history.selectTransactionRow')}
            </p>
          </div>
        )}
      </div>

      {/* BULK DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 text-slate-100 max-w-sm w-full p-6 rounded-3xl shadow-2xl relative overflow-hidden"
            >
              <div className="text-center space-y-2 mb-6">
                <div className="mx-auto w-10 h-10 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full flex items-center justify-center">
                  <AlertTriangle size={18} />
                </div>
                <h3 className="font-sans font-extrabold text-base text-white">
                  {t('history.confirmDeletion')}
                </h3>
                <p className="text-xs text-slate-400">
                  {t('history.confirmDeletionMsg1')} {selectedTxIds.length}{' '}
                  {t('history.confirmDeletionMsg2')}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
                >
                  {t('history.cancel')}
                </button>
                <button
                  onClick={confirmBulkDelete}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors"
                >
                  {t('history.deleteNow')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* OVERRIDE PASSCODE CHALLENGE MODAL */}
      <AnimatePresence>
        {showOverrideModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 text-slate-100 max-w-sm w-full p-6 rounded-3xl shadow-2xl relative overflow-hidden"
            >
              <div className="text-center space-y-2 mb-6">
                <div className="mx-auto w-10 h-10 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full flex items-center justify-center">
                  <Lock size={18} />
                </div>
                <h3 className="font-sans font-extrabold text-base text-white">
                  {t('history.managerOverride')}
                </h3>
                <p className="text-xs text-slate-400">{t('history.enterManagerPasscode')}</p>
              </div>

              <form onSubmit={handleAuthorizeOverride} className="space-y-4">
                <div>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    autoFocus
                    placeholder="••••"
                    value={overridePin}
                    onChange={(e) => setOverridePin(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-2xl py-3 text-lg font-mono tracking-[1.5em] text-white font-bold placeholder-slate-800"
                  />
                </div>

                {overrideError && (
                  <p className="text-rose-400 text-center font-mono font-bold text-[10px] uppercase tracking-wider">
                    {overrideError}
                  </p>
                )}

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowOverrideModal(false);
                      setPendingRefundTxId(null);
                    }}
                    className="flex-1 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white font-sans font-semibold text-xs py-2.5 rounded-xl transition-colors"
                  >
                    {t('history.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-sans font-bold text-xs py-2.5 rounded-xl transition-colors"
                  >
                    {t('history.authorizeRefund')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
