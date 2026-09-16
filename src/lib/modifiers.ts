import type { ModifierGroup, SelectedModifier } from '../types';

/**
 * Generates a deterministic signature string for a list of selected modifiers.
 * Two items with identical modifiers produce identical signatures, allowing
 * cart items to stack, while items with different customizations remain distinct lines.
 */
export function modifierSignature(modifiers?: SelectedModifier[]): string {
  if (!modifiers || modifiers.length === 0) return '';
  return [...modifiers]
    .sort((a, b) => a.optionId.localeCompare(b.optionId))
    .map((m) => `${m.groupId}:${m.optionId}`)
    .join('|');
}

/**
 * Computes the total price addition for a list of selected modifiers.
 */
export function calculateModifierPriceDelta(modifiers?: SelectedModifier[]): number {
  if (!modifiers || modifiers.length === 0) return 0;
  return modifiers.reduce((acc, m) => acc + (m.priceDelta || 0), 0);
}

/**
 * Returns a concise human-readable summary of the chosen modifiers.
 * Example: "+ Extra Cheese, No Onions"
 */
export function formatModifierSummary(modifiers?: SelectedModifier[]): string {
  if (!modifiers || modifiers.length === 0) return '';
  return modifiers.map((m) => m.optionName).join(', ');
}

/**
 * Validates whether the currently selected modifiers satisfy the group's requirements
 * (e.g. minSelections, maxSelections).
 */
export function validateModifierSelections(
  groups: ModifierGroup[],
  selections: SelectedModifier[],
): { valid: boolean; missingGroup?: string } {
  for (const group of groups) {
    const count = selections.filter((s) => s.groupId === group.id).length;
    if (group.minSelections && group.minSelections > 0 && count < group.minSelections) {
      return { valid: false, missingGroup: group.name };
    }
    if (group.maxSelections && count > group.maxSelections) {
      return { valid: false, missingGroup: group.name };
    }
  }
  return { valid: true };
}
