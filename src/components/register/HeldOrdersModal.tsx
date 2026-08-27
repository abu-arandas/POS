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

// The "hold order" list: parked carts an operator can resume or discard.
// Extracted from Register to keep that screen focused; behavior is unchanged.
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
            <div className="p-5 flex justify-between items-center border-b border-slate-800/60">
              <h3
                id="held-orders-title"
                className="font-sans font-bold text-slate-900 dark:text-white text-base flex items-center gap-2.5"
              >
                <div className="p-1.5 bg-amber-500/15 rounded-xl text-amber-400">
                  <Clock size={16} />
                </div>
                {t('register.heldOrders')}
                <span className="badge badge-amber ms-1">{heldOrders.length}</span>
              </h3>
              <button
                onClick={onClose}
                aria-label={t('register.close')}
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white/8 rounded-xl transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2.5">
              {heldOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <PauseCircle size={36} className="opacity-20 mb-3" />
                  <p className="font-mono text-xs">{t('register.noHeldOrders')}</p>
                </div>
              ) : (
                heldOrders.map((order) => {
                  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
                  const orderTotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
                  return (
                    <div
                      key={order.id}
                      className="group flex items-center justify-between gap-3 rounded-2xl p-3.5 transition-all bg-slate-800/40 border border-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-800/70"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-sans font-bold text-slate-800 dark:text-slate-100 text-sm truncate">
                          {order.label}
                        </p>
                        <p className="text-[10px] font-mono text-slate-500 mt-1">
                          {itemCount} {t('register.itemsLower')}{' '}
                          <span className="mx-1.5 opacity-40">•</span>
                          {currency}
                          {orderTotal.toFixed(2)}
                          {order.operatorName && (
                            <>
                              <span className="mx-1.5 opacity-40">•</span>
                              {order.operatorName}
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => onResume(order)}
                          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-colors bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25"
                        >
                          <Play size={12} className="fill-current" /> {t('register.resume')}
                        </button>
                        <button
                          onClick={() => onRemove(order.id)}
                          aria-label={t('register.deleteHeld')}
                          className="p-1.5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                        >
                          <Trash2 size={14} />
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
