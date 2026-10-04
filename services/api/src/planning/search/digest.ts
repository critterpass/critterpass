/**
 * The trip digest a plain-words search is parsed against (`search.parse`): the destination, the
 * stay's name, each day of the crew's plan with its weekday, booked meals, whether it is full or a
 * travel day, and the places already in the plan. Read as the caller, so a trip they are not on is
 * NOT_FOUND and an organiser's draft never leaks to a member. Only these fields reach the model.
 */
import type { SearchParseDigest, SearchParseMeal } from '@cp/ai';
import { tripStay } from '@cp/db';
import { DomainError, WEEKDAYS, type Weekday } from '@cp/domain';
import type pg from 'pg';

import { tripFitFacts } from '../fit/context';

/** Plan items naming a meal by category; a booked food place counts by the hour it starts. */
const MEAL_CATEGORIES = new Set(['breakfast', 'lunch', 'dinner', 'coffee', 'drinks']);
const TRAVEL_CATEGORIES = new Set(['flight', 'transfer', 'transit', 'train', 'ferry']);
/** A day with this many stops besides the stay has no room left. */
const FULL_DAY_STOPS = 6;
const PLAN_PLACES_MAX = 30;
/** The guide a trip has before one is picked. */
const DEFAULT_GUIDE_NAME = 'Tokek';

interface ItemRow {
  readonly day_id: string;
  readonly stable_id: string;
  readonly category: string | null;
  readonly poi_category: string | null;
  readonly title: string | null;
  readonly poi_id: string | null;
  readonly booked: boolean;
  readonly local_hour: number | null;
}

function mealOf(item: ItemRow): SearchParseMeal['meal'] | null {
  if (item.category !== null && MEAL_CATEGORIES.has(item.category)) {
    return item.category as SearchParseMeal['meal'];
  }
  if (item.poi_category !== 'food' || item.local_hour === null) return null;
  if (item.local_hour < 11) return 'breakfast';
  return item.local_hour < 16 ? 'lunch' : 'dinner';
}

function weekdayOf(date: string): Weekday {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return WEEKDAYS[(day + 6) % 7] as Weekday;
}

export async function searchDigest(
  tx: pg.PoolClient,
  tripId: string,
): Promise<{ digest: SearchParseDigest; crewId: string }> {
  const trip = await tripFitFacts(tx, tripId);
  const { rows: heads } = await tx.query<{
    name: string | null;
    country: string | null;
    guide: string | null;
  }>(
    `SELECT d.name, d.country, g.name AS guide
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
       LEFT JOIN guides g ON g.id = t.guide_id
      WHERE t.id = $1`,
    [tripId],
  );
  const head = heads[0];
  if (head === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  const days =
    trip.versionId === null
      ? []
      : (
          await tx.query<{ id: string; date: string }>(
            `SELECT id, to_char(date, 'YYYY-MM-DD') AS date FROM plan_days
              WHERE version_id = $1 AND date IS NOT NULL ORDER BY day_no`,
            [trip.versionId],
          )
        ).rows;
  const items =
    trip.versionId === null
      ? []
      : (
          await tx.query<ItemRow>(
            `SELECT i.day_id, i.stable_id, i.category, p.category AS poi_category, i.poi_id,
                    coalesce(p.name, i.custom_place->>'name') AS title,
                    (i.booking_id IS NOT NULL OR i.locked_reason IS NOT NULL) AS booked,
                    extract(hour FROM i.starts_at AT TIME ZONE $2)::int AS local_hour
               FROM plan_items i LEFT JOIN pois p ON p.id = i.poi_id
              WHERE i.version_id = $1 AND i.status IS DISTINCT FROM 'cancelled'
              ORDER BY i.starts_at NULLS LAST`,
            [trip.versionId, trip.tz],
          )
        ).rows;
  const stay = await tripStay(tx, tripId, days[0]?.date, trip.versionId ?? undefined);
  const places = new Map<string, string>();
  for (const item of items) {
    if (item.poi_id === null || item.title === null || item.poi_category === 'stay') continue;
    if (places.size < PLAN_PLACES_MAX) places.set(item.poi_id, item.title);
  }
  const digest: SearchParseDigest = {
    destination: [head.name, head.country].filter((part) => part !== null).join(', '),
    stayName: stay?.name ?? null,
    guideName: head.guide ?? DEFAULT_GUIDE_NAME,
    days: days.map((day) => {
      const own = items.filter((item) => item.day_id === day.id);
      const meals = own.flatMap((item) => {
        const meal = item.booked ? mealOf(item) : null;
        return meal === null || item.title === null
          ? []
          : [{ meal, title: item.title, stableId: item.stable_id }];
      });
      const stops = own.filter((item) => item.poi_category !== 'stay' && item.category !== 'stay');
      return {
        id: day.id,
        date: day.date,
        weekday: weekdayOf(day.date),
        meals,
        full: stops.length >= FULL_DAY_STOPS,
        travel: own.some((item) => item.category !== null && TRAVEL_CATEGORIES.has(item.category)),
      };
    }),
    places: [...places.entries()].map(([id, name]) => ({ id, name })),
  };
  return { digest, crewId: trip.crewId };
}
