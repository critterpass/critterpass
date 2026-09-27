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
