/**
 * A curated place's full name, made comparable with a row's names (`curated-name-rules`). Two
 * names are the same full name when they hold the same telling words in any order: accents, case,
 * joining words and the destination's own words aside, and these ways of writing one word or name
 * read as one:
 *
 * - British and American spellings ("centre", "center": "Maxwell Food Center").
 * - Vietnamese "y" after a consonant, which is also written "i" ("Mỳ Quảng" is "Mì Quảng").
 * - An elided article ("L'Edelweiss" is Edelweiss).
 * - A Vietnamese eatery's or site's head words ("Quán", "Nhà hàng", "Khu di tích"): signs and
 *   open data write them or leave them out ("Quán Nem Nướng Bảy Gành" is "Nem nướng Bảy Gành"),
 *   so a name is also read without them when two words or more are left.
 * - A name written with or without spaces, apostrophes or hyphens ("fatCUPID", "Warehouse 421",
 *   "Koʻkaldosh", "薬研堀 八昌"): the same letters in the same order.
 *
 * The researcher's point is often kilometres off on a small town's map, so a row further than the
 * same-name radius may still be the place (`farNamed`): one carrying a full name of two words or
 * more that says which place it is, not only what kind (`GENERIC`: "Night Market", "Mercado
 * Central" are in every town), within `FAR_NAME_RADIUS_M`, and only when no row of that name
 * stands elsewhere (two rows more than `SAME_PLACE_APART_M` apart are two places: a chain's
 * branches, a common temple name).
 */
import type { CuratedLead, MatchCandidate } from './curated-name-rules';
import { nameAliases, nameTokens, namingWords, tellingWords } from './place-names';
import { metresBetween } from './same-place';

/** Furthest a row carrying the place's full name may stand from the researcher's point. */
export const FAR_NAME_RADIUS_M = 10_000;
/** How far rows of the same name are looked for, to tell one place from a chain. */
export const NAMESAKE_RADIUS_M = 2 * FAR_NAME_RADIUS_M;
/** Rows of one name further apart than this are different places. */
export const SAME_PLACE_APART_M = 500;

/** British and American spellings of one word, read as one ("Maxwell Food Center"). */
export const SPELLING: Readonly<Record<string, string>> = {
  centre: 'center',
  theatre: 'theater',
  harbour: 'harbor',
  neighbourhood: 'neighborhood',
  colour: 'color',
};

/** A Vietnamese syllable ending in "y" after a consonant, also written with "i". */
const VIETNAMESE_Y = /^(?:[bcdghklmnpqrstvx]|ch|gh|kh|ng|nh|ph|th|tr)y$/u;
/** Elided articles, as `nameTokens` splits them off ("l'", "d'"). */
const ELIDED: ReadonlySet<string> = new Set(['l', 'd']);
/** Vietnamese head words of an eatery or a site, longest first (as `nameTokens` writes them). */
const HEADS: readonly (readonly string[])[] = [
  ['khu', 'di', 'tich', 'lich', 'su'],
  ['khu', 'di', 'tich'],
  ['khu', 'du', 'lich'],
  ['di', 'tich'],
  ['nha', 'hang'],
  ['quan', 'an'],
  ['quan'],
  ['tiem'],
];

/**
 * Words that say what kind of place a name is, not which (as `nameTokens` writes them): a full
 * name of only these ("Night Market", "Chợ đêm", "Playa Central") is in many towns.
 */
const GENERIC: ReadonlySet<string> = new Set(
  [
    // English
    'the night market food street road lane alley avenue square plaza beach bay island islet',
    'temple pagoda church cathedral mosque shrine monastery museum gallery park garden lake river',
    'waterfall fall cave grotto hill mountain mount peak pas valley bridge tower palace fort',
    'fortres castle old town city village quarter cafe coffee tea restaurant bar pub seafood',
    'noodle house hall hotel center mall station pier port harbor viewpoint lookout national',
    'central grand royal great new main big little small north south east west upper lower sea',
    'ocean point cape field forest farm spring hot pool lagoon dam reservoir ruin tomb memorial',
    'monument cemetery theater cinema club lounge kitchen grill bakery shop store craft art',
    'flower fish rice sand dune white red black blue green golden pink',
    // Vietnamese
    'cho dem pho duong ngo hem bai bien tam chua den dinh mieu nha tho ho song suoi thac dong',
    'hang nui doi deo thung lung cau thap quan ca phe tra hai san bun com banh mi lau oc lang',
    'ban khu di tich du lich cong vien bao tang quang truong dao hon mui cang ben vuon rung tiem',
    // Other languages travellers meet often
    'mercado playa praia plage spiaggia strand iglesia igreja eglise chiesa kirche museo museu',
    'musee praca piazza place platz calle rua rue via strasse parque parc parco jardin centro',
    'viejo vieja nuevo nueva casa castillo castello fuerte puerto porto lago rio cascada cerro',
    'monte mirador restaurante ristorante cafeteria bodega taberna la el lo la le de del da do',
    'di san santa santo sao saint st wat ko koh khao soi thanon talat jalan pantai pura pasar',
    'masjid gunung danau pulau kampung souq souk bazaar',
  ]
    .join(' ')
    .split(' '),
);

/** One word as full names compare it (see the file header). */
function foldWord(word: string): string {
  const bare = word.replace(/\p{Lm}+/gu, '');
  const spelled = SPELLING[bare] ?? bare;
  return VIETNAMESE_Y.test(spelled) ? `${spelled.slice(0, -1)}i` : spelled;
}

function withoutHead(tokens: readonly string[]): string[] | null {
  for (const head of HEADS) {
    if (tokens.length - head.length < 2) continue;
    if (head.every((word, i) => tokens[i] === word)) return tokens.slice(head.length);
  }
  return null;
}

interface FullName {
  /** The telling naming words in any order (see the file header). */
  readonly key: string;
  /** The same words in their order without spaces, for names written joined. */
  readonly letters: string;
  /** How many telling words the name is written with, joining words counted. */
  readonly words: number;
  /** How many of them name something (joining words such as "the" aside). */
  readonly naming: number;
  /** Whether a word of it says which place it is, not only what kind (`GENERIC`). */
  readonly telling: boolean;
}

function fullName(tokens: readonly string[], plain: ReadonlySet<string>): FullName {
  const kept = tokens.filter((token) => !ELIDED.has(token));
  const ordered = tellingWords(namingWords(kept), plain).map(foldWord);
  return {
    key: [...ordered].sort().join(' '),
    letters: tellingWords(kept, plain).map(foldWord).join(''),
    words: tellingWords(kept, plain).length,
    naming: ordered.length,
    telling: ordered.some((word) => !GENERIC.has(word)),
  };
}

/** A name read whole, as each name it carries and without a Vietnamese head word. */
function fullNames(name: string | null, plain: ReadonlySet<string>): FullName[] {
  if (name === null) return [];
  const readings = [nameTokens(name), ...nameAliases(name).primary];
  return [...readings, ...readings.map(withoutHead).filter((tokens) => tokens !== null)]
    .map((tokens) => fullName(tokens, plain))
    .filter((full) => full.key !== '');
}

/**
 * How many words the full name one of the row's names shares with one of the place's names
 * (the shorter of the two as written; for names written joined, the spaced one), or 0 when none
 * is the same. `telling` counts only a name that says which place it is (`GENERIC`), and only
 * its naming words ("The Barai" is one).
 */
export function sharedFullNameWords(
  lead: CuratedLead,
  row: MatchCandidate,
  plain: ReadonlySet<string>,
  rowName: string,
  telling = false,
): number {
  const wanted = [...fullNames(lead.name, plain), ...fullNames(lead.localName, plain)];
  const theirs = [...fullNames(rowName, plain), ...fullNames(row.nameLocal, plain)];
  let best = 0;
  const count = (name: FullName) => (telling ? name.naming : name.words);
  for (const ours of wanted) {
    if (telling && !ours.telling) continue;
    for (const name of theirs) {
      if (ours.key === name.key) best = Math.max(best, Math.min(count(ours), count(name)));
      else if (ours.letters === name.letters && ours.letters.length >= 5) {
        best = Math.max(best, count(ours), count(name));
      }
    }
  }
  return best;
}

/**
 * The rows that may be the place by their full name from afar (see the file header): those of
 * its full name when the nearest lies within `FAR_NAME_RADIUS_M` and none stands elsewhere, else
 * none. Pass every row of the name out to `NAMESAKE_RADIUS_M`, so a chain's branch is seen as
 * one. `named` gives a row's telling full name words (`sharedFullNameWords` with `telling`).
 */
export function farNamed<
  T extends { readonly distanceM: number; readonly lat: number; readonly lng: number },
>(rows: readonly T[], named: (row: T) => number): T[] {
  const same = rows.filter((row) => named(row) >= 2).sort((a, b) => a.distanceM - b.distanceM);
  const [first] = same;
  if (first === undefined || first.distanceM > FAR_NAME_RADIUS_M) return [];
  const apart = same.some((row) => metresBetween(row, first) > SAME_PLACE_APART_M);
  return apart ? [] : same;
}
