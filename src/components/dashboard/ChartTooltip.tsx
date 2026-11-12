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
    <div className="bg-card/95 backdrop-blur-md border border-border rounded-xl p-3 shadow-lg">
      <p className="text-foreground font-semibold text-xs mb-1.5">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-xs font-mono mt-1">
          <span
            className="swatch size-2 rounded-full"
            style={{ '--swatch-color': entry.color } as CSSProperties}
          />
          <span className="text-muted-foreground capitalize">{entry.name}:</span>
          <span className="text-foreground font-semibold">
            {valueType === 'currency' ? currency : ''}
            {Number(entry.value).toFixed(valueType === 'currency' ? 2 : 0)}
          </span>
        </div>
      ))}
    </div>
  );
};
