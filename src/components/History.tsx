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
  Share2,
  Mail,
  Download,
} from 'lucide-react';
import { SaleTransaction, Product, Customer, UserAccount } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { hashPin, hashUserPin } from '../lib/hash';
import { useTransactionStore } from '../stores/transactionStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { useProductStore } from '../stores/productStore';
import { useCustomerStore } from '../stores/customerStore';
import { syncToCloudIfEnabled } from '../lib/sync';
import { printTransactions } from '../lib/receiptPrinter';
import { printReceipt, HardwarePrintOutcome } from '../lib/hardwarePrint';
import { shareReceipt, emailReceipt } from '../lib/digitalReceipt';
import { computeRefund, refundableQuantities } from '../lib/refunds';
import { toCsv, downloadCsv, transactionsToCsvRows } from '../lib/csv';
import type { RefundPatch } from '../stores/transactionStore';
import { useTranslation } from 'react-i18next';

export default function History() {
  const { t } = useTranslation();
  const { transactions, applyRefund, deleteTransactions } = useTransactionStore();
  const { settings, printerConfig } = useSettingsStore();
  const { currentUser, users } = useAuthStore();
  const { handleUpdateProduct } = useProductStore();
  const { updateCustomerPoints, customers } = useCustomerStore();

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

  // Refund selection modal (line-item / partial refunds)
  const [refundModalTx, setRefundModalTx] = useState<SaleTransaction | null>(null);
  const [refundSelection, setRefundSelection] = useState<Record<string, number>>({});

  // Passcode Challenge Modal for Refunds
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overridePin, setOverridePin] = useState('');
  const [overrideError, setOverrideError] = useState('');

  // Cashiers may view and print history, but destructive bulk deletion is
  // reserved for managers/admins (refunds already require an override).
  const canDelete = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const activeTransaction = useMemo(() => {
    return transactions.find((tx) => tx.id === selectedTxId) || null;
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
      // The "refunded" filter includes partially-refunded sales (any refund activity).
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'refunded' ? tx.status !== 'completed' : tx.status === 'completed');

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

  // Opens the refund selection modal, defaulting to returning every remaining
  // (not-yet-refunded) unit — i.e. a full refund unless the operator narrows it.
  const openRefundModal = (tx: SaleTransaction) => {
    setRefundSelection({ ...refundableQuantities(tx) });
    setRefundModalTx(tx);
  };

  // Applies a (possibly partial) refund: returns the selected quantities to
  // stock, reverses the proportional loyalty points, records the cumulative
  // refund on the transaction, and syncs. Reads points earned from the sale so
  // a later rate change never distorts the reversal.
  const applyRefundWithSelection = (
    tx: SaleTransaction,
    selection: Record<string, number>,
    authorizedBy: string,
  ) => {
    // Re-read the live record: the modal holds a snapshot, and the same sale
    // may have been refunded on another terminal (realtime sync) meanwhile.
    // computeRefund clamps the selection against the live refundable state.
    const liveTx = useTransactionStore.getState().transactions.find((x) => x.id === tx.id) ?? tx;
    const result = computeRefund(liveTx, selection, settings.loyaltyPointsRate);
    if (!result) return;

    const updatedProducts: Product[] = [];
    // Restore stock from the clamped quantities the refund actually covers,
    // never the raw selection — the two differ when the snapshot was stale.
    for (const { productId, quantity } of result.appliedItems) {
      const prod = useProductStore.getState().products.find((p) => p.id === productId);
      if (prod) {
        const updated = { ...prod, stock: prod.stock + quantity };
        handleUpdateProduct(updated);
        updatedProducts.push(updated);
      }
    }

    let updatedCustomer: Customer | undefined;
    if (liveTx.customerId && result.pointsReversal !== 0) {
      updateCustomerPoints(liveTx.customerId, result.pointsReversal);
      updatedCustomer = useCustomerStore
        .getState()
        .customers.find((c) => c.id === liveTx.customerId);
    }

    const refundDate = new Date().toISOString();
    const patch: RefundPatch = {
      refundedItems: result.refundedItems,
      refundedAmount: result.refundedAmount,
      status: result.status,
      refundDate,
      authorizedBy,
    };
    applyRefund(liveTx.id, patch);

    syncToCloudIfEnabled(
      updatedProducts.length > 0 ? updatedProducts : undefined,
      undefined,
      updatedCustomer ? [updatedCustomer] : undefined,
      [
        {
          ...liveTx,
          status: result.status,
          refundedItems: result.refundedItems,
          refundedAmount: result.refundedAmount,
          refundDate,
          refundAuthorizedBy: authorizedBy,
        },
      ],
    );
  };

  // Refund entry point — opens the line-item selection modal.
  const handleRefundClick = (tx: SaleTransaction) => openRefundModal(tx);

  // From the refund modal: process the current selection. Cashiers must pass a
  // manager/admin override first; managers/admins confirm inline.
  const handleProcessRefund = () => {
    if (!refundModalTx) return;
    const totalQty = Object.values(refundSelection).reduce((s, q) => s + Math.max(0, q), 0);
    if (totalQty <= 0) return;
    if (!currentUser || currentUser.role === 'cashier') {
      setOverridePin('');
      setOverrideError('');
      setShowOverrideModal(true);
    } else {
      applyRefundWithSelection(
        refundModalTx,
        refundSelection,
        `${currentUser.name} (${currentUser.role})`,
      );
      setRefundModalTx(null);
    }
  };

  const handleAuthorizeOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    setOverrideError('');

    // Accept both the current (id-salted) and legacy PIN hash schemes.
    const legacyHash = await hashPin(overridePin);
    let authorizedUser: UserAccount | undefined;
    for (const u of users) {
      if (!u.active || (u.role !== 'manager' && u.role !== 'admin')) continue;
      if (u.pin === legacyHash || u.pin === (await hashUserPin(u.id, overridePin))) {
        authorizedUser = u;
        break;
      }
    }
    if (authorizedUser && refundModalTx) {
      applyRefundWithSelection(
        refundModalTx,
        refundSelection,
        `${authorizedUser.name} (${authorizedUser.role})`,
      );
      alert(
        t('history.refundAuthorized', { name: authorizedUser.name, role: authorizedUser.role }),
      );
      setShowOverrideModal(false);
      setOverridePin('');
      setRefundModalTx(null);
    } else {
      setOverrideError(t('history.invalidPasscode'));
      setOverridePin('');
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
    notifyPrint(await printReceipt(tx, settings, printerConfig));
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

  const handleBulkPrint = async () => {
    const txsToPrint = transactions.filter((tx) => selectedTxIds.includes(tx.id));
    // System (browser) printing batches every receipt into one print window;
    // hardware transports stream them one at a time.
    if (printerConfig.type === 'system') {
      const outcome = printTransactions(txsToPrint, settings, printerConfig);
      if (outcome === 'popup-blocked') alert(t('history.standardPrintBlocked'));
      return;
    }
    for (const tx of txsToPrint) {
      const outcome = await printReceipt(tx, settings, printerConfig);
      if (outcome !== 'printed') {
        notifyPrint(outcome);
        break;
      }
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
      case 'loyalty':
        return <Award size={13} className="text-emerald-500" />;
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
        <div id="history-header" className="mb-6 shrink-0 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-sans font-extrabold tracking-tight text-slate-900 dark:text-white text-xl sm:text-2xl flex items-center gap-2">
              <HistoryIcon className="text-emerald-500" /> {t('history.transactionLogs')}
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
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
            className="shrink-0 flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-700 dark:text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl shadow-sm transition-colors"
          >
            <Download size={14} /> {t('history.exportCsv')}
          </button>
        </div>

        {/* Filters */}
        <div
          id="history-filters"
          className="glass dark:glass-dark p-4 rounded-2xl border border-white/20 dark:border-white/10 shadow-lg space-y-4 mb-6 shrink-0 backdrop-blur-md"
        >
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 flex items-center space-x-2 bg-slate-100 dark:bg-slate-800/60 px-3 py-2 rounded-xl border border-slate-200/40 dark:border-slate-700/40">
              <Search size={16} className="text-slate-400" />
              <input
                id="history-search-input"
                type="text"
                placeholder={t('history.searchReceipts')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent border-none text-slate-800 dark:text-slate-100 text-xs focus:outline-none placeholder-slate-400"
              />
            </div>

            <div className="flex bg-slate-100 dark:bg-slate-800/60 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
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
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all shrink-0 ${
                    dateFilter === opt.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <select
              id="history-status-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'completed' | 'refunded')}
              className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold px-3 py-1.5 text-slate-600 dark:text-slate-300 focus:outline-none focus:border-emerald-500 shrink-0"
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
                  className="bg-transparent border-none text-xs text-slate-700 dark:text-slate-200 focus:outline-none font-mono"
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
                  className="bg-transparent border-none text-xs text-slate-700 dark:text-slate-200 focus:outline-none font-mono"
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
          <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 p-3 rounded-2xl flex justify-between items-center mb-6 shrink-0 shadow-sm transition-all animate-in fade-in slide-in-from-top-2">
            <span className="text-emerald-800 dark:text-emerald-300 font-bold text-xs px-2">
              {selectedTxIds.length} {t('history.transactionsSelected')}
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleBulkPrint}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-colors"
              >
                <Printer size={14} /> {t('history.printSelected')}
              </button>
              {canDelete && (
                <button
                  onClick={handleBulkDelete}
                  className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 size={14} /> {t('history.deleteSelected')}
                </button>
              )}
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
                    const isPartial = tx.status === 'partial';
                    const isSelected = tx.id === selectedTxId;

                    return (
                      <tr
                        key={tx.id}
                        id={`history-row-${tx.id}`}
                        onClick={() => setSelectedTxId(tx.id)}
                        className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-slate-100/80 dark:bg-slate-800/60 hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
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
                        <td className="py-3 px-2 font-mono font-bold text-slate-900 dark:text-slate-100">
                          {tx.id}
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-mono">
                          {new Date(tx.date).toLocaleDateString()} &bull;{' '}
                          {new Date(tx.date).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-200 truncate">
                          {tx.customerName || (
                            <span className="text-slate-400 font-normal">
                              {t('history.walkIn')}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold bg-slate-50/40 dark:bg-slate-900/40">
                          {tx.items.reduce((sum, item) => sum + item.quantity, 0)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
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
                                : isPartial
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}
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
                .reduce(
                  (sum, tx) =>
                    // Net of any refunds: full refund contributes 0, partial nets out.
                    sum + (tx.status === 'refunded' ? 0 : tx.total - (tx.refundedAmount ?? 0)),
                  0,
                )
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
                  : activeTransaction.status === 'partial'
                    ? 'bg-amber-50 border-amber-100 text-amber-800'
                    : 'bg-emerald-50 border-emerald-100 text-emerald-800'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Check
                  size={16}
                  className={
                    activeTransaction.status === 'refunded'
                      ? 'text-rose-600'
                      : activeTransaction.status === 'partial'
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                  }
                />
                <span className="font-sans font-bold text-xs">
                  {activeTransaction.status === 'refunded'
                    ? t('history.transactionRefunded')
                    : activeTransaction.status === 'partial'
                      ? t('history.transactionPartial')
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
                  {activeTransaction.status === 'refunded' &&
                    activeTransaction.refundAuthorizedBy && (
                      <div className="flex justify-between text-rose-600">
                        <span>{t('history.refundAuthBy')}</span>
                        <span className="truncate max-w-[150px]">
                          {activeTransaction.refundAuthorizedBy}
                        </span>
                      </div>
                    )}
                  {activeTransaction.orderNumber !== undefined && (
                    <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                      <span>{t('register.orderNumber')}</span>
                      <span>#{activeTransaction.orderNumber}</span>
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
              <div className="pt-4 mt-auto space-y-2">
                {activeTransaction.refundedAmount ? (
                  <div className="flex justify-between text-[11px] font-mono text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                    <span className="font-bold">{t('history.alreadyRefunded')}</span>
                    <span>
                      {settings.currency}
                      {activeTransaction.refundedAmount.toFixed(2)}
                    </span>
                  </div>
                ) : null}
                {activeTransaction.status !== 'refunded' ? (
                  <button
                    id="refund-action-btn"
                    onClick={() => handleRefundClick(activeTransaction)}
                    className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-sans font-bold text-xs py-2.5 rounded-xl flex items-center justify-center space-x-1.5 transition-colors shadow-sm"
                  >
                    <RotateCcw size={14} />
                    <span>
                      {activeTransaction.status === 'partial'
                        ? t('history.refundRemaining')
                        : t('history.refundThisSale')}
                    </span>
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

            {/* Print / share footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
              <button
                onClick={() => handlePrintReceipt(activeTransaction)}
                className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-sans font-bold text-xs py-2.5 rounded-xl flex items-center justify-center space-x-1.5 transition-colors shadow-md shadow-slate-900/10"
              >
                <Printer size={14} />
                <span>{t('history.printCopyReceipt')}</span>
              </button>
              <button
                onClick={() => shareReceipt(activeTransaction, settings)}
                title={t('register.share')}
                className="px-3 py-2.5 border border-slate-200 hover:bg-white text-slate-600 rounded-xl transition-colors shadow-sm"
              >
                <Share2 size={14} />
              </button>
              <button
                onClick={() =>
                  emailReceipt(
                    activeTransaction,
                    settings,
                    customers.find((c) => c.id === activeTransaction.customerId)?.email ||
                      undefined,
                  )
                }
                title={t('register.email')}
                className="px-3 py-2.5 border border-slate-200 hover:bg-white text-slate-600 rounded-xl transition-colors shadow-sm"
              >
                <Mail size={14} />
              </button>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <span className="text-4xl mb-2">🧾</span>
            <h4 className="font-sans font-bold text-slate-700 dark:text-slate-200 text-sm">
              {t('history.noReceiptSelected')}
            </h4>
            <p className="text-xs text-slate-400 max-w-[200px] mt-1">
              {t('history.selectTransactionRow')}
            </p>
          </div>
        )}
      </div>

      {/* REFUND SELECTION MODAL (line-item / partial) */}
      <AnimatePresence>
        {refundModalTx &&
          (() => {
            const remaining = refundableQuantities(refundModalTx);
            const preview = computeRefund(
              refundModalTx,
              refundSelection,
              settings.loyaltyPointsRate,
            );
            const anySelected = Object.values(refundSelection).some((q) => q > 0);
            return (
              <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-w-md w-full rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
                >
                  <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      <RotateCcw size={18} className="text-rose-500" />
                      {t('history.refundItems')} — {refundModalTx.id}
                    </h3>
                    <button
                      onClick={() => setRefundModalTx(null)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="p-4 overflow-y-auto space-y-2">
                    {refundModalTx.items.map((item) => {
                      const rem = remaining[item.productId] ?? 0;
                      const sel = refundSelection[item.productId] ?? 0;
                      return (
                        <div
                          key={item.productId}
                          className={`flex items-center justify-between gap-3 rounded-xl p-3 border ${
                            rem === 0
                              ? 'opacity-50 border-slate-200 dark:border-slate-700'
                              : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                              {item.productName}
                            </p>
                            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              {settings.currency}
                              {item.price.toFixed(2)} · {t('history.refundable')}: {rem}/
                              {item.quantity}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              disabled={sel <= 0}
                              onClick={() =>
                                setRefundSelection((s) => ({
                                  ...s,
                                  [item.productId]: Math.max(0, (s[item.productId] ?? 0) - 1),
                                }))
                              }
                              className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 flex items-center justify-center"
                            >
                              −
                            </button>
                            <span className="w-8 text-center font-mono font-bold text-sm text-slate-800 dark:text-slate-100">
                              {sel}
                            </span>
                            <button
                              disabled={sel >= rem}
                              onClick={() =>
                                setRefundSelection((s) => ({
                                  ...s,
                                  [item.productId]: Math.min(rem, (s[item.productId] ?? 0) + 1),
                                }))
                              }
                              className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 flex items-center justify-center"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
                        {t('history.refundTotal')}
                      </span>
                      <span className="font-mono font-extrabold text-lg text-rose-600 dark:text-rose-400">
                        {settings.currency}
                        {(preview?.refundAmount ?? 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex gap-2.5">
                      <button
                        onClick={() => setRefundModalTx(null)}
                        className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                      >
                        {t('history.cancel')}
                      </button>
                      <button
                        onClick={handleProcessRefund}
                        disabled={!anySelected}
                        className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white transition-colors"
                      >
                        {preview?.fullyRefunded
                          ? t('history.processFullRefund')
                          : t('history.processRefund')}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            );
          })()}
      </AnimatePresence>

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
                    onClick={() => setShowOverrideModal(false)}
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
