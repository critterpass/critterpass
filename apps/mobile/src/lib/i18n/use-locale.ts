import { useLingui } from '@lingui/react';

/** The active locale, re-rendering the caller on every `setLocale` (via `I18nRoot`'s provider). */
export function useLocale(): string {
  const { i18n } = useLingui();
  return i18n.locale;
}
