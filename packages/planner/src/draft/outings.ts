/**
 * Outings. The essential places of a destination that are far from where the crew stays, but
 * near each other, are one outing: Hội An's old town with its covered bridge and the beach beside
 * it; a peninsula with the pagoda on it; a hill resort with its bridge. An outing is one ride
 * out on one full day (never the afternoon the crew lands or the day it leaves), its places
 * together. A short trip has fewer full days than a destination has outings: the outings that
 * hold the most essentials for the time they take get the days, and the places of the others
 * are left off the trip, said to need a day of their own, rather than squeezed between town stops.
 * An outing of half a day or less takes a day only when one is left over; else it shares one.
 * A place that takes the whole day (./long-visits) is an outing wherever it is.
 */
import { foodRole } from './food-role';
import { DINNER } from './meal-slots';
import { metresBetween } from './same-place';
import { FULL_DAY_VISIT_MIN, partOfVisit, visitSpan } from './long-visits';
import { isTheirs, type DraftPoi, type TravelMatrix } from './types';
import type { TimedDay, TimedStop } from './validate-day-sense';

export interface Outing {
  /** The outing's places, the longest visit first. */
  readonly poiIds: readonly string[];
  /** The full day it is planned on; null when the trip has no day left for it. */
  readonly dayNo: number | null;
  /** The ride out, the visits and the rides between them, and the ride back. */
  readonly minutes: number;
  /** Half a day or less: it shares a day when no full day is left for it alone. */
  readonly short: boolean;
  /** Places of a short outing on the way that joined this one (seen on its day if they fit). */
  readonly joined?: readonly string[];
}

export interface OutingsInput {
  /** The essential places the draft may use (and any place a must-do asks for). */
  readonly places: readonly DraftPoi[];
  readonly travel: TravelMatrix;
  readonly homeId: string;
  readonly hopCapMin: number;
  /** Days of the trip; the first and the last take no outing. */
  readonly days: number;
  /** Days each place can be visited on. */
  readonly openDays: ReadonlyMap<string, readonly number[]>;
  /** Places a must-do asks for: their outing is planned before any other. */
  readonly asked: ReadonlySet<string>;
  /** Where the crew stays, when it is not one of `places`. */
  readonly home?: DraftPoi;
}

/** A place this share of the hop cap from home, or more, is an outing, not a stop in town. */
const FAR_SHARE = 0.75;
/** Two far places this share of the cap apart, or less, are one outing. */
const TOGETHER_SHARE = 0.625;
/** A stop or a short outing this much out of the way of a ride is not on the way. */
const ON_THE_WAY_MIN = 15;
/** A day out holds at most this much, rides included (meals around it make a long day). */
const DAY_OUT_MAX_MIN = 660;
/** An outing this long or less (rides included) takes half a day, not a day of its own. */
const SHORT_OUTING_MIN = 240;

function clusters(far: readonly DraftPoi[], travel: TravelMatrix, reach: number): DraftPoi[][] {
  const parent = far.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root] as number;
    return root;
  };
  far.forEach((a, i) => {
    far.forEach((b, j) => {
      if (j > i && (travel(a.id, b.id) ?? Number.POSITIVE_INFINITY) <= reach) {
        parent[find(j)] = find(i);
      }
    });
  });
  const groups = new Map<number, DraftPoi[]>();
  far.forEach((poi, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), poi]);
  });
  return [...groups.values()];
}

/** The destination's outings, each with the full day it gets (see the file note). */
export function planOutings(input: OutingsInput): Outing[] {
  const { travel, homeId, hopCapMin } = input;
  const home = input.home ?? input.places.find((poi) => poi.id === homeId);
  const fromHome = (poi: DraftPoi) => travel(homeId, poi.id) ?? 0;
  // A place that takes the whole day is a day out wherever it is.
  const far = input.places.filter(
    (poi) => fromHome(poi) > hopCapMin * FAR_SHARE || visitSpan(poi, fromHome(poi)) === 'full',
  );
  const sized = clusters(far, travel, hopCapMin * TOGETHER_SHARE).map((places) => {
    const ordered = [...places].sort(
      (a, b) => b.durationMin - a.durationMin || (a.id < b.id ? -1 : 1),
    );
    const out = Math.min(...ordered.map(fromHome));
    // A place inside the longest one (a bridge at the resort) is seen on its visit: no extra time.
    const head = ordered[0] as DraftPoi;
    const own = ordered.filter(
      (poi, index) => index === 0 || !partOfVisit(poi, head, fromHome(head)),
    );
    const between = own
      .slice(1)
      .reduce((sum, poi, index) => sum + (travel((own[index] as DraftPoi).id, poi.id) ?? 0), 0);
    const visits = own.reduce((sum, poi) => sum + poi.durationMin, 0);
    return {
      places: ordered,
      minutes: Math.round(out * 2 + between + visits),
      asked: ordered.some((poi) => input.asked.has(poi.id)),
    };
  });
  // What the crew asked for first; then the most essentials for the time; then the shorter.
  sized.sort(
    (a, b) =>
      Number(b.asked) - Number(a.asked) ||
      b.places.length / b.minutes - a.places.length / a.minutes ||
      a.minutes - b.minutes ||
      ((a.places[0] as DraftPoi).id < (b.places[0] as DraftPoi).id ? -1 : 1),
  );
  const free = new Set(Array.from({ length: Math.max(0, input.days - 2) }, (_, i) => i + 2));
  // The outings that need a day take the free days first; a short one takes what is left.
  const days = new Map<(typeof sized)[number], number | null>();
  for (const pass of [false, true]) {
    for (const outing of sized) {
      if (outing.minutes <= SHORT_OUTING_MIN !== pass) continue;
      const day = [...free].find((dayNo) =>
        outing.places.every((poi) => (input.openDays.get(poi.id) ?? []).includes(dayNo)),
      );
      if (day !== undefined) free.delete(day);
      days.set(outing, day ?? null);
    }
  }
  // A short outing left without a day joins one it is on the way to (the marble caves on the
  // road to the old town), when the day out can hold its visit and the detour.
  const joined = new Map<(typeof sized)[number], (typeof sized)[number]>();
  const added = new Map<(typeof sized)[number], number>();
  for (const outing of sized) {
    if (days.get(outing) !== null || outing.minutes > SHORT_OUTING_MIN) continue;
    const head = outing.places[0] as DraftPoi;
    const host = sized.find((other) => {
      const dayNo = days.get(other);
      if (other === outing || dayNo == null || joined.has(other)) return false;
      if (!outing.places.every((poi) => (input.openDays.get(poi.id) ?? []).includes(dayNo))) {
        return false;
      }
      const target = other.places[0] as DraftPoi;
      // Judged on the map: the ride estimates jump where a city ride becomes a regional one.
      if (home === undefined) return false;
      const direct = metresBetween(home, target);
      const via = metresBetween(home, head) + metresBetween(head, target);
      const detour = Math.max(0, ((via - direct) / Math.max(1, direct)) * fromHome(target));
      const visits = outing.places.reduce((sum, poi) => sum + poi.durationMin, 0);
      const extra = [...joined].filter(([, h]) => h === other).length;
      if (
        extra > 0 ||
        detour > ON_THE_WAY_MIN ||
        other.minutes + visits + detour > DAY_OUT_MAX_MIN
      ) {
        return false;
      }
      added.set(outing, Math.round(visits + Math.max(0, detour)));
      return true;
    });
    if (host !== undefined) joined.set(outing, host);
  }
  return sized.flatMap((outing): Outing[] => {
    if (joined.has(outing)) return [];
    const guests = [...joined].filter(([, host]) => host === outing).map(([guest]) => guest);
    return [
      {
        poiIds: [...outing.places, ...guests.flatMap((g) => g.places)].map((poi) => poi.id),
        dayNo: days.get(outing) ?? null,
        minutes: outing.minutes + guests.reduce((sum, g) => sum + (added.get(g) ?? 0), 0),
        short: outing.minutes <= SHORT_OUTING_MIN,
        ...(guests.length === 0
          ? {}
          : { joined: guests.flatMap((g) => g.places.map((p) => p.id)) }),
      },
    ];
  });
}

/**
 * Holds each outing's places to the outing's day in `openDays`, and takes the places of an
 * outing with no day off every day (one a must-do asks for keeps its days: the crew's call); a
 * short one with no day of its own keeps its days, to share one.
 */
export function keepOutingsTogether(
  openDays: Map<string, number[]>,
  outings: readonly Outing[],
  asked: ReadonlySet<string>,
): void {
  for (const outing of outings) {
    for (const poiId of outing.poiIds) {
      if (outing.dayNo !== null) openDays.set(poiId, [outing.dayNo]);
      else if (outing.short) {
        // A short one shares a town day: never another outing's.
        const taken = new Set(outings.map((o) => o.dayNo));
        openDays.set(
          poiId,
          (openDays.get(poiId) ?? []).filter((dayNo) => !taken.has(dayNo)),
        );
      } else if (!outing.poiIds.some((id) => asked.has(id))) openDays.delete(poiId);
    }
  }
}

/**
 * The stops of an outing's day that are neither its places nor near them, where they break the
 * outing: on a whole-day outing's day, any such sight before dinner (a sight back in town after a
 * day out is a second ride out); on a shorter outing's day, one that sits between two of the
 * outing's stops (the crew rides back to town and out again). Meals and light stops are the
 * day's to have anywhere, and a stop the crew placed or asked for is theirs.
 */
export function offTheOuting(
  day: TimedDay,
  outings: readonly Outing[],
  travel: TravelMatrix,
  hopCapMin: number | undefined,
  homeId: string | null = null,
): TimedStop[] {
  const outing = outings.find((o) => o.dayNo === day.dayNo);
  if (outing === undefined || hopCapMin === undefined) return [];
  const reach = hopCapMin * TOGETHER_SHARE;
  // Beside the outing: close to one of its places, or (where the stay is known) nearer to them
  // than to the stay, like a peak on the same peninsula.
  const ride = (a: string, b: string) => travel(a, b) ?? Number.POSITIVE_INFINITY;
  const near = (poiId: string) =>
    outing.poiIds.some(
      (id) =>
        id === poiId ||
        (ride(id, poiId) <= reach && (homeId === null || ride(id, poiId) < ride(homeId, poiId))),
    );
  // The outing's own stops, and the sights beside them (a peak on the same peninsula).
  const own = day.stops.filter((stop) => stop.item.kind !== 'meal' && near(stop.poi.id));
  const first = Math.min(...own.map((stop) => stop.startMin));
  const last = Math.max(...own.map((stop) => stop.startMin));
  const whole = outing.minutes >= FULL_DAY_VISIT_MIN;
  // Another outing's place on this day is a second ride out, wherever it stands.
  const otherOuting = (poiId: string) =>
    outings.some((o) => o !== outing && o.poiIds.includes(poiId));
  return day.stops.filter(
    (stop) =>
      // After dinner the crew is back near the stay: an evening out there is no second ride out.
      stop.startMin < DINNER.startMin &&
      (whole || otherOuting(stop.poi.id) || (stop.startMin > first && stop.startMin < last)) &&
      stop.item.kind !== 'meal' &&
      foodRole(stop.poi) !== 'light' &&
      stop.item.must_do_id === null &&
      !isTheirs(stop.item) &&
      !near(stop.poi.id),
  );
}

/**
 * After a whole-day outing the crew rides home: dinner and the evening are near the stay, or on
 * the way back. The stops after the outing's last that are neither (a dinner half an hour off
 * the road home, then another ride to a bridge) are returned. The crew's own stops stay.
 */
export function farAfterDayOut(
  day: TimedDay,
  outings: readonly Outing[],
  travel: TravelMatrix,
  homeId: string | null | undefined,
  hopCapMin: number | undefined,
): TimedStop[] {
  const outing = outings.find((o) => o.dayNo === day.dayNo && o.minutes >= FULL_DAY_VISIT_MIN);
  if (outing === undefined || homeId == null || hopCapMin === undefined) return [];
  const own = day.stops.filter((stop) => outing.poiIds.includes(stop.poi.id));
  const lastOwn = own[own.length - 1];
  if (lastOwn === undefined) return [];
  const ride = (a: string, b: string) => travel(a, b) ?? Number.POSITIVE_INFINITY;
  const homeward = ride(lastOwn.poi.id, homeId);
  let from = lastOwn.poi.id;
  return day.stops.filter((stop) => {
    if (stop.startMin <= lastOwn.startMin || outing.poiIds.includes(stop.poi.id)) return false;
    const nearHome = ride(homeId, stop.poi.id) <= hopCapMin / 2;
    const onTheWay =
      ride(from, stop.poi.id) + ride(stop.poi.id, homeId) - homeward <= ON_THE_WAY_MIN;
    from = stop.poi.id;
    return !nearHome && !onTheWay && stop.item.must_do_id === null && !isTheirs(stop.item);
  });
}
