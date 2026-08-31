import type { RefObject } from 'react';
import { ModalShell } from '../shared/ModalShell';
import type { TFunction } from 'i18next';
import { Check, PackagePlus, X } from 'lucide-react';
import type { Product, StockAdjustment, Supplier } from '../../types';

type ReceiveReason = StockAdjustment['reason'];
export interface ReceiveStockModalProps {
  t: TFunction;
  modalRef: RefObject<HTMLDivElement | null>;
  products: Product[];
  suppliers: Supplier[];
  recvProductId: string;
  recvQty: string;
  recvSupplierId: string;
  recvNote: string;
  recvReason: ReceiveReason;
  onProductIdChange(value: string): void;
  onQuantityChange(value: string): void;
  onSupplierIdChange(value: string): void;
  onNoteChange(value: string): void;
  onReasonChange(value: ReceiveReason): void;
  onClose(): void;
  onSubmit(): void;
}

export function ReceiveStockModal({
  t,
  modalRef,
  products,
  suppliers,
  recvProductId,
  recvQty,
  recvSupplierId,
  recvNote,
  recvReason,
  onProductIdChange,
  onQuantityChange,
  onSupplierIdChange,
  onNoteChange,
  onReasonChange,
  onClose,
  onSubmit,
}: ReceiveStockModalProps) {
  return (
    <ModalShell modalRef={modalRef} titleId="receive-stock-title" className="max-w-md w-full">
      <div className="px-8 py-6 border-b border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/50 flex items-center justify-between">
        <h3
          id="receive-stock-title"
          className="font-bold text-slate-900 dark:text-white text-xl flex items-center gap-3"
        >
          <PackagePlus size={24} className="text-emerald-500" /> {t('inventory.receiveStock')}
        </h3>
        <button
          onClick={onClose}
          aria-label={t('inventory.cancel')}
          className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-xl transition-colors"
        >
          <X size={20} />
        </button>
      </div>
      <div className="p-8 space-y-6">
        <div>
          <label
            htmlFor="receive-product-select"
            className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2"
          >
            {t('inventory.products')}
          </label>
          <select
            id="receive-product-select"
            value={recvProductId}
            onChange={(e) => onProductIdChange(e.target.value)}
            aria-label={t('inventory.products')}
            className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 text-lg font-bold"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({t('inventory.currentStockShort', { count: p.stock })})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
            {t('inventory.adjustmentReason')}
          </label>
          <div className="flex flex-wrap gap-2">
            {(['received', 'waste', 'correction', 'other'] as const).map((r) => (
              <button
                key={r}
                onClick={() => onReasonChange(r)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                  recvReason === r
                    ? r === 'waste'
                      ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                      : r === 'received'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                        : 'bg-amber-500/20 border-amber-500 text-amber-400'
                    : 'bg-white/80 dark:bg-slate-900/50 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t(`inventory.reason_${r}`, r.charAt(0).toUpperCase() + r.slice(1))}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="recv-qty-input"
              className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2"
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
              className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white font-mono text-xl text-center focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label
              htmlFor="recv-supplier-select"
              className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2"
            >
              {t('inventory.suppliers')}
            </label>
            <select
              id="recv-supplier-select"
              value={recvSupplierId}
              onChange={(e) => onSupplierIdChange(e.target.value)}
              aria-label={t('inventory.suppliers')}
              disabled={recvReason !== 'received'}
              className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 disabled:opacity-50"
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
            className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2"
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
            className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>
      <div className="px-8 py-5 border-t border-slate-200 dark:border-white/10 bg-white/90 dark:bg-slate-900/80 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-6 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-bold transition-colors"
        >
          {t('inventory.cancel')}
        </button>
        <button
          onClick={onSubmit}
          disabled={!recvProductId || !recvQty || isNaN(parseInt(recvQty, 10))}
          className="px-6 py-3 font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
        >
          <Check size={20} /> {t('inventory.confirmReceive', 'Confirm')}
        </button>
      </div>
    </ModalShell>
  );
}
