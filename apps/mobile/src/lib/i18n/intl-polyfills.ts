/**
 * Hermes ships only `Intl.Collator`, `Intl.DateTimeFormat` and `Intl.NumberFormat`. The app also
 * needs three more:
 * - `Intl.PluralRules`: Lingui resolves every ICU `plural` and `selectordinal` message through it,
 *   so the first plural string rendered ("3 votes") threw and a release build terminated.
 * - `Intl.RelativeTimeFormat`: staleness captions ("updated 5 minutes ago") and `format.relativeTime`.
 * - `Intl.ListFormat`: `format.list` ("Maya, Jordan and Winston").
 * Each polyfill installs itself only where the engine lacks a working implementation (never under
 * Node or Jest). PluralRules loads first: RelativeTimeFormat picks its plural category through it.
 *
 * Importing this module installs the constructors with English data only; the active language's
 * data loads through {@link loadIntlLocaleData} before its catalogs activate (the initial locale and
 * every `setLocale`), so a launch evaluates one language's data instead of all of them. English
 * loads first and stays: the polyfills fall back to the first language they were given for any tag
 * without data of its own.
 */
import '@formatjs/intl-pluralrules/polyfill.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';
import '@formatjs/intl-relativetimeformat/polyfill.js';
import '@formatjs/intl-relativetimeformat/locale-data/en.js';
import '@formatjs/intl-listformat/polyfill.js';
import '@formatjs/intl-listformat/locale-data/en.js';

/* eslint-disable @typescript-eslint/no-require-imports -- one language's data, loaded on demand */
/**
 * Plural, relative-time and list data per language of every `@cp/i18n` registry locale (a test
 * keeps the lists in step). Literal `require` calls so Metro bundles each file, evaluated only when
 * that language is activated.
 */
const LOCALE_DATA: Readonly<Record<string, () => void>> = {
  de: () => {
    require('@formatjs/intl-pluralrules/locale-data/de.js');
    require('@formatjs/intl-relativetimeformat/locale-data/de.js');
    require('@formatjs/intl-listformat/locale-data/de.js');
  },
  en: () => {
    require('@formatjs/intl-pluralrules/locale-data/en.js');
    require('@formatjs/intl-relativetimeformat/locale-data/en.js');
    require('@formatjs/intl-listformat/locale-data/en.js');
  },
  es: () => {
    require('@formatjs/intl-pluralrules/locale-data/es.js');
    require('@formatjs/intl-relativetimeformat/locale-data/es.js');
    require('@formatjs/intl-listformat/locale-data/es.js');
  },
  fr: () => {
    require('@formatjs/intl-pluralrules/locale-data/fr.js');
    require('@formatjs/intl-relativetimeformat/locale-data/fr.js');
    require('@formatjs/intl-listformat/locale-data/fr.js');
  },
  id: () => {
    require('@formatjs/intl-pluralrules/locale-data/id.js');
    require('@formatjs/intl-relativetimeformat/locale-data/id.js');
    require('@formatjs/intl-listformat/locale-data/id.js');
  },
  it: () => {
    require('@formatjs/intl-pluralrules/locale-data/it.js');
    require('@formatjs/intl-relativetimeformat/locale-data/it.js');
    require('@formatjs/intl-listformat/locale-data/it.js');
  },
  ja: () => {
    require('@formatjs/intl-pluralrules/locale-data/ja.js');
    require('@formatjs/intl-relativetimeformat/locale-data/ja.js');
    require('@formatjs/intl-listformat/locale-data/ja.js');
  },
  ko: () => {
    require('@formatjs/intl-pluralrules/locale-data/ko.js');
    require('@formatjs/intl-relativetimeformat/locale-data/ko.js');
    require('@formatjs/intl-listformat/locale-data/ko.js');
  },
  ms: () => {
    require('@formatjs/intl-pluralrules/locale-data/ms.js');
    require('@formatjs/intl-relativetimeformat/locale-data/ms.js');
    require('@formatjs/intl-listformat/locale-data/ms.js');
  },
  nl: () => {
    require('@formatjs/intl-pluralrules/locale-data/nl.js');
    require('@formatjs/intl-relativetimeformat/locale-data/nl.js');
    require('@formatjs/intl-listformat/locale-data/nl.js');
  },
  pl: () => {
    require('@formatjs/intl-pluralrules/locale-data/pl.js');
    require('@formatjs/intl-relativetimeformat/locale-data/pl.js');
    require('@formatjs/intl-listformat/locale-data/pl.js');
  },
  pt: () => {
    require('@formatjs/intl-pluralrules/locale-data/pt.js');
    require('@formatjs/intl-relativetimeformat/locale-data/pt.js');
    require('@formatjs/intl-listformat/locale-data/pt.js');
  },
  th: () => {
    require('@formatjs/intl-pluralrules/locale-data/th.js');
    require('@formatjs/intl-relativetimeformat/locale-data/th.js');
    require('@formatjs/intl-listformat/locale-data/th.js');
  },
  tr: () => {
    require('@formatjs/intl-pluralrules/locale-data/tr.js');
    require('@formatjs/intl-relativetimeformat/locale-data/tr.js');
    require('@formatjs/intl-listformat/locale-data/tr.js');
  },
  vi: () => {
    require('@formatjs/intl-pluralrules/locale-data/vi.js');
    require('@formatjs/intl-relativetimeformat/locale-data/vi.js');
    require('@formatjs/intl-listformat/locale-data/vi.js');
  },
  zh: () => {
    require('@formatjs/intl-pluralrules/locale-data/zh.js');
    require('@formatjs/intl-relativetimeformat/locale-data/zh.js');
    require('@formatjs/intl-listformat/locale-data/zh.js');
  },
};
/* eslint-enable @typescript-eslint/no-require-imports */

/** The primary language subtag (`zh-Hans` → `zh`, `en-XA` → `en`); Hermes has no `Intl.Locale`. */
function languageOf(tag: string): string {
  return tag.split('-')[0]?.toLowerCase() ?? tag;
}

/**
 * Registers the plural, relative-time and list data for `tag`'s language with the polyfills. Safe
 * to call again for the same language (the module cache runs each data file once) and a no-op
 * where the engine has its own implementations.
 */
export function loadIntlLocaleData(tag: string): void {
  LOCALE_DATA[languageOf(tag)]?.();
}
