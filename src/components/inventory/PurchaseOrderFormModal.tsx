import type { RefObject } from 'react';
import { ModalShell } from '../shared/ModalShell';
import { ModalFooter } from '../shared/ModalFooter';
import type { TFunction } from 'i18next';
import { ClipboardList, X } from 'lucide-react';
import type { Product, StoreSettings, Supplier } from '../../types';
import { availableStock, variantLabel } from '../../lib/variants';

export interface PurchaseOrderDraftLine {
  productId: string;
  /** Which variant is being ordered; required once the product has any. */
  variantId?: string;
  quantity: string;
  unitCost: string;
}
export interface PurchaseOrderFormModalProps {
  t: TFunction;
  modalRef: RefObject<HTMLDivElement | null>;
  products: Product[];
  suppliers: Supplier[];
  settings: StoreSettings;
  poSupplierId: string;
  poNote: string;
  poLines: PurchaseOrderDraftLine[];
  onSupplierIdChange(value: string): void;
  onNoteChange(value: string): void;
  onLineChange(index: number, patch: Partial<PurchaseOrderDraftLine>): void;
  onRemoveLine(index: number): void;
  onAddLine(): void;
  onClose(): void;
  onSubmit(): void;
}

/**
 * Dialog for drafting a purchase order: the supplier, the lines being
 * ordered, and the running cost of the order.
 */
export function PurchaseOrderFormModal({
  t,
  modalRef,
  products,
  suppliers,
  settings,
  poSupplierId,
  poNote,
  poLines,
  onSupplierIdChange,
  onNoteChange,
  onLineChange,
  onRemoveLine,
  onAddLine,
  onClose,
  onSubmit,
}: PurchaseOrderFormModalProps) {
  return (
    <ModalShell
      modalRef={modalRef}
      titleId="po-form-title"
      className="max-w-2xl w-full flex flex-col max-h-[90vh] rounded-2xl border border-border bg-card shadow-lg"
    >
      <div className="px-6 py-4 border-b border-border bg-card flex items-center justify-between">
        <h3
          id="po-form-title"
          className="font-semibold text-foreground text-base flex items-center gap-2.5"
        >
          <ClipboardList size={18} className="text-muted-foreground" /> {t('inventory.newPurchaseOrder')}
        </h3>
        <button
          onClick={onClose}
          aria-label={t('inventory.cancel')}
          className="size-8 inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-6 space-y-5 overflow-y-auto flex-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="po-supplier-select"
              className="text-xs font-medium text-muted-foreground block mb-1.5"
            >
              {t('inventory.poSupplier')}
            </label>
            <select
              id="po-supplier-select"
              value={poSupplierId}
              onChange={(e) => onSupplierIdChange(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground"
            >
              <option value="">{t('inventory.poNoSupplier')}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="po-note-input"
              className="text-xs font-medium text-muted-foreground block mb-1.5"
            >
              {t('inventory.poNote')}
            </label>
            <input
              id="po-note-input"
              type="text"
              value={poNote}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder={t('inventory.noteOptional')}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div className="space-y-2.5">
          {poLines.map((lineRow, idx) => {
            const lineProduct = products.find((p) => p.id === lineRow.productId);
            const lineVariants = lineProduct?.variants ?? [];
            return (
              <div key={idx} className="flex items-center gap-2 flex-wrap">
                <select
                  value={lineRow.productId}
                  onChange={(e) =>
                    onLineChange(idx, { productId: e.target.value, variantId: '' })
                  }
                  aria-label={t('inventory.products')}
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground min-w-40"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {lineVariants.length > 0 && lineProduct && (
                  <select
                    value={lineRow.variantId ?? ''}
                    onChange={(e) => onLineChange(idx, { variantId: e.target.value })}
                    aria-label={t('inventory.variant')}
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground min-w-32"
                  >
                    <option value="">{t('inventory.variantRequired')}</option>
                    {lineVariants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variantLabel(lineProduct, variant) || variant.sku} (
                        {t('inventory.currentStockShort', {
                          count: availableStock(lineProduct, variant.id),
                        })}
                        )
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="number"
                  min="1"
                  value={lineRow.quantity}
                  onChange={(e) => onLineChange(idx, { quantity: e.target.value })}
                  aria-label={t('inventory.poQty')}
                  placeholder={t('inventory.poQty')}
                  className="w-20 bg-background border border-border rounded-lg px-2.5 py-2 text-sm text-foreground font-mono text-center focus:outline-none focus:border-foreground"
                />
                <div className="w-28 flex items-center bg-background border border-border rounded-lg overflow-hidden focus-within:border-foreground">
                  <span className="ps-2 text-muted-foreground font-mono text-xs">{settings.currency}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={lineRow.unitCost}
                    onChange={(e) => onLineChange(idx, { unitCost: e.target.value })}
                    aria-label={t('inventory.poUnitCost')}
                    placeholder="0.00"
                    className="w-full bg-transparent px-2 py-2 text-sm text-foreground font-mono focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => onRemoveLine(idx)}
                  disabled={poLines.length <= 1}
                  aria-label={t('inventory.poRemoveLine')}
                  className="size-8 inline-flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg disabled:opacity-20 transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
          <button
            onClick={onAddLine}
            className="btn-secondary text-xs h-8 px-3 rounded-lg inline-flex items-center gap-1.5"
          >
            + {t('inventory.poAddLine')}
          </button>
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-border text-sm">
          <span className="text-muted-foreground font-medium text-xs uppercase tracking-wider">
            {t('inventory.poTotalCost')}
          </span>
          <span className="font-mono font-semibold text-foreground text-base">
            {settings.currency}
            {poLines
              .reduce(
                (sum, l) => sum + (parseInt(l.quantity, 10) || 0) * (parseFloat(l.unitCost) || 0),
                0,
              )
              .toFixed(2)}
          </span>
        </div>
      </div>

      <ModalFooter
        cancelLabel={t('inventory.cancel')}
        confirmLabel={t('inventory.poSaveDraft')}
        onCancel={onClose}
        onConfirm={onSubmit}
      />
    </ModalShell>
  );
}
