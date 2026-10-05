/**
 * Places that take hours. A visit of half a day or more (a waterfall park with its coaster, an
 * old town) is the anchor of its half of the day: at most one light stop (a coffee, a snack)
 * shares that half with it, and meals go around it. A visit of a whole day (a hill resort, a
 * theme park, a long hike) has its day to itself, meals inside or beside it, and never lands on
 * the day the crew arrives or leaves. A stop a few minutes' walk from the anchor is part of the
 * visit (a bridge inside the old town), not a rival to it. The length is the place's own
 * (`time_needed_min`); `derivedDurationMin` reads it from the kind and the editors' notes only
 * where that is missing. A visit is never shortened to fit another stop.
 */
import { foodRole } from './food-role';
import { DINNER, LUNCH } from './meal-slots';
import { metresBetween } from './same-place';
import { defaultDurationMin } from './schedule-day';
import { isTheirs, type DraftPoi } from './types';
import type { TimedDay, TimedStop } from './validate-day-sense';

/**
 * A visit this long, the ride there and back from the stay included, is the anchor of its half of
 * the day (Datanla: two and a half hours there and a quarter of an hour each way).
 */
export const HALF_DAY_VISIT_MIN = 180;
/** A visit this long, the round trip included, has a day of its own (Bà Nà Hills). */
export const FULL_DAY_VISIT_MIN = 420;
/** A stop this close to a long visit is inside it (a hill resort's bridge, an old town's). */
const PART_OF_IT_M = 1000;
/** Where the morning half of a day ends and the afternoon's begins. */
const HALVES_SPLIT_MIN = LUNCH.startMin + 60;

export type VisitSpan = 'full' | 'half';

/**
 * How much of a day a visit takes: its length at the place and the ride there and back from the
 * stay (`rideMin` each way), and at least what our editors' notes say ("half a day").
 */
export function visitSpan(
  poi: Pick<DraftPoi, 'durationMin' | 'bestTime' | 'whyGo'>,
  rideMin = 0,
): VisitSpan | null {
  const total = poi.durationMin + 2 * Math.max(0, rideMin);
  const said = folded(`${poi.bestTime ?? ''} ${poi.whyGo ?? ''}`);
  if (total >= FULL_DAY_VISIT_MIN || FULL_WORDS.test(said)) return 'full';
  return total >= HALF_DAY_VISIT_MIN || HALF_WORDS.test(said) ? 'half' : null;
}

/**
 * Whether a visit to `anchor` takes in `poi` too: `anchor` is a long visit (`anchorRideMin` from
 * the stay) and `poi` lies within its grounds (a bridge inside the resort, a house in the old town).
 */
export function partOfVisit(
  poi: Pick<DraftPoi, 'lat' | 'lng' | 'id' | 'durationMin'>,
  anchor: DraftPoi,
  anchorRideMin = 0,
): boolean {
  return (
    poi.id !== anchor.id &&
    // The bigger place takes in the smaller: a village inside the resort, never the other way.
    poi.durationMin < anchor.durationMin &&
    visitSpan(anchor, anchorRideMin) !== null &&
    metresBetween(poi, anchor) <= PART_OF_IT_M
  );
}

// "All day" and "cả ngày" are left out: "open all day" says nothing of the visit.
const FULL_WORDS = /\b(full|whole) day\b|\b(tron|nguyen) ngay\b/u;
const HALF_WORDS = /\bhalf (a )?day\b|\bnua ngay\b/u;
const FULL_TAGS: ReadonlySet<string> = new Set(['theme_park', 'amusement_park', 'water_park']);
const LONG_TAGS: ReadonlySet<string> = new Set(['hiking', 'trekking', 'trek']);

const folded = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase();

/**
 * A visit's length where the place has none of its own: what the editors' notes say ("a full
 * day", "nửa ngày"), else its kind (a theme park takes the day, a hike half of it), else the
 * category's usual length.
 */
export function derivedDurationMin(
  category: string,
  tags: readonly string[],
  notes: readonly (string | null | undefined)[],
): number {
  const said = folded(notes.filter((note): note is string => typeof note === 'string').join(' '));
  if (FULL_WORDS.test(said) || tags.some((tag) => FULL_TAGS.has(tag))) return 7 * 60;
  if (HALF_WORDS.test(said) || tags.some((tag) => LONG_TAGS.has(tag))) return 4 * 60;
  return defaultDurationMin(category);
}

export interface LongVisitFault {
  readonly dayNo: number;
  /** The stop at fault: the one crowding the anchor, or the anchor on a day too short for it. */
  readonly stop: TimedStop;
}

const halfOf = (minute: number) => (minute < HALVES_SPLIT_MIN ? 'am' : 'pm');

/**
 * The stops that crowd a long visit on `day`; `edge` is the day the crew arrives or leaves. A
 * stop the crew asked for is never the one at fault where the anchor's own company can be.
 */
export function longVisitFaults(
  day: TimedDay,
  edge: boolean,
  rideOf: (poi: DraftPoi) => number = () => 0,
  /** Whether two places are one outing (the peninsula and the pagoda on it): never rivals. */
  together: (a: string, b: string) => boolean = () => false,
): LongVisitFault[] {
  const faults: LongVisitFault[] = [];
  for (const anchor of day.stops) {
    const span = visitSpan(anchor.poi, rideOf(anchor.poi));
    if (span === null || anchor.item.kind === 'meal') continue;
    if (span === 'full' && edge && !isTheirs(anchor.item) && anchor.item.must_do_id === null) {
      faults.push({ dayNo: day.dayNo, stop: anchor });
      continue;
    }
    const half = halfOf(anchor.startMin);
    const company = day.stops.filter(
      (stop) =>
        stop !== anchor &&
        stop.item.kind !== 'meal' &&
        !partOfVisit(stop.poi, anchor.poi, rideOf(anchor.poi)) &&
        !together(stop.poi.id, anchor.poi.id) &&
        // After dinner is the evening's, whatever the day held.
        stop.startMin < DINNER.startMin &&
        (span === 'full' || halfOf(stop.startMin) === half),
    );
    let light = 0;
    const asked = (stop: TimedStop) => stop.item.must_do_id !== null || isTheirs(stop.item);
    for (const stop of company) {
      const isLight = foodRole(stop.poi) === 'light';
      if (isLight && light === 0) {
        light += 1;
        continue;
      }
      // What the crew asked for stays; the long visit nobody asked for is the one at fault, and
      // two the crew asked for together are their call.
      if (asked(stop) && asked(anchor)) continue;
      faults.push({ dayNo: day.dayNo, stop: asked(stop) ? anchor : stop });
    }
  }
  return faults;
}

/**
 * Stops inside a long visit on the same day (a bridge at the hill resort it is part of): the
 * visit takes them in, so as stops of their own they count its time and a ride twice. Meals,
 * light stops and the crew's own are never folded in.
 */
export function insideFaults(
  day: TimedDay,
  rideOf: (poi: DraftPoi) => number = () => 0,
): TimedStop[] {
  return day.stops.filter(
    (stop) =>
      stop.item.kind !== 'meal' &&
      foodRole(stop.poi) !== 'light' &&
      stop.item.must_do_id === null &&
      !isTheirs(stop.item) &&
      day.stops.some(
        (anchor) =>
          anchor !== stop &&
          anchor.item.kind !== 'meal' &&
          anchor.poi.durationMin > stop.poi.durationMin &&
          partOfVisit(stop.poi, anchor.poi, rideOf(anchor.poi)),
      ),
  );
}

/**
 * Of two essentials competing for a short trip's days, whether `a` comes first by our editors'
 * rank: a ranked one before an unranked one, a better rank before a worse; null when the rank
 * does not decide (neither ranked, or the same rank), and the planner's own rules do.
 */
export function rankedFirst(
  a: Pick<DraftPoi, 'essentialRank'>,
  b: Pick<DraftPoi, 'essentialRank'>,
): boolean | null {
  const ra = a.essentialRank ?? Number.POSITIVE_INFINITY;
  const rb = b.essentialRank ?? Number.POSITIVE_INFINITY;
  return ra === rb ? null : ra < rb;
}

/** An essential's rank as a sort key: unranked ones after every ranked one. */
export function rankKey(poi: Pick<DraftPoi, 'essentialRank'>): number {
  return poi.essentialRank ?? Number.POSITIVE_INFINITY;
}
