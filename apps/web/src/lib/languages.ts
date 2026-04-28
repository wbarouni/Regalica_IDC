// Source unique de vérité pour les langues supportées par REGFlow.
// Modifier cette liste pour ajouter/retirer une langue — aucun autre
// fichier à toucher : i18n, useDir, LanguageSwitcher consomment tous
// SUPPORTED_LANGUAGES.

export const SUPPORTED_LANGUAGES = [
  { code: 'fr', label: 'Français', dir: 'ltr' as const },
  { code: 'en', label: 'English', dir: 'ltr' as const },
  { code: 'ar', label: 'العربية', dir: 'rtl' as const },
] as const;

export type LangCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const DEFAULT_LANG: LangCode = 'fr';

export const RTL_LANGS: ReadonlyArray<LangCode> = SUPPORTED_LANGUAGES.filter(
  (l) => l.dir === 'rtl',
).map((l) => l.code);
