import { Activity } from 'lucide-react';
import { motion } from 'motion/react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { ChartTooltip } from './ChartTooltip';
import { trendChartGrid, trendChartMargin, trendTimeAxis, trendValueAxis } from './chartPresets';

export interface SalesTrendPoint {
  label: string;
  revenue: number;
  profit: number;
}

export interface SalesTrendChartProps {
  data: SalesTrendPoint[];
  currency: string;
}

/** Revenue and profit over the selected period, one point per bucket. */
export function SalesTrendChart({ data, currency }: SalesTrendChartProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="surface rounded-3xl p-8 shadow-xl"
    >
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="font-sans font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
            <Activity size={20} className="text-emerald-500" />
            {t('dashboard.salesTrend')}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('dashboard.historicalPerf')}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono bg-[var(--surface-1)] px-4 py-2 rounded-xl border border-slate-200 dark:border-white/5">
          <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <span className="size-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
            {t('dashboard.revenue')}
          </span>
          <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <span className="size-3 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
            {t('dashboard.profit')}
          </span>
        </div>
      </div>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={trendChartMargin}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...trendChartGrid} />
            <XAxis {...trendTimeAxis} dy={15} />
            <YAxis {...trendValueAxis} dx={-15} tickFormatter={(val) => `${val}`} />
            <Tooltip content={<ChartTooltip currency={currency} />} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#10b981"
              strokeWidth={4}
              fill="url(#colorRevenue)"
              activeDot={{ r: 8, fill: '#10b981', stroke: '#020617', strokeWidth: 3 }}
            />
            <Area
              type="monotone"
              dataKey="profit"
              stroke="#3b82f6"
              strokeWidth={4}
              fill="url(#colorProfit)"
              activeDot={{ r: 8, fill: '#3b82f6', stroke: '#020617', strokeWidth: 3 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
