/**
 * Shared `Intl` formatters. Building one crosses into ICU (slow on Android), and a formatter is
 * immutable once built, so each locale and option set is built once and reused by every caller.
 */

const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();
const numberFormats = new Map<string, Intl.NumberFormat>();
const relativeTimeFormats = new Map<string, Intl.RelativeTimeFormat>();
const listFormats = new Map<string, Intl.ListFormat>();

/** Option sets are small and finite; the bound only guards against a caller with unbounded keys. */
const MAX_PER_KIND = 500;

/** The same key for the same options whatever order they were written in; `undefined` values are dropped. */
function keyOf(locale: string, options: object | undefined): string {
  if (options === undefined) return locale;
  const entries = Object.entries(options)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${locale}|${JSON.stringify(entries)}`;
}

function cached<T>(cache: Map<string, T>, key: string, build: () => T): T {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const built = build();
  if (cache.size >= MAX_PER_KIND) cache.clear();
  cache.set(key, built);
  return built;
}

/**
 * A formatter with no zone of its own writes in the device's zone as it was when built, so its key
 * carries the device's offset: a phone that lands in another zone gets a formatter for that zone.
 */
export function dateTimeFormat(
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = keyOf(locale, options);
  return cached(
    dateTimeFormats,
    options?.timeZone === undefined ? `${key}@${new Date().getTimezoneOffset()}` : key,
    () => new Intl.DateTimeFormat(locale, options),
  );
}

export function numberFormat(
  locale: string,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  return cached(
    numberFormats,
    keyOf(locale, options),
    () => new Intl.NumberFormat(locale, options),
  );
}

export function relativeTimeFormat(
  locale: string,
  options?: Intl.RelativeTimeFormatOptions,
): Intl.RelativeTimeFormat {
  return cached(
    relativeTimeFormats,
    keyOf(locale, options),
    () => new Intl.RelativeTimeFormat(locale, options),
  );
}

export function listFormat(locale: string, options?: Intl.ListFormatOptions): Intl.ListFormat {
  return cached(listFormats, keyOf(locale, options), () => new Intl.ListFormat(locale, options));
}

/** Drops every cached formatter, for a runtime whose `Intl` was swapped underneath (tests). */
export function clearFormatterCache(): void {
  dateTimeFormats.clear();
  numberFormats.clear();
  relativeTimeFormats.clear();
  listFormats.clear();
}
