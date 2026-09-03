import type { Dispatch, SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import { motion } from 'motion/react';
import { Monitor, Receipt, RefreshCw, Save, Usb, Wifi, type LucideIcon } from 'lucide-react';
import type { PrinterConfig, ReceiptLayout } from '../../types';
import type { DetectedPrinter } from '../../lib/printerDiscovery';
import ReceiptSettingsPanel from '../ReceiptSettingsPanel';

type Setter<T> = Dispatch<SetStateAction<T>>;

export interface PrinterTypeOption {
  id: PrinterConfig['type'];
  label: string;
  icon: LucideIcon;
}

export interface PrinterPanelProps {
  t: TFunction;
  printerForm: PrinterConfig;
  onPrinterFormChange: Setter<PrinterConfig>;
  detectedPrinters: DetectedPrinter[];
  printersLoading: boolean;
  scanningNetwork: boolean;
  autoScanPrinters: boolean;
  printerTypes: readonly PrinterTypeOption[];
  receiptLayout: ReceiptLayout;
  onPairSerial(): void | Promise<void>;
  onScanNetwork(): void | Promise<void>;
  onRefreshPrinters(): void | Promise<void>;
  onUseNetworkPrinter(ip: string): void;
  onUseSystemPrinter(name: string): void;
  onAutoScanPrintersChange(value: boolean): void;
  onSavePrinter(): void;
  onReceiptLayoutChange(value: ReceiptLayout): void;
  serialSupported(): boolean;
  networkScanSupported(): boolean;
}

export function PrinterPanel({
  t,
  printerForm,
  onPrinterFormChange,
  detectedPrinters,
  printersLoading,
  scanningNetwork,
  autoScanPrinters,
  printerTypes,
  receiptLayout,
  onPairSerial,
  onScanNetwork,
  onRefreshPrinters,
  onUseNetworkPrinter,
  onUseSystemPrinter,
  onAutoScanPrintersChange,
  onSavePrinter,
  onReceiptLayoutChange,
  serialSupported,
  networkScanSupported,
}: PrinterPanelProps) {
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
                  {p.isDefault && (
                    <span className="badge badge-emerald">{t('settings.printerDefault')}</span>
                  )}
                  {p.kind === 'network' && p.ipAddress && (
                    <button
                      type="button"
                      onClick={() => onUseNetworkPrinter(p.ipAddress!)}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                    >
                      {printerForm.type === 'network' && printerForm.ipAddress === p.ipAddress
                        ? t('settings.printerInUse')
                        : t('settings.useThisPrinter')}
                    </button>
                  )}
                  {p.kind === 'system' && (
                    <button
                      type="button"
                      onClick={() => onUseSystemPrinter(p.name)}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                    >
                      {(printerForm.type === 'windows' || printerForm.type === 'system') &&
                      printerForm.printerName === p.name
                        ? t('settings.printerInUse')
                        : t('settings.useThisPrinter')}
                    </button>
                  )}
                  <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
                </div>
              </li>
            ))}
          </ul>
        )}
        {networkScanSupported() && (
          <label className="mt-3 flex items-center gap-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScanPrinters}
              onChange={(e) => onAutoScanPrintersChange(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
            />
            {t('settings.autoScanPrinters')}
          </label>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-4">
          {t('settings.connectionType')}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {printerTypes.map((pt) => {
            const Icon = pt.icon;
            const isSelected = printerForm.type === pt.id;
            return (
              <button
                key={pt.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() =>
                  onPrinterFormChange({
                    ...printerForm,
                    type: pt.id as PrinterConfig['type'],
                  })
                }
                className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon size={24} className="mb-2" />
                <span className="text-xs font-bold">{pt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label
            htmlFor="set-paper-size"
            className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
          >
            {t('settings.paperSize')}
          </label>
          <select
            id="set-paper-size"
            value={printerForm.paperSize}
            onChange={(e) =>
              onPrinterFormChange({
                ...printerForm,
                paperSize: e.target.value as PrinterConfig['paperSize'],
              })
            }
            className="glass-input w-full px-4 py-2.5 rounded-xl appearance-none"
          >
            <option value="58mm">58mm</option>
            <option value="80mm">80mm</option>
          </select>
        </div>

        {printerForm.type === 'network' && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <label
              htmlFor="set-ip-address"
              className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
            >
              {t('settings.ipAddress')}
            </label>
            <input
              id="set-ip-address"
              type="text"
              dir="ltr"
              placeholder="192.168.1.50"
              value={printerForm.ipAddress || ''}
              onChange={(e) => onPrinterFormChange({ ...printerForm, ipAddress: e.target.value })}
              className="glass-input w-full px-4 py-2.5 rounded-xl font-mono"
            />
          </motion.div>
        )}
        {printerForm.type === 'serial' && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <label
              htmlFor="set-baud-rate"
              className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
            >
              {t('settings.baudRate')}
            </label>
            <input
              id="set-baud-rate"
              type="number"
              placeholder="9600"
              value={printerForm.baudRate ?? ''}
              onChange={(e) =>
                onPrinterFormChange({
                  ...printerForm,
                  baudRate: e.target.value ? parseInt(e.target.value, 10) : undefined,
                })
              }
              className="glass-input w-full px-4 py-2.5 rounded-xl font-mono"
            />
          </motion.div>
        )}
        {(printerForm.type === 'windows' || printerForm.type === 'system') && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <label
              htmlFor="set-printer-name"
              className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
            >
              {t('settings.printerName')}
            </label>
            <input
              id="set-printer-name"
              type="text"
              list="os-printer-names"
              placeholder={t('settings.printerNamePlaceholder')}
              value={printerForm.printerName || ''}
              onChange={(e) => onPrinterFormChange({ ...printerForm, printerName: e.target.value })}
              className="glass-input w-full px-4 py-2.5 rounded-xl"
            />
            <datalist id="os-printer-names">
              {detectedPrinters
                .filter((p) => p.kind === 'system')
                .map((p) => (
                  <option key={p.name} value={p.name} />
                ))}
            </datalist>
          </motion.div>
        )}
      </div>

      {(printerForm.type === 'windows' || printerForm.type === 'system') && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-2 leading-relaxed">
          {printerForm.type === 'windows'
            ? t('settings.printerWindowsHint')
            : t('settings.printerSystemHint')}
        </p>
      )}

      <div className="space-y-3">
        <label className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800/50 rounded-xl cursor-pointer">
          <input
            type="checkbox"
            checked={printerForm.showBarcode}
            onChange={(e) => onPrinterFormChange({ ...printerForm, showBarcode: e.target.checked })}
            className="w-5 h-5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
          />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {t('settings.showBarcode')}
          </span>
        </label>

        <label className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800/50 rounded-xl cursor-pointer">
          <input
            type="checkbox"
            checked={printerForm.autoPrintOnCheckout}
            onChange={(e) =>
              onPrinterFormChange({ ...printerForm, autoPrintOnCheckout: e.target.checked })
            }
            className="w-5 h-5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
          />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {t('settings.autoPrint')}
          </span>
        </label>

        <label className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800/50 rounded-xl cursor-pointer">
          <input
            type="checkbox"
            checked={!!printerForm.kitchenTicketOnCheckout}
            onChange={(e) =>
              onPrinterFormChange({
                ...printerForm,
                kitchenTicketOnCheckout: e.target.checked,
              })
            }
            className="w-5 h-5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
          />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {t('settings.autoPrintKitchen')}
          </span>
        </label>
      </div>

      <div className="pt-4 flex justify-end">
        <button
          id="save-printer-btn"
          onClick={onSavePrinter}
          className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
        >
          <Save size={18} />
          {t('settings.savePrinter')}
        </button>
      </div>

      {/* Customer receipt layout */}
      <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2 mb-1">
          <Receipt size={16} className="text-emerald-500" />
          {t('receiptCfg.customerTitle')}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
          {t('receiptCfg.customerHint')}
        </p>
        <ReceiptSettingsPanel
          kind="customer"
          layout={receiptLayout}
          onChange={onReceiptLayoutChange}
        />
      </div>
    </div>
  );
}
