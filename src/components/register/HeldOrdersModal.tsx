import type { RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Clock, X, PauseCircle, Play, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { HeldOrder } from '../../types';

interface HeldOrdersModalProps {
  open: boolean;
  /** Ref for the dialog card, from useModalA11y (focus trap / Escape / restore). */
  dialogRef: RefObject<HTMLDivElement | null>;
  heldOrders: HeldOrder[];
  currency: string;
  onClose: () => void;
  onResume: (order: HeldOrder) => void;
  onRemove: (id: string) => void;
}

/**
 * The "hold order" list: parked carts an operator can resume or discard.
 * Extracted from Register to keep that screen focused; behavior is unchanged.
 */
export function HeldOrdersModal({
  open,
  dialogRef,
  heldOrders,
  currency,
  onClose,
  onResume,
  onRemove,
}: HeldOrdersModalProps) {
  const { t } = useTranslation();
  return (
    <AnimatePresence>
      {open && (
        <div
          id="held-orders-modal"
          className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4"
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="held-orders-title"
            tabIndex={-1}
            initial={{ scale: 0.92, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="modal-card max-w-md w-full overflow-hidden flex flex-col max-h-[80vh]"
          >
            <div className="p-4 flex justify-between items-center border-b border-border">
              <h3
                id="held-orders-title"
                className="font-semibold text-foreground text-sm flex items-center gap-2"
              >
                <div className="p-1.5 bg-muted rounded-lg text-foreground">
                  <Clock size={15} />
                </div>
                {t('register.heldOrders')}
                <span className="bg-muted text-muted-foreground border border-border font-mono px-1.5 py-0.2 rounded-full text-[10px] ms-1">
                  {heldOrders.length}
                </span>
              </h3>
              <button
                onClick={onClose}
                aria-label={t('register.close')}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              >
                <X size={15} />
              </button>
            </div>
            <div className="p-3.5 overflow-y-auto space-y-2">
              {heldOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <PauseCircle size={32} className="opacity-25 mb-2" />
                  <p className="font-mono text-xs">{t('register.noHeldOrders')}</p>
                </div>
              ) : (
                heldOrders.map((order) => {
                  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
                  const orderTotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
                  return (
                    <div
                      key={order.id}
                      className="group flex items-center justify-between gap-3 rounded-xl p-3 transition-colors bg-card border border-border hover:border-foreground/20"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground text-xs truncate">
                          {order.label}
                        </p>
                        <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                          {itemCount} {t('register.itemsLower')}{' '}
                          <span className="mx-1 opacity-40">•</span>
                          {currency}
                          {orderTotal.toFixed(2)}
                          {order.operatorName && (
                            <>
                              <span className="mx-1 opacity-40">•</span>
                              {order.operatorName}
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => onResume(order)}
                          className="btn-primary flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg"
                        >
                          <Play size={11} className="fill-current" /> {t('register.resume')}
                        </button>
                        <button
                          onClick={() => onRemove(order.id)}
                          aria-label={t('register.deleteHeld')}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded-lg transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
