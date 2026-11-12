import { useMemo, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import Logo from './Logo';
import { businessText } from './settings/businessText';
import { TEMPLATE_IDS, profileFromTemplate, type BusinessTemplate } from '../lib/businessProfile';
import { currencyDigits } from '../lib/money';
import {
  COUNTRIES,
  CURRENCY_CODES,
  countryFromLocale,
  currencyForCountry,
  currencyPrefix,
  detectTimezone,
  timezoneList,
} from '../lib/regions';
import { useSettingsStore } from '../stores/settingsStore';
import type { Locale } from '../lib/i18n';
import type { StoreSettings } from '../types';

/** A localized name for a region or currency code, or the code itself without Intl support. */
function displayName(language: string, type: 'region' | 'currency', code: string): string {
  try {
    return new Intl.DisplayNames([language], { type }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * First-run setup: what a fresh install shows before the lock screen. It asks
 * for the things that used to be hard-coded — the business's name, what kind of
 * business it is, where it is and what it charges in — and records them in one
 * write, so the terminal is never half-configured. The lock screen then creates
 * the administrator account.
 *
 * Everything chosen here can be changed later in Settings.
 */
export default function Onboarding() {
  const { t } = useTranslation();
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);

  // Preselect from the machine so most operators only type a name. The country
  // comes from the locale only when it names one; otherwise it stays unset
  // rather than guessing someone else's currency.
  const [initial] = useState(() => {
    const country = countryFromLocale(navigator.language) ?? '';
    return { country, currency: currencyForCountry(country) ?? 'USD', timezone: detectTimezone() };
  });

  const [name, setName] = useState('');
  const [template, setTemplate] = useState<BusinessTemplate>('general-retail');
  const [country, setCountry] = useState(initial.country);
  const [currencyCode, setCurrencyCode] = useState(initial.currency);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [taxRate, setTaxRate] = useState('0');
  const [taxNumber, setTaxNumber] = useState('');
  const [error, setError] = useState('');

  const text = businessText(t);
  const zones = useMemo(() => timezoneList(timezone), [timezone]);

  const handleCountryChange = (code: string) => {
    setCountry(code);
    // A country suggests its currency; the operator can still pick another.
    const suggested = currencyForCountry(code);
    if (suggested) setCurrencyCode(suggested);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const storeName = name.trim();
    if (!storeName) {
      setError(t('onboarding.businessNameRequired'));
      return;
    }
    const rate = parseFloat(taxRate);
    const base = useSettingsStore.getState().settings;
    const settings: StoreSettings = {
      ...base,
      storeName,
      taxRate: Number.isFinite(rate) ? Math.min(100, Math.max(0, rate)) : 0,
      taxNumber: taxNumber.trim() || undefined,
      currency: currencyPrefix(currencyCode),
      currencyCode,
      country: country || undefined,
      timezone,
    };
    completeOnboarding(settings, profileFromTemplate(template));
  };

  const inputClass = 'input-shell w-full px-3 py-2 rounded-xl text-xs';
  const labelClass = 'block text-xs font-medium text-muted-foreground mb-1.5';
  const sectionClass = 'text-xs font-semibold text-foreground uppercase tracking-wider font-mono';

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <motion.form
        onSubmit={handleSubmit}
        noValidate
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-xl rounded-2xl bg-card border border-border shadow-xl p-6 space-y-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div>
              <h1 className="text-base font-semibold text-foreground">{t('onboarding.title')}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{t('onboarding.subtitle')}</p>
            </div>
          </div>
          <div className="shrink-0">
            <label htmlFor="onboarding-language" className="sr-only">
              {t('onboarding.language')}
            </label>
            <select
              id="onboarding-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Locale)}
              className="input-shell px-2 py-1.5 rounded-lg text-xs"
            >
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </div>
        </div>

        <section className="space-y-3.5" aria-labelledby="onboarding-business">
          <h2 id="onboarding-business" className={sectionClass}>
            {t('onboarding.sectionBusiness')}
          </h2>
          <div>
            <label htmlFor="onboarding-name" className={labelClass}>
              {t('onboarding.businessName')}
            </label>
            <input
              id="onboarding-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder={t('onboarding.businessNamePlaceholder')}
              autoComplete="organization"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'onboarding-error' : undefined}
              className={inputClass}
            />
            {error && (
              <p
                id="onboarding-error"
                className="mt-2 text-xs font-medium text-destructive"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>

          <div role="radiogroup" aria-label={t('onboarding.businessType')}>
            <p className={labelClass}>{t('onboarding.businessType')}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {TEMPLATE_IDS.map((id) => {
                const selected = template === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTemplate(id)}
                    className={`text-start p-3 rounded-xl border transition-colors ${
                      selected
                        ? 'border-foreground bg-secondary/40'
                        : 'border-border bg-secondary/10 hover:bg-secondary/30'
                    }`}
                  >
                    <span className="block text-xs font-semibold text-foreground">
                      {text.templates[id].title}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-1">
                      {text.templates[id].hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="space-y-3.5" aria-labelledby="onboarding-region">
          <h2 id="onboarding-region" className={sectionClass}>
            {t('onboarding.sectionRegion')}
          </h2>
          <div className="grid sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="onboarding-country" className={labelClass}>
                {t('onboarding.country')}
              </label>
              <select
                id="onboarding-country"
                value={country}
                onChange={(e) => handleCountryChange(e.target.value)}
                className={inputClass}
              >
                <option value="">{t('onboarding.countryPlaceholder')}</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {displayName(language, 'region', c.code)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="onboarding-timezone" className={labelClass}>
                {t('onboarding.timezone')}
              </label>
              <select
                id="onboarding-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className={inputClass}
              >
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="onboarding-currency" className={labelClass}>
              {t('onboarding.currency')}
            </label>
            <select
              id="onboarding-currency"
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
              aria-describedby="onboarding-currency-hint"
              className={inputClass}
            >
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code} — {displayName(language, 'currency', code)}
                </option>
              ))}
            </select>
            <p id="onboarding-currency-hint" className="mt-1.5 text-[11px] text-muted-foreground">
              {t('onboarding.currencyDigits', { digits: currencyDigits(currencyCode) })}
            </p>
          </div>
        </section>

        <section className="space-y-3.5" aria-labelledby="onboarding-tax">
          <h2 id="onboarding-tax" className={sectionClass}>
            {t('onboarding.sectionTax')}
          </h2>
          <div className="grid sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="onboarding-tax-rate" className={labelClass}>
                {t('onboarding.taxRate')}
              </label>
              <input
                id="onboarding-tax-rate"
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.1"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                aria-describedby="onboarding-tax-hint"
                className={`${inputClass} font-mono`}
              />
              <p id="onboarding-tax-hint" className="mt-1.5 text-[11px] text-muted-foreground">
                {t('onboarding.taxRateHint')}
              </p>
            </div>
            <div>
              <label htmlFor="onboarding-tax-number" className={labelClass}>
                {t('onboarding.taxNumber')}
              </label>
              <input
                id="onboarding-tax-number"
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>
        </section>

        <div className="space-y-2">
          <button
            type="submit"
            className="btn-primary w-full py-2.5 rounded-xl text-xs font-medium"
          >
            {t('onboarding.finish')}
          </button>
          <p className="text-center text-[11px] text-muted-foreground">
            {t('onboarding.nextStep')}
          </p>
        </div>
      </motion.form>
    </div>
  );
}
