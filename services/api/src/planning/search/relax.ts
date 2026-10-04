/**
 * Ways out of an empty search (7d-4), each with what it returns before it is tapped: the next
 * minutes limit that finds something ("WIDEN TO 1H30 · 3 places, all in Seminyak or Canggu"), a
 * related dish or kind of place run as a real search ("TRY JAPANESE INSTEAD · 4 places in Ubud, 2
 * open late"), and dropping a pin, always. Counts are what rerunning with that way out returns.
 */
import type { PoiCategory, SearchFilter } from '@cp/domain';

import type { Evaluated } from './evaluate';
import { openPast } from './hours';

export const MINUTE_TIERS = [15, 30, 45, 60, 90, 120, 180, 240] as const;

/** Dishes and styles with a broader word that finds the same kind of meal. */
const RELATED_TERMS: readonly { readonly match: RegExp; readonly term: string }[] = [
  { match: /\b(sushi|omakase|sashimi|ramen|izakaya|udon|yakitori|tempura)\b/iu, term: 'japanese' },
  { match: /\b(pho|phở|banh mi|bánh mì|bun cha|bún chả)\b/iu, term: 'vietnamese' },
  { match: /\b(pizza|pasta|trattoria|gelato)\b/iu, term: 'italian' },
  { match: /\b(tacos?|burritos?|mezcal)\b/iu, term: 'mexican' },
  { match: /\b(dim sum|dumplings?)\b/iu, term: 'chinese' },
  { match: /\b(cocktails?|speakeasy)\b/iu, term: 'bar' },
  { match: /\b(brunch|espresso|latte)\b/iu, term: 'cafe' },
];

const RELATED_CATEGORIES: Partial<Record<PoiCategory, PoiCategory>> = {
  temple_shrine: 'museum',
  museum: 'temple_shrine',
  market: 'shopping',
  shopping: 'market',
  nature: 'beach',
  beach: 'nature',
  nightlife: 'food',
  food: 'market',
};

export type WayOut =
  | {
      readonly kind: 'widen';
      readonly label_params: { readonly minutes: number };
      readonly count: number;
      readonly areas: readonly string[];
    }
  | {
      readonly kind: 'related';
      readonly label_params: { readonly category?: PoiCategory; readonly term?: string };
      readonly count: number;
      readonly areas: readonly string[];
      readonly open_late: number;
    }
  | {
      readonly kind: 'pin';
      readonly label_params: Record<string, never>;
      readonly count: 0;
      readonly areas: readonly [];
    };

export interface Nearest {
  readonly poi_id: string;
  readonly name: string;
  readonly area: string | null;
  readonly minutes: number;
}

const AREAS_SHOWN = 3;

function areasOf(places: readonly Evaluated[]): string[] {
  const areas: string[] = [];
  for (const place of places) {
    if (place.area !== null && !areas.includes(place.area)) areas.push(place.area);
    if (areas.length === AREAS_SHOWN) break;
  }
  return areas;
}

/** A broader search for the same thing: a related word, else a related kind of place. */
export function relatedFilter(
  filter: SearchFilter,
): { filter: SearchFilter; params: { category?: PoiCategory; term?: string } } | null {
  const text = filter.text ?? '';
  const term = RELATED_TERMS.find((entry) => entry.match.test(text))?.term;
  if (term !== undefined) return { filter: { ...filter, text: term }, params: { term } };
  const only = filter.categories?.length === 1 ? filter.categories[0] : undefined;
  const category = only === undefined ? undefined : RELATED_CATEGORIES[only];
  if (category === undefined) return null;
  return { filter: { ...filter, categories: [category] }, params: { category } };
}

/**
 * The ways out of `evaluated` (an empty search) and the nearest place outside its minutes limit.
 * `rerun` runs a filter and answers its results, as the route would.
 */
export async function waysOut(
  filter: SearchFilter,
  evaluated: readonly Evaluated[],
  limit: number,
  rerun: (filter: SearchFilter) => Promise<readonly Evaluated[]>,
): Promise<{ ways_out: WayOut[]; nearest: Nearest | null }> {
  const ways: WayOut[] = [];
  let nearest: Nearest | null = null;
  const max = filter.max_minutes?.minutes;
  if (max !== undefined) {
    const further = evaluated
      .filter((place) => place.minutes !== null && place.misses.every((m) => m === 'max_minutes'))
      .sort((a, b) => (a.minutes?.value ?? 0) - (b.minutes?.value ?? 0));
    const closest = further[0];
    if (closest?.minutes) {
      nearest = {
        poi_id: closest.item.id,
        name: closest.item.name,
        area: closest.area,
        minutes: closest.minutes.value,
      };
    }
    for (const tier of MINUTE_TIERS.filter((minutes) => minutes > max)) {
      const within = further.filter((place) => (place.minutes?.value ?? Infinity) <= tier);
      if (within.length === 0) continue;
      const shown = within.slice(0, limit);
      ways.push({
        kind: 'widen',
        label_params: { minutes: tier },
        count: shown.length,
        areas: areasOf(shown),
      });
      break;
    }
  }
  const related = relatedFilter(filter);
  if (related !== null) {
    const results = (await rerun(related.filter)).slice(0, limit);
    if (results.length > 0) {
      ways.push({
        kind: 'related',
        label_params: related.params,
        count: results.length,
        areas: areasOf(results),
        open_late: results.filter((place) => openPast(place.days, '22:00') === true).length,
      });
    }
  }
  ways.push({ kind: 'pin', label_params: {}, count: 0, areas: [] });
  return { ways_out: ways, nearest };
}
