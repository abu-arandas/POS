import { useMemo, useState, useCallback } from 'react';
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
  Activity
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

interface TooltipEntry {
  color?: string;
  name?: string | number;
  value?: string | number;
}

const CustomTooltip = ({ active, payload, label, currency }: { active?: boolean; payload?: TooltipEntry[]; label?: string; currency: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0f172a]/95 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-xl">
        <p className="text-white font-bold mb-2">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 text-sm font-mono mt-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-400 capitalize">{entry.name}:</span>
            <span className="text-white font-bold">
              {currency}{Number(entry.value).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const transactions = useTransactionStore((s) => s.transactions);
  const products = useProductStore((s) => s.products);
  const categories = useProductStore((s) => s.categories);
  const settings = useSettingsStore((s) => s.settings);
  const supabaseConfig = useSettingsStore((s) => s.supabaseConfig);
  const cloudLive = supabaseConfig.enabled && supabaseConfig.status === 'connected';

  const completedTransactions = useMemo(() => {
    return transactions.filter((t) => t.status === 'completed' || t.status === 'partial');
  }, [transactions]);

  const todayDateString = useMemo(() => new Date().toDateString(), []);

  const todayTransactions = useMemo(() => {
    return completedTransactions.filter(
      (tx) => new Date(tx.date).toDateString() === todayDateString,
    );
  }, [completedTransactions, todayDateString]);

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
    const revenueToday = todayTransactions.reduce(
      (sum, t) => sum + t.total - (t.refundedAmount ?? 0), 0,
    );
    const ordersToday = todayTransactions.length;
    const aovToday = ordersToday > 0 ? revenueToday / ordersToday : 0;

    const profitToday = todayTransactions.reduce((sum, tx) => {
      const refundProportion = tx.total > 0 ? (tx.refundedAmount ?? 0) / tx.total : 0;
      const transactionCost = tx.items.reduce((cSum, item) => cSum + item.cost * item.quantity, 0);
      const transactionRevenue = tx.subtotal - tx.discount;
      return sum + (transactionRevenue - transactionCost) * (1 - refundProportion);
    }, 0);

    const uniqueDays = new Set(completedTransactions.map((tx) => new Date(tx.date).toDateString()));
    const daysCount = Math.max(1, uniqueDays.size);
    const totalHistoricalRevenue = completedTransactions.reduce(
      (sum, t) => sum + t.total - (t.refundedAmount ?? 0), 0,
    );
    const avgDailyRevenue = totalHistoricalRevenue / daysCount;

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
        const netRevenue = tx.total - (tx.refundedAmount ?? 0);
        entry.revenue += netRevenue;

        const refundProportion = tx.total > 0 ? (tx.refundedAmount ?? 0) / tx.total : 0;
        const cost = tx.items.reduce((sum, item) => sum + item.cost * item.quantity, 0);
        entry.profit += (tx.subtotal - tx.discount - cost) * (1 - refundProportion);

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
      const refundedQtys: Record<string, number> = {};
      for (const r of tx.refundedItems ?? []) {
        refundedQtys[r.productId] = (refundedQtys[r.productId] ?? 0) + r.quantity;
      }
      tx.items.forEach((item) => {
        const current = productSalesMap.get(item.productId) || {
          name: item.productName,
          quantity: 0,
          revenue: 0,
        };
        const netQty = item.quantity - (refundedQtys[item.productId] ?? 0);
        current.quantity += netQty;
        current.revenue += item.price * netQty;
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
      const net = tx.total - (tx.refundedAmount ?? 0);
      if (tx.paymentMethod in counts) {
        counts[tx.paymentMethod as keyof typeof counts] += net;
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

  const totalSalesVolume = useMemo(() => {
    return paymentMethodsData.reduce((sum, d) => sum + d.value, 0);
  }, [paymentMethodsData]);

  const operatorBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; orders: number; revenue: number }>();
    rangeTxns.forEach((tx) => {
      const key = tx.operatorId ?? tx.operatorName ?? 'unknown';
      const current = map.get(key) || { name: tx.operatorName ?? '—', orders: 0, revenue: 0 };
      current.orders += 1;
      current.revenue += tx.total - (tx.refundedAmount ?? 0);
      map.set(key, current);
    });
    return Array.from(map.values())
      .map((v) => ({ ...v, revenue: Number(v.revenue.toFixed(2)) }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [rangeTxns]);

  const exportRange = useCallback(() => {
    downloadCsv(
      `sales-${range}-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(transactionsToCsvRows(rangeTxns)),
    );
  }, [rangeTxns, range]);

  const paymentMethodsMap = useMemo(
    () => new Map(paymentMethodsData.map(d => [d.name, d])),
    [paymentMethodsData]
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
          <div className="flex bg-[#0f172a] p-1 rounded-xl border border-white/5 shadow-inner">
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
                    ? 'bg-emerald-500/20 text-emerald-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
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
            className="flex items-center gap-2 bg-[#0f172a] border border-white/5 hover:border-white/10 disabled:opacity-40 text-slate-300 hover:text-white text-xs font-bold uppercase px-4 py-2 rounded-xl shadow-sm transition-colors h-full"
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
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-slate-500/10 border-slate-400/20 text-slate-400'
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
            className="surface rounded-3xl p-6 shadow-xl flex flex-col justify-between relative overflow-hidden group hover:bg-[#1e293b] transition-colors"
          >
            <div className="absolute -inset-e-6 -top-6 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-colors" />
            <div className="flex justify-between items-start mb-4 relative z-10">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider font-mono">
                {t('dashboard.todaysRevenue')}
              </span>
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 shadow-inner">
                <DollarSign size={20} className="stroke-[2.5]" />
              </div>
            </div>
            <div className="relative z-10">
              <h3 className="font-mono font-extrabold text-white text-3xl mb-2">
                {settings.currency}{kpis.revenueToday.toFixed(2)}
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
                  vs {settings.currency}{kpis.avgDailyRevenue.toFixed(0)} avg
                </span>
              </div>
            </div>
          </motion.div>

          {/* Card 2: Profit */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="surface rounded-3xl p-6 shadow-xl flex flex-col justify-between relative overflow-hidden group hover:bg-[#1e293b] transition-colors"
          >
            <div className="absolute -inset-e-6 -top-6 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-colors" />
            <div className="flex justify-between items-start mb-4 relative z-10">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider font-mono">
                {t('dashboard.netProfit')}
              </span>
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 shadow-inner">
                <Percent size={20} className="stroke-[2.5]" />
              </div>
            </div>
            <div className="relative z-10">
              <h3 className="font-mono font-extrabold text-white text-3xl mb-2">
                {settings.currency}{kpis.profitToday.toFixed(2)}
              </h3>
              <div className="flex items-center gap-2 text-xs font-medium">
                <span className="badge badge-blue px-2 py-0.5">
                  Margin {kpis.revenueToday > 0 ? ((kpis.profitToday / kpis.revenueToday) * 100).toFixed(0) : 0}%
                </span>
                <span className="text-slate-500 font-mono">excl. tax</span>
              </div>
            </div>
          </motion.div>

          {/* Card 3: Orders */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="surface rounded-3xl p-6 shadow-xl flex flex-col justify-between relative overflow-hidden group hover:bg-[#1e293b] transition-colors"
          >
            <div className="absolute -inset-e-6 -top-6 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl group-hover:bg-purple-500/20 transition-colors" />
            <div className="flex justify-between items-start mb-4 relative z-10">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider font-mono">
                {t('dashboard.completedSales')}
              </span>
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 shadow-inner">
                <ShoppingBag size={20} className="stroke-[2.5]" />
              </div>
            </div>
            <div className="relative z-10">
              <h3 className="font-mono font-extrabold text-white text-3xl mb-2">
                {kpis.ordersToday}
              </h3>
              <div className="flex items-center gap-2 text-xs font-medium">
                <span className="badge badge-purple px-2 py-0.5 font-mono">
                  {settings.currency}{kpis.aovToday} AOV
                </span>
              </div>
            </div>
          </motion.div>

          {/* Card 4: Low Stock */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="surface rounded-3xl p-6 shadow-xl flex flex-col justify-between relative overflow-hidden group hover:bg-[#1e293b] transition-colors"
          >
            <div className={`absolute -inset-e-6 -top-6 w-32 h-32 rounded-full blur-3xl transition-colors ${kpis.lowStockItems > 0 ? 'bg-amber-500/10 group-hover:bg-amber-500/20' : 'bg-slate-500/10'}`} />
            <div className="flex justify-between items-start mb-4 relative z-10">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider font-mono">
                {t('dashboard.stockWarnings')}
              </span>
              <div className={`p-2.5 rounded-xl shadow-inner ${kpis.lowStockItems > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-800 text-slate-400'}`}>
                <Package size={20} className="stroke-[2.5]" />
              </div>
            </div>
            <div className="relative z-10">
              <h3 className="font-mono font-extrabold text-white text-3xl mb-2">
                {kpis.lowStockItems}
              </h3>
              <div className="flex items-center gap-2 text-xs font-medium">
                {kpis.lowStockItems > 0 ? (
                  <span className="badge badge-amber flex items-center gap-1.5 px-2 py-0.5">
                    <AlertTriangle size={12} /> Action Needed
                  </span>
                ) : (
                  <span className="badge badge-slate flex items-center gap-1.5 px-2 py-0.5">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" /> All Good
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
              <h3 className="font-sans font-bold text-white text-lg flex items-center gap-2">
                <Activity size={20} className="text-emerald-500" />
                {t('dashboard.salesTrend')}
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                {t('dashboard.historicalPerf')}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono bg-[#0f172a] px-4 py-2 rounded-xl border border-white/5">
              <span className="flex items-center gap-2 text-slate-300">
                <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" /> 
                {t('dashboard.revenue')}
              </span>
              <span className="flex items-center gap-2 text-slate-300">
                <span className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" /> 
                {t('dashboard.profit')}
              </span>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
              <h3 className="font-sans font-bold text-white text-lg">
                {t('dashboard.bestSellers')}
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                {t('dashboard.topMenu')}
              </p>
            </div>
            <div className="h-72 w-full">
              {topProductsData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 bg-[#0f172a] rounded-2xl border border-dashed border-white/10">
                  <Package size={32} className="mb-3 opacity-50" />
                  <span>{t('dashboard.noSales')}</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProductsData} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="#1e293b" />
                    <XAxis type="number" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} width={120} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip currency={settings.currency} />} cursor={{ fill: '#1e293b', opacity: 0.4 }} />
                    <Bar dataKey="quantity" radius={[0, 8, 8, 0]} barSize={28}>
                      {topProductsData.map((entry, index) => (
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
              <h3 className="font-sans font-bold text-white text-lg">
                {t('dashboard.salesByCategory')}
              </h3>
            </div>
            <div className="flex-1 min-h-[220px] w-full relative">
              {categoryShareData.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-slate-500 bg-[#0f172a] rounded-2xl border border-dashed border-white/10">
                  {t('dashboard.noCategoryStats')}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryShareData}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={95}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {categoryShareData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip currency={settings.currency} />} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-6">
              {categoryShareData.slice(0, 4).map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 truncate w-20">{item.name}</span>
                    <span className="text-xs font-bold text-white font-mono">
                      {settings.currency}{item.value.toFixed(0)}
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
              <h3 className="font-sans font-bold text-white text-lg">
                {t('dashboard.paymentMethods')}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {['card', 'cash', 'mobile', 'gift'].map((method) => {
                const data = paymentMethodsMap.get(method.toUpperCase());
                const val = data ? data.value : 0;
                const pct = totalSalesVolume > 0 ? (val / totalSalesVolume) * 100 : 0;

                return (
                  <div key={method} className="bg-[#0f172a] border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-colors">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono block mb-2">
                      {t(`dashboard.${method}`, { defaultValue: method })}
                    </span>
                    <span className="font-mono font-extrabold text-2xl text-white block mb-2">
                      {settings.currency}{val.toFixed(2)}
                    </span>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 mb-2">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-slate-500 font-mono">{pct.toFixed(1)}% of total</span>
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
              <h3 className="font-sans font-bold text-white text-lg flex items-center gap-2">
                <Users size={20} className="text-emerald-500" /> {t('dashboard.byOperator')}
              </h3>
            </div>
            {operatorBreakdown.length === 0 ? (
              <div className="w-full py-12 flex items-center justify-center text-slate-500 bg-[#0f172a] rounded-2xl border border-dashed border-white/10">
                {t('dashboard.noSales')}
              </div>
            ) : (
              <div className="space-y-4">
                {operatorBreakdown.map((op, idx) => {
                  const max = operatorBreakdown[0].revenue || 1;
                  return (
                    <div key={idx} className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-bold text-xs shrink-0">
                        {op.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-end mb-1.5">
                          <span className="text-sm font-semibold text-slate-200 truncate">{op.name}</span>
                          <span className="font-mono font-bold text-sm text-white">
                            {settings.currency}{op.revenue.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${Math.max(2, (op.revenue / max) * 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                            {op.orders} orders
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
    </div>
  );
}
