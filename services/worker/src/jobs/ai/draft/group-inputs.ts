/**
 * Each day group's own pipeline input (./day-groups.ts): its destination's recommended places, its
 * dates, when the crew is there on them, its guide, its share of the budget, and the must-dos,
 * wishes and stops of hers that belong to it.
 *
 * A must-do's place goes to the group whose destination's place box holds it (a later stop or a
 * day trip first, since the first stop also owns places inside their boxes), else the group of
 * the destination that owns it, else the first. A typed wish goes to the group with a place it
 * names, else the first. A stop she placed stays on its day, in that day's group. A place a later
 * group holds is not also offered to the first stop's days.
 */
import { withHeldStops, type DayGroup, type DraftPlanInput } from '@cp/ai';
import { withSystem } from '@cp/db';
import { dayTripReach, destinationPhrases, matchWish, type DraftPoi } from '@cp/planner';
import type pg from 'pg';

import type { GroupPlan } from './day-groups';
import { heldPlaceIds, withMealKinds, type HeldStop } from './held-stops';
import type { DraftTripData } from './load';
import { loadDraftPlaces } from './load-places';
import {
  arrivalAtStop,
  buildPlanInput,
  transportTimes,
  tripDates,
  type GroupDays,
  type PlanInputOptions,
} from './plan-input';
import { loadRoutedPairs } from './road-minutes';

/** For each place, the index of the group it belongs to. */
async function homesOf(
  pool: pg.Pool,
  poiIds: readonly string[],
  groups: readonly GroupPlan[],
): Promise<Map<string, number>> {
  if (poiIds.length === 0) return new Map();
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ id: string; home: number | null }>(
      `SELECT p.id, (
                SELECT g.n::int - 1
                  FROM unnest($2::uuid[]) WITH ORDINALITY AS g(id, n)
                  JOIN destinations d ON d.id = g.id
                 WHERE ST_Intersects(p.location, d.place_bounds) OR p.destination_id = d.id
                 ORDER BY ST_Intersects(p.location, d.place_bounds) DESC, g.n DESC
                 LIMIT 1) AS home
         FROM pois p WHERE p.id = ANY($1::uuid[])`,
      [poiIds, groups.map((group) => group.destinationId)],
    ),
  );
  // Inside several boxes (an area inside its city's), the later group's: the area claims it.
  return new Map(rows.map((row) => [row.id, row.home ?? 0]));
}

/** The part of the trip a group plans (dates, when the crew is there, its budget share). */
export function groupDays(trip: DraftTripData, group: GroupPlan): GroupDays {
  const all = tripDates(trip);
  const dates = group.dayNos.map((dayNo) => all[dayNo - 1] ?? all[all.length - 1] ?? '');
  const share = group.dayNos.length / Math.max(1, all.length);
  if (group.dayTrip !== null) {
    return {
      dates,
      share,
      edges: {
        arrivalMin: null,
        departureMin: null,
        arrivalDay: null,
        leavingDay: null,
        reach: { 1: dayTripReach(group.dayTrip.minutes) },
      },
    };
  }
  const flights = transportTimes(trip);
  const landsHere = group.stop === 1 ? group.dayNos.includes(1) : true;
  const arrivalMin =
    group.stop === 1
      ? flights.arrivalMin
      : arrivalAtStop(trip, dates[0] ?? '', group.onwardMinutes);
  return {
    dates,
    share,
    edges: {
      arrivalMin: landsHere ? arrivalMin : null,
      departureMin: group.leaves ? flights.departureMin : null,
      ...(landsHere ? {} : { arrivalDay: null }),
      ...(group.leaves ? {} : { leavingDay: null }),
    },
  };
}

export interface GroupInputsAsk {
  readonly trip: DraftTripData;
  readonly plan: readonly GroupPlan[];
  /** The must-dos still to plan (hers already placed are taken out by the caller). */
  readonly mustDos: DraftTripData['mustDos'];
  readonly held: readonly HeldStop[];
  readonly ideaPlaces: readonly string[];
  readonly taken: ReadonlySet<string>;
  readonly locale: string;
  readonly options: Omit<PlanInputOptions, 'days' | 'routed' | 'prefer' | 'notOffered'>;
}

/** Every group's input, without the guide's wish answers (the stages apply each group's own). */
export async function groupInputs(pool: pg.Pool, ask: GroupInputsAsk): Promise<DayGroup[]> {
  const { trip, plan } = ask;
  const placed = ask.mustDos.flatMap((m) => (m.poiId === null ? [] : [m.poiId]));
  const homes = await homesOf(pool, [...new Set([...placed, ...ask.ideaPlaces])], plan);
  const groupOfDay = (dayNo: number) =>
    Math.max(
      0,
      plan.findIndex((group) => group.dayNos.includes(dayNo)),
    );
  const loaded = await Promise.all(
    plan.map((group, index) => {
      const mine = (id: string) => (homes.get(id) ?? 0) === index;
      const held = ask.held.filter((stop) => groupOfDay(stop.dayNo) === index);
      return loadDraftPlaces(
        pool,
        group.destinationId,
        [...placed.filter(mine), ...ask.ideaPlaces.filter(mine), ...heldPlaceIds(held)],
        { borrow: group.stop > 1 || group.dayTrip !== null },
      );
    }),
  );
  // A place a later group holds belongs to it: the first stop's days do not also get it.
  const later = new Set(loaded.slice(1).flatMap((places) => places.map((poi) => poi.id)));
  const places = loaded.map((list, index) =>
    index === 0 ? list.filter((poi) => !later.has(poi.id)) : list,
  );
  const wishHome = (text: string): number => {
    const found = places.findIndex(
      (list, index) =>
        index > 0 &&
        matchWish(text, list, destinationPhrases(plan[index]?.destination ?? '')).named.length > 0,
    );
    return found === -1 ? 0 : found;
  };
  return Promise.all(
    plan.map(async (group, index): Promise<DayGroup> => {
      const own = places[index] ?? [];
      const mustDos = ask.mustDos.filter((m) =>
        m.poiId === null ? wishHome(m.title) === index : (homes.get(m.poiId) ?? 0) === index,
      );
      const local = ask.held
        .filter((stop) => groupOfDay(stop.dayNo) === index)
        .map((stop) => ({ ...stop, dayNo: group.dayNos.indexOf(stop.dayNo) + 1 }));
      const asked = buildPlanInput(
        { ...trip, destination: group.destination, guideSlug: group.guideSlug, mustDos },
        own,
        {
          ...ask.options,
          ignoreNames: destinationPhrases(group.destination),
          prefer: ask.ideaPlaces,
          notOffered: ask.taken,
          routed: await loadRoutedPairs(
            pool,
            own.map((poi: DraftPoi) => poi.id),
          ),
          days: groupDays(trip, group),
        },
      );
      const input: DraftPlanInput = withHeldStops(
        { ...asked, locale: ask.locale },
        withMealKinds(local, asked.pois, asked.frame),
      );
      return {
        destinationId: group.destinationId,
        dayNos: group.dayNos,
        input,
        ...(group.dayTrip === null ? {} : { dayTrip: { name: group.dayTrip.name } }),
      };
    }),
  );
}
