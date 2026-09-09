import { motion } from 'motion/react';
import { Check, X, ShoppingBag, Printer, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SaleTransaction, StoreSettings, ReceiptLayout } from '../../types';
import { safeImageUrl } from '../../lib/imageUrl';

export interface TransactionDetailPanelProps {
  transaction: SaleTransaction;
  settings: StoreSettings;
  receiptLayout: ReceiptLayout;
  onClose: () => void;
  onPrint: (tx: SaleTransaction) => void;
  onRefund: (tx: SaleTransaction) => void;
}

/**
 * Slide-in audit view of one sale: an on-screen mock of the printed receipt,
 * plus reprint and refund. It is a preview, not the print path — what actually
 * reaches a printer is built in lib/printing.
 */
export function TransactionDetailPanel({
  transaction,
  settings,
  receiptLayout,
  onClose,
  onPrint,
  onRefund,
}: TransactionDetailPanelProps) {
  const { t } = useTranslation();
  const isRefunded = transaction.status === 'refunded';
  const isPartial = transaction.status === 'partial';
  const logoUrl = safeImageUrl(settings.storeLogo);

  return (
    <motion.div
      initial={{ opacity: 0, x: '100%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      id="receipt-view-section"
      className="absolute inset-y-6 inset-e-6 w-96 glass dark:glass-dark border border-slate-200 dark:border-white/10 rounded-4xl shadow-2xl flex flex-col overflow-hidden z-30"
    >
      <div
        className={`p-5 flex items-center justify-between border-b border-slate-200 dark:border-white/10 ${
          isRefunded ? 'bg-rose-500/10' : isPartial ? 'bg-amber-500/10' : 'bg-emerald-500/10'
        }`}
      >
        <div className="flex items-center space-x-2">
          <Check
            size={18}
            className={
              isRefunded ? 'text-rose-500' : isPartial ? 'text-amber-500' : 'text-emerald-500'
            }
          />
          <span className="font-sans font-bold text-sm text-slate-900 dark:text-white">
            {isRefunded
              ? t('history.transactionRefunded')
              : isPartial
                ? t('history.transactionPartial')
                : t('history.transactionPaid')}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label={t('history.closeDetails')}
          className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 p-6 overflow-y-auto bg-white dark:bg-slate-950 flex flex-col justify-between scrollbar-none relative">
        <div className="absolute inset-0 mesh-bg-dark opacity-30 pointer-events-none" />

        <div
          id="audit-receipt-mockup"
          className="bg-white text-slate-900 rounded-lg p-5 shadow-sm font-mono text-[11px] relative z-10 receipt-paper"
        >
          <div className="text-center border-b border-dashed border-slate-300 pb-4 mb-4">
            <div className="flex justify-center mb-2">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-8 w-auto object-contain" />
              ) : (
                <ShoppingBag size={28} className="text-slate-800" />
              )}
            </div>
            <h4 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
              {settings.storeName}
            </h4>
            <p className="text-[10px] text-slate-500 mt-1">{settings.storeAddress}</p>
            <p className="text-[10px] text-slate-500">{settings.storePhone}</p>
          </div>

          <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-4 mb-4">
            <div className="flex justify-between">
              <span>{t('history.date')}</span>
              <span>{new Date(transaction.date).toLocaleString()}</span>
            </div>
            {isRefunded && transaction.refundDate && (
              <div className="flex justify-between text-rose-600 font-bold">
                <span>{t('history.refunded').toUpperCase()}:</span>
                <span>{new Date(transaction.refundDate).toLocaleDateString()}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>{t('history.receipt')}</span>
              <span className="font-bold">{transaction.id.substring(0, 8)}...</span>
            </div>
            {transaction.operatorName && (
              <div className="flex justify-between">
                <span>{t('history.operator')}</span>
                <span>{transaction.operatorName}</span>
              </div>
            )}
            {transaction.customerName && (
              <div className="flex justify-between text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                <span>{t('history.member')}</span>
                <span>{transaction.customerName}</span>
              </div>
            )}
          </div>

          <div className="space-y-2 border-b border-dashed border-slate-300 pb-4 mb-4">
            <div className="grid grid-cols-12 text-slate-500 dark:text-slate-400 font-bold mb-1">
              <span className="col-span-8">ITEM</span>
              <span className="col-span-2 text-center">QTY</span>
              <span className="col-span-2 text-end">TOT</span>
            </div>
            {transaction.items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12">
                <span className="col-span-8 truncate pe-2">{item.productName}</span>
                <span className="col-span-2 text-center">{item.quantity}</span>
                <span className="col-span-2 text-end">
                  {settings.currency}
                  {item.total.toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-4 mb-4">
            <div className="flex justify-between">
              <span>{t('history.subtotal')}</span>
              <span>
                {settings.currency}
                {transaction.subtotal.toFixed(2)}
              </span>
            </div>
            {transaction.discount > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>{t('history.discount')}</span>
                <span>
                  -{settings.currency}
                  {transaction.discount.toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-slate-500">
              <span>{t('history.tax')}</span>
              <span>
                {settings.currency}
                {transaction.tax.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-slate-900 font-bold pt-2 border-t border-slate-200 text-sm mt-1">
              <span>{t('history.totalPaid')}</span>
              <span>
                {settings.currency}
                {transaction.total.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="space-y-1 text-center text-[10px] text-slate-500">
            <p>PAID VIA {transaction.paymentMethod.toUpperCase()}</p>
            <p className="mt-2 font-bold uppercase">{receiptLayout.footer}</p>
          </div>
        </div>
      </div>

      <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-white/10 flex gap-2">
        <button
          onClick={() => onPrint(transaction)}
          className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white py-3 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
        >
          <Printer size={16} /> {t('history.print')}
        </button>
        {!isRefunded && (
          <button
            onClick={() => onRefund(transaction)}
            className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-xl text-xs font-bold transition-colors shadow-lg shadow-rose-500/20 flex items-center justify-center gap-2"
          >
            <RotateCcw size={16} /> {t('history.refund')}
          </button>
        )}
      </div>
    </motion.div>
  );
}
