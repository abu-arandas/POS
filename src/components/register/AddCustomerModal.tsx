import type { FormEvent, RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { UserPlus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * One field in the add-customer form, so the modal can render its inputs from
 * a list rather than repeating markup per field.
 */
export interface CustomerField {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required: boolean;
}

interface AddCustomerModalProps {
  open: boolean;
  /** Ref for the dialog card, from useModalA11y (focus trap / Escape / restore). */
  dialogRef: RefObject<HTMLDivElement | null>;
  fields: CustomerField[];
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

/**
 * The "new customer" form (name / phone / email → link to the sale). Extracted
 * from Register; the form fields and their state stay owned by Register and are
 * passed in as `fields`, so behavior is unchanged.
 */
export function AddCustomerModal({
  open,
  dialogRef,
  fields,
  onSubmit,
  onClose,
}: AddCustomerModalProps) {
  const { t } = useTranslation();
  return (
    <AnimatePresence>
      {open && (
        <div
          id="add-customer-modal"
          className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4"
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-customer-title"
            tabIndex={-1}
            initial={{ scale: 0.9, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            className="modal-card max-w-sm w-full p-6 space-y-5"
          >
            <div className="modal-divider-bottom flex justify-between items-center pb-4">
              <h3
                id="add-customer-title"
                className="font-sans font-bold text-slate-900 dark:text-white text-base flex items-center gap-2.5"
              >
                <div className="chip-emerald p-1.5 rounded-xl">
                  <UserPlus size={16} />
                </div>
                {t('register.newCustomer')}
              </h3>
              <button
                onClick={onClose}
                aria-label={t('register.close')}
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white/8 rounded-xl transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              {fields.map(({ label, type, value, onChange, placeholder, required }) => (
                <div key={label}>
                  <label
                    htmlFor={`customer-field-${label}`}
                    className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5"
                  >
                    {label}
                  </label>
                  <input
                    id={`customer-field-${label}`}
                    type={type}
                    required={required}
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="input-shell w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-all placeholder:text-slate-600"
                  />
                </div>
              ))}

              <div className="modal-divider-top flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-ghost px-5 py-2.5 text-sm font-bold rounded-xl"
                >
                  {t('register.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn-primary px-6 py-2.5 text-sm font-bold rounded-xl active:scale-95"
                >
                  {t('register.saveLink')}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
