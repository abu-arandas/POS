import { useMemo, useState } from 'react';
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
  PieChart,
  Pie,
} from 'recharts';
import { motion } from 'motion/react';
import { useTransactionStore } from '../stores/transactionStore';
import { useProductStore } from '../stores/productStore';
import { useSettingsStore } from '../stores/settingsStore';
import { toCsv, downloadCsv, transactionsToCsvRows } from '../lib/csv';
import { useTranslation } from 'react-i18next';

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { transactions } = useTransactionStore();
  const { products, categories } = useProductStore();
  const { settings, supabaseConfig } = useSettingsStore();
  const cloudLive = supabaseConfig.enabled && supabaseConfig.status === 'connected';

  const completedTransactions = useMemo(() => {
    return transactions.filter((t) => t.status === 'completed');
  }, [transactions]);

  const todayDateString = useMemo(() => new Date().toDateString(), []);

  const todayTransactions = useMemo(() => {
    return completedTransactions.filter(
      (tx) => new Date(tx.date).toDateString() === todayDateString,
    );
  }, [completedTransactions, todayDateString]);

  // Reporting date range (drives the charts, breakdowns, and export).
  const [range, setRange] = useState<'today' | '7d' | '30d' | 'all'>('7d');
  const rangeDays = range === 'today' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : 30;

  const rangeTxns = useMemo(() => {
    if (range === 'all') return completedTransactions;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (rangeDays - 1));
    return completedTransactions.filter((tx) => new Date(tx.date) >= start);
  }, [completedTransactions, range, rangeDays]);

  const kpis = useMemo(() => {
    const revenueToday = todayTransactions.reduce((sum, t) => sum + t.total, 0);
    const ordersToday = todayTransactions.length;
    const aovToday = ordersToday > 0 ? revenueToday / ordersToday : 0;

    const profitToday = todayTransactions.reduce((sum, tx) => {
      const transactionCost = tx.items.reduce((cSum, item) => cSum + item.cost * item.quantity, 0);
      const transactionRevenue = tx.subtotal - tx.discount;
      return sum + (transactionRevenue - transactionCost);
    }, 0);

    const uniqueDays = new Set(completedTransactions.map((tx) => new Date(tx.date).toDateString()));
    const daysCount = Math.max(1, uniqueDays.size);
    const totalHistoricalRevenue = completedTransactions.reduce((sum, t) => sum + t.total, 0);
    const avgDailyRevenue = totalHistoricalRevenue / daysCount;

    // Same definition as the sidebar badge: at/below threshold but still in stock.
    const lowStockItems = products.filter((p) => p.stock <= p.minStock && p.stock > 0).length;

    return {
      revenueToday: Number(revenueToday.toFixed(2)),
      ordersToday,
      aovToday: Number(aovToday.toFixed(2)),
      profitToday: Number(profitToday.toFixed(2)),
      avgDailyRevenue: Number(avgDailyRevenue.toFixed(2)),
      lowStockItems,
    };
  }, [todayTransactions, completedTransactions, products]);

  const salesTrendData = useMemo(() => {
    const datesMap = new Map<string, { label: string; revenue: number; profit: number }>();
    const today = new Date();
    // Daily buckets across the selected range (capped so the axis stays legible).
    const buckets = Math.min(range === 'all' ? 30 : rangeDays, 31);

    for (let i = buckets - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toDateString();
      const label = d.toLocaleDateString(i18n.language === 'ar' ? 'ar' : 'en', {
        weekday: buckets <= 7 ? 'short' : undefined,
        month: 'numeric',
        day: 'numeric',
      });
      datesMap.set(key, { label, revenue: 0, profit: 0 });
    }

    rangeTxns.forEach((tx) => {
      const txKey = new Date(tx.date).toDateString();
      if (datesMap.has(txKey)) {
        const entry = datesMap.get(txKey)!;
        entry.revenue += tx.total;

        // Raw (unclamped) profit so loss days show as negative — matching the
        // "Net Profit Today" KPI, which uses the same formula.
        const cost = tx.items.reduce((sum, item) => sum + item.cost * item.quantity, 0);
        entry.profit += tx.subtotal - tx.discount - cost;

        datesMap.set(txKey, entry);
      }
    });

    return Array.from(datesMap.values()).map((v) => ({
      ...v,
      revenue: Number(v.revenue.toFixed(2)),
      profit: Number(v.profit.toFixed(2)),
    }));
  }, [rangeTxns, range, rangeDays, i18n.language]);

  const topProductsData = useMemo(() => {
    const productSalesMap = new Map<string, { name: string; quantity: number; revenue: number }>();

    rangeTxns.forEach((tx) => {
      tx.items.forEach((item) => {
        const current = productSalesMap.get(item.productId) || {
          name: item.productName,
          quantity: 0,
          revenue: 0,
        };
        current.quantity += item.quantity;
        current.revenue += item.total;
        productSalesMap.set(item.productId, current);
      });
    });

    return Array.from(productSalesMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)
      .map((v) => ({
        ...v,
        revenue: Number(v.revenue.toFixed(2)),
      }));
  }, [rangeTxns]);

  const categoryShareData = useMemo(() => {
    const catSalesMap = new Map<string, number>();

    rangeTxns.forEach((tx) => {
      tx.items.forEach((item) => {
        const prod = products.find((p) => p.id === item.productId);
        const catId = prod?.category || 'general';
        const current = catSalesMap.get(catId) || 0;
        catSalesMap.set(catId, current + item.total);
      });
    });

    const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#64748b'];

    return Array.from(catSalesMap.entries())
      .map(([catId, revenue], idx) => {
        const catObj = categories.find((c) => c.id === catId);
        const catName = catObj
          ? t(`categories.${catObj.name.toLowerCase()}`, { defaultValue: catObj.name })
          : 'General';
        return {
          name: catName,
          value: Number(revenue.toFixed(2)),
          color: colors[idx % colors.length],
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [rangeTxns, products, categories, t]);

  const paymentMethodsData = useMemo(() => {
    const counts: Record<'cash' | 'card' | 'mobile' | 'gift', number> = {
      cash: 0,
      card: 0,
      mobile: 0,
      gift: 0,
    };
    rangeTxns.forEach((tx) => {
      if (tx.paymentMethod in counts) {
        counts[tx.paymentMethod as keyof typeof counts] += tx.total;
      }
    });

    const colors = { card: '#3b82f6', cash: '#10b981', mobile: '#8b5cf6', gift: '#f59e0b' };

    return Object.entries(counts)
      .map(([method, val]) => ({
        name: method.toUpperCase(),
        value: Number(val.toFixed(2)),
        color: colors[method as keyof typeof colors],
      }))
      .filter((item) => item.value > 0);
  }, [rangeTxns]);

  // Denominator over the same buckets shown in the cards, so the percentages
  // always sum to 100 (loyalty redemptions are $0 sales and are not a bucket).
  const totalSalesVolume = useMemo(() => {
    return paymentMethodsData.reduce((sum, d) => sum + d.value, 0);
  }, [paymentMethodsData]);

  // Per-operator sales for the selected range (staff performance report).
  const operatorBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; orders: number; revenue: number }>();
    rangeTxns.forEach((tx) => {
      const key = tx.operatorId ?? tx.operatorName ?? 'unknown';
      const current = map.get(key) || { name: tx.operatorName ?? '—', orders: 0, revenue: 0 };
      current.orders += 1;
      current.revenue += tx.total;
      map.set(key, current);
    });
    return Array.from(map.values())
      .map((v) => ({ ...v, revenue: Number(v.revenue.toFixed(2)) }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [rangeTxns]);

  const exportRange = () => {
    downloadCsv(
      `sales-${range}-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(transactionsToCsvRows(rangeTxns)),
    );
  };

  return (
    <div
      id="dashboard-root"
      className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 p-6 transition-colors duration-300"
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

        <div className="flex items-center gap-3">
          {/* Date-range selector — drives the charts, breakdowns, and export. */}
          <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
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
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                  range === r.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
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
            className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-700 dark:text-slate-200 text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-xl shadow-sm transition-colors"
            title={t('dashboard.exportRange')}
          >
            <Download size={13} />
          </button>

          {/* Sync Indicator — reflects whether cloud sync is actually connected */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`flex items-center space-x-2 border px-3 py-1.5 rounded-xl font-mono text-[10px] font-bold shadow-inner ${
              cloudLive
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                : 'bg-slate-500/10 border-slate-400/20 text-slate-500 dark:text-slate-400'
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
        <div id="kpi-row" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Card 1: Revenue Today */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass dark:glass-dark border border-slate-200/50 dark:border-slate-800/50 rounded-3xl p-5 shadow-lg shadow-slate-200/50 dark:shadow-none flex items-start justify-between relative overflow-hidden group hover:border-emerald-500/30 transition-colors"
          >
            <div className="absolute -inset-e-6 -top-6 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-colors" />
            <div className="space-y-1 relative z-10">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block uppercase tracking-wider font-mono">
                {t('dashboard.todaysRevenue')}
              </span>
              <h3 className="font-mono font-extrabold text-transparent bg-clip-text bg-linear-to-br from-emerald-600 to-emerald-400 dark:from-emerald-400 dark:to-emerald-200 text-2xl md:text-3xl animate-count-up">
                {settings.currency}
                {kpis.revenueToday.toFixed(2)}
              </h3>
              <div className="flex items-center gap-1.5 text-[11px] font-medium mt-2">
                {kpis.revenueToday >= kpis.avgDailyRevenue ? (
                  <span className="text-emerald-500 font-bold flex items-center">
                    <ArrowUpRight size={12} className="me-0.5" /> {t('dashboard.aboveAvg')}
                  </span>
                ) : (
                  <span className="text-rose-500 font-bold flex items-center">
                    <ArrowDownRight size={12} className="me-0.5" /> {t('dashboard.belowAvg')}
                  </span>
                )}
                <span className="text-slate-400 dark:text-slate-500 font-mono">
                  {t('dashboard.dailyAvg')} {settings.currency}
                  {kpis.avgDailyRevenue.toFixed(0)}
                </span>
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 shadow-inner relative z-10">
              <DollarSign size={22} className="stroke-[2.5]" />
            </div>
          </motion.div>

          {/* Card 2: Profit Today */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass dark:glass-dark border border-slate-200/50 dark:border-slate-800/50 rounded-3xl p-5 shadow-lg shadow-slate-200/50 dark:shadow-none flex items-start justify-between relative overflow-hidden group hover:border-blue-500/30 transition-colors"
          >
            <div className="absolute -inset-e-6 -top-6 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-colors" />
            <div className="space-y-1 relative z-10">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block uppercase tracking-wider font-mono">
                {t('dashboard.netProfit')}
              </span>
              <h3 className="font-mono font-extrabold text-slate-900 dark:text-white text-2xl md:text-3xl animate-count-up">
                {settings.currency}
                {kpis.profitToday.toFixed(2)}
              </h3>
              <div className="flex items-center gap-1.5 text-[11px] font-medium mt-2 text-slate-500 font-mono">
                <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-md">
                  {t('dashboard.margin')}{' '}
                  {kpis.revenueToday > 0
                    ? ((kpis.profitToday / kpis.revenueToday) * 100).toFixed(0)
                    : 0}
                  %
                </span>
                <span>• {t('dashboard.exclTax')}</span>
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-blue-500/10 text-blue-500 dark:text-blue-400 shadow-inner relative z-10">
              <Percent size={22} className="stroke-[2.5]" />
            </div>
          </motion.div>

          {/* Card 3: Orders Count Today */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass dark:glass-dark border border-slate-200/50 dark:border-slate-800/50 rounded-3xl p-5 shadow-lg shadow-slate-200/50 dark:shadow-none flex items-start justify-between relative overflow-hidden group hover:border-purple-500/30 transition-colors"
          >
            <div className="absolute -inset-e-6 -top-6 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-colors" />
            <div className="space-y-1 relative z-10">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block uppercase tracking-wider font-mono">
                {t('dashboard.completedSales')}
              </span>
              <h3 className="font-mono font-extrabold text-slate-900 dark:text-white text-2xl md:text-3xl animate-count-up">
                {kpis.ordersToday}
              </h3>
              <div className="flex items-center gap-1 text-[11px] font-medium mt-2 text-slate-500">
                <span className="font-mono bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-md">
                  {t('dashboard.ticketAvg')} {settings.currency}
                  {kpis.aovToday}
                </span>
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-purple-500/10 text-purple-500 dark:text-purple-400 shadow-inner relative z-10">
              <ShoppingBag size={22} className="stroke-[2.5]" />
            </div>
          </motion.div>

          {/* Card 4: Low Stock Alarms */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass dark:glass-dark border border-slate-200/50 dark:border-slate-800/50 rounded-3xl p-5 shadow-lg shadow-slate-200/50 dark:shadow-none flex items-start justify-between relative overflow-hidden group hover:border-amber-500/30 transition-colors"
          >
            <div
              className={`absolute -inset-e-6 -top-6 w-24 h-24 rounded-full blur-2xl transition-colors ${kpis.lowStockItems > 0 ? 'bg-amber-500/20 group-hover:bg-amber-500/30' : 'bg-emerald-500/10'}`}
            />
            <div className="space-y-1 relative z-10">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block uppercase tracking-wider font-mono">
                {t('dashboard.stockWarnings')}
              </span>
              <h3 className="font-mono font-extrabold text-slate-900 dark:text-white text-2xl md:text-3xl animate-count-up">
                {kpis.lowStockItems}
              </h3>
              <div className="flex items-center gap-1 text-[11px] font-semibold mt-2">
                {kpis.lowStockItems > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                    <AlertTriangle size={12} /> {t('dashboard.lowItems')}
                  </span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">
                    ● {t('dashboard.allStocked')}
                  </span>
                )}
              </div>
            </div>
            <div
              className={`p-3.5 rounded-2xl shadow-inner relative z-10 ${kpis.lowStockItems > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}
            >
              <Package size={22} className="stroke-[2.5]" />
            </div>
          </motion.div>
        </div>

        {/* Charts Grid Row 1: Sales Trend Area Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass dark:glass-dark border border-slate-200/50 dark:border-slate-800/50 rounded-3xl p-6 shadow-sm space-y-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-sans font-bold text-slate-800 dark:text-white text-base">
                {t('dashboard.salesTrend')}
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                {t('dashboard.historicalPerf')}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono bg-slate-100 dark:bg-slate-900/50 px-3 py-1.5 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />{' '}
                {t('dashboard.revenue')}
              </span>
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />{' '}
                {t('dashboard.profit')}
              </span>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={salesTrendData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                  strokeOpacity={0.2}
                />
                <XAxis
                  dataKey="label"
                  stroke="#64748b"
                  fontSize={10}
                  fontStyle="italic"
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} dx={-10} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    backdropFilter: 'blur(8px)',
                    borderRadius: '16px',
                    color: '#fff',
                    fontSize: '11px',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                  labelStyle={{
                    fontWeight: 'bold',
                    color: '#10b981',
                    fontStyle: 'italic',
                    marginBottom: '4px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                  activeDot={{
                    r: 6,
                    strokeWidth: 0,
                    fill: '#10b981',
                    style: { filter: 'drop-shadow(0px 0px 4px rgba(16,185,129,0.8))' },
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorProfit)"
                  activeDot={{
                    r: 6,
                    strokeWidth: 0,
                    fill: '#3b82f6',
                    style: { filter: 'drop-shadow(0px 0px 4px rgba(59,130,246,0.8))' },
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Charts Grid Row 2: Secondary breakdowns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart A: Top Selling Products (Bar Chart) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="glass dark:glass-dark border border-slate-200/50 dark:border-slate-800/50 rounded-3xl p-6 shadow-sm space-y-5 lg:col-span-2"
          >
            <div>
              <h3 className="font-sans font-bold text-slate-800 dark:text-white text-base">
                {t('dashboard.bestSellers')}
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                {t('dashboard.topMenu')}
              </p>
            </div>
            <div className="h-64 w-full">
              {topProductsData.length === 0 ? (
                <div className="h-full flex items-center justify-center font-mono text-xs text-slate-400 bg-slate-50/50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  {t('dashboard.noSales')}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topProductsData}
                    layout="vertical"
                    margin={{ top: 5, right: 10, left: 15, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="#e2e8f0"
                      strokeOpacity={0.2}
                    />
                    <XAxis
                      type="number"
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      orientation={i18n.language === 'ar' ? 'right' : 'left'}
                      stroke="#64748b"
                      fontSize={10}
                      width={100}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        backdropFilter: 'blur(8px)',
                        borderRadius: '16px',
                        color: '#fff',
                        fontSize: '11px',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    />
                    <Bar dataKey="quantity" fill="#10b981" radius={[0, 12, 12, 0]} barSize={24}>
                      {topProductsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </motion.div>

          {/* Chart B: Payment Methods & Category shares */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="glass dark:glass-dark border border-slate-200/50 dark:border-slate-800/50 rounded-3xl p-6 shadow-sm space-y-5 flex flex-col"
          >
            <div>
              <h3 className="font-sans font-bold text-slate-800 dark:text-white text-base">
                {t('dashboard.salesByCategory')}
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                {t('dashboard.revenueShare')}
              </p>
            </div>
            <div className="flex-1 min-h-[180px] w-full relative flex items-center justify-center">
              {categoryShareData.length === 0 ? (
                <div className="font-mono text-xs text-slate-400 bg-slate-50/50 dark:bg-slate-900/50 w-full h-full rounded-2xl flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-800">
                  {t('dashboard.noCategoryStats')}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryShareData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                    >
                      {categoryShareData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) =>
                        `${settings.currency}${parseFloat(value as string).toFixed(2)}`
                      }
                      contentStyle={{
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        backdropFilter: 'blur(8px)',
                        borderRadius: '16px',
                        color: '#fff',
                        fontSize: '11px',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            {/* Custom Legend */}
            <div className="grid grid-cols-2 gap-3 text-[10px] font-semibold text-slate-600 dark:text-slate-300 font-mono mt-auto bg-slate-50/50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-200/50 dark:border-slate-700/50">
              {categoryShareData.map((item, idx) => (
                <div key={idx} className="flex items-center space-x-2 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate opacity-80">{item.name}:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {settings.currency}
                    {item.value.toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Payment Type KPI block */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="glass dark:glass-dark border border-slate-200/50 dark:border-slate-800/50 rounded-3xl p-6 shadow-sm space-y-5"
        >
          <div>
            <h3 className="font-sans font-bold text-slate-800 dark:text-white text-base">
              {t('dashboard.paymentMethods')}
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">
              {t('dashboard.preferredModes')}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {['card', 'cash', 'mobile', 'gift'].map((method) => {
              const data = paymentMethodsData.find((d) => d.name === method.toUpperCase());
              const val = data ? data.value : 0;
              const pct = totalSalesVolume > 0 ? (val / totalSalesVolume) * 100 : 0;

              return (
                <div
                  key={method}
                  className="bg-white/40 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-5 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-linear-to-br from-white/5 to-transparent dark:from-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest font-mono relative z-10">
                    {t(`dashboard.${method}`, { defaultValue: method })}
                  </span>
                  <div className="mt-3 relative z-10">
                    <span className="font-mono font-extrabold text-lg text-slate-800 dark:text-white block">
                      {settings.currency}
                      {val.toFixed(2)}
                    </span>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold mt-1.5 block bg-emerald-500/10 w-max px-2 py-0.5 rounded-md">
                      {pct.toFixed(0)}
                      {t('dashboard.ofSales')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Per-operator sales report */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass dark:glass-dark border border-slate-200/50 dark:border-slate-800/50 rounded-3xl p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-sans font-bold text-slate-800 dark:text-white text-base flex items-center gap-2">
                <Users size={18} className="text-emerald-500" /> {t('dashboard.byOperator')}
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                {t('dashboard.byOperatorSub')}
              </p>
            </div>
          </div>
          {operatorBreakdown.length === 0 ? (
            <div className="font-mono text-xs text-slate-400 bg-slate-50/50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-8 text-center">
              {t('dashboard.noSales')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {operatorBreakdown.map((op, idx) => {
                const max = operatorBreakdown[0].revenue || 1;
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="w-28 truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {op.name}
                    </span>
                    <div className="flex-1 h-6 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden">
                      <div
                        className="h-full bg-linear-to-r from-emerald-500 to-emerald-400 rounded-lg"
                        style={{ width: `${Math.max(4, (op.revenue / max) * 100)}%` }}
                      />
                    </div>
                    <span className="w-16 text-right font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {op.orders} {t('dashboard.ordersShort')}
                    </span>
                    <span className="w-24 text-right font-mono font-bold text-sm text-slate-800 dark:text-slate-100">
                      {settings.currency}
                      {op.revenue.toFixed(2)}
                    </span>
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
