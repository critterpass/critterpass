/**
 * Generic stock for a place with no photo of its own: when its name says what it serves or is (a
 * dish, a coffee, a craft-beer bar, a beach), a stock photo of that thing, which the app labels as
 * not this place. Landmarks never get one (temples, museums, nature, markets, transport, stays and
 * hospitals keep their category's doodle), and neither does a place whose name says nothing
 * generic: a stock picture is only ever of the kind of thing, never of the named place.
 */
import { words } from './place-match';

/** Places that may show a labelled generic photo; every other category is a landmark or service. */
const GENERIC_CATEGORIES = new Set(['food', 'nightlife', 'other', 'beach']);

/** Marks a generic stock item, in its title, for the reviewer and the release validators. */
export const GENERIC_TITLE = 'Generic, not this place: ';

export interface GenericSubject {
  /** Stable key of the thing shown (`banh-xeo`). */
  readonly key: string;
  /** The stock search for it. */
  readonly query: string;
}

interface Entry {
  readonly phrases: readonly string[];
  readonly key: string;
  readonly query: string;
  /** The categories it applies to (a bare "beach" names a beach only in the beach category). */
  readonly categories: readonly string[];
}

const DISHES = ['food', 'other'];
const DRINKS = ['food', 'nightlife', 'other'];

const dish = (phrases: readonly string[], key: string, query: string): Entry => ({
  phrases,
  key,
  query,
  categories: DISHES,
});
const drink = (phrases: readonly string[], key: string, query: string): Entry => ({
  phrases,
  key,
  query,
  categories: DRINKS,
});

/**
 * First match wins, so the specific dishes come before the general words. A phrase with Vietnamese
 * marks matches only the marked name (phở is soup, phố is a street; lẩu is hot pot, lầu a floor);
 * an unmarked one matches the name with its marks dropped.
 */
const ENTRIES: readonly Entry[] = [
  drink(['cà phê trứng', 'ca phe trung', 'egg coffee'], 'egg-coffee', 'vietnamese egg coffee'),
  dish(['banh xeo'], 'banh-xeo', 'banh xeo vietnamese pancake'),
  dish(['mi quang'], 'mi-quang', 'mi quang noodles'),
  dish(['bun cha ca'], 'bun-cha-ca', 'vietnamese fish cake noodle soup'),
  dish(['bun cha'], 'bun-cha', 'bun cha'),
  dish(['bun bo'], 'bun-bo', 'bun bo hue'),
  dish(['cao lau'], 'cao-lau', 'cao lau noodles'),
  dish(['bun thit nuong'], 'bun-thit-nuong', 'bun thit nuong'),
  dish(['bun mam'], 'bun-mam', 'vietnamese vermicelli with fermented fish sauce'),
  dish(['banh beo'], 'banh-beo', 'banh beo steamed rice cakes'),
  dish(['banh canh'], 'banh-canh', 'banh canh noodle soup'),
  dish(['phở'], 'pho', 'pho noodle soup'),
  dish(['banh mi'], 'banh-mi', 'banh mi sandwich'),
  dish(['com ga'], 'com-ga', 'vietnamese chicken rice'),
  dish(['nem nuong', 'nem lui'], 'nem-nuong', 'vietnamese grilled pork skewers'),
  dish(['banh trang'], 'banh-trang', 'vietnamese rice paper rolls'),
  dish(['bo ne'], 'bo-ne', 'vietnamese beef steak egg skillet'),
  dish(['hai san', 'seafood'], 'seafood', 'grilled seafood platter'),
  dish(['kem', 'gelato', 'ice cream'], 'ice-cream', 'gelato ice cream'),
  dish(['bagel', 'bagels'], 'bagels', 'bagels'),
  dish(['pizza', 'pizzeria'], 'pizza', 'pizza'),
  dish(['burger', 'burgers'], 'burger', 'burger'),
  dish(['sushi'], 'sushi', 'sushi'),
  dish(['steak', 'steakhouse'], 'steak', 'steak dinner'),
  dish(['nướng', 'bbq', 'grill'], 'barbecue', 'barbecue grill'),
  dish(['chay', 'vegan', 'vegetarian'], 'vegan', 'vegan food bowl'),
  dish(['bakery', 'banh ngot'], 'bakery', 'bakery pastries'),
  dish(['chè'], 'che', 'vietnamese che dessert'),
  drink(['tra sua', 'bubble tea', 'milk tea'], 'bubble-tea', 'bubble tea'),
  drink(['ca phe', 'cafe', 'coffee'], 'coffee', 'vietnamese coffee phin'),
  dish(['lẩu', 'hot pot', 'hotpot'], 'hot-pot', 'vietnamese hot pot'),
  drink(['beach club', 'beach bar', 'beach lounge'], 'beach-bar', 'beach bar sunset'),
  drink(['brewing', 'brewery', 'craft beer', 'beer', 'bia'], 'craft-beer', 'craft beer glasses'),
  drink(['cocktail', 'cocktails'], 'cocktails', 'cocktail bar drinks'),
  drink(['wine'], 'wine', 'wine bar glasses'),
  drink(['rooftop', 'roof', 'sky bar'], 'rooftop-bar', 'rooftop bar night city'),
  drink(['pub'], 'pub', 'pub interior'),
  drink(['bar', 'lounge'], 'bar', 'bar counter drinks'),
  {
    phrases: ['bai bien', 'beach'],
    key: 'beach',
    query: 'tropical sandy beach',
    categories: ['beach'],
  },
];

/** The name in lower case with its Vietnamese marks, words separated by single spaces. */
function marked(name: string): string {
  return name
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** The generic subject a place's photo may show, or null when it may only show itself. */
export function genericSubjectFor(place: {
  readonly name: string;
  readonly category: string;
}): GenericSubject | null {
  if (!GENERIC_CATEGORIES.has(place.category)) return null;
  const plain = ` ${words(place.name).join(' ')} `;
  const withMarks = ` ${marked(place.name)} `;
  const has = (phrase: string) =>
    (/^[a-z ]+$/u.test(phrase) ? plain : withMarks).includes(` ${phrase} `);
  for (const entry of ENTRIES) {
    if (!entry.categories.includes(place.category)) continue;
    if (entry.phrases.some(has)) {
      return { key: entry.key, query: entry.query };
    }
  }
  return null;
}

export function isGenericTitle(title: string | null): boolean {
  return title?.startsWith(GENERIC_TITLE) === true;
}
