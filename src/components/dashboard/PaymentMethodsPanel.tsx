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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8 }}
      className="surface rounded-3xl p-8 shadow-xl"
    >
      <div className="mb-6">
        <h3 className="font-sans font-bold text-slate-900 dark:text-white text-lg">
          {t('dashboard.paymentMethods')}
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {PAYMENT_METHOD_ORDER.map((method) => {
          const data = byMethod.get(method.toUpperCase());
          const val = data ? data.value : 0;
          const pct = totalVolume > 0 ? (val / totalVolume) * 100 : 0;

          return (
            <div
              key={method}
              className="bg-[var(--surface-1)] border border-slate-200 dark:border-white/5 rounded-2xl p-5 hover:border-slate-200 transition-colors"
            >
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono block mb-2">
                {t(`dashboard.${method}`, { defaultValue: method })}
              </span>
              <span className="font-mono font-extrabold text-2xl text-slate-900 dark:text-white block mb-2">
                {currency}
                {val.toFixed(2)}
              </span>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mb-2">
                {/* The method's own colour, not a hardcoded blue. Every
                    bar being blue meant the four methods were told apart
                    by their label alone, and the colour computed for them
                    was never drawn. */}
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
              <span className="text-xs text-slate-500 font-mono">
                {t('dashboard.percentOfTotal', { percent: pct.toFixed(1) })}
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
