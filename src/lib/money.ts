// The one place that knows how many fractional digits money has.
//
// Every figure the app persists or prints used to be rounded with a hard-coded
// `toFixed(2)`. That is right for dollars and wrong for the currency this app
// ships configured for: the Jordanian dinar has 1000 fils, so a JOD 1.250 item
// was rounded to 1.25 and JOD 12.345 to 12.35 — at checkout, in the refund, in
// the Z-report and on the receipt, each independently. Precision is a property
// of the currency, so it lives here and everything else asks.
//
// Pure and DOM-free so every money module can import it and be tested with it.

/** Fractional digits for a currency nobody has told us about: the common case. */
export const DEFAULT_CURRENCY_DIGITS = 2;

/**
 * ISO 4217 minor-unit exponents that differ from two.
 *
 * Written out rather than read from `Intl` alone because a till has to round
 * the same way on every machine: ICU data moves between Electron, Chromium and
 * Node releases (it has re-decided several currencies' digits), and a terminal
 * and the browser that views its reports must not disagree about a total.
 *
 * Iraqi dinar and the 4-digit unit-of-account codes are deliberately absent —
 * ISO and CLDR disagree about IQD and a store is better served by the runtime's
 * answer than by ours — so they fall through to `Intl` below.
 */
const ZERO_DIGIT = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'UYI',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);
const THREE_DIGIT = new Set(['BHD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

/** What the fields that name a store's currency look like, for the lookup. */
export interface CurrencySource {
  /** ISO 4217 code, when the store has said which currency it is. */
  currencyCode?: string;
  /**
   * What prints in front of an amount. Free text — "$", "د.أ" — but installs
   * have long stored an ISO code here (JOD), so it is also read as a code.
   */
  currency?: string;
}

const digitsCache = new Map<string, number>();

/** Fractional digits of one candidate string, or null when it is not an ISO code. */
function digitsForCode(raw: string | undefined): number | null {
  const code = (raw ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  if (ZERO_DIGIT.has(code)) return 0;
  if (THREE_DIGIT.has(code)) return 3;
  const cached = digitsCache.get(code);
  if (cached !== undefined) return cached;
  let digits: number | null = null;
  try {
    const resolved = new Intl.NumberFormat('en', { style: 'currency', currency: code });
    digits = resolved.resolvedOptions().maximumFractionDigits ?? null;
  } catch {
    // An ill-formed code. The caller falls back to the default.
  }
  if (digits !== null) digitsCache.set(code, digits);
  return digits;
}

/**
 * How many fractional digits a store's money has.
 *
 * Accepts the settings object (or any slice of it) or a bare code. An explicit
 * `currencyCode` wins; otherwise `currency` is tried as a code, so an install
 * that stored "JOD" there gets three digits without anyone touching a setting.
 * Anything else — a symbol such as "$", empty text — is two.
 */
export function currencyDigits(source?: CurrencySource | string | null): number {
  if (source === undefined || source === null) return DEFAULT_CURRENCY_DIGITS;
  const candidates = typeof source === 'string' ? [source] : [source.currencyCode, source.currency];
  for (const candidate of candidates) {
    const digits = digitsForCode(candidate);
    if (digits !== null) return digits;
  }
  return DEFAULT_CURRENCY_DIGITS;
}

/**
 * Rounds a money amount to `digits` fractional digits.
 *
 * Deliberately `Number(n.toFixed(digits))` and nothing cleverer: it rounds the
 * binary value that is actually stored, which is what the existing pricing
 * tests pin (1.115 × 3 lands on 3.34, not 3.35). Changing the rounding rule for
 * two-digit currencies is not part of making three-digit ones work.
 */
export function roundMoney(amount: number, digits: number = DEFAULT_CURRENCY_DIGITS): number {
  const rounded = Number(amount.toFixed(clampDigits(digits)));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** `toFixed` accepts 0–100; money never needs more than a handful. */
function clampDigits(digits: number): number {
  if (!Number.isFinite(digits)) return DEFAULT_CURRENCY_DIGITS;
  return Math.min(6, Math.max(0, Math.trunc(digits)));
}

/**
 * Half the smallest unit — the slack that absorbs floating-point noise when two
 * sums of money are compared for "covers" or "overpays". It was a literal
 * `0.005`, which is half a cent and, for a currency with fils, five times the
 * smallest amount a customer can short-pay by.
 */
export function moneyTolerance(digits: number = DEFAULT_CURRENCY_DIGITS): number {
  return 0.5 * 10 ** -clampDigits(digits);
}

/** An amount as plain fixed-point text, with no currency prefix. */
export function formatAmount(amount: number, digits: number = DEFAULT_CURRENCY_DIGITS): string {
  const text = amount.toFixed(clampDigits(digits));
  // "-0.000" is what a negative amount too small to show prints as; show "0.000".
  return /^-0(\.0*)?$/.test(text) ? text.slice(1) : text;
}

/** An amount with the store's currency prefix, as receipts and reports print it. */
export function formatMoney(
  amount: number,
  currency: string,
  digits: number = DEFAULT_CURRENCY_DIGITS,
): string {
  return `${currency}${formatAmount(amount, digits)}`;
}

/** The `step` for a money `<input type="number">`: "0.01", "0.001", "1". */
export function moneyStep(digits: number = DEFAULT_CURRENCY_DIGITS): string {
  const d = clampDigits(digits);
  return d === 0 ? '1' : `0.${'0'.repeat(d - 1)}1`;
}

/**
 * Everything a screen needs to show and accept the store's money, resolved once
 * from the settings: the prefix, the digits, and bound helpers that already
 * carry them. Pure; `useMoney` is the React-facing wrapper.
 */
export interface MoneyFormatter {
  /** What prints in front of an amount. */
  currency: string;
  /** Fractional digits of the store currency. */
  digits: number;
  /** `step` for a money `<input type="number">`. */
  step: string;
  /** Rounds to the store currency's smallest unit. */
  round: (amount: number) => number;
  /** Fixed-point text with no prefix: "12.500". */
  amount: (amount: number) => string;
  /** Text with the prefix: "JOD12.500". */
  money: (amount: number) => string;
}

export function moneyFormatter(source?: CurrencySource | null): MoneyFormatter {
  const digits = currencyDigits(source);
  const currency = source?.currency ?? '';
  return {
    currency,
    digits,
    step: moneyStep(digits),
    round: (amount) => roundMoney(amount, digits),
    amount: (amount) => formatAmount(amount, digits),
    money: (amount) => formatMoney(amount, currency, digits),
  };
}
