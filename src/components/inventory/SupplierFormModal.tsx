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

/**
 * Dialog for creating a supplier and its contact details.
 */
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
      className="max-w-sm w-full rounded-2xl border border-border bg-card shadow-lg overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-border bg-card flex items-center justify-between">
        <h3
          id="supplier-form-title"
          className="font-semibold text-foreground text-base flex items-center gap-2.5"
        >
          <Truck size={18} className="text-muted-foreground" /> {t('inventory.addSupplier')}
        </h3>
        <button
          onClick={onClose}
          aria-label={t('inventory.cancel')}
          className="size-8 inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
        >
          <X size={16} />
        </button>
      </div>
      <form onSubmit={onSubmit} className="p-6 space-y-4">
        <div>
          <label
            htmlFor="supplier-name"
            className="text-xs font-medium text-muted-foreground block mb-1.5"
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
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground font-medium"
          />
        </div>
        <div>
          <label
            htmlFor="supplier-contact"
            className="text-xs font-medium text-muted-foreground block mb-1.5"
          >
            {t('inventory.supplierContactPerson')}
          </label>
          <input
            id="supplier-contact"
            type="text"
            value={supContact}
            onChange={(e) => onContactChange(e.target.value)}
            placeholder={t('inventory.supplierContact')}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="supplier-phone"
              className="text-xs font-medium text-muted-foreground block mb-1.5"
            >
              {t('inventory.supplierPhone')}
            </label>
            <input
              id="supplier-phone"
              type="tel"
              value={supPhone}
              onChange={(e) => onPhoneChange(e.target.value)}
              placeholder={t('inventory.phoneNumber')}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground"
            />
          </div>
          <div>
            <label
              htmlFor="supplier-email"
              className="text-xs font-medium text-muted-foreground block mb-1.5"
            >
              {t('inventory.supplierEmail')}
            </label>
            <input
              id="supplier-email"
              type="email"
              value={supEmail}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder={t('inventory.emailAddress')}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-border mt-4">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-xs h-9 px-4 rounded-lg"
          >
            {t('inventory.cancel')}
          </button>
          <button
            type="submit"
            className="btn-primary text-xs h-9 px-4 rounded-lg"
          >
            {t('inventory.saveSupplier')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
