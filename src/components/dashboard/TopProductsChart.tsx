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
import {
  barCategoryAxis,
  barValueAxis,
  horizontalBarGrid,
  horizontalBarMargin,
} from './chartPresets';

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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-card border border-border rounded-xl p-6 shadow-2xs lg:col-span-2"
    >
      <div className="mb-6">
        <h3 className="font-sans font-semibold text-foreground text-base">
          {t('dashboard.bestSellers')}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.topMenu')}</p>
      </div>
      <div className="h-64 w-full">
        {data.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground bg-secondary/30 rounded-xl border border-dashed border-border">
            <Package size={28} className="mb-2 opacity-40" />
            <span className="text-xs">{t('dashboard.noSales')}</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={horizontalBarMargin}>
              <CartesianGrid {...horizontalBarGrid} strokeDasharray="3 3" opacity={0.5} />
              <XAxis {...barValueAxis} stroke="var(--muted-foreground)" />
              <YAxis {...barCategoryAxis} stroke="var(--muted-foreground)" width={120} />
              <Tooltip
                content={<ChartTooltip currency={currency} valueType="number" />}
                cursor={{ fill: 'var(--secondary)', opacity: 0.5 }}
              />
              <Bar dataKey="quantity" radius={[0, 6, 6, 0]} barSize={20}>
                {data.map((_entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={index === 0 ? 'var(--foreground)' : 'var(--muted-foreground)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
}
