import type { RefObject } from 'react';
import { ModalShell } from '../shared/ModalShell';
import type { TFunction } from 'i18next';
import { Check, ClipboardList, X } from 'lucide-react';
import type { Product, StoreSettings, Supplier } from '../../types';

export interface PurchaseOrderDraftLine {
  productId: string;
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
      className="max-w-2xl w-full flex flex-col max-h-[90vh]"
    >
      <div className="px-8 py-6 border-b border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/50 flex items-center justify-between">
        <h3
          id="po-form-title"
          className="font-bold text-slate-900 dark:text-white text-xl flex items-center gap-3"
        >
          <ClipboardList size={24} className="text-emerald-500" /> {t('inventory.newPurchaseOrder')}
        </h3>
        <button
          onClick={() => onClose}
          aria-label={t('inventory.cancel')}
          className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-xl transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <div className="p-8 space-y-6 overflow-y-auto flex-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
              {t('inventory.poSupplier')}
            </label>
            <select
              value={poSupplierId}
              onChange={(e) => onSupplierIdChange(e.target.value)}
              className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
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
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
              {t('inventory.poNote')}
            </label>
            <input
              type="text"
              value={poNote}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder={t('inventory.noteOptional')}
              className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="space-y-3">
          {poLines.map((lineRow, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <select
                value={lineRow.productId}
                onChange={(e) => onLineChange(idx, { productId: e.target.value })}
                aria-label={t('inventory.products')}
                className="flex-1 bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 min-w-0"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={lineRow.quantity}
                onChange={(e) => onLineChange(idx, { quantity: e.target.value })}
                aria-label={t('inventory.poQty')}
                placeholder={t('inventory.poQty')}
                className="w-24 bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-slate-900 dark:text-white font-mono text-center focus:outline-none focus:border-emerald-500"
              />
              <div className="w-32 flex items-center bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden focus-within:border-emerald-500">
                <span className="ps-3 text-slate-500 font-mono text-sm">{settings.currency}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={lineRow.unitCost}
                  onChange={(e) => onLineChange(idx, { unitCost: e.target.value })}
                  aria-label={t('inventory.poUnitCost')}
                  placeholder="0.00"
                  className="w-full bg-transparent px-2 py-3 text-slate-900 dark:text-white font-mono focus:outline-none"
                />
              </div>
              <button
                onClick={() => onRemoveLine(idx)}
                disabled={poLines.length <= 1}
                aria-label={t('inventory.poRemoveLine')}
                className="btn-icon-outline p-2.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl disabled:opacity-25 transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={onAddLine}
            className="btn-dashed-add text-xs font-bold px-3 py-2 rounded-lg"
          >
            + {t('inventory.poAddLine')}
          </button>
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-slate-200 dark:border-white/5 text-sm">
          <span className="text-slate-500 dark:text-slate-400 font-bold uppercase text-xs tracking-wider">
            {t('inventory.poTotalCost')}
          </span>
          <span className="font-mono font-bold text-emerald-400 text-lg">
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

      <div className="px-8 py-5 border-t border-slate-200 dark:border-white/10 bg-white/90 dark:bg-slate-900/80 flex justify-end gap-3">
        <button
          onClick={() => onClose}
          className="px-6 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-bold transition-colors"
        >
          {t('inventory.cancel')}
        </button>
        <button
          onClick={onSubmit}
          className="px-6 py-3 font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
        >
          <Check size={20} /> {t('inventory.poSaveDraft')}
        </button>
      </div>
    </ModalShell>
  );
}
