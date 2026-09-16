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
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-2 border-b border-border/60 pb-2">
        <Layers size={14} className="text-muted-foreground" /> {t('inventory.sectionVariants')}
      </h4>
      <p className="text-[11px] text-muted-foreground mb-3">
        {variants.length > 0 ? t('inventory.variantStockHint') : t('inventory.variantsHint')}
      </p>

      {/* Option types */}
      <div className="space-y-3">
        {variantTypes.map((type) => (
          <div key={type.id} className="rounded-xl border border-border p-3 bg-secondary/30">
            <div className="flex items-center gap-2 mb-2.5">
              <input
                type="text"
                aria-label={t('inventory.variantTypeName')}
                placeholder={t('inventory.variantTypeNamePlaceholder')}
                value={type.name}
                onChange={(e) => renameType(type.id, e.target.value)}
                className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground"
              />
              <button
                type="button"
                onClick={() => removeType(type.id)}
                aria-label={`${t('inventory.removeVariantType')} — ${type.name || t('inventory.variantTypeName')}`}
                className="size-7 inline-flex items-center justify-center text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10 transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {type.options.map((option) => (
                <div
                  key={option.id}
                  className="flex items-center gap-1 bg-background rounded-md ps-2 pe-1 py-0.5 border border-border"
                >
                  <input
                    type="text"
                    aria-label={`${type.name || t('inventory.variantTypeName')} — ${t('inventory.variantOptionName')}`}
                    placeholder={t('inventory.variantOptionPlaceholder')}
                    value={option.name}
                    onChange={(e) => renameOption(type.id, option.id, e.target.value)}
                    className="w-20 bg-transparent border-none text-xs text-foreground focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(type.id, option.id)}
                    aria-label={`${t('inventory.removeVariantOption')} — ${option.name || type.name}`}
                    className="size-5 inline-flex items-center justify-center text-muted-foreground hover:text-destructive rounded transition-colors"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addOption(type.id)}
                className="btn-secondary text-[11px] h-6 px-2 rounded-md inline-flex items-center gap-1"
              >
                <Plus size={10} /> {t('inventory.addVariantOption')}
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        id="add-variant-type-btn"
        onClick={addType}
        className="mt-3 btn-secondary text-xs h-8 px-3 rounded-lg inline-flex items-center gap-1.5"
      >
        <Plus size={13} /> {t('inventory.addVariantType')}
      </button>

      {/* The generated matrix */}
      {variants.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t('inventory.variantCombinations', { count: variants.length })}
            </p>
            <p className="text-xs font-mono font-medium text-foreground">
              {t('inventory.variantTotalStock', { count: derivedTotal })}
            </p>
          </div>
          {atLimit && (
            <p className="text-[11px] text-amber-500 mb-2">
              {t('inventory.variantLimitReached', { count: MAX_VARIANTS_PER_PRODUCT })}
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 border-b border-border">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                  <th className="text-start font-medium px-3 py-2">
                    {t('inventory.productDetails')}
                  </th>
                  <th className="text-start font-medium px-3 py-2">{t('inventory.sku')}</th>
                  <th className="text-start font-medium px-3 py-2">
                    {t('inventory.price')} ({settings.currency})
                  </th>
                  <th className="text-start font-medium px-3 py-2">
                    {t('inventory.cost')} ({settings.currency})
                  </th>
                  <th className="text-start font-medium px-3 py-2">{t('inventory.stock')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {variants.map((variant) => {
                  const label = variantLabel({ variantTypes }, variant);
                  return (
                    <tr key={variant.id} className="hover:bg-muted/30">
                      <td className="px-3 py-1.5 font-medium text-foreground whitespace-nowrap">
                        {label || t('inventory.variantUnnamed')}
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          aria-label={`${t('inventory.sku')} — ${label}`}
                          value={variant.sku}
                          onChange={(e) => updateVariant(variant.id, { sku: e.target.value })}
                          className="w-28 bg-background border border-border rounded-md px-2 py-1 font-mono text-xs text-foreground focus:outline-none focus:border-foreground"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          aria-label={`${t('inventory.price')} — ${label}`}
                          placeholder={t('inventory.variantInherits')}
                          value={variant.price ?? ''}
                          onChange={(e) =>
                            updateVariant(variant.id, {
                              price: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                          className="w-20 bg-background border border-border rounded-md px-2 py-1 font-mono text-xs text-foreground focus:outline-none focus:border-foreground"
                        />
                      </td>
                      <td className="px-3 py-1.5">
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
                          className="w-20 bg-background border border-border rounded-md px-2 py-1 font-mono text-xs text-foreground focus:outline-none focus:border-foreground"
                        />
                      </td>
                      <td className="px-3 py-1.5">
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
                          className="w-16 bg-background border border-border rounded-md px-2 py-1 font-mono text-xs text-foreground focus:outline-none focus:border-foreground"
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
