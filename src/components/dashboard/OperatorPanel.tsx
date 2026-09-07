import type { CSSProperties } from 'react';
import { Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { OperatorSales } from '../../lib/dashboardMetrics';

export interface OperatorPanelProps {
  /** Highest revenue first — the first row sets the bar scale. */
  rows: OperatorSales[];
  currency: string;
}

/** What each member of staff took over the range, as a ranked bar list. */
export function OperatorPanel({ rows, currency }: OperatorPanelProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.9 }}
      className="surface rounded-3xl p-8 shadow-xl"
    >
      <div className="mb-6 flex items-center justify-between">
        <h3 className="font-sans font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
          <Users size={20} className="text-emerald-500" /> {t('dashboard.byOperator')}
        </h3>
      </div>
      {rows.length === 0 ? (
        <div className="w-full py-12 flex items-center justify-center text-slate-500 bg-[var(--surface-1)] rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
          {t('dashboard.noSales')}
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((op, idx) => {
            const max = rows[0].revenue || 1;
            return (
              <div key={idx} className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-xs shrink-0">
                  {op.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-end mb-1.5">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                      {op.name}
                    </span>
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                      {currency}
                      {op.revenue.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="bar-fill h-full bg-emerald-500 rounded-full"
                        style={
                          {
                            '--bar-width': `${Math.max(2, (op.revenue / max) * 100)}%`,
                          } as CSSProperties
                        }
                      />
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {op.orders} {t('dashboard.ordersLabel')}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
