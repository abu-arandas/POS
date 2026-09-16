import type { TFunction } from 'i18next';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';

export interface DangerZonePanelProps {
  t: TFunction;
  onDeleteAllTransactions(): void | Promise<void>;
  onResetDefaults(): void | Promise<void>;
}

/**
 * Settings' danger zone: the two irreversible actions — wiping transactions
 * and resetting settings — kept together and away from everything else.
 */
export function DangerZonePanel({
  t,
  onDeleteAllTransactions,
  onResetDefaults,
}: DangerZonePanelProps) {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 relative overflow-hidden">
        <div className="relative z-10 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-destructive flex items-center gap-2 mb-1">
              <AlertTriangle size={16} />
              {t('settings.dangerZone', 'Danger Zone')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t('settings.dangerWarning', 'Be careful! These actions cannot be undone.')}
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between p-3.5 bg-card border border-border rounded-lg shadow-2xs">
              <div>
                <h4 className="text-xs font-semibold text-foreground">
                  {t('settings.deleteAllTransactions', 'Delete All Transactions')}
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {t('settings.deleteAllTransactionsHint')}
                </p>
              </div>
              <button
                onClick={onDeleteAllTransactions}
                className="btn-destructive h-8 px-3 text-xs font-medium gap-1.5 shrink-0"
              >
                <Trash2 size={13} />
                {t('settings.deleteNow', 'Delete')}
              </button>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-card border border-border rounded-lg shadow-2xs">
              <div>
                <h4 className="text-xs font-semibold text-foreground">
                  {t('settings.resetToDefaults', 'Reset to Defaults')}
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {t('settings.resetToDefaultsHint')}
                </p>
              </div>
              <button
                onClick={onResetDefaults}
                className="btn-destructive h-8 px-3 text-xs font-medium gap-1.5 shrink-0"
              >
                <RotateCcw size={13} />
                {t('settings.resetNow')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
