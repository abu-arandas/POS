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
        className="modal-card max-w-sm w-full p-6 text-center"
      >
        <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={32} />
        </div>
        <h3 id="delete-tx-title" className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          {t('history.deleteTitle')}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          {t('history.deleteBody', { count })}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-bold transition-colors"
          >
            {t('history.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold transition-colors"
          >
            {t('history.delete')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
