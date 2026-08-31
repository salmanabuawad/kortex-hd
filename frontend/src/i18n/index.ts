import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { resources, RTL_LANGUAGES, type Language } from './translations';

const STORAGE_KEY = 'kortex_support_language';

export function storedLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in resources) return stored as Language;
  } catch {
    /* private browsing */
  }
  return 'he';
}

/** Sets `lang` and `dir` on <html>, which drives every logical CSS property. */
export function applyLanguage(language: Language): void {
  const root = document.documentElement;
  root.lang = language;
  root.dir = RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    /* private browsing */
  }
}

void i18n.use(initReactI18next).init({
  resources,
  lng: storedLanguage(),
  // Hebrew is the source language: a key missing from Arabic or English renders
  // its Hebrew text rather than the key itself.
  fallbackLng: 'he',
  interpolation: { escapeValue: false },
  returnNull: false,
});

applyLanguage(storedLanguage());

export default i18n;
export { RTL_LANGUAGES, LANGUAGE_NAMES, type Language } from './translations';
