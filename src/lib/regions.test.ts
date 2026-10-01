import { describe, expect, it } from 'vitest';
import { currencyDigits } from './money';
import {
  COUNTRIES,
  CURRENCY_CODES,
  countryFromLocale,
  currencyForCountry,
  currencyPrefix,
  detectTimezone,
  timezoneList,
} from './regions';

describe('currencyForCountry', () => {
  it('maps a country to its currency, case-insensitively', () => {
    expect(currencyForCountry('JO')).toBe('JOD');
    expect(currencyForCountry('jo')).toBe('JOD');
    expect(currencyForCountry('DE')).toBe('EUR');
    expect(currencyForCountry('US')).toBe('USD');
  });

  it('says nothing for a country it does not know', () => {
    expect(currencyForCountry('ZZ')).toBeUndefined();
    expect(currencyForCountry(undefined)).toBeUndefined();
  });

  it('offers only currencies whose precision the app can resolve', () => {
    // Every offered currency must produce a sane digit count, or setup would
    // hand a store a currency the money code cannot round.
    for (const code of CURRENCY_CODES) {
      const digits = currencyDigits(code);
      expect(digits, code).toBeGreaterThanOrEqual(0);
      expect(digits, code).toBeLessThanOrEqual(3);
    }
    expect(currencyDigits('JOD')).toBe(3);
  });

  it('lists each country once', () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('countryFromLocale', () => {
  it('reads the region out of a locale tag', () => {
    expect(countryFromLocale('ar-JO')).toBe('JO');
    expect(countryFromLocale('en_GB')).toBe('GB');
    expect(countryFromLocale('en-us')).toBe('US');
  });

  it('reads the region through a script subtag', () => {
    // The region is not at a fixed position: Hans / Latn can sit before it.
    expect(countryFromLocale('zh-Hans-CN')).toBe('CN');
    expect(countryFromLocale('zh_Hant_CN')).toBe('CN');
    expect(countryFromLocale('en-Latn-GB')).toBe('GB');
  });

  it('refuses a malformed tag rather than throwing', () => {
    expect(countryFromLocale('not a locale!!')).toBeUndefined();
    expect(countryFromLocale('en-')).toBeUndefined();
  });

  it('does not take a numeric region (es-419) for a country', () => {
    expect(countryFromLocale('es-419')).toBeUndefined();
  });

  it('does not guess a country from a bare language', () => {
    expect(countryFromLocale('en')).toBeUndefined();
    expect(countryFromLocale('ar')).toBeUndefined();
    expect(countryFromLocale('')).toBeUndefined();
    expect(countryFromLocale(undefined)).toBeUndefined();
  });

  it('ignores a region we do not offer', () => {
    expect(countryFromLocale('en-ZZ')).toBeUndefined();
  });
});

describe('currencyPrefix', () => {
  it('uses the symbol where there is a recognisable one', () => {
    expect(currencyPrefix('USD')).toBe('$');
    expect(currencyPrefix('EUR')).toBe('€');
    expect(currencyPrefix('GBP')).toBe('£');
  });

  it('spaces an ISO code from the amount, so a dinar total is readable', () => {
    expect(currencyPrefix('JOD')).toBe('JOD ');
    expect(currencyPrefix('kwd')).toBe('KWD ');
  });

  it('falls back to the code for something unrecognised', () => {
    expect(currencyPrefix('ZZZ')).toBe('ZZZ ');
  });
});

describe('time zones', () => {
  it('detects a zone', () => {
    expect(detectTimezone().length).toBeGreaterThan(0);
  });

  it('always includes the current zone in the list', () => {
    expect(timezoneList('Asia/Amman')).toContain('Asia/Amman');
    expect(timezoneList('Not/AZone')).toContain('Not/AZone');
  });
});
