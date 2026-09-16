import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Building2, RefreshCw, Store as StoreIcon, TrendingUp, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../stores/settingsStore';
import { fetchFleetSummary } from '../lib/fleetClient';
import { summarizeFleet, StorePresence } from '../lib/fleet';

interface FleetBoardProps {
  orgId: string;
}

const PRESENCE_DOT: Record<StorePresence, string> = {
  online: 'bg-emerald-500',
  stale: 'bg-amber-500',
  offline: 'bg-muted-foreground/40',
};

const PRESENCE_BADGE: Record<StorePresence, string> = {
  online: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  stale: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
  offline: 'text-muted-foreground bg-secondary/60 border-border',
};

/**
 * Super-admin fleet board: every store in the org with live online/offline
 * state and today's totals. Read-only. Data comes from the fleet_summary RPC;
 * on any backend hiccup it renders an empty state rather than breaking.
 */
export default function FleetBoard({ orgId }: FleetBoardProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchFleetSummary>>>([]);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      setRows(await fetchFleetSummary(orgId, start));
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    void (async () => {
      try {
        const r = await fetchFleetSummary(orgId, start);
        if (!cancelled) setRows(r);
      } catch (err) {
        console.error('Failed to load fleet summary:', err);
      } finally {
        if (!cancelled) setLoadedOnce(true);
      }
    })();
    // Re-derive presence on a timer so a store going quiet flips to offline
    // without a manual refresh.
    const tick = setInterval(() => setRows((r) => [...r]), 30_000);
    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, [orgId]);

  const summary = useMemo(() => summarizeFleet(rows), [rows]);
  const cur = settings.currency;

  return (
    <div id="fleet-root" className="flex-1 flex flex-col min-h-0 overflow-hidden p-6">
      <div className="mb-5 shrink-0 flex items-center justify-between">
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="font-semibold tracking-tight text-foreground text-lg sm:text-xl flex items-center gap-2">
            <Building2 className="text-foreground" size={20} /> {t('fleet.title')}
          </h2>
          <p className="text-muted-foreground text-xs mt-0.5">{t('fleet.subtitle')}</p>
        </motion.div>
        <button
          onClick={load}
          disabled={loading}
          className="btn-secondary h-8 px-3 text-xs flex items-center gap-1.5"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          {t('fleet.refresh')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 pe-1 pb-6">
        {/* Fleet KPI row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-5 shadow-2xs">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">
                {t('fleet.storesOnline')}
              </span>
              <Radio size={16} className="text-emerald-500" />
            </div>
            <p className="font-mono num font-semibold text-foreground text-2xl">
              {summary.onlineCount}
              <span className="text-muted-foreground text-base font-normal">
                {' '}
                / {summary.storeCount}
              </span>
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-5 shadow-2xs">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">
                {t('fleet.revenueToday')}
              </span>
              <TrendingUp size={16} className="text-emerald-500" />
            </div>
            <p className="font-mono num font-semibold text-emerald-600 dark:text-emerald-400 text-2xl">
              {cur}
              {summary.totalRevenue.toFixed(2)}
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-5 shadow-2xs">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">
                {t('fleet.ordersToday')}
              </span>
              <StoreIcon size={16} className="text-foreground" />
            </div>
            <p className="font-mono num font-semibold text-foreground text-2xl">
              {summary.totalOrders}
            </p>
          </div>
        </div>

        {/* Store list */}
        <div className="bg-card border border-border rounded-xl shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-muted/20">
            <h3 className="font-semibold text-foreground text-sm">{t('fleet.stores')}</h3>
          </div>
          {summary.stores.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <Building2 size={36} className="opacity-20" />
              <p className="font-mono text-xs max-w-sm text-center px-6">
                {loadedOnce ? t('fleet.noStores') : t('fleet.loading')}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {summary.stores.map((s) => (
                <li
                  key={s.storeId}
                  className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-secondary/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`size-2 rounded-full shrink-0 ${PRESENCE_DOT[s.presence]}`} />
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-foreground block truncate">
                        {s.storeName}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {s.lastSeenAt
                          ? `${t('fleet.lastSeen')} ${new Date(s.lastSeenAt).toLocaleString()}`
                          : t('fleet.neverSeen')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-5 shrink-0">
                    <div className="text-end hidden sm:block">
                      <span className="font-mono num font-semibold text-foreground text-sm block">
                        {cur}
                        {s.revenue.toFixed(2)}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {s.orders} {t('fleet.ordersLabel')}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-md border ${PRESENCE_BADGE[s.presence]}`}
                    >
                      {t(`fleet.presence_${s.presence}`)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
