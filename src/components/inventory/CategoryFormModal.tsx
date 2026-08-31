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
      className="max-w-sm w-full p-8 space-y-6"
    >
      <div className="flex justify-between items-center">
        <h3
          id="category-form-title"
          className="font-sans font-bold text-slate-900 dark:text-white text-xl flex items-center gap-3"
        >
          <FolderPlus size={24} className="text-emerald-500" /> {t('inventory.addNewCategory')}
        </h3>
        <button
          onClick={onClose}
          aria-label={t('inventory.cancel')}
          className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-xl transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <label
            htmlFor="new-cat-name-input"
            className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2"
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
            className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors font-bold text-lg"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-3">
            {t('inventory.visualThemeColor')}
          </label>
          <div className="grid grid-cols-3 gap-3">
            {categoryColors.map((colorOption) => (
              <button
                key={colorOption.label}
                type="button"
                onClick={() => onColorChange(colorOption.class)}
                className={`py-3 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                  newCatColor === colorOption.class
                    ? 'border-emerald-500 bg-slate-100 dark:bg-slate-800'
                    : 'border-transparent bg-white/80 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className={`w-6 h-6 rounded-full ${colorOption.bg}`}></div>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {colorOption.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-white/5">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-bold transition-colors"
          >
            {t('inventory.cancel')}
          </button>
          <button
            type="submit"
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
          >
            {t('inventory.saveCategory')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
