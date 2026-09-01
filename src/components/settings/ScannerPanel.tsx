import type { Dispatch, SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import { Save, ScanLine } from 'lucide-react';
import type { ScannerConfig } from '../../types';

type Setter<T> = Dispatch<SetStateAction<T>>;

export interface ScannerPanelProps {
  t: TFunction;
  scannerForm: ScannerConfig;
  onScannerFormChange: Setter<ScannerConfig>;
  lastTestScan: { code: string; at: string } | null;
  onSaveScanner(): void;
}

export function ScannerPanel({
  t,
  scannerForm,
  onScannerFormChange,
  lastTestScan,
  onSaveScanner,
}: ScannerPanelProps) {
  return (
    <div className="surface rounded-2xl p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-2 flex items-center gap-2">
          <ScanLine size={16} className="text-emerald-500" />
          {t('settings.scannerTitle')}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          {t('settings.scannerHint')}
        </p>
      </div>

      <label className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800/50 rounded-xl cursor-pointer">
        <input
          type="checkbox"
          checked={scannerForm.enabled}
          onChange={(e) => onScannerFormChange({ ...scannerForm, enabled: e.target.checked })}
          className="w-5 h-5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
        />
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {t('settings.scannerEnabled')}
        </span>
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label
            htmlFor="set-scanner-min-length"
            className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
          >
            {t('settings.scannerMinLength')}
          </label>
          <input
            id="set-scanner-min-length"
            type="number"
            min="1"
            value={scannerForm.minLength}
            onChange={(e) =>
              onScannerFormChange({
                ...scannerForm,
                minLength: parseInt(e.target.value, 10) || 0,
              })
            }
            className="glass-input w-full px-4 py-2.5 rounded-xl font-mono"
          />
          <p className="text-xs text-slate-500 mt-2">{t('settings.scannerMinLengthHint')}</p>
        </div>
        <div>
          <label
            htmlFor="set-scanner-speed"
            className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
          >
            {t('settings.scannerSpeed')}
          </label>
          <input
            id="set-scanner-speed"
            type="number"
            min="10"
            step="5"
            value={scannerForm.maxInterKeyMs}
            onChange={(e) =>
              onScannerFormChange({
                ...scannerForm,
                maxInterKeyMs: parseInt(e.target.value, 10) || 0,
              })
            }
            className="glass-input w-full px-4 py-2.5 rounded-xl font-mono"
          />
          <p className="text-xs text-slate-500 mt-2">{t('settings.scannerSpeedHint')}</p>
        </div>
      </div>

      {/* Live scan test area */}
      <div className="rounded-2xl border-2 border-dashed border-emerald-500/30 bg-emerald-500/5 p-5">
        <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-2">
          <ScanLine size={14} /> {t('settings.scannerTest')}
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          {t('settings.scannerTestHint')}
        </p>
        <div
          className="rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 px-4 py-3 font-mono text-sm"
          role="status"
          aria-live="polite"
        >
          {lastTestScan ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              {t('settings.scannerLastScan')}: <strong>{lastTestScan.code}</strong>
              <span className="text-slate-500 dark:text-slate-400 ms-2 text-xs">
                {lastTestScan.at}
              </span>
            </span>
          ) : (
            <span className="text-slate-500 dark:text-slate-400">
              {t('settings.scannerNoScan')}
            </span>
          )}
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <button
          id="save-scanner-btn"
          onClick={onSaveScanner}
          className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
        >
          <Save size={18} />
          {t('settings.saveScanner')}
        </button>
      </div>
    </div>
  );
}
