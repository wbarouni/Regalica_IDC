import { useTranslation } from 'react-i18next';

import { SUPPORTED_LANGUAGES } from '../../lib/languages';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  return (
    <div className="flex gap-1" role="group" aria-label="Language">
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          onClick={() => void i18n.changeLanguage(lang.code)}
          className={[
            'text-xs font-mono px-2 py-1 rounded transition-colors',
            i18n.language === lang.code
              ? 'bg-ink text-paper'
              : 'text-stone-500 hover:text-ink hover:bg-stone-100',
          ].join(' ')}
          aria-pressed={i18n.language === lang.code}
        >
          {lang.code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
