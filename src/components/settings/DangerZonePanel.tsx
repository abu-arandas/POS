import type { TFunction } from 'i18next';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';

export interface DangerZonePanelProps {
  t: TFunction;
  onDeleteAllTransactions(): void | Promise<void>;
  onResetDefaults(): void | Promise<void>;
}

export function DangerZonePanel({
  t,
  onDeleteAllTransactions,
  onResetDefaults,
}: DangerZonePanelProps) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="rounded-2xl border-2 border-rose-500/30 bg-rose-50/50 dark:bg-rose-500/5 p-6 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-6 opacity-10">
          <AlertTriangle size={120} />
        </div>
        <div className="relative z-10 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-rose-700 dark:text-rose-400 flex items-center gap-2 mb-2">
              <AlertTriangle size={20} />
              {t('settings.dangerZone', 'Danger Zone')}
            </h3>
            <p className="text-sm text-rose-600/80 dark:text-rose-400/80 font-medium">
              {t('settings.dangerWarning', 'Be careful! These actions cannot be undone.')}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-white/60 dark:bg-slate-900/60 rounded-xl border border-rose-100 dark:border-rose-900/30">
              <div>
                <h4 className="font-bold text-slate-800 dark:text-slate-200">
                  {t('settings.deleteAllTransactions', 'Delete All Transactions')}
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  {t('settings.deleteAllTransactionsHint')}
                </p>
              </div>
              <button
                onClick={onDeleteAllTransactions}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-xl flex items-center gap-2 transition-colors shrink-0"
              >
                <Trash2 size={16} />
                {t('settings.deleteNow', 'Delete')}
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-white/60 dark:bg-slate-900/60 rounded-xl border border-rose-100 dark:border-rose-900/30">
              <div>
                <h4 className="font-bold text-slate-800 dark:text-slate-200">
                  {t('settings.resetToDefaults', 'Reset to Defaults')}
                </h4>
                <p className="text-xs text-slate-500 mt-1">{t('settings.resetToDefaultsHint')}</p>
              </div>
              <button
                onClick={onResetDefaults}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-xl flex items-center gap-2 transition-colors shrink-0"
              >
                <RotateCcw size={16} />
                {t('settings.resetNow')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
