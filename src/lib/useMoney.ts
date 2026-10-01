import { useMemo } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { moneyFormatter, MoneyFormatter } from './money';

/**
 * The store's money rules for a component: how many digits an amount has, and
 * helpers that already know them. Replaces the `${settings.currency}${n.toFixed(2)}`
 * each screen used to inline, which printed a dinar sale to the fil only by
 * accident of the amount.
 */
export function useMoney(): MoneyFormatter {
  const currency = useSettingsStore((s) => s.settings.currency);
  const currencyCode = useSettingsStore((s) => s.settings.currencyCode);
  return useMemo(() => moneyFormatter({ currency, currencyCode }), [currency, currencyCode]);
}
