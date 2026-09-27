import { getLocale, sourceLocale } from './locales.js';
import type { LocaleDirection, LocaleScript } from './locales.js';

export interface LocaleMeta {
  readonly bcp47: string;
  readonly englishName: string;
  readonly nativeName: string;
  readonly script: LocaleScript;
  readonly direction: LocaleDirection;
}

/**
 * Locale metadata for the AI gateway's output-language directive and any other consumer that needs
 * a locale's name/script/direction rather than its catalogs. Falls back to the source locale's own
 * metadata for an unregistered code, so a caller never has to null-check this.
 */
export function localeMeta(locale: string): LocaleMeta {
  const entry = getLocale(locale) ?? getLocale(sourceLocale);
  if (!entry) {
    // The source locale is always registered (packages/i18n/test/locales.test.ts asserts this).
    throw new Error(`locale registry is missing the source locale "${sourceLocale}"`);
  }
  return {
    bcp47: entry.code,
    englishName: entry.englishName,
    nativeName: entry.nativeName,
    script: entry.script,
    direction: entry.direction,
  };
}
