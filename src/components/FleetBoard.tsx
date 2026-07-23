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
  online: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]',
  stale: 'bg-amber-500',
  offline: 'bg-slate-500',
};

const PRESENCE_BADGE: Record<StorePresence, string> = {
  online: 'badge badge-emerald',
  stale: 'badge badge-amber',
  offline: 'badge badge-slate',
};

// Super-admin fleet board: every store in the org with live online/offline
// state and today's totals. Read-only. Data comes from the fleet_summary RPC;
// on any backend hiccup it renders an empty state rather than breaking.
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
    fetchFleetSummary(orgId, start)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .finally(() => {
        if (!cancelled) setLoadedOnce(true);
      });
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
    <div
      id="fleet-root"
      className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-[#020617] p-6"
    >
      <div className="mb-6 shrink-0 flex items-center justify-between">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="font-sans font-extrabold tracking-tight text-slate-900 dark:text-white text-xl sm:text-2xl flex items-center gap-2">
            <Building2 className="text-emerald-500" /> {t('fleet.title')}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
            {t('fleet.subtitle')}
          </p>
        </motion.div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 bg-[#0f172a] border border-white/5 hover:border-white/10 disabled:opacity-40 text-slate-300 hover:text-white text-xs font-bold uppercase px-4 py-2 rounded-xl shadow-sm transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('fleet.refresh')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pe-1 pb-6">
        {/* Fleet KPI row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="surface rounded-3xl p-6 shadow-xl">
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider font-mono">
                {t('fleet.storesOnline')}
              </span>
              <Radio size={18} className="text-emerald-400" />
            </div>
            <p className="font-mono font-extrabold text-white text-3xl">
              {summary.onlineCount}
              <span className="text-slate-500 text-lg"> / {summary.storeCount}</span>
            </p>
          </div>
          <div className="surface rounded-3xl p-6 shadow-xl">
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider font-mono">
                {t('fleet.revenueToday')}
              </span>
              <TrendingUp size={18} className="text-emerald-400" />
            </div>
            <p className="font-mono font-extrabold text-emerald-400 text-3xl">
              {cur}{summary.totalRevenue.toFixed(2)}
            </p>
          </div>
          <div className="surface rounded-3xl p-6 shadow-xl">
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider font-mono">
                {t('fleet.ordersToday')}
              </span>
              <StoreIcon size={18} className="text-blue-400" />
            </div>
            <p className="font-mono font-extrabold text-white text-3xl">{summary.totalOrders}</p>
          </div>
        </div>

        {/* Store list */}
        <div className="surface rounded-3xl shadow-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5">
            <h3 className="font-sans font-bold text-white text-base">{t('fleet.stores')}</h3>
          </div>
          {summary.stores.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-500 gap-3">
              <Building2 size={40} className="opacity-20" />
              <p className="font-mono text-xs max-w-sm text-center px-6">
                {loadedOnce ? t('fleet.noStores') : t('fleet.loading')}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {summary.stores.map((s) => (
                <li
                  key={s.storeId}
                  className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${PRESENCE_DOT[s.presence]}`} />
                    <div className="min-w-0">
                      <span className="text-sm font-bold text-white block truncate">{s.storeName}</span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {s.lastSeenAt
                          ? `${t('fleet.lastSeen')} ${new Date(s.lastSeenAt).toLocaleString()}`
                          : t('fleet.neverSeen')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 shrink-0">
                    <div className="text-right hidden sm:block">
                      <span className="font-mono font-bold text-white text-sm block">
                        {cur}{s.revenue.toFixed(2)}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {s.orders} {t('fleet.ordersLabel')}
                      </span>
                    </div>
                    <span className={PRESENCE_BADGE[s.presence]}>{t(`fleet.presence_${s.presence}`)}</span>
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
