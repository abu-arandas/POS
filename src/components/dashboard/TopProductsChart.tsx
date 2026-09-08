import { Package } from 'lucide-react';
import { motion } from 'motion/react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { ChartTooltip } from './ChartTooltip';

export interface TopProductRow {
  name: string;
  quantity: number;
}

export interface TopProductsChartProps {
  data: TopProductRow[];
  currency: string;
}

/** Units sold per product over the range, best first. */
export function TopProductsChart({ data, currency }: TopProductsChartProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="surface rounded-3xl p-8 shadow-xl lg:col-span-2"
    >
      <div className="mb-8">
        <h3 className="font-sans font-bold text-slate-900 dark:text-white text-lg">
          {t('dashboard.bestSellers')}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('dashboard.topMenu')}</p>
      </div>
      <div className="h-72 w-full">
        {data.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 bg-[var(--surface-1)] rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
            <Package size={32} className="mb-3 opacity-50" />
            <span>{t('dashboard.noSales')}</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 20, left: 20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="#1e293b" />
              <XAxis
                type="number"
                stroke="#475569"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                dataKey="name"
                type="category"
                stroke="#94a3b8"
                fontSize={12}
                width={120}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={<ChartTooltip currency={currency} valueType="number" />}
                cursor={{ fill: '#1e293b', opacity: 0.4 }}
              />
              <Bar dataKey="quantity" radius={[0, 8, 8, 0]} barSize={28}>
                {data.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#3b82f6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
}
