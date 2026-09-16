import { motion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../lib/useModalA11y';

export interface DeleteTransactionsModalProps {
  /** How many sales the confirmation is about. */
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirmation for the irreversible bulk delete of sales. */
export function DeleteTransactionsModal({
  count,
  onCancel,
  onConfirm,
}: DeleteTransactionsModalProps) {
  const { t } = useTranslation();
  // Mounted only while open, so the trap is always armed.
  const cardRef = useModalA11y(true, onCancel);

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
      <motion.div
        ref={cardRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-tx-title"
        tabIndex={-1}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border max-w-sm w-full p-6 text-center rounded-2xl shadow-xl"
      >
        <div className="size-12 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto mb-3">
          <AlertTriangle size={24} />
        </div>
        <h3 id="delete-tx-title" className="text-base font-semibold text-foreground mb-1.5">
          {t('history.deleteTitle')}
        </h3>
        <p className="text-xs text-muted-foreground mb-5">
          {t('history.deleteBody', { count })}
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="btn-secondary flex-1 text-xs h-9 px-3 rounded-lg"
          >
            {t('history.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="btn-destructive flex-1 text-xs h-9 px-3 rounded-lg"
          >
            {t('history.delete')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
