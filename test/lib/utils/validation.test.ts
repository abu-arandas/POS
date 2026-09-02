import { describe, it, expect } from 'vitest';
import { nonNegative, isPositiveIntegerQuantity } from '../../../src/lib/utils/validation';

// Mirrors src/lib/utils/validation.ts. Note that test/lib/validation.test.ts is a
// different module entirely — it covers the Electron main process's
// electron/validation.cjs (IPC payload bounds), not these two predicates.

describe('nonNegative', () => {
  it('passes positive finite numbers through unchanged', () => {
    expect(nonNegative(4.5)).toBe(4.5);
    expect(nonNegative(0.01)).toBe(0.01);
    expect(nonNegative(1000)).toBe(1000);
  });

  it('clamps zero, negatives, and non-finite values to 0', () => {
    for (const n of [0, -0, -1, -0.01, -9999, NaN, Infinity, -Infinity]) {
      expect(nonNegative(n)).toBe(0);
    }
  });
});

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
