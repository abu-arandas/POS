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
import {
  barCategoryAxis,
  barValueAxis,
  horizontalBarGrid,
  horizontalBarMargin,
} from './chartPresets';
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className="bg-card border border-border rounded-xl p-6 shadow-2xs flex flex-col"
    >
      <div className="mb-4">
        <h3 className="font-sans font-semibold text-foreground text-base">
          {t('dashboard.salesByCategory')}
        </h3>
      </div>
      <div className="flex-1 min-h-55 w-full relative">
        {data.length === 0 ? (
          <div className="size-full flex items-center justify-center text-xs text-muted-foreground bg-secondary/30 rounded-xl border border-dashed border-border">
            {t('dashboard.noCategoryStats')}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={horizontalBarMargin}>
              <CartesianGrid
                {...horizontalBarGrid}
                stroke="var(--border)"
                strokeDasharray="3 3"
                opacity={0.5}
              />
              <XAxis {...barValueAxis} stroke="var(--muted-foreground)" />
              <YAxis {...barCategoryAxis} stroke="var(--muted-foreground)" width={110} />
              <Tooltip content={<ChartTooltip currency={currency} />} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
                {data.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-5 pt-3 border-t border-border">
        {data.map((item) => (
          <div key={item.key} className="flex items-center gap-2">
            <span
              className="swatch size-2.5 rounded-full shrink-0"
              style={{ '--swatch-color': item.color } as CSSProperties}
            />
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] text-muted-foreground truncate max-w-24">
                {item.name}
              </span>
              <span className="text-xs font-semibold text-foreground font-mono">
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
