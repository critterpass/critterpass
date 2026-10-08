import { i18n } from '@lingui/core';
import { createMMKV } from 'react-native-mmkv';

// apps/mobile/src/lib may only import the `domain` package directly (tools/lint/boundaries.js);
// `@cp/i18n` is a leaf, script-agnostic package other layers (mobile-route, mobile-ui) already may
// import, so this reaches past that restriction the same way apps/mobile/src/lib/fonts's resolver
// does for `@cp/design-tokens` — only for the registry lookup, never for React/JSX.
// eslint-disable-next-line boundaries/dependencies -- see the comment above
import { isShippedLocale, loadAllCatalogs, sourceLocale } from '@cp/i18n';

import { loadIntlLocaleData } from './intl-polyfills';

const LOCALE_STORAGE_KEY = 'cp.locale';
// createMMKV() (not the `MMKV` type-only export) detects a Jest/Vitest worker itself
// (react-native-mmkv's own isTest()) and returns its own in-memory mock, so this needs no test
// double of its own.
const storage = createMMKV();

/** The user's own language choice, if they have made one (checked before any device-preference detection). */
export function persistedLocale(): string | undefined {
  return storage.getString(LOCALE_STORAGE_KEY);
}

/** The language the UI is in right now; `undefined` until the first one is activated. */
export function activeLocale(): string | undefined {
  return i18n.locale === '' ? undefined : i18n.locale;
}

export interface SetLocaleOptions {
  /** Write the choice to MMKV so it wins over device-preferred detection on next launch. @default true */
  persist?: boolean;
}

/**
 * Activates a locale in place: loads its bundled catalogs and its language's plural, relative-time
 * and list data, then `i18n.loadAndActivate`, which every
 * `<Trans>`/`useLingui()` consumer under `I18nProvider` re-renders from automatically — the screen
 * stays mounted and navigation state is untouched, since nothing here remounts the app's tree. Falls
 * back to the source locale for an unregistered code rather than activating a locale with no
 * catalogs at all.
 */
export async function setLocale(locale: string, options: SetLocaleOptions = {}): Promise<void> {
  const { persist = true } = options;
  const resolved = isShippedLocale(locale) ? locale : sourceLocale;
  const messages = await loadAllCatalogs(resolved);
  loadIntlLocaleData(resolved);
  i18n.loadAndActivate({ locale: resolved, messages });
  if (persist) storage.set(LOCALE_STORAGE_KEY, resolved);
}

/**
 * Subscribes to real locale changes (not every catalog reload) for use outside a React tree — e.g.
 * replaying a guide sample line in the new language once `setLocale` resolves. Returns an
 * unsubscribe function.
 */
export function onLocaleChanged(callback: (locale: string) => void): () => void {
  let previous = i18n.locale;
  return i18n.on('change', () => {
    if (i18n.locale !== previous) {
      previous = i18n.locale;
      callback(i18n.locale);
    }
  });
}
