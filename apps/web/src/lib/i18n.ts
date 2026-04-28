import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import { SUPPORTED_LANGUAGES, DEFAULT_LANG } from './languages';
import frCommon from '../locales/fr/common.json';
import enCommon from '../locales/en/common.json';
import arCommon from '../locales/ar/common.json';

const resources = {
  fr: { common: frCommon },
  en: { common: enCommon },
  ar: { common: arCommon },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    defaultNS: 'common',
    fallbackLng: DEFAULT_LANG,
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'regflow-lang',
    },
  });

export default i18n;
