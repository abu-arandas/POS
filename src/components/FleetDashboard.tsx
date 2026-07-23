import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  TrendingUp,
  ShoppingBag,
  Receipt,
  Store as StoreIcon,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../stores/settingsStore';
import { fetchFleetSummary, fetchFleetDaily } from '../lib/fleetClient';
import { FleetStoreRow } from '../lib/fleet';
import { FleetDailyRow, fleetTotals, rankStores, buildDailySeries } from '../lib/fleetReport';

interface FleetDashboardProps {
  orgId: string;
}

type Period = 'today' | '7d' | '30d';

// Start-of-window for a period, using local midnight so buckets line up with the
// operator's day.
function periodSince(period: Period): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === '7d') d.setDate(d.getDate() - 6);
  if (period === '30d') d.setDate(d.getDate() - 29);
  return d;
}

// 'YYYY-MM-DD' → 'M/D' without constructing a Date (avoids UTC-shift on the
// axis labels).
function shortDay(day: string): string {
  const parts = day.split('-');
  return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : day;
}

function TrendTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  currency: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-[#0f172a] border border-white/10 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-[10px] font-mono text-slate-400 mb-1">{label}</p>
      <p className="text-sm font-mono font-bold text-emerald-400">
        {currency}
        {Number(payload[0].value).toFixed(2)}
      </p>
    </div>
  );
}

// Consolidated cross-store reporting (Phase 2). Aggregates the fleet_summary /
// fleet_daily RPCs across every store in the org, with a period selector and a
// per-store drill-in filter. Reuses the recharts language of the single-store
// Dashboard. Read-only; renders an empty state on any backend hiccup.
export default function FleetDashboard({ orgId }: FleetDashboardProps) {
  const { t } = useTranslation();
  const cur = useSettingsStore((s) => s.settings.currency);
  const [period, setPeriod] = useState<Period>('7d');
  const [storeFilter, setStoreFilter] = useState<string>('');
  const [summary, setSummary] = useState<FleetStoreRow[]>([]);
  const [daily, setDaily] = useState<FleetDailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const since = periodSince(period);
    try {
      const [s, d] = await Promise.all([
        fetchFleetSummary(orgId, since),
        fetchFleetDaily(orgId, since),
      ]);
      setSummary(s);
      setDaily(d);
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [orgId, period]);

  // Fetch on mount and whenever the org/period changes. Loading is toggled on
  // by the period buttons (an event handler) rather than synchronously here, so
  // the effect never calls setState in its body.
  useEffect(() => {
    let cancelled = false;
    const since = periodSince(period);
    Promise.all([fetchFleetSummary(orgId, since), fetchFleetDaily(orgId, since)])
      .then(([s, d]) => {
        if (cancelled) return;
        setSummary(s);
        setDaily(d);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setLoadedOnce(true);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, period]);

  // A dropped filter store (period change removed it) falls back to "all".
  const activeFilter = useMemo(
    () => (summary.some((r) => r.storeId === storeFilter) ? storeFilter : ''),
    [summary, storeFilter],
  );

  const scopedRows = useMemo(
    () => (activeFilter ? summary.filter((r) => r.storeId === activeFilter) : summary),
    [summary, activeFilter],
  );
  const totals = useMemo(() => fleetTotals(scopedRows), [scopedRows]);
  const ranked = useMemo(() => rankStores(summary), [summary]);
  const series = useMemo(
    () => buildDailySeries(daily, activeFilter || undefined).map((p) => ({ ...p, label: shortDay(p.day) })),
    [daily, activeFilter],
  );

  const empty = loadedOnce && summary.length === 0;
  const periods: Period[] = ['today', '7d', '30d'];

  return (
    <div id="fleet-dashboard-root" className="flex-1 flex flex-col min-h-0 overflow-hidden p-6">
      {/* Controls */}
      <div className="mb-6 shrink-0 flex flex-wrap items-center justify-between gap-3">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="font-sans font-extrabold tracking-tight text-slate-900 dark:text-white text-lg sm:text-xl flex items-center gap-2">
            <Activity className="text-emerald-500" size={22} /> {t('fleetReport.title')}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">{t('fleetReport.subtitle')}</p>
        </motion.div>
        <div className="flex items-center gap-2">
          {/* Store filter (drill-in) */}
          <select
            value={activeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            aria-label={t('fleetReport.storeFilter')}
            className="bg-[#0f172a] border border-white/5 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500/40"
          >
            <option value="">{t('fleetReport.allStores')}</option>
            {ranked.map((s) => (
              <option key={s.storeId} value={s.storeId}>
                {s.storeName}
              </option>
            ))}
          </select>
          {/* Period selector */}
          <div className="flex bg-[#0f172a] border border-white/5 rounded-xl p-1">
            {periods.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors ${
                  period === p ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t(`fleetReport.period_${p}`)}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            aria-label={t('fleet.refresh')}
            className="flex items-center gap-2 bg-[#0f172a] border border-white/5 hover:border-white/10 disabled:opacity-40 text-slate-300 hover:text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pe-1 pb-6">
        {empty ? (
          <div className="surface rounded-3xl py-20 flex flex-col items-center justify-center text-slate-500 gap-3">
            <StoreIcon size={40} className="opacity-20" />
            <p className="font-mono text-xs">{t('fleet.noStores')}</p>
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiTile
                label={t('fleetReport.totalRevenue')}
                value={`${cur}${totals.revenue.toFixed(2)}`}
                icon={<TrendingUp size={18} className="text-emerald-400" />}
                accent="text-emerald-400"
              />
              <KpiTile
                label={t('fleetReport.orders')}
                value={String(totals.orders)}
                icon={<ShoppingBag size={18} className="text-blue-400" />}
              />
              <KpiTile
                label={t('fleetReport.avgOrder')}
                value={`${cur}${totals.avgOrder.toFixed(2)}`}
                icon={<Receipt size={18} className="text-violet-400" />}
              />
              <KpiTile
                label={t('fleetReport.activeStores')}
                value={`${totals.activeCount} / ${totals.storeCount}`}
                icon={<StoreIcon size={18} className="text-amber-400" />}
              />
            </div>

            {/* Revenue trend */}
            <div className="surface rounded-3xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-sans font-bold text-white text-base flex items-center gap-2">
                  <Activity size={18} className="text-emerald-500" />
                  {t('fleetReport.revenueTrend')}
                </h3>
                {activeFilter && (
                  <span className="badge badge-emerald">
                    {ranked.find((s) => s.storeId === activeFilter)?.storeName}
                  </span>
                )}
              </div>
              {series.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-slate-500 font-mono text-xs">
                  {t('fleetReport.noData')}
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="fleetRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#1e293b" />
                      <XAxis dataKey="label" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                      <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                      <Tooltip content={<TrendTooltip currency={cur} />} />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#10b981"
                        strokeWidth={3}
                        fill="url(#fleetRevenue)"
                        activeDot={{ r: 6, fill: '#10b981', stroke: '#020617', strokeWidth: 3 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Revenue by store (ranked, click to drill in) */}
            <div className="surface rounded-3xl shadow-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="font-sans font-bold text-white text-base">{t('fleetReport.revenueByStore')}</h3>
                <span className="text-[10px] font-mono text-slate-500 uppercase">{t('fleetReport.clickToDrill')}</span>
              </div>
              <ul className="divide-y divide-white/5">
                {ranked.map((s) => {
                  const selected = s.storeId === activeFilter;
                  return (
                    <li key={s.storeId}>
                      <button
                        onClick={() => setStoreFilter(selected ? '' : s.storeId)}
                        className={`w-full text-start px-6 py-4 transition-colors ${
                          selected ? 'bg-emerald-500/10' : 'hover:bg-slate-800/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <span className="text-sm font-bold text-white truncate">{s.storeName}</span>
                          <div className="flex items-center gap-4 shrink-0">
                            <span className="font-mono font-bold text-white text-sm">
                              {cur}
                              {s.revenue.toFixed(2)}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500 w-10 text-end">
                              {(s.share * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                            style={{ width: `${Math.max(s.share * 100, s.revenue > 0 ? 2 : 0)}%` }}
                          />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  icon,
  accent = 'text-white',
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="surface rounded-3xl p-5 shadow-xl">
      <div className="flex justify-between items-start mb-2">
        <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider font-mono">{label}</span>
        {icon}
      </div>
      <p className={`font-mono font-extrabold text-2xl ${accent}`}>{value}</p>
    </div>
  );
}
