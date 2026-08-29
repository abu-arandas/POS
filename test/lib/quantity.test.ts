import { describe, expect, it } from 'vitest';
import { isPositiveIntegerQuantity } from '../../src/lib/quantity';

describe('isPositiveIntegerQuantity', () => {
  it('accepts positive safe integers', () => {
    expect(isPositiveIntegerQuantity(1)).toBe(true);
    expect(isPositiveIntegerQuantity(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects %s',
    (value) => {
      expect(isPositiveIntegerQuantity(value)).toBe(false);
    },
  );
});
