/**
 * One way to read a country, whichever way it was stored. The catalogue's place rows carry
 * English names ("Vietnam"); the home airport, the device geocoder and the content index carry
 * ISO 3166-1 alpha-2 codes ("VN"). Countries are compared as codes only: read both sides through
 * `toCountryCode` (or `isSameCountry`) at the boundary, never string against string.
 */
import { COUNTRY_NAMES } from './country-names';

/** Long or older forms the name table does not carry under that spelling. */
const NAME_ALIASES: Readonly<Record<string, string>> = {
  'czech republic': 'CZ',
  'great britain': 'GB',
  turkey: 'TR',
  'united kingdom': 'GB',
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  'viet nam': 'VN',
};

/** Lowercase, diacritics stripped, punctuation variants levelled ("Côte d’Ivoire" → "cote d'ivoire"). */
function foldName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[’`]/gu, "'")
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

let codesByName: ReadonlyMap<string, string> | null = null;

function nameIndex(): ReadonlyMap<string, string> {
  codesByName ??= new Map([
    ...Object.entries(COUNTRY_NAMES).map(([code, name]) => [foldName(name), code] as const),
    ...Object.entries(NAME_ALIASES),
  ]);
  return codesByName;
}

/**
 * The ISO 3166-1 alpha-2 code of a country given as a code (any case) or an English name; null
 * when it is missing or names no country we know, so an unreadable value is "unknown", never a
 * string that silently fails to match.
 */
export function toCountryCode(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = value.trim();
  // Names first: the table's short names "UK" and "US" look like codes, and "UK" is not one.
  const named = nameIndex().get(foldName(text));
  if (named !== undefined) return named;
  return /^[A-Za-z]{2}$/u.test(text) ? text.toUpperCase() : null;
}

/** Both sides name the same country; false when either is unknown. */
export function isSameCountry(a: string | null | undefined, b: string | null | undefined): boolean {
  const code = toCountryCode(a);
  return code !== null && code === toCountryCode(b);
}
