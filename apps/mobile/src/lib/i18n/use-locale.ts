import { i18n } from '@lingui/core';
import { useLingui } from '@lingui/react';
import { useSyncExternalStore } from 'react';

/** The active locale, re-rendering the caller on every `setLocale` (via `I18nRoot`'s provider). */
export function useLocale(): string {
  const { i18n } = useLingui();
  return i18n.locale;
}

const subscribe = (onChange: () => void) => i18n.on('change', onChange);
/** Before the first language is activated the app reads the source language. */
const activeLocale = () => (i18n.locale === '' ? 'en' : i18n.locale);

/**
 * The active locale for data hooks: read straight from the i18n instance, so the hook works
 * wherever it runs (a screen, a headless hook, a test with no provider) and still re-renders its
 * caller when the language changes.
 */
export function useActiveLocale(): string {
  return useSyncExternalStore(subscribe, activeLocale, activeLocale);
}
