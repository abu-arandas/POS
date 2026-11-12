import type { TFunction } from 'i18next';
import { ChefHat, Plus, Save, Trash2 } from 'lucide-react';
import type { Category, KitchenStation, ReceiptLayout } from '../../types';
import ReceiptSettingsPanel from '../ReceiptSettingsPanel';
import type { PrinterDiscovery } from './ConnectedPrinters';
import { ConnectedPrinters, ScanNetworkButton, printerRowActionClass } from './ConnectedPrinters';

export interface KitchenPrinterPanelProps {
  t: TFunction;
  discovery: PrinterDiscovery;
  categories: Category[];
  stationForm: KitchenStation[];
  kitchenLayout: ReceiptLayout;
  onAddStation(): void;
  onAddStationFromPrinter(name: string, ipAddress?: string): void;
  onUpdateStation(id: string, patch: Partial<KitchenStation>): void;
  onRemoveStation(id: string): void;
  onToggleStationCategory(id: string, categoryId: string): void;
  onSaveStations(): void;
  onKitchenLayoutChange(value: ReceiptLayout): void;
}

/**
 * Settings' kitchen-printer panel: the printers discovery found, the ticket
 * layout, and the station routing that decides which items print where.
 */
export function KitchenPrinterPanel({
  t,
  discovery,
  categories,
  stationForm,
  kitchenLayout,
  onAddStation,
  onAddStationFromPrinter,
  onUpdateStation,
  onRemoveStation,
  onToggleStationCategory,
  onSaveStations,
  onKitchenLayoutChange,
}: KitchenPrinterPanelProps) {
  // Also used outside the list: the station IP/name datalists, and the scan
  // button above the station rows that fills them.
  const { detectedPrinters, scanningNetwork, onScanNetwork, networkScanSupported } = discovery;
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-2xs max-w-3xl mx-auto space-y-6">
      <ConnectedPrinters
        t={t}
        discovery={discovery}
        renderRowActions={(p) => (
          <button
            type="button"
            onClick={() => onAddStationFromPrinter(p.name, p.ipAddress)}
            className={printerRowActionClass}
          >
            {t('settings.addStation')}
          </button>
        )}
      />

      {/* Kitchen ticket layout */}
      <div className="pt-5 border-t border-border">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono flex items-center gap-1.5 mb-1">
          <ChefHat size={14} className="text-muted-foreground" />
          {t('receiptCfg.kitchenTitle')}
        </h3>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          {t('receiptCfg.kitchenHint')}
        </p>
        <ReceiptSettingsPanel
          kind="kitchen"
          layout={kitchenLayout}
          onChange={onKitchenLayoutChange}
        />
      </div>

      {/* Kitchen station routing */}
      <div className="pt-5 border-t border-border">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono flex items-center gap-1.5">
            <ChefHat size={14} className="text-muted-foreground" />
            {t('settings.kitchenStations')}
          </h3>
          <div className="flex items-center gap-1.5">
            {networkScanSupported() && (
              <ScanNetworkButton
                t={t}
                scanningNetwork={scanningNetwork}
                onScanNetwork={onScanNetwork}
              />
            )}
            <button
              type="button"
              onClick={onAddStation}
              className="btn-secondary h-8 px-2.5 text-xs gap-1.5"
            >
              <Plus size={13} />
              {t('settings.addStation')}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          {t('settings.kitchenStationsHint')}
        </p>

        <datalist id="station-printer-ips">
          {detectedPrinters
            .filter((p) => p.kind === 'network' && p.ipAddress)
            .map((p) => (
              <option key={p.id} value={p.ipAddress!}>
                {p.name}
              </option>
            ))}
        </datalist>

        <datalist id="station-printer-names">
          {detectedPrinters
            .filter((p) => p.kind === 'system')
            .map((p) => (
              <option key={p.id} value={p.name} />
            ))}
        </datalist>
        {stationForm.length === 0 ? (
          <p className="text-xs text-muted-foreground bg-secondary/20 border border-dashed border-border rounded-lg p-3">
            {t('settings.noStations')}
          </p>
        ) : (
          <div className="space-y-3">
            {stationForm.map((station) => (
              <div
                key={station.id}
                className="rounded-xl border border-border bg-secondary/15 p-3.5 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={station.name}
                    onChange={(e) => onUpdateStation(station.id, { name: e.target.value })}
                    placeholder={t('settings.stationNamePlaceholder')}
                    aria-label={t('settings.stationName')}
                    className="flex-1 bg-secondary/40 border border-border rounded-lg px-3 py-1.5 text-xs sm:text-sm text-foreground font-semibold focus:outline-none focus:border-foreground/50 transition-colors"
                  />
                  <input
                    type="text"
                    dir="ltr"
                    list="station-printer-ips"
                    value={station.ipAddress || ''}
                    onChange={(e) => onUpdateStation(station.id, { ipAddress: e.target.value })}
                    placeholder={t('settings.stationPrinterIp')}
                    aria-label={t('settings.stationPrinterIp')}
                    className="w-36 bg-secondary/40 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:border-foreground/50 transition-colors"
                  />
                  <input
                    type="text"
                    list="station-printer-names"
                    value={station.printerName || ''}
                    onChange={(e) => onUpdateStation(station.id, { printerName: e.target.value })}
                    placeholder={t('settings.stationPrinterName')}
                    aria-label={t('settings.stationPrinterName')}
                    className="w-36 bg-secondary/40 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-foreground/50 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveStation(station.id)}
                    aria-label={t('settings.removeStation')}
                    className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-2">
                    {t('settings.stationCategories')}
                  </span>
                  {station.categoryIds.length === 0 && (
                    <p className="text-[11px] text-muted-foreground bg-secondary/30 border border-border rounded-md px-2.5 py-1.5 mb-2 leading-relaxed font-mono">
                      {t('settings.stationCatchAll')}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((cat) => {
                      const on = station.categoryIds.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => onToggleStationCategory(station.id, cat.id)}
                          className={`px-2.5 py-1 rounded-md text-xs transition-colors border ${
                            on
                              ? 'bg-foreground text-background border-foreground font-semibold'
                              : 'bg-secondary/40 border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                          }`}
                        >
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-4 flex justify-end">
          <button
            type="button"
            onClick={onSaveStations}
            className="btn-primary h-9 px-4 text-xs font-medium gap-1.5"
          >
            <Save size={15} />
            {t('settings.saveStations')}
          </button>
        </div>
      </div>
    </div>
  );
}
