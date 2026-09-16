import { useState } from 'react';
import { History as HistoryIcon, Download } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { SaleTransaction } from '../types';
import { useTransactionStore } from '../stores/transactionStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { commitRefund } from '../services';
import { printTransactions } from '../lib/printing/print';
import { printReceipt, HardwarePrintOutcome } from '../lib/printing/hardwarePrint';
import { notify } from '../lib/utils/ui';
import { localDateKey } from '../lib/utils/dates';
import { toCsv, downloadCsv, transactionsToCsvRows } from '../lib/csv';
import {
  BulkActionBar,
  DeleteTransactionsModal,
  HistoryFilters,
  RefundModal,
  TransactionDetailPanel,
  TransactionTable,
  useHistoryFilters,
} from './history/index';

/**
 * Sale history screen: search past transactions, reprint receipts, and issue
 * full or partial refunds.
 *
 * This module owns the data — the stores, the filter hook, printing and the
 * refund commit. Each region of the screen lives in components/history/.
 */
export default function History() {
  const { t } = useTranslation();
  const { transactions, deleteTransactions } = useTransactionStore();
  const { settings, printerConfig, receiptLayout } = useSettingsStore();
  const { currentUser, users } = useAuthStore();

  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [refundModalTx, setRefundModalTx] = useState<SaleTransaction | null>(null);

  const canDelete = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const {
    searchQuery,
    setSearchQuery,
    dateFilter,
    setDateFilter,
    statusFilter,
    setStatusFilter,
    paymentFilter,
    setPaymentFilter,
    selectedTxId,
    setSelectedTxId,
    activeTransaction,
    filteredTransactions,
    groupedTransactions,
  } = useHistoryFilters(transactions, t);

  // Restocking, the loyalty reversal, the refund patch and the cloud push all
  // live in commitRefund. It re-reads the transaction from the store first, so
  // a modal left open while another terminal's refund arrives cannot refund
  // against pre-refund quantities.
  const handleCommitRefund = (selection: Record<string, number>, authorizedBy: string) => {
    if (!refundModalTx) return;
    commitRefund(
      refundModalTx.id,
      selection,
      authorizedBy,
      settings.loyaltyPointsRate,
      settings.loyaltyPointValue,
    );
    setRefundModalTx(null);
  };

  const notifyPrint = (outcome: HardwarePrintOutcome) => {
    if (outcome === 'popup-blocked') notify(t('history.standardPrintBlocked'));
    else if (outcome === 'unsupported')
      notify(t('print.unsupported', { type: printerConfig.type.toUpperCase() }));
    else if (outcome === 'no-device') notify(t('print.noDevice'));
    else if (outcome === 'error') notify(t('print.error'));
  };

  const handlePrintReceipt = async (tx: SaleTransaction) => {
    notifyPrint(await printReceipt(tx, settings, printerConfig, false, receiptLayout));
  };

  const handleToggleSelectAll = (checked: boolean) => {
    setSelectedTxIds(checked ? filteredTransactions.map((tx) => tx.id) : []);
  };

  const handleToggleTx = (id: string) => {
    setSelectedTxIds((prev) => {
      if (prev.includes(id)) return prev.filter((txId) => txId !== id);
      return [...prev, id];
    });
  };

  const confirmBulkDelete = () => {
    deleteTransactions(selectedTxIds);
    setSelectedTxIds([]);
    if (selectedTxId && selectedTxIds.includes(selectedTxId)) setSelectedTxId(null);
    setShowDeleteModal(false);
  };

  /**
   * Reprints every selected transaction. A system printer takes them as one
   * job; every other transport prints them one at a time and stops at the
   * first failure rather than queueing more work on a device already in
   * trouble.
   */
  const handleBulkPrint = async () => {
    const txsToPrint = transactions.filter((tx) => selectedTxIds.includes(tx.id));
    if (printerConfig.type === 'system') {
      const outcome = printTransactions(txsToPrint, settings, printerConfig, receiptLayout);
      if (outcome === 'popup-blocked') notify(t('history.standardPrintBlocked'));
      return;
    }
    // Sequential on purpose: one printer, and a failure stops the run rather
    // than firing the rest of the batch at a device that is already unhappy.
    for (const tx of txsToPrint) {
      const outcome = await printReceipt(tx, settings, printerConfig, false, receiptLayout);
      if (outcome !== 'printed') {
        notifyPrint(outcome);
        break;
      }
    }
  };

  const togglePaymentFilter = (method: string) => {
    setPaymentFilter((prev) => {
      if (prev.includes(method)) return prev.filter((m) => m !== method);
      return [...prev, method];
    });
  };

  const exportCsv = () => {
    const rows = transactionsToCsvRows(filteredTransactions);
    downloadCsv(`transactions-${localDateKey()}.csv`, toCsv(rows));
  };

  return (
    <div
      id="history-root"
      className="flex-1 flex h-screen overflow-hidden bg-background p-6 text-foreground relative"
    >
      <div
        id="transaction-list-section"
        className="flex-1 flex flex-col min-w-0 pe-6 overflow-hidden"
      >
        <div id="history-header" className="mb-5 shrink-0 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-secondary/80 border border-border flex items-center justify-center text-foreground shrink-0">
              <HistoryIcon size={20} />
            </div>
            <div>
              <h2 className="font-sans font-semibold tracking-tight text-foreground text-xl">
                {t('history.transactionLogs')}
              </h2>
              <p className="text-muted-foreground text-xs mt-0.5">{t('history.auditPastOrders')}</p>
            </div>
          </div>
          <button
            id="export-csv-btn"
            onClick={exportCsv}
            disabled={filteredTransactions.length === 0}
            className="btn-secondary text-xs h-9 px-3 rounded-xl flex items-center gap-1.5 disabled:opacity-40"
          >
            <Download size={13} /> {t('history.exportCsv')}
          </button>
        </div>

        <HistoryFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          dateFilter={dateFilter}
          onDateChange={setDateFilter}
          paymentFilter={paymentFilter}
          onTogglePayment={togglePaymentFilter}
        />

        <TransactionTable
          filteredTransactions={filteredTransactions}
          groupedTransactions={groupedTransactions}
          selectedTxIds={selectedTxIds}
          selectedTxId={selectedTxId}
          currency={settings.currency}
          onSelectTx={setSelectedTxId}
          onToggleTx={handleToggleTx}
          onToggleSelectAll={handleToggleSelectAll}
        />
      </div>

      <AnimatePresence>
        {activeTransaction && (
          <TransactionDetailPanel
            transaction={activeTransaction}
            settings={settings}
            receiptLayout={receiptLayout}
            onClose={() => setSelectedTxId(null)}
            onPrint={handlePrintReceipt}
            onRefund={setRefundModalTx}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedTxIds.length > 0 && (
          <BulkActionBar
            count={selectedTxIds.length}
            canDelete={canDelete}
            onPrint={handleBulkPrint}
            onDelete={() => setShowDeleteModal(true)}
            onClear={() => setSelectedTxIds([])}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteModal && (
          <DeleteTransactionsModal
            count={selectedTxIds.length}
            onCancel={() => setShowDeleteModal(false)}
            onConfirm={confirmBulkDelete}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {refundModalTx && (
          <RefundModal
            transaction={refundModalTx}
            settings={settings}
            currentUser={currentUser}
            users={users}
            onClose={() => setRefundModalTx(null)}
            onCommit={handleCommitRefund}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
