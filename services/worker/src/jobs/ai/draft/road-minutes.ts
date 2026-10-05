/**
 * A redraft's "minutes less travel" counts what the day screen counts: minutes on the road
 * between stops (a walk is not travel there), from the routed legs the trip already has where a
 * pair of places was routed before, and the planner's estimate only for a pair never routed. A
 * hop short enough to walk counts nothing, as the day screen shows it on foot.
 */
import type { DraftDay } from '@cp/domain';
import { metresBetween, type DraftPoi } from '@cp/planner';
import type pg from 'pg';

/**
 * Two stops this close in a straight line are walked between: the legs job walks up to 1.2 km
 * by the streets, which run about a third longer than the straight line.
 */
const WALK_MAX_M = 900;

export type RoutedLegs = ReadonlyMap<string, { readonly mode: string; readonly minutes: number }>;

const pairKey = (from: string, to: string) => `${from}>${to}`;

/** The trip's routed legs between two places, the latest per pair, by place ids. */
export async function loadRoutedLegs(tx: pg.PoolClient, tripId: string): Promise<RoutedLegs> {
  const { rows } = await tx.query<{
    from_poi: string;
    to_poi: string;
    mode: string;
    minutes: number;
  }>(
    `SELECT DISTINCT ON (f.poi_id, t.poi_id) f.poi_id AS from_poi, t.poi_id AS to_poi, l.mode, l.minutes
       FROM plan_legs l
       JOIN plan_items f ON f.version_id = l.version_id AND f.stable_id::text = l.from_key
       JOIN plan_items t ON t.version_id = l.version_id AND t.stable_id::text = l.to_key
      WHERE l.trip_id = $1 AND NOT l.approx AND f.poi_id IS NOT NULL AND t.poi_id IS NOT NULL
      ORDER BY f.poi_id, t.poi_id, l.computed_at DESC`,
    [tripId],
  );
  return new Map(rows.map((row) => [pairKey(row.from_poi, row.to_poi), row]));
}

/** The day with each stop's travel as minutes on the road, the way the day screen adds them up. */
export function onTheRoad(
  day: DraftDay,
  legs: RoutedLegs,
  pois: ReadonlyMap<string, DraftPoi>,
): DraftDay {
  return {
    ...day,
    items: day.items.map((item, index) => {
      const from = day.items[index - 1]?.poi_id ?? null;
      const to = item.poi_id;
      if (from === null || to === null) return { ...item, travel_min: 0 };
      const routed = legs.get(pairKey(from, to)) ?? legs.get(pairKey(to, from));
      if (routed !== undefined) {
        return { ...item, travel_min: routed.mode === 'walk' ? 0 : routed.minutes };
      }
      const a = pois.get(from);
      const b = pois.get(to);
      const walked = a !== undefined && b !== undefined && metresBetween(a, b) <= WALK_MAX_M;
      return { ...item, travel_min: walked ? 0 : item.travel_min };
    }),
  };
}
