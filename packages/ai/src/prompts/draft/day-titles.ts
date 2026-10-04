/**
 * A day's title is written with the outline, before the planner trims, fills and reorders the
 * day; so it can promise "a show" the day does not have, or name a part of the map the day never
 * reaches. A title is kept only when the day still holds what it names: every kind of place it
 * mentions (a pagoda, a market, a bar) and every place name it uses. One that does not is written
 * again from the day's own stops.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import { foodRole, isKept, nameTokens, type DraftPoi } from '@cp/planner';

import type { DraftPlanInput } from './context';

const TITLE_MAX = 60;
const NAME_MAX = 30;

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
const KINDS: Readonly<Record<string, Holds>> = {
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
};

const PLACE_WORDS = new WeakMap<object, ReadonlyMap<string, number>>();

/** Every word of every place name we know here, with how many places carry it. */
function placeWords(input: Pick<DraftPlanInput, 'pois'>): ReadonlyMap<string, number> {
  const known = PLACE_WORDS.get(input.pois);
  if (known !== undefined) return known;
  const words = new Map<string, number>();
  for (const poi of input.pois.values()) {
    for (const word of new Set(nameTokens(poi.name))) words.set(word, (words.get(word) ?? 0) + 1);
  }
  PLACE_WORDS.set(input.pois, words);
  return words;
}

function stopsOf(input: Pick<DraftPlanInput, 'pois'>, day: DraftDay): DraftPoi[] {
  return day.items.flatMap((item) => {
    const poi = item.poi_id === null ? undefined : input.pois.get(item.poi_id);
    return poi === undefined ? [] : [poi];
  });
}

/** Whether the day holds everything its title names. */
export function titleFits(input: Pick<DraftPlanInput, 'pois'>, day: DraftDay): boolean {
  const stops = stopsOf(input, day);
  if (stops.length === 0) return true;
  const own = new Map(stops.map((poi) => [poi.id, new Set(nameTokens(poi.name))]));
  const names = new Set([...own.values()].flatMap((words) => [...words]));
  const known = placeWords(input);
  const raw = day.theme.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0);
  return raw.every((word, index) => {
    const token = nameTokens(word)[0];
    if (token === undefined) return true;
    const kind = KINDS[token];
    if (kind !== undefined) {
      return stops.some((poi) => kind(poi, own.get(poi.id) ?? new Set<string>()));
    }
    if (names.has(token)) return true;
    // A proper name the day does not carry: a capitalised word that only place names use.
    const proper = index > 0 && /^\p{Lu}/u.test(word);
    return !(proper && token.length >= 4 && known.has(token));
  });
}

/** The leading name of a place, short enough for a title; null when it has none that short. */
function shortName(poi: DraftPoi): string | null {
  const lead = (poi.name.split(/\s*(?:,|;|\||\(|\s[-–—]\s)\s*/u)[0] ?? '').trim();
  return lead.length > 0 && lead.length <= NAME_MAX ? lead : null;
}

/** A title from the day's own stops: its headline sights, the crew's own first. */
export function titleFrom(input: Pick<DraftPlanInput, 'pois' | 'locale'>, day: DraftDay): string {
  const ranked = day.items
    .flatMap((item, index) => {
      const poi = item.poi_id === null ? undefined : input.pois.get(item.poi_id);
      return poi === undefined || item.kind === 'meal' || foodRole(poi) === 'light'
        ? []
        : [{ poi, index, kept: isKept(item) }];
    })
    .sort(
      (a, b) =>
        Number(b.kept) - Number(a.kept) ||
        Number(b.poi.mustSee) - Number(a.poi.mustSee) ||
        b.poi.durationMin - a.poi.durationMin ||
        a.index - b.index,
    );
  const heads = ranked
    .flatMap((entry) => {
      const name = shortName(entry.poi);
      return name === null ? [] : [{ name, index: entry.index }];
    })
    .slice(0, 2)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.name);
  const both = heads.join(input.locale?.toLowerCase().startsWith('vi') === true ? ' và ' : ' and ');
  if (heads.length === 2 && both.length <= TITLE_MAX) return both;
  return heads[0] ?? day.theme;
}

export function withFittingTitles(
  input: Pick<DraftPlanInput, 'pois' | 'locale'>,
  itinerary: Itinerary,
): { readonly itinerary: Itinerary; readonly retitled: number } {
  let retitled = 0;
  const days = itinerary.days.map((day) => {
    if (titleFits(input, day)) return day;
    const theme = titleFrom(input, day);
    if (theme === day.theme) return day;
    retitled += 1;
    return { ...day, theme };
  });
  return { itinerary: { ...itinerary, days }, retitled };
}
