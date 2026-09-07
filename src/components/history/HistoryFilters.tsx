import { Search, Filter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PaymentIcon } from './PaymentIcon';
import type { HistoryDateFilter, HistoryStatusFilter } from './useHistoryFilters';

const PAYMENT_METHODS = ['cash', 'card', 'mobile', 'gift'];

export interface HistoryFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: HistoryStatusFilter;
  onStatusChange: (value: HistoryStatusFilter) => void;
  dateFilter: HistoryDateFilter;
  onDateChange: (value: HistoryDateFilter) => void;
  /** Payment methods currently selected; empty means no payment narrowing. */
  paymentFilter: string[];
  onTogglePayment: (method: string) => void;
}

/** Search box, status/date selectors and the payment-method chips. */
export function HistoryFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  dateFilter,
  onDateChange,
  paymentFilter,
  onTogglePayment,
}: HistoryFiltersProps) {
  const { t } = useTranslation();

  return (
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
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1 bg-transparent border-none text-slate-700 dark:text-slate-200 text-sm focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
        </div>

        <div className="flex gap-2">
          <select
            id="history-status-select"
            aria-label={t('history.status')}
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value as HistoryStatusFilter)}
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
                onClick={() => onDateChange(opt.id)}
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
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method}
              onClick={() => onTogglePayment(method)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 shadow-sm ${
                paymentFilter.includes(method)
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/30 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/50 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <PaymentIcon method={method} /> <span className="uppercase">{method}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
