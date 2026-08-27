import { describe, it, expect } from 'vitest';
import { nonNegative } from '../../src/lib/money';

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
