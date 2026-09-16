import type { FormEvent, RefObject } from 'react';
import { ModalShell } from '../shared/ModalShell';
import type { TFunction } from 'i18next';
import { Check, Edit2, Image as ImageIcon, Layers, PackagePlus, Plus, X } from 'lucide-react';
import type { Category, ModifierGroup, Product, ProductVariant, StoreSettings, VariantType } from '../../types';
import { VariantsEditor } from './VariantsEditor';
import { ModifiersEditor } from './ModifiersEditor';

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
  prodModifierGroups: ModifierGroup[];
  onNameChange(value: string): void;
  onSkuChange(value: string): void;
  onCategoryChange(value: string): void;
  onPriceChange(value: string): void;
  onCostChange(value: string): void;
  onStockChange(value: string): void;
  onMinStockChange(value: string): void;
  onImageChange(value: string): void;
  onVariantsChange(variantTypes: VariantType[], variants: ProductVariant[]): void;
  onModifierGroupsChange(groups: ModifierGroup[]): void;
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
  prodModifierGroups,
  onNameChange,
  onSkuChange,
  onCategoryChange,
  onPriceChange,
  onCostChange,
  onStockChange,
  onMinStockChange,
  onImageChange,
  onVariantsChange,
  onModifierGroupsChange,
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
      className="max-w-2xl w-full flex flex-col max-h-[90vh] rounded-2xl border border-border bg-card shadow-lg"
    >
      <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-card">
        <h3
          id="product-form-title"
          className="font-sans font-semibold text-foreground text-base flex items-center gap-2.5"
        >
          {editingProduct ? (
            <Edit2 size={16} className="text-muted-foreground" />
          ) : (
            <Plus size={16} className="text-muted-foreground" />
          )}
          {editingProduct ? t('inventory.editCatalogProduct') : t('inventory.addNewProduct')}
        </h3>
        <button
          onClick={onClose}
          aria-label={t('inventory.cancel')}
          className="size-8 inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col overflow-hidden flex-1">
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Basic information */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2 border-b border-border/60 pb-2">
              <Layers size={14} className="text-muted-foreground" /> {t('inventory.sectionBasics')}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label
                  htmlFor="form-prod-name"
                  className="text-xs font-medium text-muted-foreground block mb-1.5"
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
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="form-prod-sku"
                  className="text-xs font-medium text-muted-foreground block mb-1.5"
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
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="form-prod-category"
                  className="text-xs font-medium text-muted-foreground block mb-1.5"
                >
                  {t('inventory.category').replace(':', ' *')}
                </label>
                <select
                  id="form-prod-category"
                  value={prodCategory}
                  onChange={(e) => onCategoryChange(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground font-medium focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground transition-colors"
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
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2 border-b border-border/60 pb-2">
              <PackagePlus size={14} className="text-muted-foreground" />{' '}
              {t('inventory.sectionFinancials')}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="form-prod-price"
                  className="text-xs font-medium text-muted-foreground block mb-1.5"
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
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="form-prod-cost"
                  className="text-xs font-medium text-muted-foreground block mb-1.5"
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
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="form-prod-stock"
                  className="text-xs font-medium text-muted-foreground block mb-1.5"
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
                  className={`w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground transition-colors ${
                    stockIsDerived ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                />
                {stockIsDerived && (
                  <p
                    id="form-prod-stock-derived"
                    className="text-[11px] text-muted-foreground mt-1"
                  >
                    {t('inventory.variantStockHint')}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="form-prod-minstock"
                  className="text-xs font-medium text-muted-foreground block mb-1.5"
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
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground transition-colors"
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

          {/* Modifiers & Add-ons */}
          <ModifiersEditor
            t={t}
            settings={settings}
            modifierGroups={prodModifierGroups}
            onChange={onModifierGroupsChange}
          />

          {/* Asset settings */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2 border-b border-border/60 pb-2">
              <ImageIcon size={14} className="text-muted-foreground" /> {t('inventory.sectionMedia')}
            </h4>
            <label
              htmlFor="form-prod-image"
              className="text-xs font-medium text-muted-foreground block mb-1.5"
            >
              {t('inventory.productImageOptional')}
            </label>
            <div className="flex items-center gap-3">
              <div className="size-16 rounded-xl bg-secondary border border-border flex items-center justify-center overflow-hidden shrink-0">
                {productPreviewUrl ? (
                  <img src={productPreviewUrl} alt="Preview" className="size-full object-cover" />
                ) : (
                  <ImageIcon className="text-muted-foreground" size={24} />
                )}
              </div>
              <input
                id="form-prod-image"
                type="url"
                placeholder={t('inventory.imageUrlPlaceholder')}
                value={prodImage}
                onChange={(e) => onImageChange(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border bg-card flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-xs h-9 px-4 rounded-lg"
          >
            {t('inventory.cancel')}
          </button>
          <button
            type="submit"
            id="form-submit-prod-btn"
            className="btn-primary text-xs h-9 px-4 rounded-lg flex items-center gap-1.5 active:scale-[0.98]"
          >
            <Check size={14} />
            <span>{t('inventory.saveCatalogItem')}</span>
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
