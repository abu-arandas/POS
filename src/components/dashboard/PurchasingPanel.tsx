import type { CSSProperties } from 'react';
import { ClipboardList, Truck } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { PoReport } from '../../lib/poReport';

export interface PurchasingPanelProps {
  report: PoReport;
  currency: string;
}

/** Purchase-order spend for the range: received, outstanding and by supplier. */
export function PurchasingPanel({ report, currency }: PurchasingPanelProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.0 }}
      className="surface rounded-3xl p-8 shadow-xl"
    >
      <div className="mb-6 flex items-center justify-between">
        <h3 className="font-sans font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
          <ClipboardList size={20} className="text-emerald-500" /> {t('dashboard.purchasing')}
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-[var(--surface-1)] border border-slate-200 dark:border-white/5 rounded-2xl p-5">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono block mb-2">
            {t('dashboard.poReceived')}
          </span>
          <span className="font-mono font-extrabold text-2xl text-emerald-400 block">
            {currency}
            {report.receivedValue.toFixed(2)}
          </span>
        </div>
        <div className="bg-[var(--surface-1)] border border-slate-200 dark:border-white/5 rounded-2xl p-5">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono block mb-2">
            {t('dashboard.poOutstanding')}
          </span>
          <span className="font-mono font-extrabold text-2xl text-amber-400 block">
            {currency}
            {report.outstandingValue.toFixed(2)}
          </span>
        </div>
        <div className="bg-[var(--surface-1)] border border-slate-200 dark:border-white/5 rounded-2xl p-5">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono block mb-2">
            {t('dashboard.poOpenOrders')}
          </span>
          <span className="font-mono font-extrabold text-2xl text-slate-900 dark:text-white block">
            {report.countByStatus.draft + report.countByStatus.ordered}
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            {report.countByStatus.received} {t('dashboard.poReceivedCount')}
          </span>
        </div>
      </div>

      {report.suppliers.length === 0 ? (
        <div className="w-full py-10 flex items-center justify-center text-slate-500 bg-[var(--surface-1)] rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
          {t('dashboard.noPurchaseData')}
        </div>
      ) : (
        <div className="space-y-3">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
            {t('dashboard.topSuppliers')}
          </span>
          {report.suppliers.slice(0, 5).map((s) => {
            const maxSpend = report.suppliers[0].received || report.suppliers[0].outstanding || 1;
            const spend = s.received || s.outstanding;
            return (
              <div key={s.supplierId ?? 'none'} className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-emerald-400 shrink-0">
                  <Truck size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-end mb-1.5">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                      {s.supplierName}
                    </span>
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                      {currency}
                      {s.received.toFixed(2)}
                      {s.outstanding > 0 && (
                        <span className="text-amber-400 ms-2 text-xs">
                          +{currency}
                          {s.outstanding.toFixed(2)}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="bar-fill h-full bg-emerald-500 rounded-full"
                        style={
                          {
                            '--bar-width': `${Math.max(2, (spend / maxSpend) * 100)}%`,
                          } as CSSProperties
                        }
                      />
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {s.orders} {t('dashboard.poOrdersLabel')}
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
