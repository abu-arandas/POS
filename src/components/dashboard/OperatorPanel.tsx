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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45 }}
      className="bg-card border border-border rounded-xl p-6 shadow-2xs"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-sans font-semibold text-foreground text-base flex items-center gap-2">
          <Users size={16} className="text-muted-foreground" /> {t('dashboard.byOperator')}
        </h3>
      </div>
      {rows.length === 0 ? (
        <div className="w-full py-10 flex items-center justify-center text-xs text-muted-foreground bg-secondary/30 rounded-xl border border-dashed border-border">
          {t('dashboard.noSales')}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((op, idx) => {
            const max = rows[0].revenue || 1;
            return (
              <div key={idx} className="flex items-center gap-3">
                <div className="size-7 rounded-full bg-secondary border border-border flex items-center justify-center text-foreground font-semibold text-xs shrink-0">
                  {op.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-xs font-medium text-foreground truncate">{op.name}</span>
                    <span className="font-mono font-semibold text-xs text-foreground">
                      {currency}
                      {op.revenue.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="bar-fill h-full bg-foreground rounded-full"
                        style={
                          {
                            '--bar-width': `${Math.max(2, (op.revenue / max) * 100)}%`,
                          } as CSSProperties
                        }
                      />
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">
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
