import type { FormEvent, RefObject } from 'react';
import { ModalShell } from '../shared/ModalShell';
import type { TFunction } from 'i18next';
import { Truck, X } from 'lucide-react';

export interface SupplierFormModalProps {
  t: TFunction;
  modalRef: RefObject<HTMLDivElement | null>;
  supName: string;
  supContact: string;
  supPhone: string;
  supEmail: string;
  onNameChange(value: string): void;
  onContactChange(value: string): void;
  onPhoneChange(value: string): void;
  onEmailChange(value: string): void;
  onClose(): void;
  onSubmit(event: FormEvent): void;
}

export function SupplierFormModal({
  t,
  modalRef,
  supName,
  supContact,
  supPhone,
  supEmail,
  onNameChange,
  onContactChange,
  onPhoneChange,
  onEmailChange,
  onClose,
  onSubmit,
}: SupplierFormModalProps) {
  return (
    <ModalShell
      modalRef={modalRef}
      titleId="supplier-form-title"
      className="max-w-sm w-full overflow-hidden"
    >
      <div className="px-8 py-6 border-b border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/50 flex items-center justify-between">
        <h3
          id="supplier-form-title"
          className="font-bold text-slate-900 dark:text-white text-xl flex items-center gap-3"
        >
          <Truck size={24} className="text-emerald-500" /> {t('inventory.addSupplier')}
        </h3>
        <button
          onClick={onClose}
          aria-label={t('inventory.cancel')}
          className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-xl transition-colors"
        >
          <X size={20} />
        </button>
      </div>
      <form onSubmit={onSubmit} className="p-8 space-y-5">
        <div>
          <label
            htmlFor="supplier-name"
            className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2"
          >
            {t('inventory.supplierCompany')} *
          </label>
          <input
            id="supplier-name"
            type="text"
            required
            value={supName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={t('inventory.supplierName')}
            className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-bold"
          />
        </div>
        <div>
          <label
            htmlFor="supplier-contact"
            className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2"
          >
            {t('inventory.supplierContactPerson')}
          </label>
          <input
            id="supplier-contact"
            type="text"
            value={supContact}
            onChange={(e) => onContactChange(e.target.value)}
            placeholder={t('inventory.supplierContact')}
            className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="supplier-phone"
              className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2"
            >
              {t('inventory.supplierPhone')}
            </label>
            <input
              id="supplier-phone"
              type="tel"
              value={supPhone}
              onChange={(e) => onPhoneChange(e.target.value)}
              placeholder={t('inventory.phoneNumber')}
              className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label
              htmlFor="supplier-email"
              className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2"
            >
              {t('inventory.supplierEmail')}
            </label>
            <input
              id="supplier-email"
              type="email"
              value={supEmail}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder={t('inventory.emailAddress')}
              className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-6 border-t border-slate-200 dark:border-white/5 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-bold transition-colors"
          >
            {t('inventory.cancel')}
          </button>
          <button
            type="submit"
            className="px-6 py-3 font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
          >
            {t('inventory.saveSupplier')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
