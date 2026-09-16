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
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3">
        <div className="size-10 rounded-xl bg-secondary/80 border border-border flex items-center justify-center text-foreground shrink-0">
          <TrendingUp size={20} />
        </div>
        <div>
          <h2 className="font-sans font-semibold tracking-tight text-foreground text-xl">
            {t('dashboard.title')}
          </h2>
          <p className="text-muted-foreground text-xs mt-0.5">
            {t('dashboard.subtitle')}
          </p>
        </div>
      </motion.div>

      <div className="flex items-center gap-3">
        <div className="flex bg-secondary p-1 rounded-xl border border-border">
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                range === r.id
                  ? 'bg-card text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
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
          className="btn-secondary text-xs h-9 px-3 rounded-xl flex items-center gap-1.5 disabled:opacity-40"
          title={t('dashboard.exportRange')}
        >
          <Download size={13} />
          <span>CSV</span>
        </button>

        {/* Sync state */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`sync-badge ${cloudLive ? 'sync-online' : 'sync-offline'}`}
        >
          <span className="sync-dot" />
          <span>{cloudLive ? t('dashboard.sync') : t('dashboard.syncOff')}</span>
        </motion.div>
      </div>
    </div>
  );
}

