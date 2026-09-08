import { motion } from 'motion/react';
import { Printer, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface BulkActionBarProps {
  count: number;
  /** Delete is a manager/admin action; a cashier gets print and clear only. */
  canDelete: boolean;
  onPrint: () => void;
  onDelete: () => void;
  onClear: () => void;
}

/** Floating bar over the transaction table while rows are checked. */
export function BulkActionBar({
  count,
  canDelete,
  onPrint,
  onDelete,
  onClear,
}: BulkActionBarProps) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 50, scale: 0.9 }}
      className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur-xl border border-slate-200 dark:border-white/10 p-3 rounded-2xl flex items-center gap-6 shadow-2xl z-40"
    >
      <div className="flex items-center gap-3 px-2">
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
          {count}
        </div>
        <span className="text-slate-900 dark:text-white font-bold text-sm">
          {t('history.selected')}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onPrint}
          className="bg-slate-700 hover:bg-slate-600 text-slate-900 dark:text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2 transition-colors"
        >
          <Printer size={16} /> {t('history.print')}
        </button>
        {canDelete && (
          <button
            onClick={onDelete}
            className="bg-rose-500 hover:bg-rose-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2 transition-colors"
          >
            <Trash2 size={16} /> {t('history.delete')}
          </button>
        )}
        <button
          onClick={onClear}
          aria-label={t('history.clearSelection')}
          className="bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-2.5 rounded-xl transition-colors ms-2"
        >
          <X size={16} />
        </button>
      </div>
    </motion.div>
  );
}
