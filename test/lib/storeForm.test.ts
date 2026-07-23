import { describe, it, expect } from 'vitest';
import {
  validateStoreForm,
  isStoreFormValid,
  slugifyStoreId,
  normalizeStoreForm,
  isAssignableRole,
  ASSIGNABLE_ROLES,
} from '../../src/lib/storeForm';

const base = { name: 'Downtown', timezone: 'UTC', currency: '$' };

describe('validateStoreForm', () => {
  it('accepts a well-formed store', () => {
    expect(validateStoreForm(base)).toEqual({});
    expect(isStoreFormValid(base)).toBe(true);
  });

  it('flags a blank name, timezone, or currency', () => {
    const e = validateStoreForm({ name: '  ', timezone: '', currency: '' });
    expect(e).toEqual({ name: 'required', timezone: 'required', currency: 'required' });
    expect(isStoreFormValid({ name: '', timezone: 'UTC', currency: '$' })).toBe(false);
  });

  it('flags an over-long name or currency', () => {
    expect(validateStoreForm({ ...base, name: 'x'.repeat(81) })).toEqual({ name: 'tooLong' });
    expect(validateStoreForm({ ...base, currency: 'ABCDE' })).toEqual({ currency: 'tooLong' });
  });
});

describe('slugifyStoreId', () => {
  it('slugifies a name to a url-safe id', () => {
    expect(slugifyStoreId('Downtown Flagship!')).toBe('downtown-flagship');
    expect(slugifyStoreId('  Airport   Kiosk  ')).toBe('airport-kiosk');
  });

  it('falls back to "store" when nothing usable remains', () => {
    expect(slugifyStoreId('!!!')).toBe('store');
    expect(slugifyStoreId('')).toBe('store');
  });

  it('appends a numeric suffix to avoid collisions', () => {
    expect(slugifyStoreId('Downtown', ['downtown'])).toBe('downtown-2');
    expect(slugifyStoreId('Downtown', ['downtown', 'downtown-2'])).toBe('downtown-3');
  });
});

describe('normalizeStoreForm', () => {
  it('trims fields and drops an empty address', () => {
    expect(normalizeStoreForm({ name: ' A ', timezone: ' UTC ', currency: ' $ ', address: '   ' })).toEqual({
      name: 'A',
      timezone: 'UTC',
      currency: '$',
    });
  });

  it('keeps a non-empty trimmed address', () => {
    expect(normalizeStoreForm({ ...base, address: '  1 Main St ' }).address).toBe('1 Main St');
  });
});

describe('isAssignableRole', () => {
  it('accepts per-store roles and rejects superadmin / junk', () => {
    for (const r of ASSIGNABLE_ROLES) expect(isAssignableRole(r)).toBe(true);
    expect(isAssignableRole('superadmin')).toBe(false);
    expect(isAssignableRole('owner')).toBe(false);
  });
});
