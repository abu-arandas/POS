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
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 50, scale: 0.95 }}
      className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-card border border-border p-2 px-3.5 rounded-xl flex items-center gap-4 shadow-xl z-40 text-foreground"
    >
      <div className="flex items-center gap-2.5 px-1">
        <div className="size-6 rounded-full bg-foreground text-background flex items-center justify-center font-mono font-semibold text-xs">
          {count}
        </div>
        <span className="text-foreground font-medium text-xs">{t('history.selected')}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onPrint}
          className="btn-secondary text-xs h-8 px-3 rounded-lg flex items-center gap-1.5"
        >
          <Printer size={13} /> {t('history.print')}
        </button>
        {canDelete && (
          <button
            onClick={onDelete}
            className="btn-destructive text-xs h-8 px-3 rounded-lg flex items-center gap-1.5"
          >
            <Trash2 size={13} /> {t('history.delete')}
          </button>
        )}
        <button
          onClick={onClear}
          aria-label={t('history.clearSelection')}
          className="size-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </motion.div>
  );
}
