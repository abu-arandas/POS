import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ar } from '../locales/ar';
import { en } from '../locales/en';

/**
 * All application locales are assembled here so consumers keep one stable
 * i18next entry point while each locale remains independently maintainable.
 */
export const resources = {
  en,
  ar,
} as const;

/** The languages the app ships catalogues for. Derived from `resources`, so
 *  adding a locale there is the only edit a new language needs. */
export type Locale = keyof typeof resources;

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
