import { TrendingUp, Download } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { DashboardRange } from './useDashboardMetrics';

export interface DashboardHeaderProps {
  range: DashboardRange;
  onRangeChange: (range: DashboardRange) => void;
  /** Export is meaningless with nothing in the range, so it is disabled there. */
  canExport: boolean;
  onExport: () => void;
  /** Whether the cloud mirror is enabled AND currently connected. */
  cloudLive: boolean;
}

/** Screen title, the period picker, CSV export and the sync indicator. */
export function DashboardHeader({
  range,
  onRangeChange,
  canExport,
  onExport,
  cloudLive,
}: DashboardHeaderProps) {
  const { t } = useTranslation();

  return (
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
              onClick={() => onRangeChange(r.id)}
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
          onClick={onExport}
          disabled={!canExport}
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
  );
}
