import type { FormEvent, RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { UserPlus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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

// The "new customer" form (name / phone / email → link to the sale). Extracted
// from Register; the form fields and their state stay owned by Register and are
// passed in as `fields`, so behavior is unchanged.
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
            <div
              className="flex justify-between items-center pb-4"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
            >
              <h3
                id="add-customer-title"
                className="font-sans font-bold text-slate-900 dark:text-white text-base flex items-center gap-2.5"
              >
                <div
                  className="p-1.5 rounded-xl"
                  style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399' }}
                >
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
                    className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-slate-900 dark:text-white focus:outline-none transition-all placeholder:text-slate-600"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.09)',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#10b981';
                      e.target.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.12)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(255,255,255,0.09)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              ))}

              <div
                className="flex justify-end gap-2.5 pt-3"
                style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 text-sm font-bold rounded-xl transition-colors"
                  style={{
                    color: '#64748b',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {t('register.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 text-sm font-bold text-slate-900 dark:text-white rounded-xl transition-all active:scale-95"
                  style={{
                    background: 'linear-gradient(135deg, #059669, #10b981)',
                    boxShadow: '0 4px 14px rgba(16,185,129,0.3)',
                  }}
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
