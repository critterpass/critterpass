/**
 * The day groups a draft is planned in (see `@cp/ai`'s ./groups): one per stop for the days spent
 * in that stop's city, and one per day spent on a day trip. Worked out once, in the job's first
 * step, from the trip's areas over the version the job starts from (`tripAreas`) and, on a first
 * draft, the essential day trips it gives a day (./day-trips.ts); every later step plans from
 * that saved answer, so a resumed step plans the same groups.
 *
 * With `trip.areas` off, or with one group, there is no plan: the job takes today's path.
 */
import { tripAreas, withSystem } from '@cp/db';
import { PLANNING_CONFIG_DEFAULTS } from '@cp/domain';
import type pg from 'pg';

import { chooseDayTrips, essentialDayTrips, type DayTripChoice } from './day-trips';
import type { HeldStop } from './held-stops';
import type { DraftTripData } from './load';
import { tripDates } from './plan-input';

export const TRIP_AREAS_KEY = 'trip.areas';

export interface GroupPlan {
  readonly destinationId: string;
  /** "Huế, Vietnam". */
  readonly destination: string;
  readonly guideSlug: string | null;
  /** Trip day numbers, ascending. */
  readonly dayNos: readonly number[];
  /** The position of the stop the group's days belong to (1 = the trip's destination). */
  readonly stop: number;
  /** For a day trip: the area's name and the link's minutes each way. */
  readonly dayTrip: { readonly name: string; readonly minutes: number } | null;
  /** For a later stop: the minutes of the link from the stop before, when one is known. */
  readonly onwardMinutes: number | null;
  /** Whether the trip's last day is in this group (the crew leaves from it). */
  readonly leaves: boolean;
}

export interface GroupsPlan {
  /** Empty for a trip planned as one destination. */
  readonly groups: readonly GroupPlan[];
  /** What a first draft did with the destination's essential day trips; null when not asked. */
  readonly dayTrips: DayTripChoice | null;
}

export const NO_GROUPS: GroupsPlan = { groups: [], dayTrips: null };

export async function tripAreasOn(tx: pg.PoolClient): Promise<boolean> {
  const { rows } = await tx.query<{ value: unknown }>(
    'SELECT value FROM ops.ops_config WHERE key = $1',
    [TRIP_AREAS_KEY],
  );
  return (
    (rows[0] === undefined ? PLANNING_CONFIG_DEFAULTS[TRIP_AREAS_KEY] : rows[0].value) === true
  );
}

interface Place {
  readonly name: string;
  readonly destination: string;
  readonly guideSlug: string | null;
}

async function placesOf(tx: pg.PoolClient, ids: readonly string[]): Promise<Map<string, Place>> {
  const { rows } = await tx.query<{
    id: string;
    name: string;
    country: string | null;
    guide_slug: string | null;
  }>(
    `SELECT d.id, d.name, d.country, g.slug AS guide_slug
       FROM destinations d LEFT JOIN guides g ON g.id = app.destination_guide_id(d.id)
      WHERE d.id = ANY($1::uuid[])`,
    [ids],
  );
  return new Map(
    rows.map((row) => [
      row.id,
      {
        name: row.name,
        destination: [row.name, row.country].filter(Boolean).join(', '),
        guideSlug: row.guide_slug,
      },
    ]),
  );
}

export interface GroupsAsk {
  readonly tripId: string;
  readonly dayCount: number;
  /** The version the job starts from (a redraft names it); null = the trip's draft. */
  readonly baseVersionId: string | null;
  /** A first draft: the essential day trips may be given a day. */
  readonly first: boolean;
  /** Her stops on the version the job starts from: a day holding one takes no day trip. */
  readonly held: readonly HeldStop[];
}

/** The groups of a trip, or none when it is planned as one destination. */
export async function planDayGroups(pool: pg.Pool, ask: GroupsAsk): Promise<GroupsPlan> {
  return withSystem(pool, async (tx) => {
    if (!(await tripAreasOn(tx))) return NO_GROUPS;
    const areas = await tripAreas(tx, ask.tripId, ask.baseVersionId ?? undefined);
    if (areas === null) return NO_GROUPS;
    const away = new Map<number, { areaId: string; minutes: number | null }>();
    for (const day of areas.days) {
      const stop = areas.stops.find((s) => s.position === day.stopPosition);
      if (stop !== undefined && day.areaId !== stop.destinationId) {
        away.set(day.dayNo, { areaId: day.areaId, minutes: day.link?.minutes ?? null });
      }
    }
    let dayTrips: DayTripChoice | null = null;
    if (ask.first && areas.stops.length === 1 && away.size === 0) {
      const candidates = await essentialDayTrips(tx, areas.destinationId);
      // A destination with no essential day trip leaves the draft as it always was.
      dayTrips =
        candidates.length === 0
          ? null
          : chooseDayTrips(ask.dayCount, candidates, new Set(ask.held.map((s) => s.dayNo)));
      for (const trip of dayTrips?.placed ?? []) {
        away.set(trip.dayNo, { areaId: trip.destinationId, minutes: trip.minutes });
      }
    }
    if (areas.stops.length === 1 && away.size === 0) return { groups: [], dayTrips };
    const places = await placesOf(tx, [
      ...areas.stops.map((s) => s.destinationId),
      ...[...away.values()].map((a) => a.areaId),
    ]);
    const lastDay = Math.max(ask.dayCount, ...areas.stops.map((s) => s.lastDay));
    const groups: GroupPlan[] = [];
    for (const stop of areas.stops) {
      const place = places.get(stop.destinationId);
      const days = Array.from(
        { length: stop.lastDay - stop.firstDay + 1 },
        (_, i) => stop.firstDay + i,
      );
      const city = days.filter((day) => !away.has(day));
      const common = {
        stop: stop.position,
        onwardMinutes: stop.onwardLink?.minutes ?? null,
      };
      if (city.length > 0) {
        groups.push({
          destinationId: stop.destinationId,
          destination: place?.destination ?? '',
          guideSlug: place?.guideSlug ?? null,
          dayNos: city,
          dayTrip: null,
          leaves: city.includes(lastDay),
          ...common,
        });
      }
      for (const dayNo of days.filter((day) => away.has(day))) {
        const trip = away.get(dayNo);
        const area = trip === undefined ? undefined : places.get(trip.areaId);
        if (trip === undefined) continue;
        groups.push({
          destinationId: trip.areaId,
          destination: area?.destination ?? '',
          // A day trip keeps the guide of the stop it leaves from.
          guideSlug: place?.guideSlug ?? null,
          dayNos: [dayNo],
          dayTrip: { name: area?.name ?? '', minutes: trip.minutes ?? 0 },
          leaves: dayNo === lastDay,
          ...common,
        });
      }
    }
    return { groups, dayTrips };
  });
}

/** What a first draft asks: the whole trip, its essential day trips, around her stops. */
export function firstDraftAsk(trip: DraftTripData, held: readonly HeldStop[]): GroupsAsk {
  return {
    tripId: trip.tripId,
    dayCount: tripDates(trip).length,
    baseVersionId: null,
    first: true,
    held,
  };
}

/**
 * What saving writes beside the days: the area of every day not spent in the trip's first city
 * (a day trip's day, every day of a later stop), and what became of the essential day trips.
 */
export function savedAreas(plan: GroupsPlan): {
  readonly dayAreas: ReadonlyMap<number, string>;
  readonly dayTrips: DayTripChoice | null;
} {
  const dayAreas = new Map<number, string>();
  for (const group of plan.groups) {
    if (group.stop === 1 && group.dayTrip === null) continue;
    for (const dayNo of group.dayNos) dayAreas.set(dayNo, group.destinationId);
  }
  return { dayAreas, dayTrips: plan.dayTrips };
}
