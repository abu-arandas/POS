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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="bg-card border border-border rounded-xl p-6 shadow-2xs"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-sans font-semibold text-foreground text-base flex items-center gap-2">
          <ClipboardList size={16} className="text-muted-foreground" /> {t('dashboard.purchasing')}
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="bg-secondary/30 border border-border rounded-xl p-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider font-mono block mb-1">
            {t('dashboard.poReceived')}
          </span>
          <span className="font-mono font-semibold text-xl text-foreground block">
            {currency}
            {report.receivedValue.toFixed(2)}
          </span>
        </div>
        <div className="bg-secondary/30 border border-border rounded-xl p-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider font-mono block mb-1">
            {t('dashboard.poOutstanding')}
          </span>
          <span className="font-mono font-semibold text-xl text-foreground block">
            {currency}
            {report.outstandingValue.toFixed(2)}
          </span>
        </div>
        <div className="bg-secondary/30 border border-border rounded-xl p-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider font-mono block mb-1">
            {t('dashboard.poOpenOrders')}
          </span>
          <span className="font-mono font-semibold text-xl text-foreground block">
            {report.countByStatus.draft + report.countByStatus.ordered}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">
            {report.countByStatus.received} {t('dashboard.poReceivedCount')}
          </span>
        </div>
      </div>

      {report.suppliers.length === 0 ? (
        <div className="w-full py-8 flex items-center justify-center text-xs text-muted-foreground bg-secondary/30 rounded-xl border border-dashed border-border">
          {t('dashboard.noPurchaseData')}
        </div>
      ) : (
        <div className="space-y-3 pt-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider font-mono">
            {t('dashboard.topSuppliers')}
          </span>
          {report.suppliers.slice(0, 5).map((s) => {
            const maxSpend = report.suppliers[0].received || report.suppliers[0].outstanding || 1;
            const spend = s.received || s.outstanding;
            return (
              <div key={s.supplierId ?? 'none'} className="flex items-center gap-3">
                <div className="size-7 rounded-full bg-secondary border border-border flex items-center justify-center text-foreground shrink-0">
                  <Truck size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-xs font-medium text-foreground truncate">
                      {s.supplierName}
                    </span>
                    <span className="font-mono font-semibold text-xs text-foreground">
                      {currency}
                      {s.received.toFixed(2)}
                      {s.outstanding > 0 && (
                        <span className="text-muted-foreground ms-1.5 text-[11px]">
                          +{currency}
                          {s.outstanding.toFixed(2)}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="bar-fill h-full bg-foreground rounded-full"
                        style={
                          {
                            '--bar-width': `${Math.max(2, (spend / maxSpend) * 100)}%`,
                          } as CSSProperties
                        }
                      />
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">
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
