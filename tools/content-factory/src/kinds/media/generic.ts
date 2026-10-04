/**
 * Generic stock for a place with no photo of its own: when its name says what it serves or is (a
 * dish, a coffee, a craft-beer bar, a restaurant, a beach), a stock photo of that thing, which the app labels as
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
  /** The destinations it applies to, when the picture is a local thing (a phin of coffee). */
  readonly destinations?: readonly string[];
}

const DISHES = ['food', 'other'];
const DRINKS = ['food', 'nightlife', 'other'];
const VIETNAM = ['da-nang'];

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
const only = (entry: Entry, destinations: readonly string[]): Entry => ({ ...entry, destinations });

/**
 * First match wins, so the specific dishes come before the general words. A phrase with marks
 * matches only the marked name (phở is soup, phố is a street; lẩu is hot pot, lầu a floor); an
 * unmarked one matches the name with its marks dropped; a Japanese one matches anywhere in the
 * name, which has no spaces.
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
  dish(['babi guling'], 'babi-guling', 'babi guling balinese roast pork'),
  dish(['betutu'], 'betutu', 'balinese chicken rice dish'),
  dish(['nasi campur', 'nasi goreng', 'nasi'], 'nasi', 'nasi campur indonesian rice'),
  dish(['sate', 'satay'], 'satay', 'satay skewers'),
  dish(['ラーメン', 'ramen'], 'ramen', 'ramen bowl'),
  dish(['うどん', 'udon'], 'udon', 'udon noodles'),
  dish(['そば', '蕎麦', 'soba'], 'soba', 'soba noodles'),
  dish(['焼肉', 'yakiniku'], 'yakiniku', 'japanese yakiniku grilled beef'),
  dish(['すき焼き', 'sukiyaki'], 'sukiyaki', 'sukiyaki hot pot'),
  dish(['餃子', 'gyoza'], 'gyoza', 'gyoza dumplings'),
  dish(['天ぷら', 'tempura'], 'tempura', 'tempura'),
  dish(['とうふ', '豆腐', 'tofu'], 'tofu', 'japanese tofu dish'),
  dish(['おばんざい', '京料理', '懐石', 'kaiseki'], 'kaiseki', 'kaiseki japanese cuisine'),
  drink(['tea ceremony', '茶室'], 'tea-ceremony', 'japanese tea ceremony'),
  drink(
    ['抹茶', '茶寮', '茶房', '茶舗', '茶屋', '茶庵', 'matcha', 'hojicha'],
    'matcha',
    'matcha green tea',
  ),
  drink(['酒造', '酒蔵', '日本酒', 'sake'], 'sake', 'japanese sake cups'),
  dish(['だんご', '団子', '八ツ橋', '菓寮', 'wagashi'], 'wagashi', 'japanese sweets wagashi'),
  dish(['taco', 'tacos', 'taqueria'], 'tacos', 'tacos'),
  dish(['ceviche', 'cevicheria'], 'ceviche', 'ceviche'),
  dish(['picanteria'], 'peruvian', 'peruvian food'),
  dish(['churros', 'churreria'], 'churros', 'churros'),
  dish(['chocolate', 'chocolates', 'chocolateria'], 'chocolate', 'chocolate pieces'),
  dish(['tapas', 'taberna', 'tasca'], 'tapas', 'tapas'),
  dish(['hot dog', 'pylsur'], 'hot-dog', 'hot dog'),
  dish(['curry', 'indian'], 'curry', 'indian curry'),
  dish(['pasta', 'trattoria', 'osteria'], 'pasta', 'pasta dish'),
  dish(['breakfast', 'brunch'], 'brunch', 'brunch table'),
  dish(
    [
      ...['hai san', 'seafood', 'mariscos', 'marisqueria', 'marisqueira', 'peixe', 'peixaria'],
      ...['pescado', 'fish', 'lobster', 'ikan', 'bacalhau'],
    ],
    'seafood',
    'grilled seafood platter',
  ),
  dish(
    ['kem', 'gelato', 'ice cream', 'helados', 'heladeria', 'gelateria', 'gelados', 'ís'],
    'ice-cream',
    'gelato ice cream',
  ),
  dish(['bagel', 'bagels'], 'bagels', 'bagels'),
  dish(['pizza', 'pizzeria'], 'pizza', 'pizza'),
  dish(['burger', 'burgers', 'hamburgueria'], 'burger', 'burger'),
  dish(['sushi', '寿司', '鮨', 'すし'], 'sushi', 'sushi'),
  dish(['steak', 'steakhouse'], 'steak', 'steak dinner'),
  dish(['nướng', 'bbq', 'grill', 'barbacoa', 'parrilla', 'asador'], 'barbecue', 'barbecue grill'),
  dish(['chay', 'vegan', 'vegetarian'], 'vegan', 'vegan food bowl'),
  dish(
    [
      ...['bakery', 'banh ngot', 'panaderia', 'pasteleria', 'pastelaria', 'confeitaria'],
      ...['padaria', 'patisserie', 'boulangerie', 'bakari'],
    ],
    'bakery',
    'bakery pastries',
  ),
  dish(['chè'], 'che', 'vietnamese che dessert'),
  drink(['tra sua', 'bubble tea', 'milk tea'], 'bubble-tea', 'bubble tea'),
  only(drink(['ca phe', 'cafe', 'coffee'], 'coffee', 'vietnamese coffee phin'), VIETNAM),
  drink(
    [
      ...['cafe', 'coffee', 'caffe', 'cafeteria', 'kaffi', 'kaffihus', 'kopi', 'roasters'],
      ...['espresso', '珈琲', 'コーヒー', 'カフェ', '喫茶'],
    ],
    'coffee-cup',
    'cup of coffee on cafe table',
  ),
  drink(['tea', 'teahouse'], 'tea', 'teapot and cup of tea'),
  only(dish(['lẩu', 'hot pot', 'hotpot'], 'hot-pot', 'vietnamese hot pot'), VIETNAM),
  dish(['hot pot', 'hotpot'], 'hot-pot-table', 'hot pot'),
  dish(['noodle', 'noodles'], 'noodles', 'noodle soup bowl'),
  drink(['beach club', 'beach bar', 'beach lounge'], 'beach-bar', 'beach bar sunset'),
  drink(
    [
      ...['brewing', 'brewery', 'craft beer', 'beer', 'bia', 'cerveceria', 'cervejaria'],
      ...['cerveza', 'cervejeira', 'brewpub', 'taproom', 'brugghus'],
    ],
    'craft-beer',
    'craft beer glasses',
  ),
  drink(['pisco'], 'pisco', 'pisco sour cocktail'),
  drink(['mezcal', 'mezcaleria', 'tequila', 'tequileria'], 'mezcal', 'mezcal shot glasses'),
  drink(['cocktail', 'cocktails', 'speakeasy'], 'cocktails', 'cocktail bar drinks'),
  drink(['whisky', 'whiskey'], 'whisky', 'whisky glass'),
  drink(['wine', 'vinho', 'vino', 'vinos', 'garrafeira'], 'wine', 'wine bar glasses'),
  drink(['rooftop', 'roof', 'sky bar'], 'rooftop-bar', 'rooftop bar night city'),
  {
    phrases: ['nightclub', 'club', 'discotheque', 'disco'],
    key: 'nightclub',
    query: 'nightclub dance floor lights',
    categories: ['nightlife'],
  },
  drink(['pub'], 'pub', 'pub interior'),
  drink(['bar', 'lounge', 'cantina', 'pulqueria', 'barinn'], 'bar', 'bar counter drinks'),
  dish(['warung'], 'warung', 'indonesian food plate'),
  dish(
    [
      ...['restaurant', 'restaurante', 'restoran', 'resto', 'restobar', 'bistro', 'kitchen'],
      ...['cuisine', 'cocina', 'eatery', 'dining'],
    ],
    'restaurant',
    'restaurant table setting',
  ),
  {
    phrases: ['bai bien', 'beach', 'praia', 'playa', 'pantai'],
    key: 'beach',
    query: 'tropical sandy beach',
    categories: ['beach'],
    destinations: ['da-nang', 'bali'],
  },
  {
    phrases: ['beach', 'praia', 'playa'],
    key: 'beach-shore',
    query: 'sandy beach waves',
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

const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** The generic subject a place's photo may show, or null when it may only show itself. */
export function genericSubjectFor(place: {
  readonly name: string;
  readonly category: string;
  readonly destination?: string;
}): GenericSubject | null {
  if (!GENERIC_CATEGORIES.has(place.category)) return null;
  const plain = ` ${words(place.name).join(' ')} `;
  const withMarks = ` ${marked(place.name)} `;
  const has = (phrase: string) => {
    if (JAPANESE.test(phrase)) return place.name.includes(phrase);
    return (/^[a-z ]+$/u.test(phrase) ? plain : withMarks).includes(` ${phrase} `);
  };
  for (const entry of ENTRIES) {
    if (!entry.categories.includes(place.category)) continue;
    if (entry.destinations !== undefined && !entry.destinations.includes(place.destination ?? '')) {
      continue;
    }
    if (entry.phrases.some(has)) {
      return { key: entry.key, query: entry.query };
    }
  }
  return null;
}

export function isGenericTitle(title: string | null): boolean {
  return title?.startsWith(GENERIC_TITLE) === true;
}
