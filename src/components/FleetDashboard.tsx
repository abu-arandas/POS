import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
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
import {
  trendChartGrid,
  trendChartMargin,
  trendTimeAxis,
  trendValueAxis,
} from './dashboard/chartPresets';

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

/**
 * Hover readout for the fleet revenue chart: the day, and what it took.
 */
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
    <div className="bg-card/95 backdrop-blur-md border border-border rounded-xl px-3 py-2 shadow-md">
      <p className="text-[11px] font-mono text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-mono num font-semibold text-foreground">
        {currency}
        {Number(payload[0].value).toFixed(2)}
      </p>
    </div>
  );
}

/**
 * Consolidated cross-store reporting (Phase 2). Aggregates the fleet_summary /
 * fleet_daily RPCs across every store in the org, with a period selector and a
 * per-store drill-in filter. Reuses the recharts language of the single-store
 * Dashboard. Read-only; renders an empty state on any backend hiccup.
 */
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
    void (async () => {
      try {
        const [s, d] = await Promise.all([
          fetchFleetSummary(orgId, since),
          fetchFleetDaily(orgId, since),
        ]);
        if (cancelled) return;
        setSummary(s);
        setDaily(d);
      } catch (err) {
        console.error('Failed to load fleet dashboard:', err);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadedOnce(true);
        }
      }
    })();
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
    () =>
      buildDailySeries(daily, activeFilter || undefined).map((p) => ({
        ...p,
        label: shortDay(p.day),
      })),
    [daily, activeFilter],
  );

  const empty = loadedOnce && summary.length === 0;
  const periods: Period[] = ['today', '7d', '30d'];

  return (
    <div id="fleet-dashboard-root" className="flex-1 flex flex-col min-h-0 overflow-hidden p-6">
      {/* Controls */}
      <div className="mb-5 shrink-0 flex flex-wrap items-center justify-between gap-3">
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="font-semibold tracking-tight text-foreground text-lg sm:text-xl flex items-center gap-2">
            <Activity className="text-foreground" size={20} /> {t('fleetReport.title')}
          </h2>
          <p className="text-muted-foreground text-xs mt-0.5">
            {t('fleetReport.subtitle')}
          </p>
        </motion.div>
        <div className="flex items-center gap-2">
          {/* Store filter (drill-in) */}
          <select
            value={activeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            aria-label={t('fleetReport.storeFilter')}
            className="bg-background border border-input text-foreground text-xs font-medium px-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{t('fleetReport.allStores')}</option>
            {ranked.map((s) => (
              <option key={s.storeId} value={s.storeId}>
                {s.storeName}
              </option>
            ))}
          </select>
          {/* Period selector */}
          <div className="flex bg-muted/60 border border-border rounded-lg p-0.5">
            {periods.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  period === p
                    ? 'bg-card text-foreground shadow-2xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
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
            className="btn-secondary h-8 px-2.5 rounded-lg"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 pe-1 pb-6">
        {empty ? (
          <div className="bg-card border border-border rounded-xl py-20 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <StoreIcon size={36} className="opacity-20" />
            <p className="font-mono text-xs">{t('fleet.noStores')}</p>
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiTile
                label={t('fleetReport.totalRevenue')}
                value={`${cur}${totals.revenue.toFixed(2)}`}
                icon={<TrendingUp size={16} className="text-emerald-500" />}
                accent="text-emerald-600 dark:text-emerald-400"
              />
              <KpiTile
                label={t('fleetReport.orders')}
                value={String(totals.orders)}
                icon={<ShoppingBag size={16} className="text-foreground" />}
              />
              <KpiTile
                label={t('fleetReport.avgOrder')}
                value={`${cur}${totals.avgOrder.toFixed(2)}`}
                icon={<Receipt size={16} className="text-foreground" />}
              />
              <KpiTile
                label={t('fleetReport.activeStores')}
                value={`${totals.activeCount} / ${totals.storeCount}`}
                icon={<StoreIcon size={16} className="text-foreground" />}
              />
            </div>

            {/* Revenue trend */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                  <Activity size={16} className="text-foreground" />
                  {t('fleetReport.revenueTrend')}
                </h3>
                {activeFilter && (
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md border border-border bg-muted text-foreground">
                    {ranked.find((s) => s.storeId === activeFilter)?.storeName}
                  </span>
                )}
              </div>
              {series.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground font-mono text-xs">
                  {t('fleetReport.noData')}
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={trendChartMargin}>
                      <defs>
                        <linearGradient id="fleetRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-foreground, #18181b)" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="var(--color-foreground, #18181b)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...trendChartGrid} strokeDasharray="3 3" opacity={0.3} />
                      <XAxis {...trendTimeAxis} dy={8} />
                      <YAxis {...trendValueAxis} dx={-8} />
                      <Tooltip content={<TrendTooltip currency={cur} />} />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="var(--color-foreground, #18181b)"
                        strokeWidth={2}
                        fill="url(#fleetRevenue)"
                        activeDot={{ r: 4, fill: 'var(--color-foreground, #18181b)', stroke: 'var(--color-background, #ffffff)', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Revenue by store (ranked, click to drill in) */}
            <div className="bg-card border border-border rounded-xl shadow-2xs overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border bg-muted/20 flex items-center justify-between">
                <h3 className="font-semibold text-foreground text-sm">
                  {t('fleetReport.revenueByStore')}
                </h3>
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  {t('fleetReport.clickToDrill')}
                </span>
              </div>
              <ul className="divide-y divide-border/60">
                {ranked.map((s) => {
                  const selected = s.storeId === activeFilter;
                  return (
                    <li key={s.storeId}>
                      <button
                        onClick={() => setStoreFilter(selected ? '' : s.storeId)}
                        className={`w-full text-start px-5 py-3.5 transition-colors ${
                          selected
                            ? 'bg-secondary'
                            : 'hover:bg-secondary/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <span className="text-sm font-semibold text-foreground truncate">
                            {s.storeName}
                          </span>
                          <div className="flex items-center gap-4 shrink-0">
                            <span className="font-mono num font-semibold text-foreground text-sm">
                              {cur}
                              {s.revenue.toFixed(2)}
                            </span>
                            <span className="font-mono num text-[11px] text-muted-foreground w-10 text-end">
                              {(s.share * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="bar-fill h-full rounded-full bg-foreground"
                            style={
                              {
                                '--bar-width': `${Math.max(s.share * 100, s.revenue > 0 ? 2 : 0)}%`,
                              } as CSSProperties
                            }
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

/**
 * One headline figure on the fleet dashboard, with its label and icon.
 */
function KpiTile({
  label,
  value,
  icon,
  accent = 'text-foreground',
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-2xs">
      <div className="flex justify-between items-start mb-2">
        <span className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">
          {label}
        </span>
        {icon}
      </div>
      <p className={`font-mono num font-semibold text-2xl ${accent}`}>{value}</p>
    </div>
  );
}
