import { useCallback, useMemo } from 'react';
import { Layers, Plus, X } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { ProductVariant, StoreSettings, VariantType } from '../../types';
import { shortId } from '../../lib/utils/ids';
import {
  MAX_VARIANTS_PER_PRODUCT,
  rebuildVariants,
  totalVariantStock,
  variantLabel,
} from '../../lib/variants';

export interface VariantsEditorProps {
  t: TFunction;
  settings: StoreSettings;
  /** The product's own SKU, used to seed each generated variant's SKU. */
  baseSku: string;
  variantTypes: VariantType[];
  variants: ProductVariant[];
  onChange(variantTypes: VariantType[], variants: ProductVariant[]): void;
}

/** A short, readable suffix for a generated SKU — "-01", "-02". */
const skuSuffix = (index: number) => String(index + 1).padStart(2, '0');

/**
 * The variants half of the product form: the option types the product varies
 * along, and the matrix of combinations they produce.
 *
 * The matrix is DERIVED, never hand-built. An operator adds "Colour: Red,
 * Blue" and gets every size-by-colour row; a row's own SKU, price, cost and
 * stock are then theirs to set. Regeneration carries those edits across by
 * option signature, so adding a fourth colour does not zero the stock of the
 * three that were already counted.
 */
export function VariantsEditor({
  t,
  settings,
  baseSku,
  variantTypes,
  variants,
  onChange,
}: VariantsEditorProps) {
  /**
   * Every change to the types regenerates the matrix in the same breath. The
   * two are one piece of state: types that no longer describe the variants
   * beneath them would leave rows nothing can name, price or sell.
   */
  const applyTypes = useCallback(
    (nextTypes: VariantType[]) => {
      const nextVariants = rebuildVariants(
        nextTypes,
        variants,
        shortId,
        (_options, index) => `${baseSku}-${skuSuffix(index)}`,
      );
      onChange(nextTypes, nextVariants);
    },
    [baseSku, variants, onChange],
  );

  const addType = useCallback(() => {
    applyTypes([...variantTypes, { id: shortId(), name: '', options: [] }]);
  }, [applyTypes, variantTypes]);

  const removeType = useCallback(
    (typeId: string) => {
      const nextTypes = variantTypes.filter((type) => type.id !== typeId);
      // Dropping the last type drops the matrix with it: a product with no axes
      // has no combinations, and it goes back to being a plain single item.
      if (nextTypes.length === 0) {
        onChange([], []);
        return;
      }
      applyTypes(nextTypes);
    },
    [applyTypes, onChange, variantTypes],
  );

  const renameType = useCallback(
    (typeId: string, name: string) => {
      // A rename touches no option ids, so the matrix is untouched too — no
      // regeneration, and no chance of a rebuild losing a stock figure.
      onChange(
        variantTypes.map((type) => (type.id === typeId ? { ...type, name } : type)),
        variants,
      );
    },
    [onChange, variantTypes, variants],
  );

  const addOption = useCallback(
    (typeId: string) => {
      applyTypes(
        variantTypes.map((type) =>
          type.id === typeId
            ? { ...type, options: [...type.options, { id: shortId(), name: '' }] }
            : type,
        ),
      );
    },
    [applyTypes, variantTypes],
  );

  const renameOption = useCallback(
    (typeId: string, optionId: string, name: string) => {
      onChange(
        variantTypes.map((type) =>
          type.id === typeId
            ? {
                ...type,
                options: type.options.map((option) =>
                  option.id === optionId ? { ...option, name } : option,
                ),
              }
            : type,
        ),
        variants,
      );
    },
    [onChange, variantTypes, variants],
  );

  const removeOption = useCallback(
    (typeId: string, optionId: string) => {
      applyTypes(
        variantTypes.map((type) =>
          type.id === typeId
            ? { ...type, options: type.options.filter((option) => option.id !== optionId) }
            : type,
        ),
      );
    },
    [applyTypes, variantTypes],
  );

  const updateVariant = useCallback(
    (variantId: string, patch: Partial<ProductVariant>) => {
      onChange(
        variantTypes,
        variants.map((variant) => (variant.id === variantId ? { ...variant, ...patch } : variant)),
      );
    },
    [onChange, variantTypes, variants],
  );

  const derivedTotal = useMemo(() => totalVariantStock({ variants, stock: 0 }), [variants]);
  const atLimit = variants.length >= MAX_VARIANTS_PER_PRODUCT;

  return (
    <div>
      <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2 border-b border-slate-200 dark:border-white/5 pb-2">
        <Layers size={16} className="text-emerald-500" /> {t('inventory.sectionVariants')}
      </h4>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        {variants.length > 0 ? t('inventory.variantStockHint') : t('inventory.variantsHint')}
      </p>

      {/* Option types */}
      <div className="space-y-4">
        {variantTypes.map((type) => (
          <div
            key={type.id}
            className="rounded-2xl border border-slate-200 dark:border-white/10 p-4 bg-white/60 dark:bg-slate-900/40"
          >
            <div className="flex items-center gap-3 mb-3">
              <input
                type="text"
                aria-label={t('inventory.variantTypeName')}
                placeholder={t('inventory.variantTypeNamePlaceholder')}
                value={type.name}
                onChange={(e) => renameType(type.id, e.target.value)}
                className="flex-1 bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => removeType(type.id)}
                aria-label={`${t('inventory.removeVariantType')} — ${type.name || t('inventory.variantTypeName')}`}
                className="p-2 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {type.options.map((option) => (
                <div
                  key={option.id}
                  className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl ps-3 pe-1 py-1 border border-slate-200 dark:border-white/10"
                >
                  <input
                    type="text"
                    aria-label={`${type.name || t('inventory.variantTypeName')} — ${t('inventory.variantOptionName')}`}
                    placeholder={t('inventory.variantOptionPlaceholder')}
                    value={option.name}
                    onChange={(e) => renameOption(type.id, option.id, e.target.value)}
                    className="w-24 bg-transparent border-none text-sm text-slate-900 dark:text-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(type.id, option.id)}
                    aria-label={`${t('inventory.removeVariantOption')} — ${option.name || type.name}`}
                    className="p-1 text-slate-500 hover:text-rose-400 rounded-lg transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addOption(type.id)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-dashed border-emerald-500/40 hover:bg-emerald-500/10 transition-colors"
              >
                <Plus size={12} /> {t('inventory.addVariantOption')}
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        id="add-variant-type-btn"
        onClick={addType}
        className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-dashed border-emerald-500/40 hover:bg-emerald-500/10 transition-colors"
      >
        <Plus size={14} /> {t('inventory.addVariantType')}
      </button>

      {/* The generated matrix */}
      {variants.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {t('inventory.variantCombinations', { count: variants.length })}
            </p>
            <p className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
              {t('inventory.variantTotalStock', { count: derivedTotal })}
            </p>
          </div>
          {atLimit && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2">
              {t('inventory.variantLimitReached', { count: MAX_VARIANTS_PER_PRODUCT })}
            </p>
          )}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800/60">
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="text-start font-bold px-3 py-2">
                    {t('inventory.productDetails')}
                  </th>
                  <th className="text-start font-bold px-3 py-2">{t('inventory.sku')}</th>
                  <th className="text-start font-bold px-3 py-2">
                    {t('inventory.price')} ({settings.currency})
                  </th>
                  <th className="text-start font-bold px-3 py-2">
                    {t('inventory.cost')} ({settings.currency})
                  </th>
                  <th className="text-start font-bold px-3 py-2">{t('inventory.stock')}</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant) => {
                  const label = variantLabel({ variantTypes }, variant);
                  return (
                    <tr key={variant.id} className="border-t border-slate-200 dark:border-white/5">
                      <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        {label || t('inventory.variantUnnamed')}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          aria-label={`${t('inventory.sku')} — ${label}`}
                          value={variant.sku}
                          onChange={(e) => updateVariant(variant.id, { sku: e.target.value })}
                          className="w-32 bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1.5 font-mono text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          aria-label={`${t('inventory.price')} — ${label}`}
                          placeholder={t('inventory.variantInherits')}
                          value={variant.price ?? ''}
                          // An emptied box means "inherit", not "free". Writing 0
                          // here would quietly make the variant a giveaway.
                          onChange={(e) =>
                            updateVariant(variant.id, {
                              price: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                          className="w-24 bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1.5 font-mono text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          aria-label={`${t('inventory.cost')} — ${label}`}
                          placeholder={t('inventory.variantInherits')}
                          value={variant.cost ?? ''}
                          onChange={(e) =>
                            updateVariant(variant.id, {
                              cost: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                          className="w-24 bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1.5 font-mono text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          aria-label={`${t('inventory.stock')} — ${label}`}
                          value={variant.stock}
                          onChange={(e) =>
                            updateVariant(variant.id, {
                              stock: Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                            })
                          }
                          className="w-20 bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1.5 font-mono text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
