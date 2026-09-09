import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { Monitor, RefreshCw, Usb, Wifi } from 'lucide-react';
import type { DetectedPrinter } from '../../lib/printing/printerDiscovery';

// The receipt-printer and kitchen-printer panels both list what discovery
// found, and both drive that list with the same pair/scan/refresh controls.
// Only the per-row action differs — "use this printer" against the receipt
// config, "add station" against kitchen routing — so the list lives here and
// each panel supplies its own action.

/** Shared styling for the small toolbar buttons above the printer list. */
export const printerToolbarButtonClass =
  'px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-xl flex items-center gap-2 transition-colors';

/** Shared styling for the per-row action buttons on the right of each entry. */
export const printerRowActionClass =
  'text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition-colors';

export interface ScanNetworkButtonProps {
  t: TFunction;
  scanningNetwork: boolean;
  onScanNetwork(): void | Promise<void>;
}

/**
 * Kicks off a network printer scan. Appears above both printer lists and again
 * above the kitchen station list, where a scan populates the IP autocomplete.
 */
export function ScanNetworkButton({ t, scanningNetwork, onScanNetwork }: ScanNetworkButtonProps) {
  return (
    <button
      type="button"
      onClick={onScanNetwork}
      disabled={scanningNetwork}
      className={printerToolbarButtonClass}
    >
      <Wifi size={14} className={scanningNetwork ? 'animate-pulse' : ''} />
      {scanningNetwork ? t('settings.scanningNetwork') : t('settings.scanNetwork')}
    </button>
  );
}

export interface ConnectedPrintersProps {
  t: TFunction;
  detectedPrinters: DetectedPrinter[];
  printersLoading: boolean;
  scanningNetwork: boolean;
  onPairSerial(): void | Promise<void>;
  onScanNetwork(): void | Promise<void>;
  onRefreshPrinters(): void | Promise<void>;
  serialSupported(): boolean;
  networkScanSupported(): boolean;
  /** Panel-specific action(s) rendered at the right of each printer row. */
  renderRowActions(printer: DetectedPrinter): ReactNode;
  /** Optional control below the list, such as the auto-scan toggle. */
  footer?: ReactNode;
}

/**
 * The "connected printers" section: discovery controls and the list of what
 * they found, with each row's action supplied by the panel using it.
 */
export function ConnectedPrinters({
  t,
  detectedPrinters,
  printersLoading,
  scanningNetwork,
  onPairSerial,
  onScanNetwork,
  onRefreshPrinters,
  serialSupported,
  networkScanSupported,
  renderRowActions,
  footer,
}: ConnectedPrintersProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
          {t('settings.connectedPrinters')}
        </h3>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {serialSupported() && (
            <button type="button" onClick={onPairSerial} className={printerToolbarButtonClass}>
              <Usb size={14} />
              {t('settings.pairSerial')}
            </button>
          )}
          {networkScanSupported() && (
            <ScanNetworkButton
              t={t}
              scanningNetwork={scanningNetwork}
              onScanNetwork={onScanNetwork}
            />
          )}
          <button
            type="button"
            onClick={onRefreshPrinters}
            disabled={printersLoading}
            className={printerToolbarButtonClass}
          >
            <RefreshCw size={14} className={printersLoading ? 'animate-spin' : ''} />
            {t('settings.refreshPrinters')}
          </button>
        </div>
      </div>
      {detectedPrinters.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-4 leading-relaxed">
          {printersLoading ? '…' : t('settings.noPrintersFound')}
        </p>
      ) : (
        <ul className="space-y-2">
          {detectedPrinters.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                  {p.kind === 'system' ? (
                    <Monitor size={16} />
                  ) : p.kind === 'network' ? (
                    <Wifi size={16} />
                  ) : (
                    <Usb size={16} />
                  )}
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block truncate">
                    {p.name}
                  </span>
                  {p.detail && (
                    <span className="text-[11px] text-slate-500 block truncate">{p.detail}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">{renderRowActions(p)}</div>
            </li>
          ))}
        </ul>
      )}
      {footer}
    </div>
  );
}
