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
      className="absolute inset-y-6 inset-e-6 w-96 bg-card border border-border rounded-2xl shadow-xl flex flex-col overflow-hidden z-30"
    >
      <div className="p-4 flex items-center justify-between border-b border-border bg-card">
        <div className="flex items-center space-x-2">
          <Check
            size={16}
            className={
              isRefunded ? 'text-destructive' : isPartial ? 'text-amber-500' : 'text-emerald-500'
            }
          />
          <span className="font-sans font-semibold text-sm text-foreground">
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
          className="size-8 inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 p-5 overflow-y-auto bg-muted/20 flex flex-col justify-between scrollbar-none relative">
        <div
          id="audit-receipt-mockup"
          className="bg-card text-foreground border border-border rounded-xl p-5 shadow-2xs font-mono text-[11px] relative z-10"
        >
          <div className="text-center border-b border-dashed border-border pb-4 mb-4">
            <div className="flex justify-center mb-2">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-8 w-auto object-contain" />
              ) : (
                <ShoppingBag size={24} className="text-muted-foreground" />
              )}
            </div>
            <h4 className="font-bold text-foreground text-xs uppercase tracking-wider">
              {settings.storeName}
            </h4>
            <p className="text-[10px] text-muted-foreground mt-0.5">{settings.storeAddress}</p>
            <p className="text-[10px] text-muted-foreground">{settings.storePhone}</p>
          </div>

          <div className="space-y-1.5 border-b border-dashed border-border pb-4 mb-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('history.date')}</span>
              <span>{new Date(transaction.date).toLocaleString()}</span>
            </div>
            {isRefunded && transaction.refundDate && (
              <div className="flex justify-between text-destructive font-semibold">
                <span>{t('history.refunded').toUpperCase()}:</span>
                <span>{new Date(transaction.refundDate).toLocaleDateString()}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('history.receipt')}</span>
              <span className="font-semibold">{transaction.id.substring(0, 8)}...</span>
            </div>
            {transaction.operatorName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('history.operator')}</span>
                <span>{transaction.operatorName}</span>
              </div>
            )}
            {transaction.customerName && (
              <div className="flex justify-between font-semibold bg-secondary px-2 py-0.5 rounded">
                <span>{t('history.member')}</span>
                <span>{transaction.customerName}</span>
              </div>
            )}
          </div>

          <div className="space-y-2 border-b border-dashed border-border pb-4 mb-4">
            <div className="grid grid-cols-12 text-muted-foreground font-semibold mb-1 text-[10px]">
              <span className="col-span-8">ITEM</span>
              <span className="col-span-2 text-center">QTY</span>
              <span className="col-span-2 text-end">TOT</span>
            </div>
            {transaction.items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12">
                <span className="col-span-8 truncate pe-2">
                  {item.variantName
                    ? `${item.productName} — ${item.variantName}`
                    : item.productName}
                </span>
                <span className="col-span-2 text-center">{item.quantity}</span>
                <span className="col-span-2 text-end">
                  {settings.currency}
                  {item.total.toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 border-b border-dashed border-border pb-4 mb-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('history.subtotal')}</span>
              <span>
                {settings.currency}
                {transaction.subtotal.toFixed(2)}
              </span>
            </div>
            {transaction.discount > 0 && (
              <div className="flex justify-between text-destructive">
                <span>{t('history.discount')}</span>
                <span>
                  -{settings.currency}
                  {transaction.discount.toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>{t('history.tax')}</span>
              <span>
                {settings.currency}
                {transaction.tax.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-foreground font-semibold pt-2 border-t border-border text-xs mt-1">
              <span>{t('history.totalPaid')}</span>
              <span>
                {settings.currency}
                {transaction.total.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="space-y-1 text-center text-[10px] text-muted-foreground">
            <p>PAID VIA {transaction.paymentMethod.toUpperCase()}</p>
            <p className="mt-1 font-semibold uppercase">{receiptLayout.footer}</p>
          </div>
        </div>
      </div>

      <div className="p-4 bg-card border-t border-border flex gap-2">
        <button
          onClick={() => onPrint(transaction)}
          className="btn-secondary flex-1 text-xs h-9 px-3 rounded-lg flex items-center justify-center gap-1.5"
        >
          <Printer size={14} /> {t('history.print')}
        </button>
        {!isRefunded && (
          <button
            onClick={() => onRefund(transaction)}
            className="btn-destructive flex-1 text-xs h-9 px-3 rounded-lg flex items-center justify-center gap-1.5"
          >
            <RotateCcw size={14} /> {t('history.refund')}
          </button>
        )}
      </div>
    </motion.div>
  );
}
