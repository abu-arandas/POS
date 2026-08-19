import React, { useState, useMemo } from 'react';
import {
  Search,
  History as HistoryIcon,
  Printer,
  RotateCcw,
  CreditCard,
  DollarSign,
  Smartphone,
  Gift,
  Award,
  X,
  Check,
  AlertTriangle,
  Lock,
  ShoppingBag,
  Trash2,
  Download,
  Filter,
  ChevronRight,
  Minus,
  Plus,
} from 'lucide-react';
import { SaleTransaction, Product, Customer } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { hashPin, hashPinSalted } from '../lib/hash';
import { useTransactionStore } from '../stores/transactionStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { useProductStore } from '../stores/productStore';
import { useCustomerStore } from '../stores/customerStore';
import { syncToCloudIfEnabled } from '../lib/sync';
import { printTransactions } from '../lib/receiptPrinter';
import { printReceipt, HardwarePrintOutcome } from '../lib/hardwarePrint';
import { computeRefund, refundableQuantities } from '../lib/refunds';
import { useModalA11y } from '../lib/useModalA11y';
import { usePinAttemptStore } from '../stores/pinAttemptStore';
import { lockoutStatus, formatRemaining } from '../lib/pinThrottle';
import { toCsv, downloadCsv, transactionsToCsvRows } from '../lib/csv';
import type { RefundPatch } from '../stores/transactionStore';
import { useTranslation } from 'react-i18next';

// Single throttle bucket for the manager-override PIN (it is not tied to one
// account — any manager/admin PIN authorizes, so the guesser names no user).
const OVERRIDE_THROTTLE_KEY = '__manager_override__';

export default function History() {
  const { t } = useTranslation();
  const { transactions, applyRefund, deleteTransactions } = useTransactionStore();
  const { settings, printerConfig, receiptLayout } = useSettingsStore();
  const { currentUser, users } = useAuthStore();
  const { handleUpdateProduct } = useProductStore();
  const { updateCustomerPoints } = useCustomerStore();
  const pinAttempts = usePinAttemptStore((s) => s.attempts);
  const registerPinFailure = usePinAttemptStore((s) => s.registerFailure);
  const registerPinSuccess = usePinAttemptStore((s) => s.registerSuccess);

  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | '7days'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'refunded'>('all');
  const [paymentFilter, setPaymentFilter] = useState<string[]>([]);

  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [refundModalTx, setRefundModalTx] = useState<SaleTransaction | null>(null);
  const [refundSelection, setRefundSelection] = useState<Record<string, number>>({});
  const [refundStep, setRefundStep] = useState<1 | 2>(1);
  const [overridePin, setOverridePin] = useState('');
  const [overrideError, setOverrideError] = useState('');

  const canDelete = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const deleteModalRef = useModalA11y(showDeleteModal, () => setShowDeleteModal(false));
  const refundModalRef = useModalA11y(!!refundModalTx, () => setRefundModalTx(null));

  const activeTransaction = useMemo(() => {
    return transactions.find((tx) => tx.id === selectedTxId) || null;
  }, [transactions, selectedTxId]);

  const filteredTransactions = useMemo(() => {
    // Bolt: Hoist invariants outside the filter loop
    const query = searchQuery.toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    return transactions
      .filter((tx) => {
        const matchesSearch =
          tx.id.toLowerCase().includes(query) ||
          (tx.customerName && tx.customerName.toLowerCase().includes(query)) ||
          tx.paymentMethod.toLowerCase().includes(query);

        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'refunded' ? tx.status !== 'completed' : tx.status === 'completed');

        const matchesPayment =
          paymentFilter.length === 0 || paymentFilter.includes(tx.paymentMethod);

        let matchesDate = true;
        const txDate = new Date(tx.date);

        if (dateFilter === 'today') {
          matchesDate = txDate >= today;
        } else if (dateFilter === 'yesterday') {
          matchesDate = txDate >= yesterday && txDate < today;
        } else if (dateFilter === '7days') {
          matchesDate = txDate >= sevenDaysAgo;
        }

        return matchesSearch && matchesStatus && matchesDate && matchesPayment;
      })
      // Bolt: Sort ISO strings directly instead of parsing into Dates
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [transactions, searchQuery, dateFilter, statusFilter, paymentFilter]);

  // Group by date
  const groupedTransactions = useMemo(() => {
    const groups: Record<string, SaleTransaction[]> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    filteredTransactions.forEach((tx) => {
      const d = new Date(tx.date);
      d.setHours(0, 0, 0, 0);
      let label = d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      if (d.getTime() === today.getTime()) label = t('history.today', 'Today');
      else if (d.getTime() === yesterday.getTime()) label = t('history.yesterday', 'Yesterday');

      if (!groups[label]) groups[label] = [];
      groups[label].push(tx);
    });
    return groups;
  }, [filteredTransactions, t]);

  const openRefundModal = (tx: SaleTransaction) => {
    setRefundSelection({ ...refundableQuantities(tx) });
    setRefundModalTx(tx);
    setRefundStep(1);
    setOverridePin('');
    setOverrideError('');
  };

  const applyRefundWithSelection = (
    staleTx: SaleTransaction,
    selection: Record<string, number>,
    authorizedBy: string,
  ) => {
    const tx =
      useTransactionStore.getState().transactions.find((t) => t.id === staleTx.id) || staleTx;
    const result = computeRefund(
      tx,
      selection,
      settings.loyaltyPointsRate,
      settings.loyaltyPointValue,
    );
    if (!result) return;

    const updatedProducts: Product[] = [];
    const productState = useProductStore.getState().products;
    const prodMap = new Map(productState.map((p) => [p.id, p]));

    for (const [productId, qty] of Object.entries(result.appliedItems)) {
      if (qty <= 0) continue;
      const prod = prodMap.get(productId);
      if (prod) {
        const updated = { ...prod, stock: prod.stock + qty };
        handleUpdateProduct(updated);
        updatedProducts.push(updated);
      }
    }

    let updatedCustomer: Customer | undefined;
    if (tx.customerId && result.pointsReversal !== 0) {
      updateCustomerPoints(tx.customerId, result.pointsReversal);
      const customerState = useCustomerStore.getState().customers;
      const custMap = new Map(customerState.map((c) => [c.id, c]));
      updatedCustomer = custMap.get(tx.customerId);
    }

    const refundDate = new Date().toISOString();
    const patch: RefundPatch = {
      refundedItems: result.refundedItems,
      refundedAmount: result.refundedAmount,
      status: result.status,
      refundDate,
      authorizedBy,
    };
    applyRefund(tx.id, patch);

    syncToCloudIfEnabled(
      updatedProducts.length > 0 ? updatedProducts : undefined,
      undefined,
      updatedCustomer ? [updatedCustomer] : undefined,
      [
        {
          ...tx,
          status: result.status,
          refundedItems: result.refundedItems,
          refundedAmount: result.refundedAmount,
          refundDate,
          refundAuthorizedBy: authorizedBy,
        },
      ],
    );
  };

  const handleProcessRefund = () => {
    if (!refundModalTx) return;
    const totalQty = Object.values(refundSelection).reduce((s, q) => s + Math.max(0, q), 0);
    if (totalQty <= 0) return;

    if (refundStep === 1) {
      setRefundStep(2);
    } else {
      if (!currentUser || currentUser.role === 'cashier') {
        // Needs pin verification inline
        handleAuthorizeOverride();
      } else {
        applyRefundWithSelection(
          refundModalTx,
          refundSelection,
          `${currentUser.name} (${currentUser.role})`,
        );
        setRefundModalTx(null);
      }
    }
  };

  const handleAuthorizeOverride = async () => {
    setOverrideError('');
    // The override accepts ANY manager/admin PIN, so it is the widest PIN
    // surface in the app — throttle it like the lock screen. Keyed to the
    // override rather than an account, since the guesser hasn't named one.
    const gate = lockoutStatus(pinAttempts, OVERRIDE_THROTTLE_KEY, Date.now());
    if (gate.locked) {
      setOverrideError(t('history.overrideLockedOut', { time: formatRemaining(gate.remainingMs) }));
      return;
    }

    const eligible = users.filter((u) => u.active && (u.role === 'manager' || u.role === 'admin'));
    const [legacyHash, ...saltedHashes] = await Promise.all([
      hashPin(overridePin),
      ...eligible.map((u) => hashPinSalted(u.id, overridePin)),
    ]);
    let authorizedUser: (typeof eligible)[number] | undefined;
    for (let i = 0; i < eligible.length; i++) {
      const u = eligible[i];
      if (u.pin === saltedHashes[i] || u.pin === legacyHash) {
        authorizedUser = u;
        break;
      }
    }
    if (authorizedUser && refundModalTx) {
      registerPinSuccess(OVERRIDE_THROTTLE_KEY);
      applyRefundWithSelection(
        refundModalTx,
        refundSelection,
        `${authorizedUser.name} (${authorizedUser.role})`,
      );
      setRefundModalTx(null);
    } else {
      registerPinFailure(OVERRIDE_THROTTLE_KEY);
      const after = lockoutStatus(
        usePinAttemptStore.getState().attempts,
        OVERRIDE_THROTTLE_KEY,
        Date.now(),
      );
      setOverrideError(
        after.locked
          ? t('history.overrideLockedOut', { time: formatRemaining(after.remainingMs) })
          : t('history.invalidPasscode'),
      );
    }
  };

  const notifyPrint = (outcome: HardwarePrintOutcome) => {
    if (outcome === 'popup-blocked') alert(t('history.standardPrintBlocked'));
    else if (outcome === 'unsupported')
      alert(t('print.unsupported', { type: printerConfig.type.toUpperCase() }));
    else if (outcome === 'no-device') alert(t('print.noDevice'));
    else if (outcome === 'error') alert(t('print.error'));
  };

  const handlePrintReceipt = async (tx: SaleTransaction) => {
    notifyPrint(await printReceipt(tx, settings, printerConfig, false, receiptLayout));
  };

  const handleToggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedTxIds(filteredTransactions.map((tx) => tx.id));
    else setSelectedTxIds([]);
  };

  const handleToggleTx = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTxIds((prev) =>
      prev.includes(id) ? prev.filter((txId) => txId !== id) : [...prev, id],
    );
  };

  const confirmBulkDelete = () => {
    deleteTransactions(selectedTxIds);
    setSelectedTxIds([]);
    if (selectedTxId && selectedTxIds.includes(selectedTxId)) setSelectedTxId(null);
    setShowDeleteModal(false);
  };

  const handleBulkPrint = async () => {
    const txsToPrint = transactions.filter((tx) => selectedTxIds.includes(tx.id));
    if (printerConfig.type === 'system') {
      const outcome = printTransactions(txsToPrint, settings, printerConfig, receiptLayout);
      if (outcome === 'popup-blocked') alert(t('history.standardPrintBlocked'));
      return;
    }
    for (const tx of txsToPrint) {
      const outcome = await printReceipt(tx, settings, printerConfig, false, receiptLayout);
      if (outcome !== 'printed') {
        notifyPrint(outcome);
        break;
      }
    }
  };

  const getPaymentIcon = (method: string) => {
    switch (method) {
      case 'card':
        return <CreditCard size={13} className="text-blue-400" />;
      case 'cash':
        return <DollarSign size={13} className="text-emerald-400" />;
      case 'mobile':
        return <Smartphone size={13} className="text-purple-400" />;
      case 'gift':
        return <Gift size={13} className="text-amber-400" />;
      case 'loyalty':
        return <Award size={13} className="text-emerald-400" />;
      default:
        return <CreditCard size={13} className="text-slate-500 dark:text-slate-400" />;
    }
  };

  const togglePaymentFilter = (method: string) => {
    setPaymentFilter((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method],
    );
  };

  const renderRefundAmounts = () => {
    if (!refundModalTx) return null;
    const computed = computeRefund(
      refundModalTx,
      refundSelection,
      settings.loyaltyPointsRate,
      settings.loyaltyPointValue,
    );
    if (!computed) return null;
    return (
      <div className="bg-white/80 dark:bg-slate-900/50 rounded-2xl p-4 border border-slate-300 dark:border-slate-700 space-y-2 mt-4">
        {computed.pointsReversal !== 0 && (
          <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
            <span>{t('history.loyaltyAdjustment')}</span>
            <span className="font-mono">
              {computed.pointsReversal > 0 ? '+' : ''}
              {computed.pointsReversal} pts
            </span>
          </div>
        )}
        <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
          <span>{t('history.totalRefundedAfter')}</span>
          <span className="font-mono">
            {settings.currency}
            {computed.refundedAmount.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between text-lg font-bold text-slate-900 dark:text-white pt-2 border-t border-slate-300 dark:border-slate-700">
          <span>{t('history.refundAmount')}</span>
          <span className="text-emerald-400 font-mono">
            {settings.currency}
            {computed.refundAmount.toFixed(2)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div
      id="history-root"
      className="flex-1 flex h-screen overflow-hidden bg-slate-50 dark:bg-[#020617] p-6 text-slate-800 dark:text-slate-100 relative"
    >
      <div
        id="transaction-list-section"
        className="flex-1 flex flex-col min-w-0 pe-6 overflow-hidden"
      >
        <div id="history-header" className="mb-6 shrink-0 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-sans font-extrabold tracking-tight text-slate-900 dark:text-white text-xl sm:text-2xl flex items-center gap-2">
              <HistoryIcon className="text-emerald-500" /> {t('history.transactionLogs')}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
              {t('history.auditPastOrders')}
            </p>
          </div>
          <button
            id="export-csv-btn"
            onClick={() => {
              const rows = transactionsToCsvRows(filteredTransactions);
              downloadCsv(`transactions-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
            }}
            disabled={filteredTransactions.length === 0}
            className="shrink-0 flex items-center gap-1.5 glass-input hover:bg-slate-100 dark:bg-slate-800 disabled:opacity-40 text-slate-900 dark:text-white text-xs font-semibold px-4 py-2.5 rounded-2xl shadow-lg transition-colors"
          >
            <Download size={14} /> {t('history.exportCsv')}
          </button>
        </div>

        <div
          id="history-filters"
          className="surface p-5 rounded-4xl shadow-2xl mb-6 shrink-0 space-y-4"
        >
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 flex items-center space-x-2 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/10 px-4 py-2 rounded-2xl focus-within:ring-2 focus-within:ring-emerald-500/50 transition-shadow shadow-sm">
              <Search size={16} className="text-slate-400 dark:text-slate-500" />
              <input
                id="history-search-input"
                type="text"
                aria-label={t('history.searchReceipts')}
                placeholder={t('history.searchReceipts')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent border-none text-slate-700 dark:text-slate-200 text-sm focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            <div className="flex gap-2">
              <select
                id="history-status-select"
                aria-label={t('history.status')}
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as 'all' | 'completed' | 'refunded')
                }
                className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/10 rounded-2xl text-xs font-semibold px-4 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer transition-shadow shadow-sm"
              >
                <option
                  value="all"
                  className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {t('history.allStatuses')}
                </option>
                <option
                  value="completed"
                  className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {t('history.paidCompleted')}
                </option>
                <option
                  value="refunded"
                  className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {t('history.refundedReturned')}
                </option>
              </select>

              <div className="flex bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-white/5 p-1 rounded-2xl shrink-0 shadow-inner">
                {(
                  [
                    { id: 'all', label: t('history.allDates') },
                    { id: 'today', label: t('history.today') },
                    { id: 'yesterday', label: t('history.yesterday') },
                    { id: '7days', label: t('history.last7Days') },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setDateFilter(opt.id)}
                    className={`px-4 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all shrink-0 border ${
                      dateFilter === opt.id
                        ? 'bg-white dark:bg-slate-700/50 text-emerald-600 dark:text-emerald-400 shadow-sm border-slate-200/50 dark:border-white/10'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/5'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-slate-400 dark:text-slate-500" />
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t('history.paymentFilter')}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {['cash', 'card', 'mobile', 'gift'].map((method) => (
                <button
                  key={method}
                  onClick={() => togglePaymentFilter(method)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 shadow-sm ${
                    paymentFilter.includes(method)
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/30 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/50 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {getPaymentIcon(method)} <span className="uppercase">{method}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          id="history-table-container"
          className="flex-1 surface rounded-4xl shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="flex-1 overflow-y-auto scrollbar-none relative">
            <table id="history-table" className="w-full text-start border-collapse table-fixed">
              <thead className="sticky top-0 z-20">
                <tr className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider font-mono border-b border-slate-200 dark:border-white/5 shadow-sm">
                  <th className="py-4 px-4 w-12.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={t('history.selectAll')}
                      className="rounded bg-slate-100 dark:bg-slate-800 border-slate-600 text-emerald-500 focus:ring-emerald-500 cursor-pointer w-4 h-4"
                      checked={
                        filteredTransactions.length > 0 &&
                        selectedTxIds.length === filteredTransactions.length
                      }
                      onChange={handleToggleSelectAll}
                    />
                  </th>
                  <th className="py-4 px-2 w-35">{t('history.receiptId')}</th>
                  <th className="py-4 px-4 w-1/4">{t('history.customer')}</th>
                  <th className="py-4 px-3 w-1/8 text-center">{t('history.items')}</th>
                  <th className="py-4 px-4 w-1/8 text-end">{t('history.total')}</th>
                  <th className="py-4 px-4 w-1/8 text-center">{t('history.payment')}</th>
                  <th className="py-4 px-4 w-30 text-center">{t('history.status')}</th>
                </tr>
              </thead>
              <tbody className="text-sm font-sans text-slate-700 dark:text-slate-200">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-16 text-center text-slate-500 dark:text-slate-400 font-mono"
                    >
                      <div className="flex flex-col items-center">
                        <HistoryIcon size={32} className="text-slate-600 mb-3" />
                        {t('history.noHistoricalTransactions')}
                      </div>
                    </td>
                  </tr>
                ) : (
                  Object.entries(groupedTransactions).map(([dateLabel, txs]) => (
                    <React.Fragment key={dateLabel}>
                      <tr>
                        <td
                          colSpan={7}
                          className="py-2 px-4 bg-white/60 dark:bg-slate-900/40 text-xs font-bold text-slate-500 dark:text-slate-400 sticky top-12 z-10 backdrop-blur-sm border-y border-slate-200 dark:border-white/5 uppercase tracking-widest"
                        >
                          {dateLabel}
                        </td>
                      </tr>
                      {txs.map((tx) => {
                        const isRefunded = tx.status === 'refunded';
                        const isPartial = tx.status === 'partial';
                        const isSelected = tx.id === selectedTxId;
                        const isChecked = selectedTxIds.includes(tx.id);

                        return (
                          <tr
                            key={tx.id}
                            onClick={() => setSelectedTxId(tx.id)}
                            onKeyDown={(e) => {
                              // Only when the row itself is focused — keys on the
                              // nested checkbox must keep their native behavior.
                              if (e.target !== e.currentTarget) return;
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedTxId(tx.id);
                              }
                            }}
                            tabIndex={0}
                            className={`transition-colors cursor-pointer border-b border-slate-200 dark:border-white/5 last:border-0 ${
                              isSelected
                                ? 'bg-slate-200 dark:bg-slate-800/80 hover:bg-slate-300 dark:hover:bg-slate-700/80'
                                : 'hover:bg-slate-100 dark:bg-slate-800/40'
                            } ${isRefunded ? 'opacity-60' : ''}`}
                          >
                            <td
                              className="py-4 px-4 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                aria-label={`${t('history.selectTransaction')} ${tx.id.substring(0, 12)}`}
                                className="rounded bg-slate-100 dark:bg-slate-800 border-slate-600 text-emerald-500 focus:ring-emerald-500 cursor-pointer w-4 h-4"
                                checked={isChecked}
                                onChange={(e) =>
                                  handleToggleTx(tx.id, e as unknown as React.MouseEvent)
                                }
                              />
                            </td>
                            <td className="py-4 px-2 font-mono font-bold text-slate-600 dark:text-slate-300 text-xs">
                              {tx.id.length > 12 ? `${tx.id.substring(0, 12)}\u2026` : tx.id}
                              <div className="text-[10px] text-slate-500 mt-1 font-sans">
                                {new Date(tx.date).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              {tx.customerName ? (
                                <span className="font-bold text-slate-900 dark:text-white">
                                  {tx.customerName}
                                </span>
                              ) : (
                                <span className="text-slate-500 font-medium italic">
                                  {t('history.walkIn')}
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-3 text-center">
                              <span className="inline-block bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg text-xs font-mono text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                                {tx.items.reduce((sum, item) => sum + item.quantity, 0)}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-end font-mono font-bold text-slate-900 dark:text-white">
                              {settings.currency}
                              {tx.total.toFixed(2)}
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center justify-center gap-1.5 font-mono uppercase text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/50 py-1 px-2 rounded-xl border border-slate-300 dark:border-slate-700">
                                {getPaymentIcon(tx.paymentMethod)}
                                <span>{tx.paymentMethod}</span>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-center">
                              <span
                                className={`badge ${isRefunded ? 'badge-rose' : isPartial ? 'badge-amber' : 'badge-emerald'}`}
                              >
                                {isRefunded
                                  ? t('history.refunded')
                                  : isPartial
                                    ? t('history.partial')
                                    : t('history.paid')}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 border-t border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/60 text-[11px] text-slate-500 dark:text-slate-400 font-mono flex justify-between shrink-0">
            <span>
              {t('history.filteredCount')} {filteredTransactions.length} {t('history.sales')}
            </span>
            <span className="font-bold text-slate-700 dark:text-slate-200">
              {t('history.totalValue')} {settings.currency}
              {filteredTransactions
                .reduce(
                  (sum, tx) =>
                    sum + (tx.status === 'refunded' ? 0 : tx.total - (tx.refundedAmount ?? 0)),
                  0,
                )
                .toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {activeTransaction && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            id="receipt-view-section"
            className="absolute top-6 inset-e-6 bottom-6 w-96 glass dark:glass-dark border border-slate-200 dark:border-white/10 rounded-4xl shadow-2xl flex flex-col overflow-hidden z-30"
          >
            <div
              className={`p-5 flex items-center justify-between border-b border-slate-200 dark:border-white/10 ${
                activeTransaction.status === 'refunded'
                  ? 'bg-rose-500/10'
                  : activeTransaction.status === 'partial'
                    ? 'bg-amber-500/10'
                    : 'bg-emerald-500/10'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Check
                  size={18}
                  className={
                    activeTransaction.status === 'refunded'
                      ? 'text-rose-500'
                      : activeTransaction.status === 'partial'
                        ? 'text-amber-500'
                        : 'text-emerald-500'
                  }
                />
                <span className="font-sans font-bold text-sm text-slate-900 dark:text-white">
                  {activeTransaction.status === 'refunded'
                    ? t('history.transactionRefunded')
                    : activeTransaction.status === 'partial'
                      ? t('history.transactionPartial')
                      : t('history.transactionPaid')}
                </span>
              </div>
              <button
                onClick={() => setSelectedTxId(null)}
                aria-label={t('history.closeDetails')}
                className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-white rounded-xl transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 p-6 overflow-y-auto bg-white dark:bg-slate-950 flex flex-col justify-between scrollbar-none relative">
              <div className="absolute inset-0 mesh-bg-dark opacity-30 pointer-events-none" />

              <div
                id="audit-receipt-mockup"
                className="bg-white text-slate-900 rounded-lg p-5 shadow-sm font-mono text-[11px] relative z-10 receipt-paper"
              >
                <div className="text-center border-b border-dashed border-slate-300 pb-4 mb-4">
                  <div className="flex justify-center mb-2">
                    {settings.storeLogo ? (
                      <img
                        src={settings.storeLogo}
                        alt="Logo"
                        className="h-8 w-auto object-contain"
                      />
                    ) : (
                      <ShoppingBag size={28} className="text-slate-800" />
                    )}
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
                    {settings.storeName}
                  </h4>
                  <p className="text-[10px] text-slate-500 mt-1">{settings.storeAddress}</p>
                  <p className="text-[10px] text-slate-500">{settings.storePhone}</p>
                </div>

                <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-4 mb-4">
                  <div className="flex justify-between">
                    <span>{t('history.date')}</span>
                    <span>{new Date(activeTransaction.date).toLocaleString()}</span>
                  </div>
                  {activeTransaction.status === 'refunded' && activeTransaction.refundDate && (
                    <div className="flex justify-between text-rose-600 font-bold">
                      <span>{t('history.refunded').toUpperCase()}:</span>
                      <span>{new Date(activeTransaction.refundDate).toLocaleDateString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>{t('history.receipt')}</span>
                    <span className="font-bold">{activeTransaction.id.substring(0, 8)}...</span>
                  </div>
                  {activeTransaction.operatorName && (
                    <div className="flex justify-between">
                      <span>{t('history.operator')}</span>
                      <span>{activeTransaction.operatorName}</span>
                    </div>
                  )}
                  {activeTransaction.customerName && (
                    <div className="flex justify-between text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                      <span>{t('history.member')}</span>
                      <span>{activeTransaction.customerName}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-b border-dashed border-slate-300 pb-4 mb-4">
                  <div className="grid grid-cols-12 text-slate-500 dark:text-slate-400 font-bold mb-1">
                    <span className="col-span-8">ITEM</span>
                    <span className="col-span-2 text-center">QTY</span>
                    <span className="col-span-2 text-end">TOT</span>
                  </div>
                  {activeTransaction.items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12">
                      <span className="col-span-8 truncate pe-2">{item.productName}</span>
                      <span className="col-span-2 text-center">{item.quantity}</span>
                      <span className="col-span-2 text-end">
                        {settings.currency}
                        {item.total.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-4 mb-4">
                  <div className="flex justify-between">
                    <span>{t('history.subtotal')}</span>
                    <span>
                      {settings.currency}
                      {activeTransaction.subtotal.toFixed(2)}
                    </span>
                  </div>
                  {activeTransaction.discount > 0 && (
                    <div className="flex justify-between text-rose-600">
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
                  <div className="flex justify-between text-slate-900 font-bold pt-2 border-t border-slate-200 text-sm mt-1">
                    <span>{t('history.totalPaid')}</span>
                    <span>
                      {settings.currency}
                      {activeTransaction.total.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="space-y-1 text-center text-[10px] text-slate-500">
                  <p>PAID VIA {activeTransaction.paymentMethod.toUpperCase()}</p>
                  <p className="mt-2 font-bold uppercase">{receiptLayout.footer}</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-white/10 flex gap-2">
              <button
                onClick={() => handlePrintReceipt(activeTransaction)}
                className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white py-3 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
              >
                <Printer size={16} /> {t('history.print')}
              </button>
              {activeTransaction.status !== 'refunded' && (
                <button
                  onClick={() => openRefundModal(activeTransaction)}
                  className="flex-1 bg-rose-500 hover:bg-rose-600 text-slate-900 dark:text-white py-3 rounded-xl text-xs font-bold transition-colors shadow-lg shadow-rose-500/20 flex items-center justify-center gap-2"
                >
                  <RotateCcw size={16} /> {t('history.refund')}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedTxIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur-xl border border-slate-200 dark:border-white/10 p-3 rounded-2xl flex items-center gap-6 shadow-2xl z-40"
          >
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                {selectedTxIds.length}
              </div>
              <span className="text-slate-900 dark:text-white font-bold text-sm">
                {t('history.selected')}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleBulkPrint}
                className="bg-slate-700 hover:bg-slate-600 text-slate-900 dark:text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2 transition-colors"
              >
                <Printer size={16} /> {t('history.print')}
              </button>
              {canDelete && (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="bg-rose-500 hover:bg-rose-600 text-slate-900 dark:text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2 transition-colors"
                >
                  <Trash2 size={16} /> {t('history.delete')}
                </button>
              )}
              <button
                onClick={() => setSelectedTxIds([])}
                aria-label={t('history.clearSelection')}
                className="bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-2.5 rounded-xl transition-colors ms-2"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
            <motion.div
              ref={deleteModalRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-tx-title"
              tabIndex={-1}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="modal-card max-w-sm w-full p-6 text-center"
            >
              <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={32} />
              </div>
              <h3
                id="delete-tx-title"
                className="text-xl font-bold text-slate-900 dark:text-white mb-2"
              >
                {t('history.deleteTitle')}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                {t('history.deleteBody', { count: selectedTxIds.length })}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-bold transition-colors"
                >
                  {t('history.cancel')}
                </button>
                <button
                  onClick={confirmBulkDelete}
                  className="flex-1 px-4 py-3 bg-rose-500 hover:bg-rose-600 text-slate-900 dark:text-white rounded-xl font-bold transition-colors"
                >
                  {t('history.delete')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {refundModalTx && (
          <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
            <motion.div
              ref={refundModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="refund-modal-title"
              tabIndex={-1}
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="modal-card max-w-md w-full overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/50 flex justify-between items-center">
                <h3
                  id="refund-modal-title"
                  className="font-sans font-bold text-slate-900 dark:text-white text-lg"
                >
                  {refundStep === 1 ? t('history.refundStep1') : t('history.refundStep2')}
                </h3>
                <button
                  onClick={() => setRefundModalTx(null)}
                  aria-label={t('history.close')}
                  className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                {refundStep === 1 && (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                      {t('history.selectQtyHint')}
                    </p>
                    {refundModalTx.items.map((item, idx) => {
                      const max = refundableQuantities(refundModalTx)[item.productId] || 0;
                      if (max <= 0) return null;
                      const current = refundSelection[item.productId] || 0;
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-slate-100 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-white/5"
                        >
                          <div className="flex-1 min-w-0 pe-4">
                            <h4 className="text-slate-900 dark:text-white font-bold truncate">
                              {item.productName}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                              {settings.currency}
                              {(item.total / item.quantity).toFixed(2)} {t('history.each')}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 bg-white dark:bg-slate-900 rounded-xl p-1 border border-slate-200 dark:border-white/10">
                            <button
                              onClick={() =>
                                setRefundSelection({
                                  ...refundSelection,
                                  [item.productId]: Math.max(0, current - 1),
                                })
                              }
                              aria-label={`${t('history.decreaseRefundQty')} — ${item.productName}`}
                              className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-900 dark:text-white hover:bg-rose-500/20 hover:text-rose-400"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="w-6 text-center font-bold font-mono text-slate-900 dark:text-white">
                              {current}
                            </span>
                            <button
                              onClick={() =>
                                setRefundSelection({
                                  ...refundSelection,
                                  [item.productId]: Math.min(max, current + 1),
                                })
                              }
                              aria-label={`${t('history.increaseRefundQty')} — ${item.productName}`}
                              className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-900 dark:text-white hover:bg-emerald-500/20 hover:text-emerald-400"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {refundStep === 2 && (
                  <div className="space-y-6">
                    {renderRefundAmounts()}
                    {(!currentUser || currentUser.role === 'cashier') && (
                      <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-5">
                        <div className="flex items-center gap-2 text-rose-400 mb-3 font-bold text-sm">
                          <Lock size={16} /> {t('history.managerAuthRequired')}
                        </div>
                        <input
                          type="password"
                          placeholder={t('history.managerPin')}
                          aria-label={t('history.managerPin')}
                          data-autofocus
                          value={overridePin}
                          onChange={(e) => setOverridePin(e.target.value)}
                          className="w-full glass-input rounded-xl px-4 py-3 text-slate-900 dark:text-white text-center tracking-widest font-mono focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                        />
                        {overrideError && (
                          <p className="text-xs text-rose-400 mt-2 text-center">{overrideError}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/50 flex gap-3">
                {refundStep === 2 && (
                  <button
                    onClick={() => setRefundStep(1)}
                    className="px-5 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-bold transition-colors"
                  >
                    {t('history.back')}
                  </button>
                )}
                <button
                  onClick={handleProcessRefund}
                  disabled={
                    refundStep === 1 &&
                    Object.values(refundSelection).reduce((a, b) => a + b, 0) === 0
                  }
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-slate-900 dark:text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
                >
                  {refundStep === 1 ? t('history.next') : t('history.confirmRefund')}{' '}
                  {refundStep === 1 && <ChevronRight size={16} />}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
