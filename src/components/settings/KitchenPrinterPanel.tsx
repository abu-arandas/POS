import type { TFunction } from 'i18next';
import { ChefHat, Monitor, Plus, RefreshCw, Save, Trash2, Usb, Wifi } from 'lucide-react';
import type { Category, KitchenStation, ReceiptLayout } from '../../types';
import type { DetectedPrinter } from '../../lib/printerDiscovery';
import ReceiptSettingsPanel from '../ReceiptSettingsPanel';

export interface KitchenPrinterPanelProps {
  t: TFunction;
  categories: Category[];
  stationForm: KitchenStation[];
  detectedPrinters: DetectedPrinter[];
  scanningNetwork: boolean;
  printersLoading: boolean;
  kitchenLayout: ReceiptLayout;
  onPairSerial(): void | Promise<void>;
  onScanNetwork(): void | Promise<void>;
  onRefreshPrinters(): void | Promise<void>;
  onAddStation(): void;
  onAddStationFromPrinter(name: string, ipAddress?: string): void;
  onUpdateStation(id: string, patch: Partial<KitchenStation>): void;
  onRemoveStation(id: string): void;
  onToggleStationCategory(id: string, categoryId: string): void;
  onSaveStations(): void;
  onKitchenLayoutChange(value: ReceiptLayout): void;
  serialSupported(): boolean;
  networkScanSupported(): boolean;
}

export function KitchenPrinterPanel({
  t,
  categories,
  stationForm,
  detectedPrinters,
  scanningNetwork,
  printersLoading,
  kitchenLayout,
  onPairSerial,
  onScanNetwork,
  onRefreshPrinters,
  onAddStation,
  onAddStationFromPrinter,
  onUpdateStation,
  onRemoveStation,
  onToggleStationCategory,
  onSaveStations,
  onKitchenLayoutChange,
  serialSupported,
  networkScanSupported,
}: KitchenPrinterPanelProps) {
  return (
    <div className="surface rounded-2xl p-6 max-w-3xl mx-auto space-y-8">
      {/* Connected printers */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
            {t('settings.connectedPrinters')}
          </h3>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {serialSupported() && (
              <button
                type="button"
                onClick={onPairSerial}
                className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl flex items-center gap-2 transition-colors"
              >
                <Usb size={14} />
                {t('settings.pairSerial')}
              </button>
            )}
            {networkScanSupported() && (
              <button
                type="button"
                onClick={onScanNetwork}
                disabled={scanningNetwork}
                className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-xl flex items-center gap-2 transition-colors"
              >
                <Wifi size={14} className={scanningNetwork ? 'animate-pulse' : ''} />
                {scanningNetwork ? t('settings.scanningNetwork') : t('settings.scanNetwork')}
              </button>
            )}
            <button
              type="button"
              onClick={onRefreshPrinters}
              disabled={printersLoading}
              className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-xl flex items-center gap-2 transition-colors"
            >
              <RefreshCw size={14} className={printersLoading ? 'animate-spin' : ''} />
              {t('settings.refreshPrinters')}
            </button>
          </div>
        </div>
        {detectedPrinters.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl px-4 py-4 leading-relaxed">
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
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
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
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onAddStationFromPrinter(p.name, p.ipAddress)}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                  >
                    {t('settings.addStation')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Kitchen ticket layout */}
      <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2 mb-1">
          <ChefHat size={16} className="text-emerald-500" />
          {t('receiptCfg.kitchenTitle')}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
          {t('receiptCfg.kitchenHint')}
        </p>
        <ReceiptSettingsPanel
          kind="kitchen"
          layout={kitchenLayout}
          onChange={onKitchenLayoutChange}
        />
      </div>

      {/* Kitchen station routing */}
      <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
            <ChefHat size={16} className="text-emerald-500" />
            {t('settings.kitchenStations')}
          </h3>
          <div className="flex items-center gap-2">
            {networkScanSupported() && (
              <button
                type="button"
                onClick={onScanNetwork}
                disabled={scanningNetwork}
                className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-xl flex items-center gap-2 transition-colors"
              >
                <Wifi size={14} className={scanningNetwork ? 'animate-pulse' : ''} />
                {scanningNetwork ? t('settings.scanningNetwork') : t('settings.scanNetwork')}
              </button>
            )}
            <button
              type="button"
              onClick={onAddStation}
              className="px-3 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl flex items-center gap-2 transition-colors"
            >
              <Plus size={14} />
              {t('settings.addStation')}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
          {t('settings.kitchenStationsHint')}
        </p>

        {/* Discovered network-printer IPs offered as autocomplete on the
                        station IP fields below. */}
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
          <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl px-4 py-4">
            {t('settings.noStations')}
          </p>
        ) : (
          <div className="space-y-4">
            {stationForm.map((station) => (
              <div
                key={station.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/40 p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={station.name}
                    onChange={(e) => onUpdateStation(station.id, { name: e.target.value })}
                    placeholder={t('settings.stationNamePlaceholder')}
                    aria-label={t('settings.stationName')}
                    className="glass-input flex-1 px-4 py-2.5 rounded-xl font-bold"
                  />
                  <input
                    type="text"
                    dir="ltr"
                    list="station-printer-ips"
                    value={station.ipAddress || ''}
                    onChange={(e) => onUpdateStation(station.id, { ipAddress: e.target.value })}
                    placeholder={t('settings.stationPrinterIp')}
                    aria-label={t('settings.stationPrinterIp')}
                    className="glass-input w-40 px-4 py-2.5 rounded-xl font-mono text-sm"
                  />
                  <input
                    type="text"
                    list="station-printer-names"
                    value={station.printerName || ''}
                    onChange={(e) => onUpdateStation(station.id, { printerName: e.target.value })}
                    placeholder={t('settings.stationPrinterName')}
                    aria-label={t('settings.stationPrinterName')}
                    className="glass-input w-40 px-4 py-2.5 rounded-xl text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveStation(station.id)}
                    aria-label={t('settings.removeStation')}
                    className="p-2.5 text-slate-500 dark:text-slate-400 hover:text-rose-500 bg-slate-200 dark:bg-slate-800 hover:bg-rose-500/10 rounded-xl transition-colors shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
                    {t('settings.stationCategories')}
                  </span>
                  {station.categoryIds.length === 0 && (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 mb-2 leading-relaxed">
                      {t('settings.stationCatchAll')}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => {
                      const on = station.categoryIds.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => onToggleStationCategory(station.id, cat.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                            on
                              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
                              : 'bg-slate-200/50 dark:bg-slate-900/50 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
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
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
          >
            <Save size={18} />
            {t('settings.saveStations')}
          </button>
        </div>
      </div>
    </div>
  );
}
