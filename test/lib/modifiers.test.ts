import { describe, it, expect } from 'vitest';
import {
  calculateModifierPriceDelta,
  formatModifierSummary,
  modifierSignature,
  validateModifierSelections,
} from '../../src/lib/modifiers';
import type { ModifierGroup, SelectedModifier } from '../../src/types';

const mod = (over: Partial<SelectedModifier>): SelectedModifier => ({
  groupId: 'g',
  groupName: 'Group',
  optionId: 'o',
  optionName: 'Option',
  priceDelta: 0,
  ...over,
});

describe('modifierSignature', () => {
  // The signature is what decides whether two taps stack onto one cart line or
  // sit as two. Get it wrong in one direction and a customer's "no onions" is
  // silently applied to someone else's burger; wrong in the other and the same
  // item lists twice.
  it('is empty for an item with no modifiers, so it keys on the product alone', () => {
    expect(modifierSignature()).toBe('');
    expect(modifierSignature([])).toBe('');
  });

  it('ignores the order they were chosen in', () => {
    const a = modifierSignature([mod({ optionId: 'cheese' }), mod({ optionId: 'bacon' })]);
    const b = modifierSignature([mod({ optionId: 'bacon' }), mod({ optionId: 'cheese' })]);
    expect(a).toBe(b);
  });

  it('separates different selections', () => {
    expect(modifierSignature([mod({ optionId: 'cheese' })])).not.toBe(
      modifierSignature([mod({ optionId: 'bacon' })]),
    );
  });

  it('distinguishes the same option id under different groups', () => {
    // Two groups can legitimately name an option "none"; folding them together
    // would merge "no sauce" with "no pickles".
    expect(modifierSignature([mod({ groupId: 'sauce', optionId: 'none' })])).not.toBe(
      modifierSignature([mod({ groupId: 'pickles', optionId: 'none' })]),
    );
  });

  it('does not mutate the array it was handed', () => {
    // It sorts to normalise; sorting in place would reorder the caller's
    // selection state underneath it.
    const selections = [mod({ optionId: 'b' }), mod({ optionId: 'a' })];
    modifierSignature(selections);
    expect(selections.map((s) => s.optionId)).toEqual(['b', 'a']);
  });
});

describe('calculateModifierPriceDelta', () => {
  it('is zero with nothing selected', () => {
    expect(calculateModifierPriceDelta()).toBe(0);
    expect(calculateModifierPriceDelta([])).toBe(0);
  });

  it('sums the deltas', () => {
    expect(
      calculateModifierPriceDelta([mod({ priceDelta: 0.5 }), mod({ priceDelta: 1.25 })]),
    ).toBeCloseTo(1.75);
  });

  it('subtracts a negative delta', () => {
    // A discount modifier ("small size", "no meat") is a legitimate negative.
    expect(
      calculateModifierPriceDelta([mod({ priceDelta: 2 }), mod({ priceDelta: -0.5 })]),
    ).toBeCloseTo(1.5);
  });
});

describe('formatModifierSummary', () => {
  it('is empty with nothing selected', () => {
    expect(formatModifierSummary()).toBe('');
    expect(formatModifierSummary([])).toBe('');
  });

  it('joins the option names in the order chosen', () => {
    expect(
      formatModifierSummary([
        mod({ optionName: 'Extra cheese' }),
        mod({ optionName: 'No onions' }),
      ]),
    ).toBe('Extra cheese, No onions');
  });
});

describe('validateModifierSelections', () => {
  const group = (over: Partial<ModifierGroup>): ModifierGroup => ({
    id: 'sauce',
    name: 'Sauce',
    options: [],
    ...over,
  });

  it('accepts an optional group left empty', () => {
    expect(validateModifierSelections([group({ minSelections: 0 })], [])).toEqual({ valid: true });
  });

  it('refuses a required group left empty, naming it', () => {
    const result = validateModifierSelections([group({ minSelections: 1 })], []);
    expect(result.valid).toBe(false);
    expect(result.missingGroup).toBe('Sauce');
  });

  it('accepts a required group once it is satisfied', () => {
    expect(
      validateModifierSelections([group({ minSelections: 1 })], [mod({ groupId: 'sauce' })]),
    ).toEqual({ valid: true });
  });

  it('refuses more selections than the group allows', () => {
    const result = validateModifierSelections(
      [group({ maxSelections: 1 })],
      [mod({ groupId: 'sauce', optionId: 'a' }), mod({ groupId: 'sauce', optionId: 'b' })],
    );
    expect(result.valid).toBe(false);
  });

  it('counts each group separately', () => {
    // A selection in one group must not satisfy another group's minimum.
    const result = validateModifierSelections(
      [
        group({ id: 'sauce', minSelections: 1 }),
        group({ id: 'side', name: 'Side', minSelections: 1 }),
      ],
      [mod({ groupId: 'sauce' })],
    );
    expect(result.valid).toBe(false);
    expect(result.missingGroup).toBe('Side');
  });

  it('accepts a group with no bounds at all', () => {
    expect(validateModifierSelections([group({})], [])).toEqual({ valid: true });
  });
});
