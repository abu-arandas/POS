import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Product, ProductVariant, SelectedModifier, StoreSettings } from '../../types';
import { ModalShell } from '../shared/ModalShell';
import { variantPrice } from '../../lib/variants';
import { calculateModifierPriceDelta, validateModifierSelections } from '../../lib/modifiers';

export interface ModifierPickerModalProps {
  product: Product;
  variant?: ProductVariant;
  settings: StoreSettings;
  onConfirm(modifiers: SelectedModifier[]): void;
  onClose(): void;
}

export function ModifierPickerModal({
  product,
  variant,
  settings,
  onConfirm,
  onClose,
}: ModifierPickerModalProps) {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);
  // Memoised because it is a useMemo dependency below: `product.modifierGroups
  // || []` allocates a fresh array on every render when the product has none,
  // which would re-run the validity check each time.
  const groups = useMemo(() => product.modifierGroups ?? [], [product.modifierGroups]);

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

  // Initialize with defaults if any
  const [selections, setSelections] = useState<SelectedModifier[]>(() => {
    const initial: SelectedModifier[] = [];
    for (const group of groups) {
      for (const opt of group.options) {
        if (opt.isDefault) {
          initial.push({
            groupId: group.id,
            groupName: group.name,
            optionId: opt.id,
            optionName: opt.name,
            priceDelta: opt.priceDelta,
          });
        }
      }
    }
    return initial;
  });

  const basePrice = variant ? variantPrice(product, variant) : product.price;
  const modifierDelta = useMemo(() => calculateModifierPriceDelta(selections), [selections]);
  const totalPrice = basePrice + modifierDelta;

  const toggleOption = (
    groupId: string,
    groupName: string,
    optionId: string,
    optionName: string,
    priceDelta: number,
    maxSelections?: number,
  ) => {
    setSelections((prev) => {
      const isSelected = prev.some((s) => s.groupId === groupId && s.optionId === optionId);

      if (isSelected) {
        return prev.filter((s) => !(s.groupId === groupId && s.optionId === optionId));
      }

      // Single-choice / Radio behavior
      if (maxSelections === 1) {
        const withoutGroup = prev.filter((s) => s.groupId !== groupId);
        return [...withoutGroup, { groupId, groupName, optionId, optionName, priceDelta }];
      }

      // Multi-choice capped by maxSelections
      const groupCount = prev.filter((s) => s.groupId === groupId).length;
      if (maxSelections && groupCount >= maxSelections) {
        return prev;
      }

      return [...prev, { groupId, groupName, optionId, optionName, priceDelta }];
    });
  };

  // Required-group validation lives in lib/modifiers so the rule is stated
  // once; this modal used to carry its own copy of the same loop, which is how
  // the two drift apart.
  const isValid = useMemo(
    () => validateModifierSelections(groups, selections).valid,
    [groups, selections],
  );

  return (
    <ModalShell
      id="modifier-picker-modal"
      modalRef={modalRef}
      titleId="modifier-picker-title"
      className="max-w-lg w-full flex flex-col"
      compactAnimation
    >
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
        <div className="min-w-0">
          <h3 id="modifier-picker-title" className="font-semibold text-foreground text-sm truncate">
            {product.name}
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">{t('register.customizeItem')}</p>
        </div>
        <button
          onClick={onClose}
          aria-label={t('common.cancel')}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors shrink-0"
        >
          <X size={15} />
        </button>
      </div>

      <div className="space-y-6 p-5 overflow-y-auto">
        {groups.map((group) => {
          const groupSelections = selections.filter((s) => s.groupId === group.id);

          return (
            <div key={group.id} className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  {group.name}
                  {group.minSelections && group.minSelections > 0 ? (
                    <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      {t('common.required')}
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {t('common.optional')}
                    </span>
                  )}
                </span>
                {group.maxSelections && group.maxSelections > 1 && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {t('register.maxCount', { count: group.maxSelections })}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {group.options.map((opt) => {
                  const selected = groupSelections.some((s) => s.optionId === opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        toggleOption(
                          group.id,
                          group.name,
                          opt.id,
                          opt.name,
                          opt.priceDelta,
                          group.maxSelections,
                        )
                      }
                      className={`flex flex-col text-start p-2.5 rounded-lg border text-xs transition-all ${
                        selected
                          ? 'border-foreground bg-foreground text-background shadow-2xs font-medium'
                          : 'border-border bg-card text-foreground hover:bg-secondary/50'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="truncate">{opt.name}</span>
                        {selected && <Check size={12} className="shrink-0" />}
                      </div>
                      <span className="text-[11px] font-mono num opacity-80">
                        {opt.priceDelta > 0
                          ? `+${settings.currency}${opt.priceDelta.toFixed(2)}`
                          : opt.priceDelta < 0
                            ? `-${settings.currency}${Math.abs(opt.priceDelta).toFixed(2)}`
                            : t('register.included')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Footer with total and actions */}
        <div className="pt-4 border-t border-border flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
              {t('register.total')}
            </span>
            <span className="text-lg font-mono num font-semibold text-foreground">
              {settings.currency}
              {totalPrice.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary h-9 px-4 text-xs">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={!isValid}
              onClick={() => onConfirm(selections)}
              className="btn-primary h-9 px-4 text-xs flex items-center gap-1.5"
            >
              <Plus size={14} />
              {t('register.addToCart')}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
