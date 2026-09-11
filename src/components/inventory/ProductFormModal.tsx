import type { FormEvent, RefObject } from 'react';
import { ModalShell } from '../shared/ModalShell';
import type { TFunction } from 'i18next';
import { Check, Edit2, Image as ImageIcon, Layers, PackagePlus, Plus, X } from 'lucide-react';
import type { Category, Product, ProductVariant, StoreSettings, VariantType } from '../../types';
import { VariantsEditor } from './VariantsEditor';

export interface ProductFormModalProps {
  t: TFunction;
  modalRef: RefObject<HTMLDivElement | null>;
  editingProduct: Product | null;
  categories: Category[];
  settings: StoreSettings;
  prodName: string;
  prodSku: string;
  prodCategory: string;
  prodPrice: string;
  prodCost: string;
  prodStock: string;
  prodMinStock: string;
  prodImage: string;
  productPreviewUrl: string;
  prodVariantTypes: VariantType[];
  prodVariants: ProductVariant[];
  onNameChange(value: string): void;
  onSkuChange(value: string): void;
  onCategoryChange(value: string): void;
  onPriceChange(value: string): void;
  onCostChange(value: string): void;
  onStockChange(value: string): void;
  onMinStockChange(value: string): void;
  onImageChange(value: string): void;
  onVariantsChange(variantTypes: VariantType[], variants: ProductVariant[]): void;
  onClose(): void;
  onSubmit(event: FormEvent): void;
}

/**
 * Dialog for creating or editing a product: identity, pricing, stock levels,
 * variants and image. Fully controlled — every field's state lives in Inventory.
 */
export function ProductFormModal({
  t,
  modalRef,
  editingProduct,
  categories,
  settings,
  prodName,
  prodSku,
  prodCategory,
  prodPrice,
  prodCost,
  prodStock,
  prodMinStock,
  prodImage,
  productPreviewUrl,
  prodVariantTypes,
  prodVariants,
  onNameChange,
  onSkuChange,
  onCategoryChange,
  onPriceChange,
  onCostChange,
  onStockChange,
  onMinStockChange,
  onImageChange,
  onVariantsChange,
  onClose,
  onSubmit,
}: ProductFormModalProps) {
  // On a varianted product the stock box is the read-only sum of the matrix
  // below it. Leaving it editable would offer the operator a number that the
  // next variant edit silently overwrites.
  const stockIsDerived = prodVariants.length > 0;
  return (
    <ModalShell
      id="product-form-modal"
      modalRef={modalRef}
      titleId="product-form-title"
      className="max-w-3xl w-full flex flex-col max-h-[90vh]"
    >
      <div className="px-8 py-6 border-b border-slate-200 dark:border-white/10 flex justify-between items-center bg-white/80 dark:bg-slate-900/50">
        <h3
          id="product-form-title"
          className="font-sans font-bold text-slate-900 dark:text-white text-xl flex items-center gap-3"
        >
          {editingProduct ? (
            <Edit2 className="text-emerald-500" />
          ) : (
            <Plus className="text-emerald-500" />
          )}
          {editingProduct ? t('inventory.editCatalogProduct') : t('inventory.addNewProduct')}
        </h3>
        <button
          onClick={onClose}
          aria-label={t('inventory.cancel')}
          className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-xl transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col overflow-hidden flex-1">
        <div className="p-8 space-y-8 overflow-y-auto">
          {/* Basic information */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2 border-b border-slate-200 dark:border-white/5 pb-2">
              <Layers size={16} className="text-emerald-500" /> {t('inventory.sectionBasics')}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label
                  htmlFor="form-prod-name"
                  className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2"
                >
                  {t('inventory.productName')} *
                </label>
                <input
                  id="form-prod-name"
                  type="text"
                  required
                  placeholder="e.g. White Mocha Latte"
                  value={prodName}
                  onChange={(e) => onNameChange(e.target.value)}
                  className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="form-prod-sku"
                  className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2"
                >
                  {t('inventory.skuCode')} *
                </label>
                <input
                  id="form-prod-sku"
                  type="text"
                  required
                  placeholder="e.g. BEV-MOC-01"
                  value={prodSku}
                  onChange={(e) => onSkuChange(e.target.value)}
                  className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="form-prod-category"
                  className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2"
                >
                  {t('inventory.category').replace(':', ' *')}
                </label>
                <select
                  id="form-prod-category"
                  value={prodCategory}
                  onChange={(e) => onCategoryChange(e.target.value)}
                  className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white font-semibold focus:outline-none focus:border-emerald-500 transition-colors"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Financials & Stock */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2 border-b border-slate-200 dark:border-white/5 pb-2">
              <PackagePlus size={16} className="text-emerald-500" />{' '}
              {t('inventory.sectionFinancials')}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label
                  htmlFor="form-prod-price"
                  className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2"
                >
                  {t('inventory.sellPrice')} ({settings.currency}) *
                </label>
                <input
                  id="form-prod-price"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0.00"
                  value={prodPrice}
                  onChange={(e) => onPriceChange(e.target.value)}
                  className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white font-mono text-lg focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="form-prod-cost"
                  className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2"
                >
                  {t('inventory.costPrice')} ({settings.currency}) *
                </label>
                <input
                  id="form-prod-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0.00"
                  value={prodCost}
                  onChange={(e) => onCostChange(e.target.value)}
                  className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white font-mono text-lg focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="form-prod-stock"
                  className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2"
                >
                  {t('inventory.inStockCount')} *
                </label>
                <input
                  id="form-prod-stock"
                  type="number"
                  min="0"
                  required
                  placeholder="0"
                  value={prodStock}
                  readOnly={stockIsDerived}
                  aria-describedby={stockIsDerived ? 'form-prod-stock-derived' : undefined}
                  onChange={(e) => onStockChange(e.target.value)}
                  className={`w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors ${
                    stockIsDerived ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                />
                {stockIsDerived && (
                  <p
                    id="form-prod-stock-derived"
                    className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5"
                  >
                    {t('inventory.variantStockHint')}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="form-prod-minstock"
                  className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2"
                >
                  {t('inventory.lowStockAlert')}
                </label>
                <input
                  id="form-prod-minstock"
                  type="number"
                  min="0"
                  placeholder="5"
                  value={prodMinStock}
                  onChange={(e) => onMinStockChange(e.target.value)}
                  className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Variants */}
          <VariantsEditor
            t={t}
            settings={settings}
            baseSku={prodSku}
            variantTypes={prodVariantTypes}
            variants={prodVariants}
            onChange={onVariantsChange}
          />

          {/* Asset settings */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2 border-b border-slate-200 dark:border-white/5 pb-2">
              <ImageIcon size={16} className="text-emerald-500" /> {t('inventory.sectionMedia')}
            </h4>
            <label
              htmlFor="form-prod-image"
              className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2"
            >
              {t('inventory.productImageOptional')}
            </label>
            <div className="flex gap-4">
              <div className="size-20 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                {productPreviewUrl ? (
                  <img src={productPreviewUrl} alt="Preview" className="size-full object-cover" />
                ) : (
                  <ImageIcon className="text-slate-500" size={32} />
                )}
              </div>
              <input
                id="form-prod-image"
                type="url"
                placeholder={t('inventory.imageUrlPlaceholder')}
                value={prodImage}
                onChange={(e) => onImageChange(e.target.value)}
                className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 placeholder:text-slate-600 self-center"
              />
            </div>
          </div>
        </div>

        <div className="px-8 py-5 border-t border-slate-200 dark:border-white/10 bg-white/90 dark:bg-slate-900/80 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-bold transition-colors"
          >
            {t('inventory.cancel')}
          </button>
          <button
            type="submit"
            id="form-submit-prod-btn"
            className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-transform active:scale-95"
          >
            <Check size={20} />
            <span>{t('inventory.saveCatalogItem')}</span>
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
