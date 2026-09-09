import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

export interface ModalFooterProps {
  /** Label on the dismiss button. */
  cancelLabel: string;
  /** Label on the confirm button. */
  confirmLabel: ReactNode;
  onCancel(): void;
  onConfirm(): void;
  /** Greys out and blocks the confirm button while the form is incomplete. */
  confirmDisabled?: boolean;
}

/**
 * The cancel/confirm bar pinned to the bottom of a form dialog. Extracted so
 * the two inventory modals cannot drift apart on button order, spacing, or the
 * disabled treatment, which are the things an operator notices first.
 */
export function ModalFooter({
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  confirmDisabled = false,
}: ModalFooterProps) {
  return (
    <div className="px-8 py-5 border-t border-slate-200 dark:border-white/10 bg-white/90 dark:bg-slate-900/80 flex justify-end gap-3">
      <button
        onClick={onCancel}
        className="px-6 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-bold transition-colors"
      >
        {cancelLabel}
      </button>
      <button
        onClick={onConfirm}
        disabled={confirmDisabled}
        className="px-6 py-3 font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
      >
        <Check size={20} /> {confirmLabel}
      </button>
    </div>
  );
}
