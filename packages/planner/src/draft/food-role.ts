/**
 * What a food place is for. Our place table files every place that serves anything under `food`,
 * so a coffee shop and an ice-cream stall sat on the same list as the noodle shop, and a draft
 * called a café "dinner". A place is a `meal` place (it can be the day's lunch or dinner) or a
 * `light` one (coffee, tea, dessert, a snack: a break, never a meal), read from what the row
 * carries: its tags where our editors set them, else its name, the way the pick job tells cafés
 * from eateries; a stop of twenty minutes or less is a snack whatever it sells. Eateries our set files under another kind (a roast-pork warung under nightlife)
 * count as meal places too.
 *
 * A dish is read from the names: two places whose names lead with the same two words that are not
 * generic ("mì quảng", "babi guling", "bánh căn") serve the same thing.
 */
import { nameAliases, nameTokens } from './place-names';
import type { DraftPoi } from './types';

export type FoodRole = 'meal' | 'light';

const MEAL_TAGS: ReadonlySet<string> = new Set(['sit_down_dining', 'sit_down', 'street_food']);
const SIT_DOWN: ReadonlySet<string> = new Set(['sit_down_dining', 'sit_down']);
/** A food stop our editors give this long or less is eaten standing: a break, not a meal. */
const SNACK_MAX_MIN = 20;
const LIGHT_TAGS: ReadonlySet<string> = new Set([
  'coffee',
  'cafe',
  'dessert',
  'bakery',
  'tea',
  'ice_cream',
]);

/** Name runs (accents folded) that say coffee, tea, dessert or a snack. */
const LIGHT_WORDS: readonly (readonly string[])[] = [
  ['cafe'],
  ['coffee'],
  ['caphe'],
  ['ca', 'phe'],
  ['kafe'],
  ['kopi'],
  ['roastery'],
  ['roaster'],
  ['espresso'],
  ['tea'],
  ['teahouse'],
  ['tiem', 'tra'],
  ['tra', 'sua'],
  ['kem'],
  ['gelato'],
  ['ice', 'cream'],
  ['dessert'],
  ['patisserie'],
  ['bakery'],
  ['juice'],
  ['smoothie'],
  ['sinh', 'to'],
  ['boba'],
  // Street snacks eaten standing, whatever the row says of how long a visit takes.
  ['banh', 'trang'],
  ['sua', 'chua'],
];

/** Name runs that say a kitchen cooks meals, whatever else the name says. */
const MEAL_WORDS: readonly (readonly string[])[] = [
  ['restaurant'],
  ['bistro'],
  ['kitchen'],
  ['eatery'],
  ['grill'],
  ['food'],
  ['dining'],
  ['diner'],
  ['pizza'],
  ['pizzeria'],
  ['steakhouse'],
  ['brasserie'],
  ['trattoria'],
  ['taverna'],
  ['warung'],
  ['nha', 'hang'],
];

function hasRun(tokens: readonly string[], run: readonly string[]): boolean {
  for (let at = 0; at + run.length <= tokens.length; at += 1) {
    if (run.every((word, i) => tokens[at + i] === word)) return true;
  }
  return false;
}

const ROLES = new WeakMap<DraftPoi, FoodRole | null>();

/** Whether `poi` can be a day's lunch or dinner (`meal`), is a break (`light`), or is not food. */
export function foodRole(poi: DraftPoi): FoodRole | null {
  const cached = ROLES.get(poi);
  if (cached !== undefined) return cached;
  const role = readRole(poi);
  ROLES.set(poi, role);
  return role;
}

function readRole(poi: DraftPoi): FoodRole | null {
  const tokens = nameTokens(poi.name);
  const mealTag = poi.tags.some((tag) => MEAL_TAGS.has(tag));
  const lightTag = poi.tags.some((tag) => LIGHT_TAGS.has(tag));
  const lightName = LIGHT_WORDS.some((run) => hasRun(tokens, run));
  const mealName = MEAL_WORDS.some((run) => hasRun(tokens, run));
  if (poi.category === 'food') {
    if (lightName && !mealName) return 'light';
    // Twenty minutes at a counter (a bánh mì, a sweet soup, a yoghurt) is a snack, not a dinner.
    const quick = poi.durationMin <= SNACK_MAX_MIN && !poi.tags.some((tag) => SIT_DOWN.has(tag));
    if (quick && !mealName) return 'light';
    if (mealTag || mealName) return 'meal';
    return lightTag ? 'light' : 'meal';
  }
  // An eatery filed under another kind: only where the tags say it feeds people and nothing says
  // it is a market or a sight.
  const filedAsVenue = poi.category === 'nightlife' || poi.category === 'other';
  if (filedAsVenue && mealTag && !poi.tags.includes('markets') && !lightName) return 'meal';
  return null;
}

/** How the planner schedules a stop at `poi`: only meal places are meals. */
export function stopKind(poi: DraftPoi | undefined): 'activity' | 'meal' {
  return poi !== undefined && foodRole(poi) === 'meal' ? 'meal' : 'activity';
}

/** Words every eatery's name may carry: they name no dish. */
const GENERIC: ReadonlySet<string> = new Set([
  'nha',
  'hang',
  'quan',
  'tiem',
  'an',
  'com',
  'restaurant',
  'resto',
  'warung',
  'rumah',
  'makan',
  'cafe',
  'coffee',
  'bar',
  'kitchen',
  'bistro',
  'house',
  'food',
  'street',
  'the',
  'and',
  'of',
  'la',
  'le',
  'el',
  'de',
]);

const DISHES = new WeakMap<DraftPoi, string | null>();

/**
 * The dish a place's name leads with: its first two words that are not generic ("mi quang" of
 * "Mỳ Quảng Cô Sáu", "babi guling" of "Babi Guling Ibu Oka"); null for a one-word name.
 */
export function dishOf(poi: DraftPoi): string | null {
  const cached = DISHES.get(poi);
  if (cached !== undefined) return cached;
  // One spelling for the vowel pair people write either way ("mỳ" and "mì").
  const words = (nameAliases(poi.name).primary[0] ?? [])
    .map((word) => word.replaceAll('y', 'i'))
    .filter((word) => !GENERIC.has(word) && !/^\p{Nd}+$/u.test(word));
  const dish = words.length < 2 ? null : `${words[0] as string} ${words[1] as string}`;
  DISHES.set(poi, dish);
  return dish;
}

/** Two places whose names lead with the same dish. */
export function sameDish(a: DraftPoi, b: DraftPoi): boolean {
  if (a.id === b.id) return true;
  const dish = dishOf(a);
  return dish !== null && dish === dishOf(b);
}

/**
 * Whether two places serve the same dish even when one leads its name with its own ("Chip Chip -
 * bánh căn" and "Bánh Căn Nhà Yến"): the same leading dish, or one's dish anywhere in the other's
 * name.
 */
export function sharesDish(a: DraftPoi, b: DraftPoi): boolean {
  if (sameDish(a, b)) return true;
  const within = (dish: string | null, poi: DraftPoi) =>
    dish !== null &&
    hasRun(
      nameTokens(poi.name).map((word) => word.replaceAll('y', 'i')),
      dish.split(' '),
    );
  return within(dishOf(a), b) || within(dishOf(b), a);
}
