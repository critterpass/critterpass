/**
 * The words of day titles: what a kind of place a title names must be for the day to hold one
 * ("market", "chùa", "cà phê"), the words that name a place without saying which, and the place
 * names of the destination as titles are checked against them.
 */
import { foodRole, nameTokens, type DraftPoi } from '@cp/planner';

import type { DraftPlanInput } from './context';

/** Whether a stop (its place and the words of its name) is the kind of place a title word means. */
type Holds = (poi: DraftPoi, words: ReadonlySet<string>) => boolean;
const category =
  (...kinds: string[]): Holds =>
  (poi) =>
    kinds.includes(poi.category);
const named =
  (...words: string[]): Holds =>
  (_, own) =>
    words.some((word) => own.has(word));
const either =
  (...tests: Holds[]): Holds =>
  (poi, own) =>
    tests.some((test) => test(poi, own));
const church: Holds = (_, own) =>
  own.has('church') || own.has('cathedral') || (own.has('nha') && own.has('tho'));

/** Words a title uses for a kind of place, and what a stop must be for the day to hold one. */
export const KINDS: Readonly<Record<string, Holds>> = {
  temple: (poi, own) => poi.category === 'temple_shrine' && !church(poi, own),
  pagoda: (poi, own) => poi.category === 'temple_shrine' && !church(poi, own),
  shrine: category('temple_shrine'),
  church,
  market: either(category('market'), named('market', 'cho', 'pasar')),
  beach: either(category('beach'), named('beach', 'bai', 'pantai')),
  museum: either(category('museum'), named('museum')),
  waterfall: named('waterfall', 'fall', 'thac'),
  fall: named('waterfall', 'fall', 'thac'),
  lake: named('lake', 'ho', 'danau'),
  station: named('station', 'ga'),
  garden: named('garden', 'vuon', 'taman'),
  bar: either(category('nightlife'), named('bar', 'pub')),
  cocktail: category('nightlife'),
  nightlife: category('nightlife'),
  coffee: (poi) => foodRole(poi) === 'light',
  cafe: (poi) => foodRole(poi) === 'light',
  show: named('show', 'theatre', 'theater'),
  terrace: named('terrace'),
  forest: named('forest', 'rung'),
  // The same in Vietnamese, as a title in the organiser's language writes them.
  ho: named('lake', 'ho'),
  chua: (poi, own) => poi.category === 'temple_shrine' && !church(poi, own),
  cho: either(category('market'), named('market', 'cho')),
  // "cà phê": "ca" alone is too many other words.
  phe: (poi) => foodRole(poi) === 'light',
  thac: named('waterfall', 'fall', 'thac'),
};

/** Words of a place name that say what it is, not which: a title naming only these names none. */
export const COMMON: ReadonlySet<string> = new Set(
  'the and old town ancient park hill peninsula mountain island bridge street pho ban dao nui bien cau khu lich'.split(
    ' ',
  ),
);

const PLACE_WORDS = new WeakMap<object, ReadonlyMap<string, number>>();

/** Every word of every place name we know here, with how many places carry it. */
export function placeWords(input: Pick<DraftPlanInput, 'pois'>): ReadonlyMap<string, number> {
  const known = PLACE_WORDS.get(input.pois);
  if (known !== undefined) return known;
  const words = new Map<string, number>();
  for (const poi of input.pois.values()) {
    for (const word of new Set(nameTokens(`${poi.name} ${poi.nameLocal ?? ''}`))) {
      words.set(word, (words.get(word) ?? 0) + 1);
    }
  }
  PLACE_WORDS.set(input.pois, words);
  return words;
}

const STRINGS = new WeakMap<object, readonly string[]>();

/** Every place name we know here as its tokens, spaced, for phrase lookups. */
export function placeStrings(input: Pick<DraftPlanInput, 'pois'>): readonly string[] {
  const known = STRINGS.get(input.pois);
  if (known !== undefined) return known;
  const strings = [...input.pois.values()].flatMap((poi) =>
    [poi.name, poi.nameLocal ?? '']
      .filter(Boolean)
      .map((name) => ` ${nameTokens(name).join(' ')} `),
  );
  STRINGS.set(input.pois, strings);
  return strings;
}

/** Runs of two or more capitalised words in a title ("Sơn Trà" of "Sơn Trà và biển"). */
export function capitalisedRuns(words: readonly string[]): string[][] {
  const runs: string[][] = [];
  let run: string[] = [];
  for (const word of [...words, '']) {
    if (/^\p{Lu}/u.test(word)) run.push(word);
    else {
      if (run.length >= 2) runs.push(run);
      run = [];
    }
  }
  return runs;
}
