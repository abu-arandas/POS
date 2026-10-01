import { describe, expect, it } from 'vitest';
import {
  currencyDigits,
  formatAmount,
  formatMoney,
  moneyStep,
  moneyTolerance,
  roundMoney,
} from './money';

describe('currencyDigits', () => {
  it.each([
    ['JOD', 3],
    ['KWD', 3],
    ['BHD', 3],
    ['OMR', 3],
    ['TND', 3],
    ['USD', 2],
    ['EUR', 2],
    ['AED', 2],
    ['JPY', 0],
    ['KRW', 0],
  ])('%s has %i fractional digits', (code, digits) => {
    expect(currencyDigits(code)).toBe(digits);
  });

  it('reads an ISO code stored in the display field, as installs have long done', () => {
    expect(currencyDigits({ currency: 'JOD' })).toBe(3);
    expect(currencyDigits({ currency: ' jod ' })).toBe(3);
  });

  it('prefers an explicit currencyCode over the display text', () => {
    expect(currencyDigits({ currencyCode: 'JOD', currency: 'د.أ' })).toBe(3);
    expect(currencyDigits({ currencyCode: 'USD', currency: 'JOD' })).toBe(2);
  });

  it('is two for symbols, free text and nothing at all', () => {
    expect(currencyDigits({ currency: '$' })).toBe(2);
    expect(currencyDigits({ currency: 'د.أ' })).toBe(2);
    expect(currencyDigits({ currency: '' })).toBe(2);
    expect(currencyDigits('')).toBe(2);
    expect(currencyDigits(undefined)).toBe(2);
    expect(currencyDigits(null)).toBe(2);
  });
});

describe('roundMoney', () => {
  it('keeps three digits for a three-digit currency', () => {
    expect(roundMoney(12.345, 3)).toBe(12.345);
    expect(roundMoney(1.2504, 3)).toBe(1.25);
    expect(roundMoney(1.2506, 3)).toBe(1.251);
  });

  it('rounds like toFixed on the stored binary value, as the pricing tests pin', () => {
    expect(roundMoney(1.115 * 3, 2)).toBe(3.34);
    expect(roundMoney(0.1 * 3, 2)).toBe(0.3);
  });

  it('rounds a zero-digit currency to whole units', () => {
    expect(roundMoney(1234.6, 0)).toBe(1235);
  });

  it('defaults to two digits', () => {
    expect(roundMoney(1.2349)).toBe(1.23);
  });

  it('never returns negative zero', () => {
    expect(Object.is(roundMoney(-0.0001, 2), 0)).toBe(true);
  });

  it('survives a nonsense digit count rather than throwing', () => {
    expect(roundMoney(1.5, Number.NaN)).toBe(1.5);
    expect(roundMoney(1.5, -3)).toBe(2);
  });
});

describe('moneyTolerance', () => {
  it('is half the smallest unit', () => {
    expect(moneyTolerance(2)).toBe(0.005);
    expect(moneyTolerance(3)).toBe(0.0005);
    expect(moneyTolerance(0)).toBe(0.5);
  });
});

describe('formatAmount / formatMoney', () => {
  it('prints exactly the currency digits, trailing zeros included', () => {
    expect(formatAmount(12.5, 3)).toBe('12.500');
    expect(formatAmount(12.5, 2)).toBe('12.50');
    expect(formatAmount(1235, 0)).toBe('1235');
  });

  it('is byte-identical to the old toFixed(2) output for two-digit currencies', () => {
    for (const n of [0, 1, 1.005, 2.675, 99.999, 1234.5, -3.5]) {
      expect(formatAmount(n)).toBe(n.toFixed(2));
    }
  });

  it('does not print a negative zero', () => {
    expect(formatAmount(-0.0001, 3)).toBe('0.000');
  });

  it('puts the prefix straight in front, as receipts always have', () => {
    expect(formatMoney(12.5, 'JOD', 3)).toBe('JOD12.500');
    expect(formatMoney(12.5, '$')).toBe('$12.50');
  });
});

describe('moneyStep', () => {
  it('matches the currency digits', () => {
    expect(moneyStep(2)).toBe('0.01');
    expect(moneyStep(3)).toBe('0.001');
    expect(moneyStep(0)).toBe('1');
    expect(moneyStep()).toBe('0.01');
  });
});
