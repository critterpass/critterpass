/**
 * The essential handful of a destination (`DraftPoi.essential`, at most fifteen, flagged by our
 * editors): the places a first visit should hold. They lead the trip's core must-sees, so the
 * outline, the day stage and the fills all place them first; once the days are settled, one still
 * missing is put on a day that can take it, a stop nobody asked for giving way if it must; and one
 * the draft leaves out is reported with the reason, so nobody has to guess why it is not there. One
 * inside a long visit on the draft (a bridge at a hill resort) is seen on that visit.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import {
  DINNER,
  foodRole,
  isKept,
  minuteOfDate,
  opensDay,
  rankedFirst,
  RIDE_HOME_MAX_MIN,
  type DraftPoi,
} from '@cp/planner';

import { homeOf, hopCap, insideVisit, spanOf } from './areas';
import { misplacedOpeners } from './openers';
import type { DraftPlanInput } from './context';
import { placeOne } from './place-essential';
import type { SkeletonDay } from './skeleton';

/** Why an essential place is not in a draft. */
export type EssentialGap =
  /** Not open on any day of the trip. */
  | 'closed'
  /** Too long a ride from where the crew stays for any day. */
  | 'too_far'
  /** Not offered for this draft: the organiser holds it herself or took it out. */
  | 'not_offered'
  /** Every day it could go on holds stops the organiser placed, and it fits around them on none. */
  | 'held_in_the_way'
  /** It is an outing far from the stay, and the trip has no full day left for it. */
  | 'needs_a_day'
  /** A redraft of its day took it out, and no other day had room. */
  | 'redrafted_out'
  /** Every day it could go on is full of other essentials and long visits. */
  | 'days_full'
  /** It needs to open its day, and every day it could open belongs to a place that needs it more. */
  | 'mornings_taken'
  /** Every day it could go on went to an essential our editors rank higher. */
  | 'outranked'
  /** Every day it could go on is full of stops the planner may not move. */
  | 'no_room';

export interface EssentialLeftOut {
  readonly poiId: string;
  readonly reason: EssentialGap;
}

/** The destination's essential sights, our editors' best-ranked first (unranked after). */
export function essentialsOf(input: Pick<DraftPlanInput, 'pois'>): DraftPoi[] {
  return [...input.pois.values()]
    .filter((poi) => poi.essential === true && foodRole(poi) !== 'meal')
    .map((poi, index) => ({ poi, index }))
    .sort((a, b) => {
      const first = rankedFirst(a.poi, b.poi);
      return first === null ? a.index - b.index : first ? -1 : 1;
    })
    .map((entry) => entry.poi);
}

function held(itinerary: Itinerary): Set<string> {
  return new Set(itinerary.days.flatMap((day) => day.items.map((item) => item.poi_id ?? '')));
}

/**
 * The long visit on the draft that takes in `poi` (the resort a bridge is inside), if any: such
 * an essential is seen on that visit, not left out.
 */
export function visitTakingIn(
  input: Pick<DraftPlanInput, 'pois' | 'pools' | 'travel'>,
  itinerary: Itinerary,
  poi: DraftPoi,
): DraftPoi | null {
  for (const id of held(itinerary)) {
    const anchor = input.pois.get(id);
    if (anchor !== undefined && insideVisit(input, poi, anchor)) return anchor;
  }
  return null;
}

/** The essentials the draft does not hold, each with why. */
export function essentialsLeftOut(input: DraftPlanInput, itinerary: Itinerary): EssentialLeftOut[] {
  const there = held(itinerary);
  const home = homeOf(input);
  const offered = new Set([
    ...input.pools.sights.map((poi) => poi.id),
    ...input.pools.activities.map((poi) => poi.id),
    ...input.pools.mustDos.map((slot) => slot.poiId),
  ]);
  const hers = new Set((input.held ?? []).map((stop) => stop.dayNo));
  const outingDays = new Set(input.pools.outings.map((o) => o.dayNo));
  const noDay = new Set(
    // A short outing with no day of its own may share a town day: it needs a day only when every
    // day it could go on is another outing's.
    input.pools.outings
      .filter(
        (outing) =>
          outing.dayNo === null &&
          (!outing.short ||
            outing.poiIds.every((id) =>
              (input.pools.openDays.get(id) ?? []).every((dayNo) => outingDays.has(dayNo)),
            )),
      )
      .flatMap((o) => o.poiIds),
  );
  return essentialsOf(input)
    .filter((poi) => !there.has(poi.id) && visitTakingIn(input, itinerary, poi) === null)
    .map((poi): EssentialLeftOut => {
      const open = input.pools.openDays.get(poi.id) ?? [];
      const ride = home === null ? 0 : (input.travel(home, poi.id) ?? 0);
      const reason: EssentialGap = noDay.has(poi.id)
        ? 'needs_a_day'
        : ride > RIDE_HOME_MAX_MIN
          ? 'too_far'
          : open.length === 0
            ? 'closed'
            : !offered.has(poi.id)
              ? 'not_offered'
              : open.every((dayNo) => hers.has(dayNo))
                ? 'held_in_the_way'
                : open.every((dayNo) => outrankedOn(input, itinerary, dayNo, poi))
                  ? 'outranked'
                  : open.every((dayNo) => morningTaken(input, itinerary, dayNo, poi))
                    ? 'mornings_taken'
                    : open.every((dayNo) => fullOfSights(input, itinerary, dayNo))
                      ? 'days_full'
                      : 'no_room';
      return { poiId: poi.id, reason };
    });
}

/**
 * Whether day `dayNo` holds nothing that could give way to an essential: every sight on it before
 * dinner is an essential, the crew's own, a light stop or a long visit.
 */
function fullOfSights(input: DraftPlanInput, itinerary: Itinerary, dayNo: number): boolean {
  const day = itinerary.days.find((d) => d.day_no === dayNo);
  // The evening's stops never stand in the way of a sight: they are after dinner.
  const sights = (day?.items ?? []).filter(
    (item) =>
      item.kind !== 'meal' &&
      day !== undefined &&
      minuteOfDate(new Date(item.starts_at), day.date, input.frame.tz) < DINNER.startMin,
  );
  return (
    sights.length > 0 &&
    sights.every((item) => {
      const poi = input.pois.get(item.poi_id ?? '');
      return (
        poi === undefined ||
        poi.essential === true ||
        isKept(item) ||
        foodRole(poi) === 'light' ||
        spanOf(input, poi) !== null
      );
    })
  );
}

/** Whether day `dayNo` holds an essential our editors rank above `poi`. */
function outrankedOn(
  input: DraftPlanInput,
  itinerary: Itinerary,
  dayNo: number,
  poi: DraftPoi,
): boolean {
  const day = itinerary.days.find((d) => d.day_no === dayNo);
  return (day?.items ?? []).some((item) => {
    const other = input.pois.get(item.poi_id ?? '');
    return other?.essential === true && rankedFirst(other, poi) === true;
  });
}

/** Whether `poi` must open its day and day `dayNo` is opened by a place that needs it more. */
function morningTaken(
  input: DraftPlanInput,
  itinerary: Itinerary,
  dayNo: number,
  poi: DraftPoi,
): boolean {
  const reach = { homeId: homeOf(input), hopCapMin: hopCap(input), travel: input.travel };
  if (!opensDay(poi, reach)) return false;
  const day = itinerary.days.find((d) => d.day_no === dayNo);
  const probe = day === undefined ? [] : misplacedOpeners(input, withStop(day, poi));
  return probe.some((item) => item.poi_id === poi.id);
}

/** `day` with `poi` added as its first stop, for asking whether it could open it. */
function withStop(day: DraftDay, poi: DraftPoi): DraftDay {
  const first = day.items[0];
  const stop = {
    ...(first ?? { tz: 'UTC', currency: 'USD', travel_min: 0, note: null }),
    stable_id: `probe-${poi.id}`,
    kind: 'activity' as const,
    poi_id: poi.id,
    starts_at: first?.starts_at ?? `${day.date}T00:00:00Z`,
    ends_at: first?.starts_at ?? `${day.date}T00:00:00Z`,
    must_do_id: null,
    booking_id: null,
    locked_reason: null,
    cost_model: 'per_person' as const,
    amount_minor: 0,
  };
  return { ...day, items: [stop, ...day.items] };
}

/** Rounds of placing: an essential that made way for a longer one gets a turn of its own. */
const ROUNDS = 3;

/**
 * Puts each essential the settled draft still lacks on a day it is open, the day whose stops it
 * sits nearest first: added when the day stays as clean; else in the seat of a stop that is
 * neither the crew's own nor an essential (the last such stop first); else in the seat of a
 * shorter essential, which is then placed again on another day in the next round.
 */
export function placeEssentials(
  input: DraftPlanInput,
  outlines: readonly SkeletonDay[],
  start: Itinerary,
): { readonly itinerary: Itinerary; readonly added: number } {
  let itinerary = start;
  const before = essentialsLeftOut(input, start);
  for (let round = 0; round < ROUNDS; round += 1) {
    let moved = false;
    for (const gap of essentialsLeftOut(input, itinerary)) {
      const poi = input.pois.get(gap.poiId);
      if (
        poi === undefined ||
        !['no_room', 'held_in_the_way', 'days_full', 'outranked'].includes(gap.reason)
      ) {
        continue;
      }
      const placed = placeOne(input, outlines, itinerary, poi, round);
      if (placed === null) continue;
      itinerary = placed;
      moved = true;
    }
    if (!moved) break;
  }
  // Never worse off than it started: fewer left out, or as many with worse-ranked ones among
  // them (a better-ranked essential took a worse one's day); a round that only shuffled is undone.
  const after = essentialsLeftOut(input, itinerary);
  return better(input, after, before)
    ? { itinerary, added: Math.max(0, before.length - after.length) }
    : { itinerary: start, added: 0 };
}

/** Whether leaving out `now` is better than leaving out `was`, by count and then by rank. */
function better(
  input: DraftPlanInput,
  now: readonly EssentialLeftOut[],
  was: readonly EssentialLeftOut[],
): boolean {
  if (now.length !== was.length) return now.length < was.length;
  const ranks = (gaps: readonly EssentialLeftOut[]) =>
    gaps
      .map((gap) => input.pois.get(gap.poiId)?.essentialRank ?? Number.POSITIVE_INFINITY)
      .sort((a, b) => a - b);
  const [a, b] = [ranks(now), ranks(was)];
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}
