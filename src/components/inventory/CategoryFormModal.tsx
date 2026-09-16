import type { FormEvent, RefObject } from 'react';
import { ModalShell } from '../shared/ModalShell';
import type { TFunction } from 'i18next';
import { FolderPlus, X } from 'lucide-react';

export interface CategoryColorOption {
  class: string;
  bg: string;
  label: string;
}
export interface CategoryFormModalProps {
  t: TFunction;
  modalRef: RefObject<HTMLDivElement | null>;
  categoryColors: readonly CategoryColorOption[];
  newCatName: string;
  newCatColor: string;
  onNameChange(value: string): void;
  onColorChange(value: string): void;
  onClose(): void;
  onSubmit(event: FormEvent): void;
}

/**
 * Dialog for naming a new category and picking its colour.
 */
export function CategoryFormModal({
  t,
  modalRef,
  categoryColors,
  newCatName,
  newCatColor,
  onNameChange,
  onColorChange,
  onClose,
  onSubmit,
}: CategoryFormModalProps) {
  return (
    <ModalShell
      id="category-form-modal"
      modalRef={modalRef}
      titleId="category-form-title"
      className="max-w-sm w-full p-6 space-y-5 rounded-2xl border border-border bg-card shadow-lg"
    >
      <div className="flex justify-between items-center">
        <h3
          id="category-form-title"
          className="font-sans font-semibold text-foreground text-base flex items-center gap-2.5"
        >
          <FolderPlus size={18} className="text-muted-foreground" /> {t('inventory.addNewCategory')}
        </h3>
        <button
          onClick={onClose}
          aria-label={t('inventory.cancel')}
          className="size-8 inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="new-cat-name-input"
            className="text-xs font-medium text-muted-foreground block mb-1.5"
          >
            {t('inventory.categoryName')} *
          </label>
          <input
            id="new-cat-name-input"
            type="text"
            required
            placeholder="e.g. Beverages"
            value={newCatName}
            onChange={(e) => onNameChange(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground transition-colors font-medium"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-2">
            {t('inventory.visualThemeColor')}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {categoryColors.map((colorOption) => (
              <button
                key={colorOption.label}
                type="button"
                onClick={() => onColorChange(colorOption.class)}
                className={`py-2 rounded-lg border flex flex-col items-center gap-1.5 transition-all text-xs font-medium ${
                  newCatColor === colorOption.class
                    ? 'border-foreground bg-secondary text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-secondary/50'
                }`}
              >
                <div className={`size-4 rounded-full ${colorOption.bg}`}></div>
                <span>{colorOption.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-xs h-9 px-4 rounded-lg"
          >
            {t('inventory.cancel')}
          </button>
          <button type="submit" className="btn-primary text-xs h-9 px-4 rounded-lg">
            {t('inventory.saveCategory')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
