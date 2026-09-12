/**
 * A monetary amount.
 *
 * `tabular-nums` is the whole point. Proportional digits make a column of
 * prices ragged and a changing total jitter as it counts — on a till, where
 * amounts sit in columns and update while the operator watches, that reads as
 * instability. Fixed-width digits keep the decimal point still.
 *
 * The currency symbol is dimmed rather than removed: the operator needs the
 * figure, not the unit, but the unit has to be there on a receipt or a refund.
 */
export interface MoneyProps {
  value: number;
  currency: string;
  /** `money` for totals and stat figures, `body` inline, `small` in dense rows. */
  size?: 'small' | 'body' | 'lead' | 'money';
  /** Renders negatives in the danger colour — refunds, discounts. */
  signed?: boolean;
  className?: string;
}

const SIZE = {
  small: 'text-small',
  body: 'text-body',
  lead: 'text-lead font-semibold',
  money: 'text-money font-extrabold tracking-tight',
} as const;

export function Money({ value, currency, size = 'body', signed, className = '' }: MoneyProps) {
  const negative = value < 0;
  const shown = Math.abs(value).toFixed(2);
  return (
    <span
      className={`tabular-nums whitespace-nowrap ${SIZE[size]} ${
        signed && negative ? 'text-danger' : ''
      } ${className}`}
    >
      {negative && signed ? '−' : ''}
      <span className="opacity-55">{currency}</span>
      {shown}
    </span>
  );
}
