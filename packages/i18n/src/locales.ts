/**
 * Locale registry (design-system.md §6, product-decisions.md §7 language default). One entry per
 * locale Lingui knows about: the launch set that gates release builds, the founder-exception set
 * registered but not yet gated, and the dev-only pseudo-locale used to rehearse expansion and
 * accented glyphs before real translations exist.
 */

/** ISO 15924 script code for the locale's primary writing system. */
export type LocaleScript = 'Latn' | 'Hans' | 'Jpan' | 'Kore' | 'Thai';

export type LocaleDirection = 'ltr' | 'rtl';

export interface LocaleEntry {
  /** BCP-47 language tag; the key used in catalog paths, MMKV storage and sync headers. */
  readonly code: string;
  readonly englishName: string;
  readonly nativeName: string;
  readonly script: LocaleScript;
  readonly direction: LocaleDirection;
  /**
   * Launch-gate membership: release builds (see tools/scripts/i18n/check-complete.ts) fail when a
   * shipped locale's catalogs are incomplete. Non-shipped entries stay registered so their catalogs
   * exist for future work without blocking a release.
   */
  readonly shipped: boolean;
  /**
   * Pseudo-localised QA locale (accented glyphs, +40% length). Compiled from the source locale's
   * own text rather than translated; never shown in a language picker and never part of the launch
   * gate.
   */
  readonly pseudo?: boolean;
}

/** The locale every message id and untranslated fallback is authored in. */
export const sourceLocale = 'en';

/**
 * Founder-selected launch languages (product-decisions.md §7 language default) plus the founder
 * exception locales registered ahead of a wider-launch confirmation, plus the dev pseudo-locale.
 * Ordered: source locale, shipped set, exception set, pseudo-locale.
 */
export const locales: readonly LocaleEntry[] = [
  {
    code: 'en',
    englishName: 'English',
    nativeName: 'English',
    script: 'Latn',
    direction: 'ltr',
    shipped: true,
  },
  {
    code: 'zh-Hans',
    englishName: 'Chinese (Simplified)',
    nativeName: '简体中文',
    script: 'Hans',
    direction: 'ltr',
    shipped: true,
  },
  {
    code: 'id',
    englishName: 'Indonesian',
    nativeName: 'Bahasa Indonesia',
    script: 'Latn',
    direction: 'ltr',
    shipped: true,
  },
  {
    code: 'ja',
    englishName: 'Japanese',
    nativeName: '日本語',
    script: 'Jpan',
    direction: 'ltr',
    shipped: true,
  },
  {
    code: 'es',
    englishName: 'Spanish',
    nativeName: 'Español',
    script: 'Latn',
    direction: 'ltr',
    shipped: true,
  },
  {
    code: 'pt',
    englishName: 'Portuguese',
    nativeName: 'Português',
    script: 'Latn',
    direction: 'ltr',
    shipped: true,
  },
  {
    code: 'fr',
    englishName: 'French',
    nativeName: 'Français',
    script: 'Latn',
    direction: 'ltr',
    shipped: true,
  },
  {
    code: 'ko',
    englishName: 'Korean',
    nativeName: '한국어',
    script: 'Kore',
    direction: 'ltr',
    shipped: true,
  },
  {
    code: 'th',
    englishName: 'Thai',
    nativeName: 'ไทย',
    script: 'Thai',
    direction: 'ltr',
    shipped: true,
  },
  {
    code: 'vi',
    englishName: 'Vietnamese',
    nativeName: 'Tiếng Việt',
    script: 'Latn',
    direction: 'ltr',
    shipped: true,
  },
  // Founder-exception locales (open question: confirming the wider 16-language set flips `shipped`
  // to true here; no other code change). Registered now so their catalog directories, Tolgee glossary
  // and native generators already work the day the exception is confirmed.
  {
    code: 'de',
    englishName: 'German',
    nativeName: 'Deutsch',
    script: 'Latn',
    direction: 'ltr',
    shipped: false,
  },
  {
    code: 'it',
    englishName: 'Italian',
    nativeName: 'Italiano',
    script: 'Latn',
    direction: 'ltr',
    shipped: false,
  },
  {
    code: 'nl',
    englishName: 'Dutch',
    nativeName: 'Nederlands',
    script: 'Latn',
    direction: 'ltr',
    shipped: false,
  },
  {
    code: 'tr',
    englishName: 'Turkish',
    nativeName: 'Türkçe',
    script: 'Latn',
    direction: 'ltr',
    shipped: false,
  },
  {
    code: 'ms',
    englishName: 'Malay',
    nativeName: 'Bahasa Melayu',
    script: 'Latn',
    direction: 'ltr',
    shipped: false,
  },
  {
    code: 'pl',
    englishName: 'Polish',
    nativeName: 'Polski',
    script: 'Latn',
    direction: 'ltr',
    shipped: false,
  },
  {
    code: 'en-XA',
    englishName: 'Pseudo (dev)',
    nativeName: 'Pseudo (dev)',
    script: 'Latn',
    direction: 'ltr',
    shipped: false,
    pseudo: true,
  },
];

/** Every registered BCP-47 tag, in registry order; what Lingui's `locales` config lists. */
export const localeCodes: readonly string[] = locales.map((entry) => entry.code);

/** Locales a release build gates on: complete and reviewed, per the launch-language default. */
export const shippedLocales: readonly LocaleEntry[] = locales.filter((entry) => entry.shipped);

/** Codes for {@link shippedLocales}, for filtering CLI/CI commands by `--locale`. */
export const shippedLocaleCodes: readonly string[] = shippedLocales.map((entry) => entry.code);

/** Looks up a registry entry by BCP-47 tag, or `undefined` for an unregistered code. */
export function getLocale(code: string): LocaleEntry | undefined {
  return locales.find((entry) => entry.code === code);
}

/** Whether `code` is registered and part of the launch gate. */
export function isShippedLocale(code: string): boolean {
  return getLocale(code)?.shipped === true;
}
