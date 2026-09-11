import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Product, ProductVariant, StoreSettings } from '../../types';
import { ModalShell } from '../shared/ModalShell';
import { availableStock, optionSignature, variantLabel, variantPrice } from '../../lib/variants';

export interface VariantPickerModalProps {
  product: Product;
  settings: StoreSettings;
  /** Units already in the cart, per variant id, so the picker can stop at the limit. */
  cartQuantityByVariantId: Map<string, number>;
  onPick(variant: ProductVariant): void;
  onClose(): void;
}

/**
 * Picks which variant of a product to ring up.
 *
 * One row of option chips per variant type, because that is how the operator
 * thinks about it ("large, oat") rather than as a flat list of forty
 * combinations. The combination those chips land on is looked up by option
 * signature; a product whose matrix has a hole simply has no variant for that
 * pair and the Add button says so.
 */
export function VariantPickerModal({
  product,
  settings,
  cartQuantityByVariantId,
  onPick,
  onClose,
}: VariantPickerModalProps) {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);
  const types = useMemo(
    () => (product.variantTypes ?? []).filter((type) => type.options.length > 0),
    [product.variantTypes],
  );

  const variantsBySignature = useMemo(
    () => new Map((product.variants ?? []).map((v) => [optionSignature(v.options), v] as const)),
    [product.variants],
  );

  /**
   * Opens on the first combination that can actually be sold, rather than on
   * the first one in the matrix. A sold-out first option would otherwise
   * present the operator with a disabled Add button on a product that has
   * plenty left in other sizes.
   */
  const [selection, setSelection] = useState<Record<string, string>>(() => {
    const sellable = (product.variants ?? []).find(
      (v) => availableStock(product, v.id) - (cartQuantityByVariantId.get(v.id) ?? 0) > 0,
    );
    if (sellable) return { ...sellable.options };
    const first: Record<string, string> = {};
    for (const type of types) first[type.id] = type.options[0].id;
    return first;
  });

  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const chosen = variantsBySignature.get(optionSignature(selection));
  const remaining = chosen
    ? availableStock(product, chosen.id) - (cartQuantityByVariantId.get(chosen.id) ?? 0)
    : 0;
  const canAdd = Boolean(chosen) && remaining > 0;

  const confirm = useCallback(() => {
    if (chosen && remaining > 0) onPick(chosen);
  }, [chosen, remaining, onPick]);

  return (
    <ModalShell
      id="variant-picker-modal"
      modalRef={modalRef}
      titleId="variant-picker-title"
      className="max-w-md w-full flex flex-col"
      compactAnimation
    >
      <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
        <div className="min-w-0">
          <h3
            id="variant-picker-title"
            className="font-sans font-bold text-slate-900 dark:text-white text-base truncate"
          >
            {product.name}
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {t('register.chooseVariant')}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label={t('register.closeVariantPicker')}
          className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-xl transition-colors shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
        {types.map((type) => (
          <div key={type.id}>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              {type.name}
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={type.name}>
              {type.options.map((option) => {
                const isSelected = selection[type.id] === option.id;
                // Whether this option leads anywhere sellable, given everything
                // else currently picked. Greys out "Large" when large is gone in
                // the chosen colour, instead of letting the operator find out at
                // the Add button.
                const candidate = variantsBySignature.get(
                  optionSignature({ ...selection, [type.id]: option.id }),
                );
                const soldOut =
                  !candidate ||
                  availableStock(product, candidate.id) -
                    (cartQuantityByVariantId.get(candidate.id) ?? 0) <=
                    0;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelection((prev) => ({ ...prev, [type.id]: option.id }))}
                    className={`toggle-pill px-3.5 py-1.5 rounded-xl text-[11px] font-semibold ${
                      isSelected ? 'is-selected' : ''
                    } ${soldOut ? 'opacity-40 line-through' : ''}`}
                  >
                    {option.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono font-bold text-slate-900 dark:text-white text-sm">
            {settings.currency}
            {variantPrice(product, chosen).toFixed(2)}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
            {chosen
              ? variantLabel(product, chosen) || product.sku
              : t('register.variantUnavailable')}
          </p>
        </div>
        <button
          type="button"
          onClick={confirm}
          disabled={!canAdd}
          className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl flex items-center gap-2 transition-transform active:scale-95 shrink-0"
        >
          <Check size={16} />
          <span>{canAdd ? t('register.addToCart') : t('register.outOfStock')}</span>
        </button>
      </div>
    </ModalShell>
  );
}
