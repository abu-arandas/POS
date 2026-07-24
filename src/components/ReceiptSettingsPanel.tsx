import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import { ReceiptLayout, ReceiptToggles, SaleTransaction } from '../types';
import { useSettingsStore } from '../stores/settingsStore';
import {
  DATE_FORMATS,
  TIME_FORMATS,
  RECEIPT_FONTS,
  formatDateTime,
} from '../lib/receiptFormat';
import { receiptPreviewDoc } from '../lib/receiptPrinter';

interface ReceiptSettingsPanelProps {
  kind: 'customer' | 'kitchen';
  layout: ReceiptLayout;
  onChange: (layout: ReceiptLayout) => void;
}

// A representative sale so the live preview shows every block that a toggle can
// turn on/off (multi-qty line, discount, cash change, loyalty points, member).
const SAMPLE_TX: SaleTransaction = {
  id: 'INV-1452',
  date: new Date().toISOString(),
  items: [
    { productId: 'p1', productName: 'Cappuccino', price: 4.5, cost: 1, quantity: 2, total: 9.0 },
    { productId: 'p2', productName: 'Croissant', price: 3.0, cost: 0.8, quantity: 1, total: 3.0 },
  ],
  subtotal: 12.0,
  discount: 1.0,
  discountType: 'fixed',
  discountValue: 1,
  tax: 1.1,
  total: 12.1,
  paymentMethod: 'cash',
  cashPaid: 15,
  cashChange: 2.9,
  customerId: 'c1',
  customerName: 'Sara A.',
  operatorName: 'Cashier 1',
  pointsEarned: 12,
  status: 'completed',
};

// Which toggles are worth surfacing for each receipt kind. The kitchen ticket
// deliberately omits money/branding fields.
const TOGGLE_KEYS: Record<'customer' | 'kitchen', (keyof ReceiptToggles)[]> = {
  customer: [
    'logo',
    'storeName',
    'branchName',
    'address',
    'phone',
    'taxNumber',
    'date',
    'time',
    'receiptNumber',
    'operator',
    'customer',
    'priceColumn',
    'itemUnitPrice',
    'totals',
    'paymentDetails',
    'changeDue',
    'loyalty',
    'barcode',
  ],
  kitchen: ['storeName', 'receiptNumber', 'date', 'time', 'operator', 'customer'],
};

export default function ReceiptSettingsPanel({ kind, layout, onChange }: ReceiptSettingsPanelProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const printerConfig = useSettingsStore((s) => s.printerConfig);

  const now = useMemo(() => new Date(), []);
  const previewDoc = useMemo(
    () => receiptPreviewDoc(SAMPLE_TX, settings, printerConfig, layout, kind),
    [settings, printerConfig, layout, kind],
  );

  const setField = <K extends keyof ReceiptLayout>(key: K, value: ReceiptLayout[K]) =>
    onChange({ ...layout, [key]: value });
  const setToggle = (key: keyof ReceiptToggles, value: boolean) =>
    onChange({ ...layout, show: { ...layout.show, [key]: value } });

  const previewWidth = printerConfig.paperSize === '58mm' ? 240 : 322;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
      {/* Controls */}
      <div className="space-y-5">
        {/* Header / footer */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Labeled label={t('receiptCfg.header')}>
            <input
              value={layout.header}
              onChange={(e) => setField('header', e.target.value)}
              placeholder={kind === 'kitchen' ? 'KITCHEN' : 'Welcome'}
              className={INPUT}
            />
          </Labeled>
          <Labeled label={t('receiptCfg.footer')}>
            <input
              value={layout.footer}
              onChange={(e) => setField('footer', e.target.value)}
              placeholder="Thank you!"
              className={INPUT}
            />
          </Labeled>
        </div>

        {/* Typography */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Labeled label={t('receiptCfg.font')}>
            <select
              value={layout.fontFamily}
              onChange={(e) => setField('fontFamily', e.target.value)}
              className={INPUT}
            >
              {RECEIPT_FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label={t('receiptCfg.fontSize')}>
            <input
              type="number"
              min={8}
              max={40}
              value={layout.fontSizePx}
              onChange={(e) => setField('fontSizePx', Math.max(8, Math.min(40, Number(e.target.value) || 12)))}
              className={INPUT}
            />
          </Labeled>
          <Labeled label={`${t('receiptCfg.dateFormat')} · ${formatDateTime(now, layout.dateFormat)}`}>
            <select
              value={layout.dateFormat}
              onChange={(e) => setField('dateFormat', e.target.value)}
              className={INPUT}
            >
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label={`${t('receiptCfg.timeFormat')} · ${formatDateTime(now, layout.timeFormat)}`}>
            <select
              value={layout.timeFormat}
              onChange={(e) => setField('timeFormat', e.target.value)}
              className={INPUT}
            >
              {TIME_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Labeled>
        </div>

        {/* Field toggles */}
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2">
            {t('receiptCfg.fields')}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
            {TOGGLE_KEYS[kind].map((key) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!layout.show[key]}
                  onChange={(e) => setToggle(key, e.target.checked)}
                  className="accent-emerald-500 w-4 h-4 shrink-0"
                />
                <span className="text-xs text-slate-300 truncate">{t(`receiptCfg.tg_${key}`)}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="lg:sticky lg:top-0 self-start">
        <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
          <Eye size={12} /> {t('receiptCfg.preview')}
        </p>
        <div className="rounded-2xl overflow-x-auto border border-white/10 bg-white shadow-xl">
          <iframe
            title={t('receiptCfg.preview')}
            srcDoc={previewDoc}
            style={{ width: previewWidth }}
            className="h-[380px] bg-white block"
            sandbox=""
          />
        </div>
      </div>
    </div>
  );
}

const INPUT =
  'w-full bg-[#0f172a] border border-white/10 focus:border-emerald-500/40 text-slate-200 text-sm px-3 py-2 rounded-lg focus:outline-none placeholder:text-slate-600';

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
