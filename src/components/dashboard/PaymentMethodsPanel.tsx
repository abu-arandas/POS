import type { CSSProperties } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { NEUTRAL, type ChartMode } from '../../lib/chartPalette';
import { PAYMENT_METHOD_ORDER, type PaymentMethodRow } from './useDashboardMetrics';

export interface PaymentMethodsPanelProps {
  /** Keyed by the UPPERCASED method name, as the metrics hook emits it. */
  byMethod: Map<string, PaymentMethodRow>;
  /** Denominator for the share bars; zero means every bar is empty. */
  totalVolume: number;
  currency: string;
  chartMode: ChartMode;
}

/** What each payment method took over the range, and its share of the total. */
export function PaymentMethodsPanel({
  byMethod,
  totalVolume,
  currency,
  chartMode,
}: PaymentMethodsPanelProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="bg-card border border-border rounded-xl p-6 shadow-2xs"
    >
      <div className="mb-4">
        <h3 className="font-sans font-semibold text-foreground text-base">
          {t('dashboard.paymentMethods')}
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {PAYMENT_METHOD_ORDER.map((method) => {
          const data = byMethod.get(method.toUpperCase());
          const val = data ? data.value : 0;
          const pct = totalVolume > 0 ? (val / totalVolume) * 100 : 0;

          return (
            <div
              key={method}
              className="bg-secondary/30 border border-border rounded-xl p-4 transition-colors"
            >
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider font-mono block mb-1">
                {t(`dashboard.${method}`, { defaultValue: method })}
              </span>
              <span className="font-mono font-semibold text-xl text-foreground block mb-2">
                {currency}
                {val.toFixed(2)}
              </span>
              <div className="w-full bg-secondary rounded-full h-1.5 mb-1.5">
                <div
                  className="bar-fill h-1.5 rounded-full"
                  style={
                    {
                      '--bar-width': `${pct}%`,
                      backgroundColor: data ? data.color : NEUTRAL[chartMode],
                    } as CSSProperties
                  }
                />
              </div>
              <span className="text-[11px] text-muted-foreground font-mono">
                {t('dashboard.percentOfTotal', { percent: pct.toFixed(1) })}
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
