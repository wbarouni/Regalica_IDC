import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { SUPPORTED_LANGUAGES } from '../lib/languages';

export function useDir(): 'ltr' | 'rtl' {
  const { i18n } = useTranslation();
  const langConfig = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language);
  const dir: 'ltr' | 'rtl' = langConfig?.dir ?? 'ltr';

  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('dir', dir);
    html.setAttribute('lang', i18n.language);
  }, [dir, i18n.language]);

  return dir;
}
