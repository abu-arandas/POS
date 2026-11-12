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
  'h-8 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary border border-border disabled:opacity-40 rounded-lg flex items-center gap-1.5 transition-colors';

/** Shared styling for the per-row action buttons on the right of each entry. */
export const printerRowActionClass =
  'text-[11px] font-medium px-2.5 py-1 rounded-md bg-secondary text-foreground hover:bg-foreground hover:text-background border border-border transition-colors';

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
      <Wifi size={13} className={scanningNetwork ? 'animate-pulse' : ''} />
      {scanningNetwork ? t('settings.scanningNetwork') : t('settings.scanNetwork')}
    </button>
  );
}

/**
 * What discovery found and the controls that drive it. Bundled into one object
 * because it travels as a unit from usePrinterDiscovery through whichever panel
 * is open down to this list — as nine loose props it was the same forwarding
 * block written out in both panels.
 */
export interface PrinterDiscovery {
  detectedPrinters: DetectedPrinter[];
  printersLoading: boolean;
  scanningNetwork: boolean;
  onPairSerial(): void | Promise<void>;
  onScanNetwork(): void | Promise<void>;
  onRefreshPrinters(): void | Promise<void>;
  serialSupported(): boolean;
  networkScanSupported(): boolean;
}

export interface ConnectedPrintersProps {
  t: TFunction;
  discovery: PrinterDiscovery;
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
  discovery,
  renderRowActions,
  footer,
}: ConnectedPrintersProps) {
  const {
    detectedPrinters,
    printersLoading,
    scanningNetwork,
    onPairSerial,
    onScanNetwork,
    onRefreshPrinters,
    serialSupported,
    networkScanSupported,
  } = discovery;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono">
          {t('settings.connectedPrinters')}
        </h3>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {serialSupported() && (
            <button type="button" onClick={onPairSerial} className={printerToolbarButtonClass}>
              <Usb size={13} />
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
            <RefreshCw size={13} className={printersLoading ? 'animate-spin' : ''} />
            {t('settings.refreshPrinters')}
          </button>
        </div>
      </div>
      {detectedPrinters.length === 0 ? (
        <p className="text-xs text-muted-foreground bg-secondary/20 border border-dashed border-border rounded-lg p-3 leading-relaxed">
          {printersLoading ? '…' : t('settings.noPrintersFound')}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {detectedPrinters.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-secondary/30 border border-border"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="size-7 rounded bg-secondary border border-border text-muted-foreground flex items-center justify-center shrink-0">
                  {p.kind === 'system' ? (
                    <Monitor size={14} />
                  ) : p.kind === 'network' ? (
                    <Wifi size={14} />
                  ) : (
                    <Usb size={14} />
                  )}
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-medium text-foreground block truncate">
                    {p.name}
                  </span>
                  {p.detail && (
                    <span className="text-[11px] text-muted-foreground block truncate font-mono">
                      {p.detail}
                    </span>
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
