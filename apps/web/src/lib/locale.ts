/* eslint-disable lingui/no-unlocalized-strings -- language tags, cookie and header plumbing, not UI copy. */
/**
 * Which language a visitor reads the coming-soon page in. One pure function decides, in this
 * order: a locale in the address (`/vi`, for that request only), the choice the visitor made in
 * the language switcher (the `cp_locale` cookie), the browser's `Accept-Language` list, then
 * English. Only shipped languages are ever
 * returned (the registry in @cp/i18n), so a request for anything else falls through to the next
 * preference instead of a half-translated page.
 */
import { shippedLocales, sourceLocale } from '@cp/i18n';
import type { LocaleEntry } from '@cp/i18n';

export const LOCALE_COOKIE = 'cp_locale';
/** One year, in seconds. */
export const LOCALE_COOKIE_MAX_AGE = 31_536_000;
export const DEFAULT_LOCALE = sourceLocale;

/** The languages the site is offered in, in registry order (what the switcher lists). */
export const SITE_LOCALES: readonly LocaleEntry[] = shippedLocales;
export const SITE_LOCALE_CODES: readonly string[] = SITE_LOCALES.map((entry) => entry.code);

export type LocaleSource = 'path' | 'cookie' | 'header' | 'default';

export interface NegotiatedLocale {
  readonly locale: string;
  readonly source: LocaleSource;
}

/** Language subtags browsers still send under a retired code. */
const LEGACY_LANGUAGES: Readonly<Record<string, string>> = { in: 'id' };
/** Regions that write Chinese in Traditional characters when the tag names no script. */
const TRADITIONAL_CHINESE_REGIONS = new Set(['tw', 'hk', 'mo']);

/** The shipped locale whose code is exactly `value` (as it appears in an address or the cookie). */
export function exactLocale(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return SITE_LOCALE_CODES.includes(value) ? value : null;
}

/** As {@link exactLocale}, ignoring letter case: `/zh-hans` names the same language as `/zh-Hans`. */
export function locateLocale(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const wanted = value.toLowerCase();
  return SITE_LOCALE_CODES.find((code) => code.toLowerCase() === wanted) ?? null;
}

/**
 * The shipped locale that serves a browser language tag, or `null` when none does. Matches on the
 * language, then on script or region where the language is written in more than one script:
 * `vi-VN` → `vi`, `pt-BR` → `pt`, `es-419` → `es`, `zh`/`zh-CN`/`zh-SG`/`zh-Hans-*` → `zh-Hans`,
 * while `zh-TW`, `zh-HK` and `zh-Hant-*` are Traditional Chinese, which is not shipped.
 */
export function matchLanguageTag(tag: string): string | null {
  const subtags = tag.trim().toLowerCase().split(/[-_]/u);
  const first = subtags[0] ?? '';
  if (first === '') return null;
  const language = LEGACY_LANGUAGES[first] ?? first;
  const rest = subtags.slice(1);

  if (language === 'zh') {
    const script = rest.find((subtag) => subtag.length === 4);
    if (script !== undefined) return script === 'hans' ? exactLocale('zh-Hans') : null;
    const region = rest.find((subtag) => subtag.length === 2);
    if (region !== undefined && TRADITIONAL_CHINESE_REGIONS.has(region)) return null;
    return exactLocale('zh-Hans');
  }
  return SITE_LOCALE_CODES.find((code) => code.toLowerCase().split('-')[0] === language) ?? null;
}

/**
 * The language tags of an `Accept-Language` header, most wanted first: sorted by q-value, ties
 * kept in the order sent. `*` and anything refused with `q=0` are dropped.
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (header === null || header === undefined) return [];
  return header
    .split(',')
    .map((part, index) => {
      const [rawTag = '', ...params] = part.split(';');
      const qParam = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
      const parsed = qParam === undefined ? 1 : Number.parseFloat(qParam.slice(2));
      const quality = Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0;
      return { tag: rawTag.trim(), quality, index };
    })
    .filter((entry) => entry.tag !== '' && entry.tag !== '*' && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((entry) => entry.tag);
}

export interface LocaleSignals {
  /** The locale segment of the address, when the page was opened at `/<locale>`. */
  readonly pathLocale?: string | null | undefined;
  /** The value of the `cp_locale` cookie. */
  readonly cookieLocale?: string | null | undefined;
  /** The raw `Accept-Language` request header. */
  readonly acceptLanguage?: string | null | undefined;
}

export function negotiateLocale(signals: LocaleSignals): NegotiatedLocale {
  const fromPath = exactLocale(signals.pathLocale);
  if (fromPath !== null) return { locale: fromPath, source: 'path' };

  const fromCookie = exactLocale(signals.cookieLocale);
  if (fromCookie !== null) return { locale: fromCookie, source: 'cookie' };

  for (const tag of parseAcceptLanguage(signals.acceptLanguage)) {
    const matched = matchLanguageTag(tag);
    if (matched !== null) return { locale: matched, source: 'header' };
  }
  return { locale: DEFAULT_LOCALE, source: 'default' };
}
