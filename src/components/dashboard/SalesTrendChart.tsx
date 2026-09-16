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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="bg-card border border-border rounded-xl p-6 shadow-2xs"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-sans font-semibold text-foreground text-base flex items-center gap-2">
            <Activity size={16} className="text-muted-foreground" />
            {t('dashboard.salesTrend')}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('dashboard.historicalPerf')}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono bg-secondary px-3 py-1.5 rounded-lg border border-border">
          <span className="flex items-center gap-1.5 text-foreground">
            <span className="size-2 rounded-full bg-emerald-500" />
            {t('dashboard.revenue')}
          </span>
          <span className="flex items-center gap-1.5 text-foreground">
            <span className="size-2 rounded-full bg-blue-500" />
            {t('dashboard.profit')}
          </span>
        </div>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={trendChartMargin}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...trendChartGrid} stroke="var(--border)" strokeDasharray="3 3" opacity={0.5} />
            <XAxis {...trendTimeAxis} stroke="var(--muted-foreground)" dy={10} />
            <YAxis {...trendValueAxis} stroke="var(--muted-foreground)" dx={-10} tickFormatter={(val) => `${val}`} />
            <Tooltip content={<ChartTooltip currency={currency} />} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#10b981"
              strokeWidth={2.5}
              fill="url(#colorRevenue)"
              activeDot={{ r: 5, fill: '#10b981', stroke: 'var(--card)', strokeWidth: 2 }}
            />
            <Area
              type="monotone"
              dataKey="profit"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#colorProfit)"
              activeDot={{ r: 4, fill: '#3b82f6', stroke: 'var(--card)', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
