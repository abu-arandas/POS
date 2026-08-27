import type { ComponentType, RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ShoppingBag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BarcodeSvg } from '../BarcodeSvg';
import type { PrinterConfig, ReceiptLayout, SaleTransaction, StoreSettings } from '../../types';
import { resolveCustomerLayout } from '../../lib/receiptFormat';
import { safeImageUrl } from '../../lib/imageUrl';

export interface ReceiptAction {
  icon: ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
}

interface ReceiptModalProps {
  open: boolean;
  /** Ref for the dialog card, from useModalA11y (focus trap / Escape / restore). */
  dialogRef: RefObject<HTMLDivElement | null>;
  receipt: SaleTransaction | null;
  settings: StoreSettings;
  printerConfig: PrinterConfig;
  receiptLayout: ReceiptLayout;
  showBarcode: boolean;
  actions: ReceiptAction[];
  onClose: () => void;
}

// The post-sale receipt preview: a thermal-style receipt plus the print /
// kitchen / share / email actions. Extracted from Register; it renders the
// passed transaction and settings and invokes the passed actions, so behavior
// is unchanged.
export function ReceiptModal({
  open,
  dialogRef,
  receipt,
  settings,
  printerConfig,
  receiptLayout,
  showBarcode,
  actions,
  onClose,
}: ReceiptModalProps) {
  const { t } = useTranslation();
  const resolvedLayout = resolveCustomerLayout(receiptLayout, printerConfig);
  const show = resolvedLayout.show;
  return (
    <AnimatePresence>
      {open && receipt && (
        <div
          id="receipt-modal"
          className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4"
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="receipt-modal-title"
            tabIndex={-1}
            initial={{ scale: 0.88, opacity: 0, y: 32 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.88, opacity: 0, y: 32 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="receipt-card max-w-sm w-full overflow-hidden flex flex-col rounded-3xl"
          >
            <div className="bg-linear-to-br from-emerald-500 to-emerald-600 text-slate-900 dark:text-white p-8 pb-10 text-center flex flex-col items-center relative overflow-hidden">
              {/* Decorative background circle */}
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
              <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-black opacity-10 rounded-full blur-xl"></div>

              <motion.div
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 12, delay: 0.1 }}
                className="bg-white/20 p-3 rounded-full text-slate-900 dark:text-white shadow-inner mb-4 backdrop-blur-sm z-10"
              >
                <Check size={36} strokeWidth={3} />
              </motion.div>
              <h3
                id="receipt-modal-title"
                className="font-sans font-bold text-slate-900 dark:text-white text-2xl tracking-tight z-10 mb-1.5"
              >
                {t('register.paymentSuccessful')}
              </h3>
              <p className="text-emerald-100 text-[11px] uppercase tracking-wider font-bold bg-black/15 px-3.5 py-1 rounded-full z-10 shadow-sm border border-slate-200 dark:border-white/10">
                {t('register.receipt')} {receipt.id}
              </p>
            </div>

            <div className="px-6 pb-6 pt-0 flex-1 overflow-y-auto max-h-105 relative -mt-4 z-20">
              <div
                id="thermal-receipt"
                className="bg-white dark:bg-slate-950 border-x border-slate-200 dark:border-slate-800 border-y-[6px] border-y-slate-200 dark:border-y-slate-800 border-dashed rounded-xl p-6 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] space-y-4 font-mono text-xs text-slate-700 dark:text-slate-300"
              >
                <div className="text-center border-b border-dashed border-slate-300 dark:border-slate-700 pb-4">
                  {show.logo && (
                    <div className="flex justify-center mb-3">
                      {safeImageUrl(settings.storeLogo) ? (
                        <img
                          src={safeImageUrl(settings.storeLogo)}
                          alt={t('receiptCfg.tg_logo', 'Logo')}
                          className="h-8 w-auto object-contain grayscale opacity-80 dark:invert"
                        />
                      ) : (
                        <ShoppingBag size={28} className="text-slate-800 dark:text-slate-200" />
                      )}
                    </div>
                  )}
                  {show.storeName && (
                    <h4 className="font-bold text-slate-900 dark:text-white text-base uppercase tracking-widest">
                      {settings.storeName}
                    </h4>
                  )}
                  {show.address && settings.storeAddress && (
                    <p className="text-[10px] text-slate-500 mt-2">{settings.storeAddress}</p>
                  )}
                  {show.phone && settings.storePhone && (
                    <p className="text-[10px] text-slate-500">{settings.storePhone}</p>
                  )}
                </div>

                <div className="space-y-1.5 text-[10px] border-b border-dashed border-slate-300 dark:border-slate-700 pb-4">
                  {show.date && (
                    <div className="flex justify-between">
                      <span>{t('history.date', 'DATE:')}</span>
                      <span>{new Date(receipt.date).toLocaleString()}</span>
                    </div>
                  )}
                  {show.receiptNumber && (
                    <div className="flex justify-between">
                      <span>{t('register.receipt').toUpperCase()}:</span>
                      <span>{receipt.id}</span>
                    </div>
                  )}
                  {show.operator && (
                    <div className="flex justify-between">
                      <span>{t('register.operator')}:</span>
                      <span>{receipt.operatorName || '—'}</span>
                    </div>
                  )}
                  {show.customer && receipt.customerName && (
                    <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-bold mt-1">
                      <span>{t('register.member')}:</span>
                      <span>{receipt.customerName}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-b border-dashed border-slate-300 dark:border-slate-700 pb-4">
                  {receipt.items.map((item, idx) => (
                    <div key={idx}>
                      <div className="flex justify-between items-start gap-4">
                        <span className="flex-1 pe-2">
                          <span className="opacity-70 me-1">{item.quantity}x</span>
                          {item.productName}
                        </span>
                        {show.priceColumn && (
                          <span className="shrink-0 font-bold">
                            {settings.currency}
                            {item.total.toFixed(2)}
                          </span>
                        )}
                      </div>
                      {show.itemUnitPrice && item.quantity > 1 && (
                        <div className="text-[10px] opacity-60 ps-4">
                          @ {settings.currency}
                          {item.price.toFixed(2)} {t('register.each', 'ea')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {show.totals && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span>{t('register.subtotal').toUpperCase()}:</span>
                      <span>
                        {settings.currency}
                        {receipt.subtotal.toFixed(2)}
                      </span>
                    </div>
                    {receipt.discount > 0 && (
                      <div className="flex justify-between text-amber-700 dark:text-amber-400">
                        <span>{t('register.discount').toUpperCase()}</span>
                        <span>
                          -{settings.currency}
                          {receipt.discount.toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>
                        {t('register.tax').toUpperCase()}
                        {settings.taxRate > 0 ? ` (${settings.taxRate}%)` : ''}:
                      </span>
                      <span>
                        {settings.currency}
                        {receipt.tax.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-900 dark:text-white font-bold pt-3 border-t border-slate-300 dark:border-slate-700 mt-2 text-sm">
                      <span>{t('register.totalPaid')}:</span>
                      <span>
                        {settings.currency}
                        {receipt.total.toFixed(2)}
                      </span>
                    </div>
                    {receipt.discount > 0 && (
                      <div className="text-center font-bold text-amber-700 dark:text-amber-400 border border-dashed border-amber-400/50 rounded py-1 mt-2">
                        {t('register.youSaved', 'YOU SAVED')} {settings.currency}
                        {receipt.discount.toFixed(2)}
                      </div>
                    )}
                  </div>
                )}

                {show.paymentDetails && (
                  <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-4 space-y-1.5 text-[10px]">
                    <div className="flex justify-between">
                      <span>{t('register.method')}:</span>
                      <span className="uppercase font-bold">{receipt.paymentMethod}</span>
                    </div>
                    {show.changeDue && receipt.paymentMethod === 'cash' && (
                      <>
                        <div className="flex justify-between">
                          <span>{t('register.cashTenderedReceipt')}:</span>
                          <span>
                            {settings.currency}
                            {(receipt.cashPaid || 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-900 dark:text-white font-bold">
                          <span>{t('register.change')}:</span>
                          <span>
                            {settings.currency}
                            {(receipt.cashChange || 0).toFixed(2)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {show.loyalty && receipt.customerName && (receipt.pointsEarned ?? 0) > 0 && (
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-bold">
                    <span>{t('register.pointsEarned', 'POINTS EARNED')}:</span>
                    <span>{receipt.pointsEarned}</span>
                  </div>
                )}

                {resolvedLayout.footer && (
                  <div className="text-center pt-5 border-t border-dashed border-slate-300 dark:border-slate-700 text-[10px] text-slate-500 dark:text-slate-400">
                    <p className="tracking-widest">{resolvedLayout.footer}</p>
                  </div>
                )}

                {show.barcode && showBarcode && (
                  <div className="pt-4 flex flex-col items-center gap-1">
                    <div className="bg-white rounded p-1">
                      <BarcodeSvg data={receipt.id} options={{ height: 40, moduleWidth: 1.4 }} />
                    </div>
                    <span className="font-mono text-[10px] tracking-[0.2em] text-slate-500">
                      {receipt.id}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-divider-top p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                {actions.map(({ icon: Icon, label, onClick }) => (
                  <button
                    key={label}
                    onClick={onClick}
                    className="btn-ghost-emerald flex-1 flex justify-center items-center gap-1.5 py-2.5 rounded-xl text-xs font-bold group"
                  >
                    <Icon size={14} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onClose}
                className="btn-primary w-full py-3.5 rounded-xl text-sm font-bold active:scale-[0.98]"
              >
                {t('register.newSale')}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
