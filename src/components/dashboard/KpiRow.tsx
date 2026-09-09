import type { ReactNode } from 'react';
import {
  DollarSign,
  Percent,
  ShoppingBag,
  Package,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { DashboardKpis } from '../../lib/dashboardMetrics';

// Tailwind scans for whole class names, so each accent is spelled out rather
// than assembled from the accent's name at runtime.
const ACCENTS = {
  emerald: {
    glow: 'bg-emerald-500/10 group-hover:bg-emerald-500/20',
    icon: 'bg-emerald-500/10 text-emerald-400',
  },
  blue: {
    glow: 'bg-blue-500/10 group-hover:bg-blue-500/20',
    icon: 'bg-blue-500/10 text-blue-400',
  },
  purple: {
    glow: 'bg-purple-500/10 group-hover:bg-purple-500/20',
    icon: 'bg-purple-500/10 text-purple-400',
  },
  amber: {
    glow: 'bg-amber-500/10 group-hover:bg-amber-500/20',
    icon: 'bg-amber-500/10 text-amber-500',
  },
  // The resting state of the stock card: nothing needs attention.
  slate: {
    glow: 'bg-slate-500/10',
    icon: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
  },
} as const;

interface KpiCardProps {
  label: string;
  icon: ReactNode;
  accent: keyof typeof ACCENTS;
  /** The headline figure, already formatted. */
  value: string;
  /** Badges and context under the figure. */
  footer: ReactNode;
  delay: number;
}

/**
 * One headline figure on the dashboard: its label, value and trailing note,
 * in the accent colour that identifies the metric.
 */
function KpiCard({ label, icon, accent, value, footer, delay }: KpiCardProps) {
  const { glow, icon: iconClass } = ACCENTS[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="surface rounded-3xl p-6 shadow-xl flex flex-col justify-between relative overflow-hidden group hover:bg-[var(--surface-hover)] transition-colors"
    >
      <div
        className={`absolute -inset-e-6 -top-6 w-32 h-32 rounded-full blur-3xl transition-colors ${glow}`}
      />
      <div className="flex justify-between items-start mb-4 relative z-10">
        <span className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider font-mono">
          {label}
        </span>
        <div className={`p-2.5 rounded-xl shadow-inner ${iconClass}`}>{icon}</div>
      </div>
      <div className="relative z-10">
        <h3 className="font-mono font-extrabold text-slate-900 dark:text-white text-3xl mb-2">
          {value}
        </h3>
        <div className="flex items-center gap-2 text-xs font-medium">{footer}</div>
      </div>
    </motion.div>
  );
}

export interface KpiRowProps {
  kpis: DashboardKpis;
  currency: string;
}

/** The four headline figures: revenue, profit, orders and stock warnings. */
export function KpiRow({ kpis, currency }: KpiRowProps) {
  const { t } = useTranslation();
  const margin =
    kpis.revenueToday > 0 ? ((kpis.profitToday / kpis.revenueToday) * 100).toFixed(0) : 0;

  return (
    <div id="kpi-row" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <KpiCard
        label={t('dashboard.todaysRevenue')}
        icon={<DollarSign size={20} className="stroke-[2.5]" />}
        accent="emerald"
        value={`${currency}${kpis.revenueToday.toFixed(2)}`}
        delay={0.1}
        footer={
          <>
            {kpis.revenueToday >= kpis.avgDailyRevenue ? (
              <span className="badge badge-emerald flex items-center px-2 py-0.5">
                <ArrowUpRight size={14} className="me-1" /> {t('dashboard.aboveAvg')}
              </span>
            ) : (
              <span className="badge badge-rose flex items-center px-2 py-0.5">
                <ArrowDownRight size={14} className="me-1" /> {t('dashboard.belowAvg')}
              </span>
            )}
            <span className="text-slate-500 font-mono">
              {t('dashboard.vsAvg', {
                amount: `${currency}${kpis.avgDailyRevenue.toFixed(0)}`,
              })}
            </span>
          </>
        }
      />

      <KpiCard
        label={t('dashboard.netProfit')}
        icon={<Percent size={20} className="stroke-[2.5]" />}
        accent="blue"
        value={`${currency}${kpis.profitToday.toFixed(2)}`}
        delay={0.2}
        footer={
          <>
            <span className="badge badge-blue px-2 py-0.5">
              {t('dashboard.margin').replace(':', '')} {margin}%
            </span>
            <span className="text-slate-500 font-mono">{t('dashboard.exclTax')}</span>
          </>
        }
      />

      <KpiCard
        label={t('dashboard.completedSales')}
        icon={<ShoppingBag size={20} className="stroke-[2.5]" />}
        accent="purple"
        value={`${kpis.ordersToday}`}
        delay={0.3}
        footer={
          <span className="badge badge-purple px-2 py-0.5 font-mono">
            {currency}
            {kpis.aovToday} {t('dashboard.aov')}
          </span>
        }
      />

      <KpiCard
        label={t('dashboard.stockWarnings')}
        icon={<Package size={20} className="stroke-[2.5]" />}
        accent={kpis.lowStockItems > 0 ? 'amber' : 'slate'}
        value={`${kpis.lowStockItems}`}
        delay={0.4}
        footer={
          kpis.lowStockItems > 0 ? (
            <span className="badge badge-amber flex items-center gap-1.5 px-2 py-0.5">
              <AlertTriangle size={12} /> {t('dashboard.actionNeeded')}
            </span>
          ) : (
            <span className="badge badge-slate flex items-center gap-1.5 px-2 py-0.5">
              <span className="size-1.5 bg-slate-400 rounded-full" /> {t('dashboard.allGood')}
            </span>
          )
        }
      />
    </div>
  );
}
