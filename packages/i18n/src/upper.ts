/**
 * Locale-aware uppercase transform for the design's all-caps chips/labels (design-system.md §6
 * "Casing"). Strings are authored sentence case in catalogs; this is applied at render time.
 *
 * `String.prototype.toLocaleUpperCase` already gives the Turkish dotted İ and drops Greek accents
 * per its own Unicode case-mapping data (verified against both: plain `toUpperCase` keeps the Greek
 * accent and gives the Turkish dotless I that this rule is meant to avoid); German ß→SS is the
 * Unicode default and needs no locale argument. CJK/Thai/Korean have no case distinction at all
 * (design-system.md's own display rule for those scripts is a non-condensed heavy face instead of
 * an uppercase transform), so this returns the input unchanged for those languages even when it
 * contains embedded Latin text, rather than uppercasing only the Latin substrings.
 */

const NO_CASE_LANGUAGES = new Set(['zh', 'ja', 'ko', 'th']);

export function upper(text: string, locale: string): string {
  const primaryLanguage = locale.split(/[-_]/, 1)[0]?.toLowerCase() ?? '';
  if (NO_CASE_LANGUAGES.has(primaryLanguage)) return text;
  return text.toLocaleUpperCase(locale);
}

/**
 * Currency symbols written in mixed or lower case (Rp, kr, zł, Kč, Ft, lei, лв): they are part of
 * an amount, not a word, so an all-caps display style leaves them as written ("Rp 450.000", never
 * "RP 450.000"). A symbol only counts as one when it stands alone or sits next to the number.
 */
const CURRENCY_SYMBOL =
  /(?<![\p{L}])(Rp|kr|zł|Kč|Ft|lei|лв)(?=$|[\s\u00a0\u202f]*[\d.,\-−]|[\s\u00a0\u202f]*$)/gu;

/** `upper`, keeping mixed-case currency symbols of amounts as written. */
export function upperKeepingCurrency(text: string, locale: string): string {
  let out = '';
  let last = 0;
  for (const match of text.matchAll(CURRENCY_SYMBOL)) {
    const at = match.index;
    out += upper(text.slice(last, at), locale) + match[0];
    last = at + match[0].length;
  }
  return out + upper(text.slice(last), locale);
}
