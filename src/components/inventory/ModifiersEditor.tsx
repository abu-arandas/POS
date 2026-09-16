import React, { useCallback } from 'react';
import { Plus, X, UtensilsCrossed, Trash2 } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { ModifierGroup, ModifierOption, StoreSettings } from '../../types';
import { shortId } from '../../lib/utils/ids';

export interface ModifiersEditorProps {
  t: TFunction;
  settings: StoreSettings;
  modifierGroups: ModifierGroup[];
  onChange: (groups: ModifierGroup[]) => void;
}

export function ModifiersEditor({
  t,
  settings,
  modifierGroups,
  onChange,
}: ModifiersEditorProps) {
  const addGroup = useCallback(() => {
    const newGroup: ModifierGroup = {
      id: shortId(),
      name: '',
      minSelections: 0,
      maxSelections: 1,
      options: [
        { id: shortId(), name: '', priceDelta: 0 },
      ],
    };
    onChange([...modifierGroups, newGroup]);
  }, [modifierGroups, onChange]);

  const removeGroup = useCallback(
    (groupId: string) => {
      onChange(modifierGroups.filter((g) => g.id !== groupId));
    },
    [modifierGroups, onChange],
  );

  const updateGroup = useCallback(
    (groupId: string, patch: Partial<ModifierGroup>) => {
      onChange(
        modifierGroups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)),
      );
    },
    [modifierGroups, onChange],
  );

  const addOption = useCallback(
    (groupId: string) => {
      onChange(
        modifierGroups.map((g) => {
          if (g.id !== groupId) return g;
          return {
            ...g,
            options: [...g.options, { id: shortId(), name: '', priceDelta: 0 }],
          };
        }),
      );
    },
    [modifierGroups, onChange],
  );

  const updateOption = useCallback(
    (groupId: string, optionId: string, patch: Partial<ModifierOption>) => {
      onChange(
        modifierGroups.map((g) => {
          if (g.id !== groupId) return g;
          return {
            ...g,
            options: g.options.map((opt) =>
              opt.id === optionId ? { ...opt, ...patch } : opt,
            ),
          };
        }),
      );
    },
    [modifierGroups, onChange],
  );

  const removeOption = useCallback(
    (groupId: string, optionId: string) => {
      onChange(
        modifierGroups.map((g) => {
          if (g.id !== groupId) return g;
          return {
            ...g,
            options: g.options.filter((opt) => opt.id !== optionId),
          };
        }),
      );
    },
    [modifierGroups, onChange],
  );

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <UtensilsCrossed size={14} className="text-muted-foreground" />
          {t('inventory.itemModifiers', { defaultValue: 'Item Modifiers & Add-ons' })}
        </h4>
        <button
          type="button"
          onClick={addGroup}
          className="text-xs font-medium text-foreground hover:text-foreground/80 flex items-center gap-1.5 transition-colors"
        >
          <Plus size={14} />
          <span>{t('inventory.addModifierGroup', { defaultValue: 'Add Group' })}</span>
        </button>
      </div>

      {modifierGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 p-4 text-center">
          <p className="text-xs text-muted-foreground">
            {t(
              'inventory.noModifiersHint',
              { defaultValue: 'No custom modifiers configured. Add groups like "Doneness", "Cheese", or "Sauces".' },
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {modifierGroups.map((group, groupIdx) => (
            <div
              key={group.id}
              className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-3"
            >
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs text-muted-foreground font-semibold">
                  #{groupIdx + 1}
                </span>
                <input
                  type="text"
                  placeholder={t('inventory.modifierGroupNamePlaceholder', { defaultValue: 'Group Name (e.g. Cheese, Doneness)' })}
                  value={group.name}
                  onChange={(e) => updateGroup(group.id, { name: e.target.value })}
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-foreground"
                />
                <div className="flex items-center gap-1.5 bg-background border border-border rounded-lg px-2 py-1">
                  <label className="text-[10px] uppercase font-mono text-muted-foreground cursor-pointer flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={group.minSelections > 0}
                      onChange={(e) =>
                        updateGroup(group.id, { minSelections: e.target.checked ? 1 : 0 })
                      }
                      className="rounded accent-foreground"
                    />
                    <span>{t('inventory.required', { defaultValue: 'Required' })}</span>
                  </label>
                </div>
                <div className="flex items-center gap-1.5 bg-background border border-border rounded-lg px-2 py-1">
                  <label className="text-[10px] uppercase font-mono text-muted-foreground cursor-pointer flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={group.maxSelections > 1}
                      onChange={(e) =>
                        updateGroup(group.id, { maxSelections: e.target.checked ? 99 : 1 })
                      }
                      className="rounded accent-foreground"
                    />
                    <span>{t('inventory.multiSelect', { defaultValue: 'Multi' })}</span>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => removeGroup(group.id)}
                  aria-label="Remove Group"
                  className="size-7 inline-flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Options list */}
              <div className="ps-5 space-y-2 border-s-2 border-border/80 ms-2">
                {group.options.map((opt) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={t('inventory.optionNamePlaceholder', { defaultValue: 'Option name (e.g. Cheddar, Well Done)' })}
                      value={opt.name}
                      onChange={(e) => updateOption(group.id, opt.id, { name: e.target.value })}
                      className="flex-1 bg-background border border-border rounded-md px-2.5 py-1 text-xs text-foreground focus:outline-none focus:border-foreground"
                    />
                    <div className="relative w-28">
                      <span className="absolute inset-y-0 start-2 flex items-center text-[10px] text-muted-foreground font-mono">
                        +{settings.currency}
                      </span>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        placeholder="0.00"
                        value={opt.priceDelta === 0 ? '' : opt.priceDelta}
                        onChange={(e) =>
                          updateOption(group.id, opt.id, {
                            priceDelta: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full bg-background border border-border rounded-md ps-8 pe-2 py-1 text-xs text-foreground font-mono focus:outline-none focus:border-foreground"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeOption(group.id, opt.id)}
                      aria-label="Remove option"
                      className="size-6 inline-flex items-center justify-center text-muted-foreground hover:text-destructive rounded transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addOption(group.id)}
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors pt-1"
                >
                  <Plus size={11} />
                  <span>{t('inventory.addOption', { defaultValue: 'Add Choice / Option' })}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
