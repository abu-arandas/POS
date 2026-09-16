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

interface KpiCardProps {
  label: string;
  icon: ReactNode;
  /** The headline figure, already formatted. */
  value: string;
  /** Badges and context under the figure. */
  footer: ReactNode;
  delay: number;
}

/**
 * One headline figure on the dashboard: its label, value and trailing note.
 */
function KpiCard({ label, icon, value, footer, delay }: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-card border border-border rounded-xl p-5 shadow-2xs flex flex-col justify-between relative transition-colors"
    >
      <div className="flex justify-between items-start mb-3">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider font-mono">
          {label}
        </span>
        <div className="size-8 rounded-lg bg-secondary border border-border flex items-center justify-center text-foreground shrink-0">
          {icon}
        </div>
      </div>
      <div>
        <h3 className="font-mono font-semibold num text-foreground text-2xl mb-1.5">{value}</h3>
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
    <div id="kpi-row" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        label={t('dashboard.todaysRevenue')}
        icon={<DollarSign size={16} />}
        value={`${currency}${kpis.revenueToday.toFixed(2)}`}
        delay={0.05}
        footer={
          <>
            {kpis.revenueToday >= kpis.avgDailyRevenue ? (
              <span className="badge badge-emerald flex items-center px-2 py-0.5">
                <ArrowUpRight size={13} className="me-0.5" /> {t('dashboard.aboveAvg')}
              </span>
            ) : (
              <span className="badge badge-rose flex items-center px-2 py-0.5">
                <ArrowDownRight size={13} className="me-0.5" /> {t('dashboard.belowAvg')}
              </span>
            )}
            <span className="text-muted-foreground font-mono text-[11px]">
              {t('dashboard.vsAvg', {
                amount: `${currency}${kpis.avgDailyRevenue.toFixed(0)}`,
              })}
            </span>
          </>
        }
      />

      <KpiCard
        label={t('dashboard.netProfit')}
        icon={<Percent size={16} />}
        value={`${currency}${kpis.profitToday.toFixed(2)}`}
        delay={0.1}
        footer={
          <>
            <span className="badge badge-blue px-2 py-0.5">
              {t('dashboard.margin').replace(':', '')} {margin}%
            </span>
            <span className="text-muted-foreground font-mono text-[11px]">
              {t('dashboard.exclTax')}
            </span>
          </>
        }
      />

      <KpiCard
        label={t('dashboard.completedSales')}
        icon={<ShoppingBag size={16} />}
        value={`${kpis.ordersToday}`}
        delay={0.15}
        footer={
          <span className="badge badge-purple px-2 py-0.5 font-mono">
            {currency}
            {kpis.aovToday} {t('dashboard.aov')}
          </span>
        }
      />

      <KpiCard
        label={t('dashboard.stockWarnings')}
        icon={<Package size={16} />}
        value={`${kpis.lowStockItems}`}
        delay={0.2}
        footer={
          kpis.lowStockItems > 0 ? (
            <span className="badge badge-amber flex items-center gap-1 px-2 py-0.5">
              <AlertTriangle size={11} /> {t('dashboard.actionNeeded')}
            </span>
          ) : (
            <span className="badge badge-slate flex items-center gap-1.5 px-2 py-0.5">
              <span className="size-1.5 bg-emerald-500 rounded-full" /> {t('dashboard.allGood')}
            </span>
          )
        }
      />
    </div>
  );
}
