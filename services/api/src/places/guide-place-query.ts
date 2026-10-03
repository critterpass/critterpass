/**
 * How the guide's place search reads a name as a traveller types it ("Khách sạn avatar đà nẵng",
 * "ks avatar", "avatar hotel"): accents folded the way `unaccent` folds them for `pois.fts`, the
 * destination's own name dropped, and words that only say what kind of place it is ("khách sạn",
 * "hotel") turned into a category hint instead of words the name must contain. What is left becomes
 * prefix tsqueries over `fts`: every word (an exact match, any order) or any word (the closest
 * names, offered when nothing matches exactly).
 */
import type { PoiCategory } from '@cp/domain';

/** Lowercase, without diacritics: the folding `app.unaccent_immutable` gives `pois.fts`. */
export function foldAccents(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/gu, 'd').toLowerCase();
}

/** Kind-of-place words, folded, longest first so "khach san" wins over "san". */
const KIND_WORDS: readonly (readonly [string, PoiCategory])[] = [
  ['khach san', 'stay'],
  ['nha nghi', 'stay'],
  ['homestay', 'stay'],
  ['hostel', 'stay'],
  ['resort', 'stay'],
  ['hotel', 'stay'],
  ['ks', 'stay'],
  ['nha hang', 'food'],
  ['restaurant', 'food'],
  ['quan an', 'food'],
];

/** Words that only point at the city ("thành phố", "tp") rather than a place in it. */
const CITY_WORDS = ['thanh pho', 'tp', 'city'];

export interface GuidePlaceQuery {
  /** Folded words the name must hold, in the order typed. */
  readonly words: readonly string[];
  /** The kind the typed words named ("khách sạn" → stay), ranked first. */
  readonly kind: PoiCategory | undefined;
  /** Every word, as prefixes (`avatar:* & hoi:*`); null when no word is left. */
  readonly all: string | null;
  /** Any word, as prefixes (`avatar:* | hoi:*`); null when no word is left. */
  readonly any: string | null;
}

function words(text: string): string[] {
  return foldAccents(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');
}

export function parseGuidePlaceQuery(
  text: string,
  destinationName: string | null | undefined,
): GuidePlaceQuery {
  let folded = ` ${words(text).join(' ')} `;
  let kind: PoiCategory | undefined;
  for (const [phrase, category] of KIND_WORDS) {
    if (!folded.includes(` ${phrase} `)) continue;
    kind ??= category;
    folded = folded.replaceAll(` ${phrase} `, ' ');
  }
  const city = words(destinationName ?? '');
  // "đà nẵng" and "danang" both name the city.
  const cityPhrases = city.length === 0 ? [] : [city.join(' '), city.join('')];
  for (const phrase of [...cityPhrases, ...CITY_WORDS])
    folded = folded.replaceAll(` ${phrase} `, ' ');
  // Split on anything but letters and digits above, so no typed character can reach the tsquery.
  const unique = [...new Set(folded.split(' ').filter((word) => word.length > 1))];
  const prefixes = unique.map((word) => `${word}:*`);
  return {
    words: unique,
    kind,
    all: prefixes.length === 0 ? null : prefixes.join(' & '),
    any: prefixes.length === 0 ? null : prefixes.join(' | '),
  };
}
