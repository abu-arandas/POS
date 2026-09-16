import type { RefObject } from 'react';
import { ModalShell } from '../shared/ModalShell';
import { ModalFooter } from '../shared/ModalFooter';
import type { TFunction } from 'i18next';
import { PackagePlus, X } from 'lucide-react';
import type { Product, StockAdjustment, Supplier } from '../../types';
import { availableStock, variantLabel } from '../../lib/variants';

type ReceiveReason = StockAdjustment['reason'];
export interface ReceiveStockModalProps {
  t: TFunction;
  modalRef: RefObject<HTMLDivElement | null>;
  products: Product[];
  suppliers: Supplier[];
  recvProductId: string;
  recvVariantId: string;
  recvQty: string;
  recvSupplierId: string;
  recvNote: string;
  recvReason: ReceiveReason;
  onProductIdChange(value: string): void;
  onVariantIdChange(value: string): void;
  onQuantityChange(value: string): void;
  onSupplierIdChange(value: string): void;
  onNoteChange(value: string): void;
  onReasonChange(value: ReceiveReason): void;
  onClose(): void;
  onSubmit(): void;
}

/**
 * Dialog for taking stock in against a product: how many arrived, from
 * which supplier, and why — the reason is what the stock log records.
 */
export function ReceiveStockModal({
  t,
  modalRef,
  products,
  suppliers,
  recvProductId,
  recvVariantId,
  recvQty,
  recvSupplierId,
  recvNote,
  recvReason,
  onProductIdChange,
  onVariantIdChange,
  onQuantityChange,
  onSupplierIdChange,
  onNoteChange,
  onReasonChange,
  onClose,
  onSubmit,
}: ReceiveStockModalProps) {
  // On a varianted product the movement has to name one variant: `stock` there
  // is the sum of the rows, not a pool anything can be added to.
  const selectedProduct = products.find((p) => p.id === recvProductId);
  const variants = selectedProduct?.variants ?? [];
  return (
    <ModalShell
      modalRef={modalRef}
      titleId="receive-stock-title"
      className="max-w-md w-full rounded-2xl border border-border bg-card shadow-lg overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-border bg-card flex items-center justify-between">
        <h3
          id="receive-stock-title"
          className="font-semibold text-foreground text-base flex items-center gap-2.5"
        >
          <PackagePlus size={18} className="text-muted-foreground" /> {t('inventory.receiveStock')}
        </h3>
        <button
          onClick={onClose}
          aria-label={t('inventory.cancel')}
          className="size-8 inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
        >
          <X size={16} />
        </button>
      </div>
      <div className="p-6 space-y-4">
        <div>
          <label
            htmlFor="receive-product-select"
            className="text-xs font-medium text-muted-foreground block mb-1.5"
          >
            {t('inventory.products')}
          </label>
          <select
            id="receive-product-select"
            value={recvProductId}
            onChange={(e) => onProductIdChange(e.target.value)}
            aria-label={t('inventory.products')}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground text-sm font-medium"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({t('inventory.currentStockShort', { count: p.stock })})
              </option>
            ))}
          </select>
        </div>

        {variants.length > 0 && selectedProduct && (
          <div>
            <label
              htmlFor="receive-variant-select"
              className="text-xs font-medium text-muted-foreground block mb-1.5"
            >
              {t('inventory.variant')}
            </label>
            <select
              id="receive-variant-select"
              value={recvVariantId}
              onChange={(e) => onVariantIdChange(e.target.value)}
              aria-label={t('inventory.variant')}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground text-sm font-medium"
            >
              <option value="">{t('inventory.variantRequired')}</option>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variantLabel(selectedProduct, variant) || variant.sku} (
                  {t('inventory.currentStockShort', {
                    count: availableStock(selectedProduct, variant.id),
                  })}
                  )
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            {t('inventory.adjustmentReason')}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {(['received', 'waste', 'correction', 'other'] as const).map((r) => (
              <button
                key={r}
                onClick={() => onReasonChange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  recvReason === r
                    ? 'bg-foreground text-background border-foreground font-semibold'
                    : 'bg-background border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                }`}
              >
                {t(`inventory.reason_${r}`, r.charAt(0).toUpperCase() + r.slice(1))}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="recv-qty-input"
              className="text-xs font-medium text-muted-foreground block mb-1.5"
            >
              {t('inventory.deltaQuantity')}
            </label>
            <input
              id="recv-qty-input"
              type="number"
              value={recvQty}
              onChange={(e) => onQuantityChange(e.target.value)}
              aria-label={t('inventory.qtyChange')}
              placeholder={recvReason === 'waste' ? '-5' : '10'}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground font-mono text-sm text-center focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground"
            />
          </div>
          <div>
            <label
              htmlFor="recv-supplier-select"
              className="text-xs font-medium text-muted-foreground block mb-1.5"
            >
              {t('inventory.suppliers')}
            </label>
            <select
              id="recv-supplier-select"
              value={recvSupplierId}
              onChange={(e) => onSupplierIdChange(e.target.value)}
              aria-label={t('inventory.suppliers')}
              disabled={recvReason !== 'received'}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground disabled:opacity-40 text-sm"
            >
              <option value="">{t('inventory.noneOption')}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label
            htmlFor="recv-note-input"
            className="text-xs font-medium text-muted-foreground block mb-1.5"
          >
            {t('inventory.notes')}
          </label>
          <input
            id="recv-note-input"
            type="text"
            value={recvNote}
            onChange={(e) => onNoteChange(e.target.value)}
            aria-label={t('inventory.noteOptional')}
            placeholder={t('inventory.noteOptional')}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <ModalFooter
        cancelLabel={t('inventory.cancel')}
        confirmLabel={t('inventory.confirmReceive', 'Confirm')}
        onCancel={onClose}
        onConfirm={onSubmit}
        confirmDisabled={!recvProductId || !recvQty || isNaN(parseInt(recvQty, 10))}
      />
    </ModalShell>
  );
}
