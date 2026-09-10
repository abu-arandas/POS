import React from 'react';
import { History as HistoryIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SaleTransaction } from '../../types';
import { PaymentIcon } from './PaymentIcon';

export interface TransactionTableProps {
  /** Rows after filtering, used for the select-all state and the footer totals. */
  filteredTransactions: SaleTransaction[];
  /** The same rows bucketed under localized date headings. */
  groupedTransactions: Record<string, SaleTransaction[]>;
  selectedTxIds: string[];
  selectedTxId: string | null;
  currency: string;
  onSelectTx: (id: string) => void;
  onToggleTx: (id: string) => void;
  onToggleSelectAll: (checked: boolean) => void;
}

/** Scrollable transaction table with date headings, checkboxes and a total row. */
export function TransactionTable({
  filteredTransactions,
  groupedTransactions,
  selectedTxIds,
  selectedTxId,
  currency,
  onSelectTx,
  onToggleTx,
  onToggleSelectAll,
}: TransactionTableProps) {
  const { t } = useTranslation();

  return (
    <div
      id="history-table-container"
      className="flex-1 surface rounded-4xl shadow-2xl overflow-hidden flex flex-col"
    >
      <div className="flex-1 overflow-y-auto scrollbar-none relative">
        <table id="history-table" className="w-full text-start border-collapse table-fixed">
          <thead className="sticky top-0 z-20">
            <tr className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider font-mono border-b border-slate-200 dark:border-white/5 shadow-sm">
              <th className="p-4 w-12.5 text-center">
                <input
                  type="checkbox"
                  aria-label={t('history.selectAll')}
                  className="rounded bg-slate-100 dark:bg-slate-800 border-slate-600 text-emerald-500 focus:ring-emerald-500 cursor-pointer size-4"
                  checked={
                    filteredTransactions.length > 0 &&
                    selectedTxIds.length === filteredTransactions.length
                  }
                  onChange={(e) => onToggleSelectAll(e.target.checked)}
                />
              </th>
              <th className="py-4 px-2 w-35">{t('history.receiptId')}</th>
              <th className="p-4 w-1/4">{t('history.customer')}</th>
              <th className="py-4 px-3 w-1/8 text-center">{t('history.items')}</th>
              <th className="p-4 w-1/8 text-end">{t('history.total')}</th>
              <th className="p-4 w-1/8 text-center">{t('history.payment')}</th>
              <th className="p-4 w-30 text-center">{t('history.status')}</th>
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
                        onClick={() => onSelectTx(tx.id)}
                        onKeyDown={(e) => {
                          // Only when the row itself is focused — keys on the
                          // nested checkbox must keep their native behavior.
                          if (e.target !== e.currentTarget) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectTx(tx.id);
                          }
                        }}
                        tabIndex={0}
                        className={`transition-colors cursor-pointer border-b border-slate-200 dark:border-white/5 last:border-0 ${
                          isSelected
                            ? 'bg-slate-200 dark:bg-slate-800/80 hover:bg-slate-300 dark:hover:bg-slate-700/80'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800/40'
                        } ${isRefunded ? 'opacity-60' : ''}`}
                      >
                        <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`${t('history.selectTransaction')} ${tx.id.substring(0, 12)}`}
                            className="rounded bg-slate-100 dark:bg-slate-800 border-slate-600 text-emerald-500 focus:ring-emerald-500 cursor-pointer size-4"
                            checked={isChecked}
                            onChange={() => onToggleTx(tx.id)}
                          />
                        </td>
                        <td className="py-4 px-2 font-mono font-bold text-slate-600 dark:text-slate-300 text-xs">
                          {tx.id.length > 12 ? `${tx.id.substring(0, 12)}…` : tx.id}
                          <div className="text-[10px] text-slate-500 mt-1 font-sans">
                            {new Date(tx.date).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </td>
                        <td className="p-4">
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
                        <td className="p-4 text-end font-mono font-bold text-slate-900 dark:text-white">
                          {currency}
                          {tx.total.toFixed(2)}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-1.5 font-mono uppercase text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/50 py-1 px-2 rounded-xl border border-slate-300 dark:border-slate-700">
                            <PaymentIcon method={tx.paymentMethod} />
                            <span>{tx.paymentMethod}</span>
                          </div>
                        </td>
                        <td className="p-4 text-center">
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
          {t('history.totalValue')} {currency}
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
  );
}
