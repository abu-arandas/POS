import type { CSSProperties } from 'react';

interface TooltipEntry {
  color?: string;
  name?: string | number;
  value?: string | number;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  currency: string;
  valueType?: 'currency' | 'number';
}

/** Recharts tooltip in the app's surface styling, shared by every chart. */
export const ChartTooltip = ({
  active,
  payload,
  label,
  currency,
  valueType = 'currency',
}: ChartTooltipProps) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-[var(--surface-1)] backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-xl">
      <p className="text-slate-900 dark:text-white font-bold mb-2">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-sm font-mono mt-1">
          <span
            className="swatch size-2 rounded-full"
            style={{ '--swatch-color': entry.color } as CSSProperties}
          />
          <span className="text-slate-500 dark:text-slate-400 capitalize">{entry.name}:</span>
          <span className="text-slate-900 dark:text-white font-bold">
            {valueType === 'currency' ? currency : ''}
            {Number(entry.value).toFixed(valueType === 'currency' ? 2 : 0)}
          </span>
        </div>
      ))}
    </div>
  );
};
