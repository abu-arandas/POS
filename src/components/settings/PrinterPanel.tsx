import type { Dispatch, SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import { motion } from 'motion/react';
import { Receipt, Save, type LucideIcon } from 'lucide-react';
import type { PrinterConfig, ReceiptLayout } from '../../types';
import ReceiptSettingsPanel from '../ReceiptSettingsPanel';
import type { PrinterDiscovery } from './ConnectedPrinters';
import { ConnectedPrinters, printerRowActionClass } from './ConnectedPrinters';

type Setter<T> = Dispatch<SetStateAction<T>>;

export interface PrinterTypeOption {
  id: PrinterConfig['type'];
  label: string;
  icon: LucideIcon;
}

export interface PrinterPanelProps {
  t: TFunction;
  discovery: PrinterDiscovery;
  printerForm: PrinterConfig;
  onPrinterFormChange: Setter<PrinterConfig>;
  autoScanPrinters: boolean;
  printerTypes: readonly PrinterTypeOption[];
  receiptLayout: ReceiptLayout;
  onUseNetworkPrinter(ip: string): void;
  onUseSystemPrinter(name: string): void;
  onAutoScanPrintersChange(value: boolean): void;
  onSavePrinter(): void;
  onReceiptLayoutChange(value: ReceiptLayout): void;
}

/**
 * Settings' receipt-printer panel: the printers discovery found, how this
 * terminal talks to the one it uses, and what the customer receipt shows.
 */
export function PrinterPanel({
  t,
  discovery,
  printerForm,
  onPrinterFormChange,
  autoScanPrinters,
  printerTypes,
  receiptLayout,
  onUseNetworkPrinter,
  onUseSystemPrinter,
  onAutoScanPrintersChange,
  onSavePrinter,
  onReceiptLayoutChange,
}: PrinterPanelProps) {
  // Also used outside the list: the OS-printer datalist and the auto-scan toggle.
  const { detectedPrinters, networkScanSupported } = discovery;
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-2xs max-w-3xl mx-auto space-y-6">
      <ConnectedPrinters
        t={t}
        discovery={discovery}
        renderRowActions={(p) => (
          <>
            {p.isDefault && (
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border bg-secondary text-foreground border-border">
                {t('settings.printerDefault')}
              </span>
            )}
            {p.kind === 'network' && p.ipAddress && (
              <button
                type="button"
                onClick={() => onUseNetworkPrinter(p.ipAddress!)}
                className={printerRowActionClass}
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
                className={printerRowActionClass}
              >
                {(printerForm.type === 'windows' || printerForm.type === 'system') &&
                printerForm.printerName === p.name
                  ? t('settings.printerInUse')
                  : t('settings.useThisPrinter')}
              </button>
            )}
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          </>
        )}
        footer={
          networkScanSupported() ? (
            <label className="mt-2.5 flex items-center gap-2 text-xs font-medium text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={autoScanPrinters}
                onChange={(e) => onAutoScanPrintersChange(e.target.checked)}
                className="size-3.5 rounded border-border text-foreground focus:ring-foreground accent-foreground"
              />
              {t('settings.autoScanPrinters')}
            </label>
          ) : undefined
        }
      />

      <div className="pt-2 border-t border-border">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono mb-3">
          {t('settings.connectionType')}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
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
                className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${
                  isSelected
                    ? 'border-foreground bg-foreground text-background font-semibold shadow-2xs'
                    : 'border-border bg-secondary/30 hover:bg-secondary/60 text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon size={18} className="mb-1.5" />
                <span className="text-xs">{pt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="set-paper-size"
            className="block text-xs font-medium text-muted-foreground mb-1.5"
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
            className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground focus:outline-none focus:border-foreground/50 transition-colors"
          >
            <option value="58mm">58mm</option>
            <option value="80mm">80mm</option>
          </select>
        </div>

        {printerForm.type === 'network' && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
            <label
              htmlFor="set-ip-address"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
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
              className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground font-mono focus:outline-none focus:border-foreground/50 transition-colors"
            />
          </motion.div>
        )}
        {printerForm.type === 'serial' && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
            <label
              htmlFor="set-baud-rate"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
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
              className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground font-mono focus:outline-none focus:border-foreground/50 transition-colors"
            />
          </motion.div>
        )}
        {(printerForm.type === 'windows' || printerForm.type === 'system') && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
            <label
              htmlFor="set-printer-name"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
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
              className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground focus:outline-none focus:border-foreground/50 transition-colors"
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
        <p className="text-[11px] text-muted-foreground -mt-1 leading-relaxed">
          {printerForm.type === 'windows'
            ? t('settings.printerWindowsHint')
            : t('settings.printerSystemHint')}
        </p>
      )}

      <div className="space-y-2 pt-1">
        <label className="flex items-center gap-3 p-3 bg-secondary/20 border border-border rounded-lg cursor-pointer hover:bg-secondary/30 transition-colors">
          <input
            type="checkbox"
            checked={printerForm.showBarcode}
            onChange={(e) => onPrinterFormChange({ ...printerForm, showBarcode: e.target.checked })}
            className="size-4 rounded border-border text-foreground focus:ring-foreground accent-foreground"
          />
          <span className="text-xs font-medium text-foreground">{t('settings.showBarcode')}</span>
        </label>

        <label className="flex items-center gap-3 p-3 bg-secondary/20 border border-border rounded-lg cursor-pointer hover:bg-secondary/30 transition-colors">
          <input
            type="checkbox"
            checked={printerForm.autoPrintOnCheckout}
            onChange={(e) =>
              onPrinterFormChange({ ...printerForm, autoPrintOnCheckout: e.target.checked })
            }
            className="size-4 rounded border-border text-foreground focus:ring-foreground accent-foreground"
          />
          <span className="text-xs font-medium text-foreground">{t('settings.autoPrint')}</span>
        </label>

        <label className="flex items-center gap-3 p-3 bg-secondary/20 border border-border rounded-lg cursor-pointer hover:bg-secondary/30 transition-colors">
          <input
            type="checkbox"
            checked={Boolean(printerForm.kitchenTicketOnCheckout)}
            onChange={(e) =>
              onPrinterFormChange({
                ...printerForm,
                kitchenTicketOnCheckout: e.target.checked,
              })
            }
            className="size-4 rounded border-border text-foreground focus:ring-foreground accent-foreground"
          />
          <span className="text-xs font-medium text-foreground">
            {t('settings.autoPrintKitchen')}
          </span>
        </label>
      </div>

      <div className="pt-2 flex justify-end">
        <button
          id="save-printer-btn"
          onClick={onSavePrinter}
          className="btn-primary h-9 px-4 text-xs font-medium gap-1.5"
        >
          <Save size={15} />
          {t('settings.savePrinter')}
        </button>
      </div>

      {/* Customer receipt layout */}
      <div className="pt-5 border-t border-border">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono flex items-center gap-1.5 mb-1">
          <Receipt size={14} className="text-muted-foreground" />
          {t('receiptCfg.customerTitle')}
        </h3>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
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
