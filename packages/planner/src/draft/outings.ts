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
import { visitSpan } from './long-visits';
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
}

/** A place this share of the hop cap from home, or more, is an outing, not a stop in town. */
const FAR_SHARE = 0.75;
/** Two far places this share of the cap apart, or less, are one outing. */
const TOGETHER_SHARE = 0.625;
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
    const between = ordered
      .slice(1)
      .reduce((sum, poi, index) => sum + (travel((ordered[index] as DraftPoi).id, poi.id) ?? 0), 0);
    const visits = ordered.reduce((sum, poi) => sum + poi.durationMin, 0);
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
  return sized.map((outing): Outing => ({
    poiIds: outing.places.map((poi) => poi.id),
    dayNo: days.get(outing) ?? null,
    minutes: outing.minutes,
    short: outing.minutes <= SHORT_OUTING_MIN,
  }));
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
      else if (!outing.short && !outing.poiIds.some((id) => asked.has(id))) openDays.delete(poiId);
    }
  }
}

/**
 * The stops of an outing's day that are neither its places nor near them: a sight back in town
 * after a day out is a second ride out. Meals and light stops are the day's to have anywhere, and
 * a stop the crew placed or asked for is theirs.
 */
export function offTheOuting(
  day: TimedDay,
  outings: readonly Outing[],
  travel: TravelMatrix,
  hopCapMin: number | undefined,
): TimedStop[] {
  const outing = outings.find((o) => o.dayNo === day.dayNo);
  if (outing === undefined || hopCapMin === undefined) return [];
  const reach = hopCapMin * TOGETHER_SHARE;
  return day.stops.filter(
    (stop) =>
      stop.item.kind !== 'meal' &&
      foodRole(stop.poi) !== 'light' &&
      stop.item.must_do_id === null &&
      !isTheirs(stop.item) &&
      !outing.poiIds.includes(stop.poi.id) &&
      outing.poiIds.every((id) => (travel(id, stop.poi.id) ?? Number.POSITIVE_INFINITY) > reach),
  );
}
