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
      className="bg-card border border-border rounded-xl p-3.5 mb-4 shadow-2xs shrink-0 space-y-3"
    >
      <div className="flex flex-col md:flex-row gap-2.5">
        <div className="flex-1 flex items-center space-x-2 bg-background border border-border px-3 py-1.5 rounded-lg focus-within:border-foreground focus-within:ring-1 focus-within:ring-foreground transition-all">
          <Search size={14} className="text-muted-foreground" />
          <input
            id="history-search-input"
            type="text"
            aria-label={t('history.searchReceipts')}
            placeholder={t('history.searchReceipts')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1 bg-transparent border-none text-foreground text-xs focus:outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex gap-2">
          <select
            id="history-status-select"
            aria-label={t('history.status')}
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value as HistoryStatusFilter)}
            className="bg-background border border-border rounded-lg text-xs font-medium px-3 py-1.5 text-foreground focus:outline-none focus:border-foreground cursor-pointer transition-colors"
          >
            <option value="all">{t('history.allStatuses')}</option>
            <option value="completed">{t('history.paidCompleted')}</option>
            <option value="refunded">{t('history.refundedReturned')}</option>
          </select>

          <div className="flex bg-secondary border border-border p-1 rounded-lg shrink-0">
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
                className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all shrink-0 ${
                  dateFilter === opt.id
                    ? 'bg-card text-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 pt-0.5">
        <div className="flex items-center gap-1.5">
          <Filter size={12} className="text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            {t('history.paymentFilter')}
          </span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method}
              onClick={() => onTogglePayment(method)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all border flex items-center gap-1.5 ${
                paymentFilter.includes(method)
                  ? 'bg-foreground text-background border-foreground font-semibold'
                  : 'bg-background border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <PaymentIcon method={method} /> <span className="uppercase text-[11px]">{method}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
