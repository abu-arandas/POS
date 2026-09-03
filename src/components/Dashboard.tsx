import { useMemo, useState, useCallback, useEffect, type CSSProperties } from 'react';
import {
  TrendingUp,
  ShoppingBag,
  Percent,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Package,
  AlertTriangle,
  Download,
  Users,
  Activity,
  ClipboardList,
  Truck,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { motion } from 'motion/react';
import {
  assignSeriesColors,
  foldToCap,
  NEUTRAL,
  SERIES_CAP,
  type ChartMode,
} from '../lib/chartPalette';
import { useTransactionStore } from '../stores/transactionStore';
import { useProductStore } from '../stores/productStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useSupplyStore } from '../stores/supplyStore';
import { toCsv, downloadCsv, transactionsToCsvRows } from '../lib/csv';
import { buildPoReport } from '../lib/poReport';
import {
  buildTrendBuckets,
  categoryRevenue,
  computeKpis,
  operatorBreakdown,
  paymentTotals,
  reportableTransactions,
  topProducts,
  withinLastDays,
} from '../lib/dashboardMetrics';
import { useTranslation } from 'react-i18next';

interface TooltipEntry {
  color?: string;
  name?: string | number;
  value?: string | number;
}

const CustomTooltip = ({
  active,
  payload,
  label,
  currency,
  valueType = 'currency',
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  currency: string;
  valueType?: 'currency' | 'number';
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[var(--surface-1)] backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-xl">
        <p className="text-slate-900 dark:text-white font-bold mb-2">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 text-sm font-mono mt-1">
            <span
              className="swatch w-2 h-2 rounded-full"
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
  }
  return null;
};

/**
 * Sales dashboard: revenue and order trends, top products, and stock alerts
 * for the selected period.
 */
// Every payment method the app supports, in a fixed order. The colour a
// method gets must not depend on whether it took money in the selected range.
const PAYMENT_METHOD_ORDER = ['card', 'cash', 'mobile', 'gift'] as const;

export default function Dashboard() {
  const { t, i18n } = useTranslation();
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

  const todayTransactions = useMemo(() => {
    return completedTransactions.filter(
      (tx) => new Date(tx.date).toDateString() === todayDateString,
    );
  }, [completedTransactions, todayDateString]);

  const [range, setRange] = useState<'today' | '7d' | '30d' | 'all'>('7d');
  // 'all' is handled separately (rangeTxns returns everything), so 30d/all both map to 30.
  const rangeDays = range === 'today' ? 1 : range === '7d' ? 7 : 30;

  const rangeTxns = useMemo(
    () =>
      range === 'all'
        ? completedTransactions
        : withinLastDays(completedTransactions, todayStart, rangeDays),
    [completedTransactions, range, rangeDays, todayStart],
  );

  const kpis = useMemo(
    () => computeKpis(todayTransactions, completedTransactions, products),
    [todayTransactions, completedTransactions, products],
  );

  const salesTrendData = useMemo(() => {
    const buckets = Math.min(range === 'all' ? 30 : rangeDays, 31);
    // The figures come from the metrics module; the label is the screen's,
    // because it is the only part that depends on the active locale.
    return buildTrendBuckets(rangeTxns, todayStart, buckets).map((bucket) => ({
      label: new Date(bucket.key).toLocaleDateString(i18n.language === 'ar' ? 'ar' : 'en', {
        weekday: buckets <= 7 ? 'short' : undefined,
        month: 'numeric',
        day: 'numeric',
      }),
      revenue: bucket.revenue,
      profit: bucket.profit,
    }));
  }, [rangeTxns, range, rangeDays, i18n.language, todayStart]);

  const topProductsData = useMemo(() => topProducts(rangeTxns), [rangeTxns]);

  const chartMode: ChartMode = darkMode ? 'dark' : 'light';

  const categoryShareData = useMemo(() => {
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

  const paymentMethodsData = useMemo(() => {
    // A fixed domain: every method keeps its colour whether or not it took any
    // money in the selected range.
    const colors = assignSeriesColors(PAYMENT_METHOD_ORDER, chartMode);
    return paymentTotals(rangeTxns).map(({ method, value }) => ({
      name: method.toUpperCase(),
      value,
      color: colors.get(method) ?? NEUTRAL[chartMode],
    }));
  }, [rangeTxns, chartMode]);

  const totalSalesVolume = useMemo(() => {
    return paymentMethodsData.reduce((sum, d) => sum + d.value, 0);
  }, [paymentMethodsData]);

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

  const paymentMethodsMap = useMemo(
    () => new Map(paymentMethodsData.map((d) => [d.name, d])),
    [paymentMethodsData],
  );

  return (
    <div
      id="dashboard-root"
      className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-[#020617] p-6 transition-colors duration-300"
    >
      {/* Header */}
      <div id="dashboard-header" className="mb-6 shrink-0 flex items-center justify-between">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="font-sans font-extrabold tracking-tight text-slate-900 dark:text-white text-xl sm:text-2xl flex items-center gap-2">
            <TrendingUp className="text-emerald-500" /> {t('dashboard.title')}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
            {t('dashboard.subtitle')}
          </p>
        </motion.div>

        <div className="flex items-center gap-4">
          <div className="flex bg-white dark:bg-[#0f172a] p-1 rounded-xl border border-slate-200 dark:border-white/5 shadow-inner">
            {(
              [
                { id: 'today', label: t('dashboard.rangeToday') },
                { id: '7d', label: t('dashboard.range7d') },
                { id: '30d', label: t('dashboard.range30d') },
                { id: 'all', label: t('dashboard.rangeAll') },
              ] as const
            ).map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                aria-pressed={range === r.id}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                  range === r.id
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <button
            id="dashboard-export-btn"
            onClick={exportRange}
            disabled={rangeTxns.length === 0}
            className="flex items-center gap-2 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-[#1e293b] disabled:opacity-40 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-bold uppercase px-4 py-2 rounded-xl shadow-sm transition-colors h-full"
            title={t('dashboard.exportRange')}
          >
            <Download size={14} />
            CSV
          </button>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`flex items-center space-x-2 border px-4 py-2 rounded-xl text-xs font-bold shadow-inner ${
              cloudLive
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-slate-100 dark:bg-slate-500/10 border-slate-200 dark:border-slate-400/20 text-slate-500 dark:text-slate-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                cloudLive
                  ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                  : 'bg-slate-400'
              }`}
            />
            <span>{cloudLive ? t('dashboard.sync') : t('dashboard.syncOff')}</span>
          </motion.div>
        </div>
      </div>

      {/* Main dashboard content container */}
      <div id="dashboard-content" className="flex-1 overflow-y-auto space-y-6 pe-1 pb-6">
        {/* KPI Row */}
        <div id="kpi-row" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Revenue */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="surface rounded-3xl p-6 shadow-xl flex flex-col justify-between relative overflow-hidden group hover:bg-[var(--surface-hover)] transition-colors"
          >
            <div className="absolute -inset-e-6 -top-6 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-colors" />
            <div className="flex justify-between items-start mb-4 relative z-10">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider font-mono">
                {t('dashboard.todaysRevenue')}
              </span>
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 shadow-inner">
                <DollarSign size={20} className="stroke-[2.5]" />
              </div>
            </div>
            <div className="relative z-10">
              <h3 className="font-mono font-extrabold text-slate-900 dark:text-white text-3xl mb-2">
                {settings.currency}
                {kpis.revenueToday.toFixed(2)}
              </h3>
              <div className="flex items-center gap-2 text-xs font-medium">
                {kpis.revenueToday >= kpis.avgDailyRevenue ? (
                  <span className="badge badge-emerald flex items-center px-2 py-0.5">
                    <ArrowUpRight size={14} className="me-1" /> {t('dashboard.aboveAvg')}
                  </span>
                ) : (
                  <span className="badge badge-rose flex items-center px-2 py-0.5">
                    <ArrowDownRight size={14} className="me-1" /> {t('dashboard.belowAvg')}
                  </span>
                )}
                <span className="text-slate-500 font-mono">
                  {t('dashboard.vsAvg', {
                    amount: `${settings.currency}${kpis.avgDailyRevenue.toFixed(0)}`,
                  })}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Card 2: Profit */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="surface rounded-3xl p-6 shadow-xl flex flex-col justify-between relative overflow-hidden group hover:bg-[var(--surface-hover)] transition-colors"
          >
            <div className="absolute -inset-e-6 -top-6 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-colors" />
            <div className="flex justify-between items-start mb-4 relative z-10">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider font-mono">
                {t('dashboard.netProfit')}
              </span>
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 shadow-inner">
                <Percent size={20} className="stroke-[2.5]" />
              </div>
            </div>
            <div className="relative z-10">
              <h3 className="font-mono font-extrabold text-slate-900 dark:text-white text-3xl mb-2">
                {settings.currency}
                {kpis.profitToday.toFixed(2)}
              </h3>
              <div className="flex items-center gap-2 text-xs font-medium">
                <span className="badge badge-blue px-2 py-0.5">
                  {t('dashboard.margin').replace(':', '')}{' '}
                  {kpis.revenueToday > 0
                    ? ((kpis.profitToday / kpis.revenueToday) * 100).toFixed(0)
                    : 0}
                  %
                </span>
                <span className="text-slate-500 font-mono">{t('dashboard.exclTax')}</span>
              </div>
            </div>
          </motion.div>

          {/* Card 3: Orders */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="surface rounded-3xl p-6 shadow-xl flex flex-col justify-between relative overflow-hidden group hover:bg-[var(--surface-hover)] transition-colors"
          >
            <div className="absolute -inset-e-6 -top-6 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl group-hover:bg-purple-500/20 transition-colors" />
            <div className="flex justify-between items-start mb-4 relative z-10">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider font-mono">
                {t('dashboard.completedSales')}
              </span>
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 shadow-inner">
                <ShoppingBag size={20} className="stroke-[2.5]" />
              </div>
            </div>
            <div className="relative z-10">
              <h3 className="font-mono font-extrabold text-slate-900 dark:text-white text-3xl mb-2">
                {kpis.ordersToday}
              </h3>
              <div className="flex items-center gap-2 text-xs font-medium">
                <span className="badge badge-purple px-2 py-0.5 font-mono">
                  {settings.currency}
                  {kpis.aovToday} {t('dashboard.aov')}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Card 4: Low Stock */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="surface rounded-3xl p-6 shadow-xl flex flex-col justify-between relative overflow-hidden group hover:bg-[var(--surface-hover)] transition-colors"
          >
            <div
              className={`absolute -inset-e-6 -top-6 w-32 h-32 rounded-full blur-3xl transition-colors ${kpis.lowStockItems > 0 ? 'bg-amber-500/10 group-hover:bg-amber-500/20' : 'bg-slate-500/10'}`}
            />
            <div className="flex justify-between items-start mb-4 relative z-10">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider font-mono">
                {t('dashboard.stockWarnings')}
              </span>
              <div
                className={`p-2.5 rounded-xl shadow-inner ${kpis.lowStockItems > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}
              >
                <Package size={20} className="stroke-[2.5]" />
              </div>
            </div>
            <div className="relative z-10">
              <h3 className="font-mono font-extrabold text-slate-900 dark:text-white text-3xl mb-2">
                {kpis.lowStockItems}
              </h3>
              <div className="flex items-center gap-2 text-xs font-medium">
                {kpis.lowStockItems > 0 ? (
                  <span className="badge badge-amber flex items-center gap-1.5 px-2 py-0.5">
                    <AlertTriangle size={12} /> {t('dashboard.actionNeeded')}
                  </span>
                ) : (
                  <span className="badge badge-slate flex items-center gap-1.5 px-2 py-0.5">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />{' '}
                    {t('dashboard.allGood')}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Charts Row 1: Sales Trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="surface rounded-3xl p-8 shadow-xl"
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="font-sans font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
                <Activity size={20} className="text-emerald-500" />
                {t('dashboard.salesTrend')}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {t('dashboard.historicalPerf')}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono bg-[var(--surface-1)] px-4 py-2 rounded-xl border border-slate-200 dark:border-white/5">
              <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                {t('dashboard.revenue')}
              </span>
              <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <span className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                {t('dashboard.profit')}
              </span>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={salesTrendData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#1e293b" />
                <XAxis
                  dataKey="label"
                  stroke="#475569"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  dy={15}
                />
                <YAxis
                  stroke="#475569"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  dx={-15}
                  tickFormatter={(val) => `${val}`}
                />
                <Tooltip content={<CustomTooltip currency={settings.currency} />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  strokeWidth={4}
                  fill="url(#colorRevenue)"
                  activeDot={{ r: 8, fill: '#10b981', stroke: '#020617', strokeWidth: 3 }}
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  stroke="#3b82f6"
                  strokeWidth={4}
                  fill="url(#colorProfit)"
                  activeDot={{ r: 8, fill: '#3b82f6', stroke: '#020617', strokeWidth: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Best Sellers */}
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
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {t('dashboard.topMenu')}
              </p>
            </div>
            <div className="h-72 w-full">
              {topProductsData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 bg-[var(--surface-1)] rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
                  <Package size={32} className="mb-3 opacity-50" />
                  <span>{t('dashboard.noSales')}</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topProductsData}
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
                      content={<CustomTooltip currency={settings.currency} valueType="number" />}
                      cursor={{ fill: '#1e293b', opacity: 0.4 }}
                    />
                    <Bar dataKey="quantity" radius={[0, 8, 8, 0]} barSize={28}>
                      {topProductsData.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </motion.div>

          {/* Category Share */}
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
              {categoryShareData.length === 0 ? (
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
                    data={categoryShareData}
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
                    <Tooltip content={<CustomTooltip currency={settings.currency} />} />
                    <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={22}>
                      {categoryShareData.map((entry) => (
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
              {categoryShareData.map((item) => (
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
                      {settings.currency}
                      {item.value.toFixed(0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Bottom Row: Payments & Operators */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="surface rounded-3xl p-8 shadow-xl"
          >
            <div className="mb-6">
              <h3 className="font-sans font-bold text-slate-900 dark:text-white text-lg">
                {t('dashboard.paymentMethods')}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {['card', 'cash', 'mobile', 'gift'].map((method) => {
                const data = paymentMethodsMap.get(method.toUpperCase());
                const val = data ? data.value : 0;
                const pct = totalSalesVolume > 0 ? (val / totalSalesVolume) * 100 : 0;

                return (
                  <div
                    key={method}
                    className="bg-[var(--surface-1)] border border-slate-200 dark:border-white/5 rounded-2xl p-5 hover:border-slate-200 transition-colors"
                  >
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono block mb-2">
                      {t(`dashboard.${method}`, { defaultValue: method })}
                    </span>
                    <span className="font-mono font-extrabold text-2xl text-slate-900 dark:text-white block mb-2">
                      {settings.currency}
                      {val.toFixed(2)}
                    </span>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mb-2">
                      {/* The method's own colour, not a hardcoded blue. Every
                          bar being blue meant the four methods were told apart
                          by their label alone, and the colour computed for them
                          was never drawn. */}
                      <div
                        className="bar-fill h-1.5 rounded-full"
                        style={
                          {
                            '--bar-width': `${pct}%`,
                            backgroundColor: data ? data.color : NEUTRAL[chartMode],
                          } as CSSProperties
                        }
                      />
                    </div>
                    <span className="text-xs text-slate-500 font-mono">
                      {t('dashboard.percentOfTotal', { percent: pct.toFixed(1) })}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className="surface rounded-3xl p-8 shadow-xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <h3 className="font-sans font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
                <Users size={20} className="text-emerald-500" /> {t('dashboard.byOperator')}
              </h3>
            </div>
            {operatorRows.length === 0 ? (
              <div className="w-full py-12 flex items-center justify-center text-slate-500 bg-[var(--surface-1)] rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
                {t('dashboard.noSales')}
              </div>
            ) : (
              <div className="space-y-4">
                {operatorRows.map((op, idx) => {
                  const max = operatorRows[0].revenue || 1;
                  return (
                    <div key={idx} className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-xs shrink-0">
                        {op.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-end mb-1.5">
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                            {op.name}
                          </span>
                          <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                            {settings.currency}
                            {op.revenue.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="bar-fill h-full bg-emerald-500 rounded-full"
                              style={
                                {
                                  '--bar-width': `${Math.max(2, (op.revenue / max) * 100)}%`,
                                } as CSSProperties
                              }
                            />
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                            {op.orders} {t('dashboard.ordersLabel')}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>

        {/* Purchasing (purchase orders) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
          className="surface rounded-3xl p-8 shadow-xl"
        >
          <div className="mb-6 flex items-center justify-between">
            <h3 className="font-sans font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
              <ClipboardList size={20} className="text-emerald-500" /> {t('dashboard.purchasing')}
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-[var(--surface-1)] border border-slate-200 dark:border-white/5 rounded-2xl p-5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono block mb-2">
                {t('dashboard.poReceived')}
              </span>
              <span className="font-mono font-extrabold text-2xl text-emerald-400 block">
                {settings.currency}
                {poReport.receivedValue.toFixed(2)}
              </span>
            </div>
            <div className="bg-[var(--surface-1)] border border-slate-200 dark:border-white/5 rounded-2xl p-5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono block mb-2">
                {t('dashboard.poOutstanding')}
              </span>
              <span className="font-mono font-extrabold text-2xl text-amber-400 block">
                {settings.currency}
                {poReport.outstandingValue.toFixed(2)}
              </span>
            </div>
            <div className="bg-[var(--surface-1)] border border-slate-200 dark:border-white/5 rounded-2xl p-5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono block mb-2">
                {t('dashboard.poOpenOrders')}
              </span>
              <span className="font-mono font-extrabold text-2xl text-slate-900 dark:text-white block">
                {poReport.countByStatus.draft + poReport.countByStatus.ordered}
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {poReport.countByStatus.received} {t('dashboard.poReceivedCount')}
              </span>
            </div>
          </div>

          {poReport.suppliers.length === 0 ? (
            <div className="w-full py-10 flex items-center justify-center text-slate-500 bg-[var(--surface-1)] rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
              {t('dashboard.noPurchaseData')}
            </div>
          ) : (
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                {t('dashboard.topSuppliers')}
              </span>
              {poReport.suppliers.slice(0, 5).map((s) => {
                const maxSpend =
                  poReport.suppliers[0].received || poReport.suppliers[0].outstanding || 1;
                const spend = s.received || s.outstanding;
                return (
                  <div key={s.supplierId ?? 'none'} className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-emerald-400 shrink-0">
                      <Truck size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-end mb-1.5">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                          {s.supplierName}
                        </span>
                        <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                          {settings.currency}
                          {s.received.toFixed(2)}
                          {s.outstanding > 0 && (
                            <span className="text-amber-400 ms-2 text-xs">
                              +{settings.currency}
                              {s.outstanding.toFixed(2)}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="bar-fill h-full bg-emerald-500 rounded-full"
                            style={
                              {
                                '--bar-width': `${Math.max(2, (spend / maxSpend) * 100)}%`,
                              } as CSSProperties
                            }
                          />
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 shrink-0">
                          {s.orders} {t('dashboard.poOrdersLabel')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
