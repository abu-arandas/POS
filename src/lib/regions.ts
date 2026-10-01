// The small amount of regional knowledge first-run setup needs: which country
// suggests which currency, what to preselect from the machine's locale, and what
// to print in front of an amount.
//
// Deliberately NOT here: tax rates. They change by law and by product category,
// so a table in the app would be quietly wrong; setup asks the operator instead.
// Names are not here either — country and currency names come from
// `Intl.DisplayNames` in the active language, which is why this file is a list
// of codes and not a catalogue of translations.

/** Countries offered at setup, with the currency each normally uses (ISO 3166 → ISO 4217). */
export const COUNTRIES: ReadonlyArray<{ code: string; currency: string }> = [
  { code: 'JO', currency: 'JOD' },
  { code: 'AE', currency: 'AED' },
  { code: 'SA', currency: 'SAR' },
  { code: 'KW', currency: 'KWD' },
  { code: 'BH', currency: 'BHD' },
  { code: 'OM', currency: 'OMR' },
  { code: 'QA', currency: 'QAR' },
  { code: 'IQ', currency: 'IQD' },
  { code: 'LB', currency: 'LBP' },
  { code: 'EG', currency: 'EGP' },
  { code: 'PS', currency: 'ILS' },
  { code: 'IL', currency: 'ILS' },
  { code: 'TR', currency: 'TRY' },
  { code: 'TN', currency: 'TND' },
  { code: 'LY', currency: 'LYD' },
  { code: 'MA', currency: 'MAD' },
  { code: 'DZ', currency: 'DZD' },
  { code: 'US', currency: 'USD' },
  { code: 'CA', currency: 'CAD' },
  { code: 'MX', currency: 'MXN' },
  { code: 'BR', currency: 'BRL' },
  { code: 'GB', currency: 'GBP' },
  { code: 'IE', currency: 'EUR' },
  { code: 'DE', currency: 'EUR' },
  { code: 'FR', currency: 'EUR' },
  { code: 'ES', currency: 'EUR' },
  { code: 'IT', currency: 'EUR' },
  { code: 'NL', currency: 'EUR' },
  { code: 'CH', currency: 'CHF' },
  { code: 'IN', currency: 'INR' },
  { code: 'PK', currency: 'PKR' },
  { code: 'BD', currency: 'BDT' },
  { code: 'ID', currency: 'IDR' },
  { code: 'MY', currency: 'MYR' },
  { code: 'SG', currency: 'SGD' },
  { code: 'PH', currency: 'PHP' },
  { code: 'JP', currency: 'JPY' },
  { code: 'KR', currency: 'KRW' },
  { code: 'CN', currency: 'CNY' },
  { code: 'AU', currency: 'AUD' },
  { code: 'NZ', currency: 'NZD' },
  { code: 'ZA', currency: 'ZAR' },
  { code: 'NG', currency: 'NGN' },
  { code: 'KE', currency: 'KES' },
];

/** Every currency offered at setup, once each, by code. */
export const CURRENCY_CODES: ReadonlyArray<string> = [
  ...new Set(COUNTRIES.map((c) => c.currency)),
].sort();

/** The currency a country normally uses, or undefined for one not in the list. */
export function currencyForCountry(country: string | undefined): string | undefined {
  return COUNTRIES.find((c) => c.code === country?.toUpperCase())?.currency;
}

/**
 * The country a locale tag points at — `ar-JO`, `en_GB` — if it is one we offer.
 * A bare language (`en`, `ar`) names no country, and guessing one would
 * preselect somebody else's currency, so it yields nothing.
 */
export function countryFromLocale(tag: string | undefined): string | undefined {
  const region = /^[A-Za-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(tag ?? '')?.[1]?.toUpperCase();
  return COUNTRIES.some((c) => c.code === region) ? region : undefined;
}

/**
 * What to print before an amount for a currency: the symbol where there is a
 * recognisable one ("$", "€", "£"), otherwise the ISO code followed by a space,
 * so a dinar total reads `JOD 9.187` and not `JOD9.187`.
 */
export function currencyPrefix(code: string): string {
  const upper = code.trim().toUpperCase();
  let symbol = '';
  try {
    symbol =
      new Intl.NumberFormat('en', {
        style: 'currency',
        currency: upper,
        currencyDisplay: 'narrowSymbol',
      })
        .formatToParts(0)
        .find((part) => part.type === 'currency')?.value ?? '';
  } catch {
    // An unrecognised code: fall through to the code itself.
  }
  // Intl hands back the code when it has no symbol of its own.
  if (!symbol || symbol.toUpperCase() === upper) return `${upper} `;
  return /[A-Za-z]$/.test(symbol) ? `${symbol} ` : symbol;
}

/** The machine's own time zone, which is almost always the business's. */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Every IANA time zone the runtime knows, always including `current`. */
export function timezoneList(current: string): string[] {
  const zones = supportedTimezones();
  return zones.includes(current) ? zones : [current, ...zones];
}

/** What `Intl` can list, or nothing where it cannot (older runtimes throw or omit it). */
function supportedTimezones(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf;
    return supported ? supported('timeZone') : [];
  } catch {
    return [];
  }
}
