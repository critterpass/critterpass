/**
 * A day's title is written with the outline, before the planner trims, fills and reorders the
 * day; so it can promise "a show" the day does not have, or name a part of the map the day never
 * reaches. A title is kept only when the day still holds what it names: every kind of place it
 * mentions (a pagoda, a market, a bar; two of them when it says "waterfalls") and every place name
 * it uses, and it claims no flight or other way of travelling that nobody entered. One that does
 * not is written again: by the guide first (./retitle.ts), and from the names of the day's own
 * stops when that fails too.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import { foodRole, isKept, minuteOfDate, nameTokens, type DraftPoi } from '@cp/planner';

import { spanOf } from './areas';

import type { DraftPlanInput } from './context';
import { shownName } from './shown-names';

const TITLE_MAX = 60;
const MORNING_TITLE_ENDS_MIN = 13 * 60 + 30;
const EVENING_TITLE_FROM_MIN = 17 * 60 + 30;
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
  // The same in Vietnamese, as a title in the organiser's language writes them.
  ho: named('lake', 'ho'),
  chua: (poi, own) => poi.category === 'temple_shrine' && !church(poi, own),
  cho: either(category('market'), named('market', 'cho')),
  // "cà phê": "ca" alone is too many other words.
  phe: (poi) => foodRole(poi) === 'light',
  thac: named('waterfall', 'fall', 'thac'),
};

/** Words of a place name that say what it is, not which: a title naming only these names none. */
const COMMON: ReadonlySet<string> = new Set(
  'the and old town ancient park hill peninsula mountain island bridge street pho ban dao nui bien cau khu lich'.split(
    ' ',
  ),
);

/** What a title check needs to know of a visit's length (the ride from the stay counts). */
type Spanned = Pick<DraftPlanInput, 'pools' | 'pois' | 'travel'>;

const PLACE_WORDS = new WeakMap<object, ReadonlyMap<string, number>>();

/** Every word of every place name we know here, with how many places carry it. */
function placeWords(input: Pick<DraftPlanInput, 'pois'>): ReadonlyMap<string, number> {
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

const AM: ReadonlySet<string> = new Set(['morning', 'sang']);
const PM: ReadonlySet<string> = new Set(['afternoon', 'chieu']);
const LATE: ReadonlySet<string> = new Set(['evening', 'night', 'nightcap']);
/** Words that promise an easy day; such a day has no ride over `EASY_RIDE_MAX_MIN`. */
const EASE: ReadonlySet<string> = new Set([
  'easy',
  'gentle',
  'soft',
  'slow',
  'lazy',
  'nhe',
  'nhang',
]);
const EASY_RIDE_MAX_MIN = 25;
/** Words that put something early in the day; such a day has started by `EARLY_BY_MIN`. */
const EARLY: ReadonlySet<string> = new Set(['early', 'dawn', 'sunrise', 'som']);
const EARLY_BY_MIN = 9 * 60;
/** A way of travelling the title takes for granted ("before the flight", "trước giờ bay"). */
const TRANSPORT =
  /\b(flights?|fly(ing)?|planes?|airport|take-?off)\b|(giờ|chuyến|sân|máy|lên|ra) bay|chuyến xe|giờ xe|giờ tàu|chuyến tàu/iu;

/**
 * Whether the title speaks of a flight (or a bus or train to catch) on a day nobody entered one
 * for: the planner only assumes when the crew arrives and leaves, and never how.
 */
export function claimsTransport(
  input: Pick<DraftPlanInput, 'frame'>,
  day: Pick<DraftDay, 'theme' | 'date'>,
): boolean {
  if (!TRANSPORT.test(day.theme.normalize('NFC'))) return false;
  const { dates, arrivalMin, departureMin } = input.frame;
  const entered =
    (day.date === dates[0] && arrivalMin !== null) ||
    (day.date === dates[dates.length - 1] && departureMin !== null);
  return !entered;
}
const NOON = 12 * 60;

/**
 * Whether the day holds everything its title names, in the order the title names it: each kind
 * of place and each place it mentions is a stop of the day, the second after the first; what it
 * puts in the morning is before noon and what it puts in the afternoon after; a morning-only
 * title ends by early afternoon, an evening one has a stop in the evening; and a title that
 * calls the day easy has no long ride in it.
 */
export function titleFits(
  input: Pick<DraftPlanInput, 'pois' | 'frame' | 'pools' | 'travel'>,
  day: DraftDay,
): boolean {
  const at = (iso: string) => minuteOfDate(new Date(iso), day.date, input.frame.tz);
  const stops = day.items.flatMap((item) => {
    const poi = item.poi_id === null ? undefined : input.pois.get(item.poi_id);
    if (poi === undefined) return [];
    const words = new Set(nameTokens(`${poi.name} ${poi.nameLocal ?? ''}`));
    return [{ poi, words, start: at(item.starts_at), ride: item.travel_min }];
  });
  if (stops.length === 0) return true;
  if (claimsTransport(input, day)) return false;
  // A day built around a long visit says so: its title names the place.
  const anchor = longestVisit(input, stops);
  if (anchor !== null) {
    const said = new Set(nameTokens(day.theme));
    const own = nameTokens(`${anchor.poi.name} ${anchor.poi.nameLocal ?? ''}`).filter(
      (token) => token.length >= 3 && KINDS[token] === undefined && !COMMON.has(token),
    );
    if (own.length > 0 && !own.some((token) => said.has(token))) return false;
  }
  const names = day.items.map((item) =>
    (item.poi_id === null ? '' : (input.pois.get(item.poi_id)?.name ?? '')).toLowerCase(),
  );
  const known = placeWords(input);
  const raw = day.theme.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0);
  const tokens = raw.map((word) => nameTokens(word)[0]);
  const ends = Math.max(...day.items.map((item) => at(item.ends_at)));
  const lastStart = Math.max(...stops.map((stop) => stop.start));
  const splitDay = tokens.some(
    (token) => token !== undefined && (PM.has(token) || LATE.has(token)),
  );
  let cursor = 0;
  let half: 'am' | 'pm' | null = null;
  // The first stop at or after the last one named that `is` what the title says, in its half.
  const claim = (is: (stop: (typeof stops)[number]) => boolean): boolean => {
    const inHalf = (stop: (typeof stops)[number]) =>
      half === null || (half === 'am' ? stop.start < NOON : stop.start >= NOON);
    const found = stops.findIndex((stop, index) => index >= cursor && is(stop) && inHalf(stop));
    if (found === -1) return false;
    cursor = found;
    return true;
  };
  return raw.every((word, index) => {
    const token = tokens[index];
    if (token === undefined) return true;
    if (AM.has(token)) {
      half = 'am';
      // A morning is over by early afternoon, unless the title goes on to the rest of the day or
      // names the long visit the morning is for ("A morning at Datanla").
      return splitDay || ends <= MORNING_TITLE_ENDS_MIN || (anchor !== null && anchor.start < NOON);
    }
    if (PM.has(token)) {
      half = 'pm';
      return true;
    }
    if (LATE.has(token)) {
      half = 'pm';
      return lastStart >= EVENING_TITLE_FROM_MIN;
    }
    if (EASE.has(token)) return stops.every((stop) => stop.ride <= EASY_RIDE_MAX_MIN);
    if (EARLY.has(token)) return Math.min(...stops.map((stop) => stop.start)) <= EARLY_BY_MIN;
    const kind = KINDS[token];
    if (kind !== undefined) {
      // "Waterfalls" promises two, unless it is the word of a stop's own name ("Datanla Falls").
      const plural = word.toLowerCase();
      const several =
        plural !== token && plural.endsWith('s') && !names.some((name) => name.includes(plural));
      if (several && stops.filter((stop) => kind(stop.poi, stop.words)).length < 2) return false;
      return claim((stop) => kind(stop.poi, stop.words));
    }
    const holders = stops.filter((stop) => stop.words.has(token));
    const proper = /^\p{Lu}/u.test(word);
    // A place the title names: a capitalised word one or two of the day's stops carry.
    if (proper && holders.length > 0 && holders.length <= 2 && token.length >= 3) {
      return claim((stop) => stop.words.has(token));
    }
    if (holders.length > 0) return true;
    // A proper name the day does not carry: a capitalised word that only place names use.
    return !(proper && index > 0 && token.length >= 4 && known.has(token));
  });
}

/** The day's longest visit of half a day or more, if it has one. */
function longestVisit<T extends { readonly poi: DraftPoi; readonly start: number }>(
  input: Spanned,
  stops: readonly T[],
): T | null {
  const long = stops
    .filter((stop) => spanOf(input, stop.poi) !== null && foodRole(stop.poi) !== 'meal')
    .sort((a, b) => b.poi.durationMin - a.poi.durationMin);
  return long[0] ?? null;
}

const LONG_TITLES = {
  en: {
    full: (name: string) => `${name}, the whole day`,
    am: (name: string) => `A morning at ${name}`,
    pm: (name: string) => `An afternoon at ${name}`,
  },
  vi: {
    full: (name: string) => `${name}, trọn ngày`,
    am: (name: string) => `Buổi sáng ở ${name}`,
    pm: (name: string) => `Buổi chiều ở ${name}`,
  },
} as const;

/** The leading name of a place, short enough for a title; null when it has none that short. */
function shortName(name: string): string | null {
  const lead = (name.split(/\s*(?:,|;|\||\(|\s[-–—]\s)\s*/u)[0] ?? '').trim();
  return lead.length > 0 && lead.length <= NAME_MAX ? lead : null;
}

/** A title from the day's own stops: its headline sights, the crew's own first. */
export function titleFrom(
  input: Pick<
    DraftPlanInput,
    'pois' | 'locale' | 'destinationLanguages' | 'frame' | 'pools' | 'travel'
  >,
  day: DraftDay,
): string {
  const vi = input.locale?.toLowerCase().startsWith('vi') === true;
  // A day built around a long visit is named for it: "A morning at Datanla".
  const timed = day.items.flatMap((item) => {
    const poi = item.poi_id === null ? undefined : input.pois.get(item.poi_id);
    const start = minuteOfDate(new Date(item.starts_at), day.date, input.frame.tz);
    return poi === undefined || item.kind === 'meal' ? [] : [{ poi, start }];
  });
  const anchor = longestVisit(input, timed);
  const anchorName = anchor === null ? null : shortName(shownName(input, anchor.poi));
  if (anchor !== null && anchorName !== null) {
    const words = LONG_TITLES[vi ? 'vi' : 'en'];
    const half = anchor.start < NOON ? words.am : words.pm;
    const title = (spanOf(input, anchor.poi) === 'full' ? words.full : half)(anchorName);
    if (title.length <= TITLE_MAX) return title;
  }
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
      const name = shortName(shownName(input, entry.poi));
      return name === null ? [] : [{ name, index: entry.index }];
    })
    .slice(0, 2)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.name);
  const both = heads.join(vi ? ' và ' : ' and ');
  if (heads.length === 2 && both.length <= TITLE_MAX) return both;
  return heads[0] ?? day.theme;
}

export function withFittingTitles(
  input: Pick<
    DraftPlanInput,
    'pois' | 'locale' | 'frame' | 'destinationLanguages' | 'pools' | 'travel'
  >,
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
