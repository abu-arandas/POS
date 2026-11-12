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

/**
 * Settings' scanner panel: the keyboard-wedge timing that separates a
 * scanned barcode from ordinary typing, with a live test field to confirm
 * the thresholds suit the hardware in the shop.
 */
export function ScannerPanel({
  t,
  scannerForm,
  onScannerFormChange,
  lastTestScan,
  onSaveScanner,
}: ScannerPanelProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-2xs max-w-3xl mx-auto space-y-6">
      <div>
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono mb-1.5 flex items-center gap-2">
          <ScanLine size={14} className="text-muted-foreground" />
          {t('settings.scannerTitle')}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{t('settings.scannerHint')}</p>
      </div>

      <label className="flex items-center gap-3 p-3 bg-secondary/20 border border-border rounded-lg cursor-pointer hover:bg-secondary/30 transition-colors">
        <input
          type="checkbox"
          checked={scannerForm.enabled}
          onChange={(e) => onScannerFormChange({ ...scannerForm, enabled: e.target.checked })}
          className="size-4 rounded border-border text-foreground focus:ring-foreground accent-foreground"
        />
        <span className="text-xs font-medium text-foreground">{t('settings.scannerEnabled')}</span>
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="set-scanner-min-length"
            className="block text-xs font-medium text-muted-foreground mb-1.5"
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
            className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground font-mono focus:outline-none focus:border-foreground/50 transition-colors"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            {t('settings.scannerMinLengthHint')}
          </p>
        </div>
        <div>
          <label
            htmlFor="set-scanner-speed"
            className="block text-xs font-medium text-muted-foreground mb-1.5"
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
            className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground font-mono focus:outline-none focus:border-foreground/50 transition-colors"
          />
          <p className="text-[11px] text-muted-foreground mt-1">{t('settings.scannerSpeedHint')}</p>
        </div>
      </div>

      {/* Live scan test area */}
      <div className="rounded-xl border border-dashed border-border bg-secondary/15 p-4">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono mb-1 flex items-center gap-1.5">
          <ScanLine size={13} className="text-muted-foreground" /> {t('settings.scannerTest')}
        </h4>
        <p className="text-[11px] text-muted-foreground mb-3">{t('settings.scannerTestHint')}</p>
        <div
          className="rounded-lg bg-secondary/40 border border-border px-3 py-2.5 font-mono text-xs"
          role="status"
          aria-live="polite"
        >
          {lastTestScan ? (
            <span className="text-foreground font-semibold">
              {t('settings.scannerLastScan')}:{' '}
              <strong className="font-mono">{lastTestScan.code}</strong>
              <span className="text-muted-foreground ms-2 text-[11px] font-normal">
                {lastTestScan.at}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">{t('settings.scannerNoScan')}</span>
          )}
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <button
          id="save-scanner-btn"
          onClick={onSaveScanner}
          className="btn-primary h-9 px-4 text-xs font-medium gap-1.5"
        >
          <Save size={15} />
          {t('settings.saveScanner')}
        </button>
      </div>
    </div>
  );
}
