/**
 * What placing ideas reads, as the system: the crew's plan as the plan check sees it (current
 * version, stays, rain, crowds, stored legs, pace limit) and the chosen ideas not yet on a day,
 * each as a fit place from our own place facts (a dropped pin has only its position).
 */
import { knownHours } from '@cp/domain';
import {
  crowdWeeks,
  isOutdoorCategory,
  placeIdeas,
  type CrowdCurveRow,
  type PlacementIdea,
} from '@cp/planner';
import type pg from 'pg';

import { loadCheck, readCheckTrip, type LoadedCheck } from '../check/context';

export interface PlacementInput {
  readonly trip_id: string;
  /** Null: every live idea not yet on a day. */
  readonly idea_ids: readonly string[] | null;
}

export interface PlacementIdeaRow {
  readonly id: string;
  readonly poi_id: string | null;
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly hours: unknown;
  readonly time_needed_min: number | null;
  readonly best_time: boolean;
  readonly want: number;
  readonly rather_not: number;
}

export interface LoadedPlacement {
  readonly loaded: LoadedCheck;
  readonly ideas: readonly PlacementIdeaRow[];
  readonly versionId: string;
}

export async function loadPlacement(
  tx: pg.PoolClient,
  input: PlacementInput,
  now: Date,
): Promise<LoadedPlacement | null> {
  const trip = await readCheckTrip(tx, input.trip_id);
  if (trip === null || trip.versionId === null) return null;
  const loaded = await loadCheck(tx, trip, now);
  const { rows } = await tx.query<PlacementIdeaRow>(
    `SELECT i.id, i.poi_id, i.name, coalesce(p.category, i.category) AS category,
            coalesce(p.lat, i.lat) AS lat, coalesce(p.lng, i.lng) AS lng, p.hours,
            (p.editorial->>'time_needed_min')::int AS time_needed_min,
            coalesce(p.editorial ? 'best_time', false) AS best_time,
            (SELECT count(*) FROM place_stances s
              WHERE s.trip_id = i.trip_id AND s.poi_id = i.poi_id AND s.stance = 'want')::int AS want,
            (SELECT count(*) FROM place_stances s
              WHERE s.trip_id = i.trip_id AND s.poi_id = i.poi_id AND s.stance = 'rather_not')::int AS rather_not
       FROM trip_ideas i LEFT JOIN pois p ON p.id = i.poi_id
      WHERE i.trip_id = $1 AND i.deleted_at IS NULL
        AND ($2::uuid[] IS NULL OR i.id = ANY($2::uuid[]))
        AND NOT EXISTS (SELECT 1 FROM plan_items pi
                         WHERE pi.version_id = $3 AND pi.poi_id = i.poi_id)
      ORDER BY i.id`,
    [input.trip_id, input.idea_ids, trip.versionId],
  );
  return { loaded, ideas: rows, versionId: trip.versionId };
}

/** Each idea as the fit engine reads it, with its own crowd week. */
export async function placementIdeas(
  tx: pg.PoolClient,
  rows: readonly PlacementIdeaRow[],
): Promise<PlacementIdea[]> {
  const poiIds = rows.flatMap((row) => (row.poi_id === null ? [] : [row.poi_id]));
  const curves = await tx.query<CrowdCurveRow>(
    `SELECT poi_id, dow, hourly, source, approved_at FROM crowd_forecasts
      WHERE poi_id = ANY($1::uuid[]) AND source IN ('visits', 'editorial')`,
    [poiIds],
  );
  const weeks = crowdWeeks(curves.rows);
  return rows.map((row) => ({
    ideaId: row.id,
    place: {
      poiId: row.poi_id,
      point: { lat: row.lat, lng: row.lng },
      category: row.category,
      hours: knownHours(row.hours),
      timeNeededMin: row.time_needed_min,
      outdoor: isOutdoorCategory(row.category),
      crowds: row.poi_id === null ? null : (weeks.get(row.poi_id) ?? null),
      stances: { want: row.want, ratherNot: row.rather_not },
      bestTime: row.best_time,
    },
  }));
}

export function runPlacement(placement: LoadedPlacement, ideas: readonly PlacementIdea[]) {
  return placeIdeas(placement.loaded.context, ideas, {
    maxStopsPerDay: placement.loaded.thresholds.paceStopsPer9h,
  });
}
