import type { CSSProperties } from 'react';
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
import type { CategoryShareRow } from './useDashboardMetrics';

export interface CategoryShareChartProps {
  data: CategoryShareRow[];
  currency: string;
}

/** Revenue per category over the range, with a legend of every row. */
export function CategoryShareChart({ data, currency }: CategoryShareChartProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7 }}
      className="surface rounded-3xl p-8 shadow-xl flex flex-col"
    >
      <div className="mb-4">
        <h3 className="font-sans font-bold text-slate-900 dark:text-white text-lg">
          {t('dashboard.salesByCategory')}
        </h3>
      </div>
      <div className="flex-1 min-h-55 w-full relative">
        {data.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-slate-500 bg-[var(--surface-1)] rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
            {t('dashboard.noCategoryStats')}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {/* Bars, not a donut. A pie compares every slice against every
                other at once, and this palette only clears the colour-vision
                floors for three simultaneous classes; bars are compared
                against their neighbour, which six clear. Bars also carry the
                category name in the axis, so identity never rests on colour
                alone — and that doubles as the visible label the light
                surface requires, where three of the steps sit under 3:1. */}
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
                width={110}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ChartTooltip currency={currency} />} />
              <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={22}>
                {data.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      {/* Every row, with its value — the old grid showed the first four of
          however many there were, so anything past the fourth was
          identified by its colour and nothing else. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-6">
        {data.map((item) => (
          <div key={item.key} className="flex items-center gap-2">
            <span
              className="swatch w-3 h-3 rounded-full shrink-0"
              style={{ '--swatch-color': item.color } as CSSProperties}
            />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate w-20">
                {item.name}
              </span>
              <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                {currency}
                {item.value.toFixed(0)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
