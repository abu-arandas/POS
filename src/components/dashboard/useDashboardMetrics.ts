import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTransactionStore } from '../../stores/transactionStore';
import { useProductStore } from '../../stores/productStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSupplyStore } from '../../stores/supplyStore';
import { toCsv, downloadCsv, transactionsToCsvRows } from '../../lib/csv';
import { buildPoReport } from '../../lib/poReport';
import {
  assignSeriesColors,
  foldToCap,
  NEUTRAL,
  SERIES_CAP,
  type ChartMode,
} from '../../lib/chartPalette';
import {
  buildTrendBuckets,
  categoryRevenue,
  computeKpis,
  operatorBreakdown,
  paymentTotals,
  reportableTransactions,
  topProducts,
  withinLastDays,
} from '../../lib/dashboardMetrics';

export type DashboardRange = 'today' | '7d' | '30d' | 'all';

// Every payment method the app supports, in a fixed order. The colour a
// method gets must not depend on whether it took money in the selected range.
export const PAYMENT_METHOD_ORDER = ['card', 'cash', 'mobile', 'gift'] as const;

export interface CategoryShareRow {
  key: string;
  name: string;
  value: number;
  color: string;
}

export interface PaymentMethodRow {
  name: string;
  value: number;
  color: string;
}

/**
 * Everything the dashboard reports, derived from the stores.
 *
 * The arithmetic itself lives in lib/dashboardMetrics and lib/poReport; this
 * assembles it for one selected range, keeps the range, and holds the pieces
 * that depend on the active locale or theme — which the pure modules cannot
 * see.
 */
export function useDashboardMetrics(t: TFunction, language: string) {
  const transactions = useTransactionStore((s) => s.transactions);
  const products = useProductStore((s) => s.products);
  const categories = useProductStore((s) => s.categories);
  const settings = useSettingsStore((s) => s.settings);
  const supabaseConfig = useSettingsStore((s) => s.supabaseConfig);
  // Charts carry their own light/dark steps, so they need the theme itself
  // rather than a CSS class the canvas cannot read.
  const darkMode = useSettingsStore((s) => s.darkMode);
  const purchaseOrders = useSupplyStore((s) => s.purchaseOrders);

  const cloudLive = supabaseConfig.enabled && supabaseConfig.status === 'connected';
  const chartMode: ChartMode = darkMode ? 'dark' : 'light';

  const completedTransactions = useMemo(() => reportableTransactions(transactions), [transactions]);

  // A POS terminal is routinely left running past midnight, so "today" cannot be
  // captured once at mount — that pins every KPI to the day the screen was
  // opened. Re-check on a minute tick and only re-render when the calendar day
  // actually turns over.
  const [todayDateString, setTodayDateString] = useState(() => new Date().toDateString());
  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date().toDateString();
      setTodayDateString((prev) => (prev === now ? prev : now));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Local midnight of the current day. Everything date-relative below derives
  // from this rather than calling new Date() itself, so the tick above is a real
  // input to those memos and the windows genuinely slide at midnight.
  const todayStart = useMemo(
    () => new Date(todayDateString).setHours(0, 0, 0, 0),
    [todayDateString],
  );

  const todayTransactions = useMemo(
    () =>
      completedTransactions.filter((tx) => new Date(tx.date).toDateString() === todayDateString),
    [completedTransactions, todayDateString],
  );

  const [range, setRange] = useState<DashboardRange>('7d');
  // 'all' is handled separately (rangeTxns returns everything), so 30d/all both map to 30.
  const rangeDays = range === 'today' ? 1 : range === '7d' ? 7 : 30;

  const rangeTxns = useMemo(() => {
    if (range === 'all') return completedTransactions;
    return withinLastDays(completedTransactions, todayStart, rangeDays);
  }, [completedTransactions, range, rangeDays, todayStart]);

  const kpis = useMemo(
    () => computeKpis(todayTransactions, completedTransactions, products),
    [todayTransactions, completedTransactions, products],
  );

  const salesTrendData = useMemo(() => {
    const buckets = Math.min(range === 'all' ? 30 : rangeDays, 31);
    // The figures come from the metrics module; the label is the screen's,
    // because it is the only part that depends on the active locale.
    return buildTrendBuckets(rangeTxns, todayStart, buckets).map((bucket) => ({
      label: new Date(bucket.key).toLocaleDateString(language === 'ar' ? 'ar' : 'en', {
        weekday: buckets <= 7 ? 'short' : undefined,
        month: 'numeric',
        day: 'numeric',
      }),
      revenue: bucket.revenue,
      profit: bucket.profit,
    }));
  }, [rangeTxns, range, rangeDays, language, todayStart]);

  const topProductsData = useMemo(() => topProducts(rangeTxns), [rangeTxns]);

  const categoryShareData = useMemo<CategoryShareRow[]>(() => {
    // Colour is keyed on the CATALOGUE, not on this range's revenue ranking.
    // Keying it on the ranking meant narrowing the date range repainted whichever
    // categories survived — the same category green in one range and amber in
    // the next — so two ranges could not be compared by eye.
    const colors = assignSeriesColors(
      categories.map((category) => category.id),
      chartMode,
    );
    const byId = new Map(categories.map((category) => [category.id, category]));
    const rows = categoryRevenue(rangeTxns, products).map((entry) => {
      const category = byId.get(entry.categoryId);
      return {
        key: entry.categoryId,
        name: category
          ? t(`categories.${category.name.toLowerCase()}`, { defaultValue: category.name })
          : 'General',
        value: entry.revenue,
      };
    });
    // Bars compare against their neighbour, so the adjacent cap applies.
    return foldToCap(
      rows,
      colors,
      chartMode,
      SERIES_CAP.adjacent,
      t('dashboard.otherCategories', { defaultValue: 'Other' }),
    );
  }, [rangeTxns, products, categories, t, chartMode]);

  const paymentMethodsData = useMemo<PaymentMethodRow[]>(() => {
    // A fixed domain: every method keeps its colour whether or not it took any
    // money in the selected range.
    const colors = assignSeriesColors(PAYMENT_METHOD_ORDER, chartMode);
    return paymentTotals(rangeTxns).map(({ method, value }) => ({
      name: method.toUpperCase(),
      value,
      color: colors.get(method) ?? NEUTRAL[chartMode],
    }));
  }, [rangeTxns, chartMode]);

  const totalSalesVolume = useMemo(
    () => paymentMethodsData.reduce((sum, d) => sum + d.value, 0),
    [paymentMethodsData],
  );

  const paymentMethodsMap = useMemo(
    () => new Map(paymentMethodsData.map((d) => [d.name, d])),
    [paymentMethodsData],
  );

  const operatorRows = useMemo(() => operatorBreakdown(rangeTxns), [rangeTxns]);

  const poReport = useMemo(
    () => buildPoReport(purchaseOrders, range === 'all' ? undefined : rangeDays),
    [purchaseOrders, range, rangeDays],
  );

  const exportRange = useCallback(() => {
    downloadCsv(
      `sales-${range}-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(transactionsToCsvRows(rangeTxns)),
    );
  }, [rangeTxns, range]);

  return {
    settings,
    chartMode,
    cloudLive,
    range,
    setRange,
    rangeTxns,
    kpis,
    salesTrendData,
    topProductsData,
    categoryShareData,
    paymentMethodsMap,
    totalSalesVolume,
    operatorRows,
    poReport,
    exportRange,
  };
}
