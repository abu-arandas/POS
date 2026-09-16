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
      className="flex-1 border border-border rounded-xl shadow-2xs overflow-hidden flex flex-col bg-card"
    >
      <div className="flex-1 overflow-y-auto scrollbar-none relative">
        <table id="history-table" className="w-full text-start border-collapse table-fixed">
          <thead className="sticky top-0 z-20">
            <tr className="bg-muted/50 text-muted-foreground text-[11px] font-medium uppercase tracking-wider font-mono border-b border-border">
              <th className="p-3 w-12 text-center">
                <input
                  type="checkbox"
                  aria-label={t('history.selectAll')}
                  className="rounded border-border text-foreground focus:ring-foreground cursor-pointer size-3.5"
                  checked={
                    filteredTransactions.length > 0 &&
                    selectedTxIds.length === filteredTransactions.length
                  }
                  onChange={(e) => onToggleSelectAll(e.target.checked)}
                />
              </th>
              <th className="py-3 px-2 w-36 text-start">{t('history.receiptId')}</th>
              <th className="p-3 w-1/4 text-start">{t('history.customer')}</th>
              <th className="py-3 px-3 w-1/8 text-center">{t('history.items')}</th>
              <th className="p-3 w-1/8 text-end">{t('history.total')}</th>
              <th className="p-3 w-1/8 text-center">{t('history.payment')}</th>
              <th className="p-3 w-28 text-center">{t('history.status')}</th>
            </tr>
          </thead>
          <tbody className="text-sm font-sans text-foreground">
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-muted-foreground font-mono">
                  <div className="flex flex-col items-center">
                    <HistoryIcon size={32} className="text-muted-foreground mb-2 opacity-40" />
                    <span className="text-xs">{t('history.noHistoricalTransactions')}</span>
                  </div>
                </td>
              </tr>
            ) : (
              Object.entries(groupedTransactions).map(([dateLabel, txs]) => (
                <React.Fragment key={dateLabel}>
                  <tr>
                    <td
                      colSpan={7}
                      className="py-1.5 px-4 bg-secondary/40 text-xs font-mono font-medium text-muted-foreground sticky top-10 z-10 backdrop-blur-sm border-y border-border uppercase tracking-wider"
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
                          if (e.target !== e.currentTarget) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectTx(tx.id);
                          }
                        }}
                        tabIndex={0}
                        className={`transition-colors cursor-pointer border-b border-border/50 last:border-0 ${
                          isSelected ? 'bg-secondary/80' : 'hover:bg-muted/30'
                        } ${isRefunded ? 'opacity-60' : ''}`}
                      >
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`${t('history.selectTransaction')} ${tx.id.substring(0, 12)}`}
                            className="rounded border-border text-foreground focus:ring-foreground cursor-pointer size-3.5"
                            checked={isChecked}
                            onChange={() => onToggleTx(tx.id)}
                          />
                        </td>
                        <td className="py-3 px-2 font-mono font-medium text-foreground text-xs">
                          {tx.id.length > 12 ? `${tx.id.substring(0, 12)}…` : tx.id}
                          <div className="text-[10px] text-muted-foreground mt-0.5 font-sans">
                            {new Date(tx.date).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </td>
                        <td className="p-3">
                          {tx.customerName ? (
                            <span className="font-medium text-foreground">{tx.customerName}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">
                              {t('history.walkIn')}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="inline-block bg-secondary px-2 py-0.5 rounded-md text-xs font-mono text-foreground border border-border">
                            {tx.items.reduce((sum, item) => sum + item.quantity, 0)}
                          </span>
                        </td>
                        <td className="p-3 text-end font-mono font-semibold text-foreground text-sm">
                          {currency}
                          {tx.total.toFixed(2)}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1.5 font-mono uppercase text-[10px] text-muted-foreground bg-secondary/60 py-0.5 px-2 rounded-md border border-border">
                            <PaymentIcon method={tx.paymentMethod} />
                            <span>{tx.paymentMethod}</span>
                          </div>
                        </td>
                        <td className="p-3 text-center">
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

      <div className="px-4 py-2.5 border-t border-border bg-card text-xs text-muted-foreground font-mono flex justify-between shrink-0">
        <span>
          {t('history.filteredCount')} {filteredTransactions.length} {t('history.sales')}
        </span>
        <span className="font-semibold text-foreground">
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
