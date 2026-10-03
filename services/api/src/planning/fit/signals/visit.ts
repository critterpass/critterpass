/**
 * Places as fit reads them: our own stored hours (never a live third-party attribute), the
 * editors' visit length and best-time line, outdoor by kind, the crowd week and where the crew
 * stands on it. Only active places are read.
 */
import { knownHours } from '@cp/domain';
import { isOutdoorCategory, type FitPlace } from '@cp/planner';
import type pg from 'pg';

import { readCrowdWeeks } from './crowds';

export interface PlaceRow {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly hours: unknown;
  readonly time_needed_min: number | null;
  readonly best_time: boolean;
  readonly curated: boolean;
}

export interface FitPlaceFacts {
  readonly place: FitPlace & { readonly poiId: string };
  readonly row: PlaceRow;
}

export async function readPlaceRows(
  tx: pg.PoolClient,
  poiIds: readonly string[],
): Promise<PlaceRow[]> {
  if (poiIds.length === 0) return [];
  const { rows } = await tx.query<PlaceRow>(
    `SELECT id, name, category, lat, lng, hours,
            (editorial->>'time_needed_min')::int AS time_needed_min,
            (editorial ? 'best_time') AS best_time,
            (curation = 'editorial') AS curated
       FROM pois WHERE id = ANY($1::uuid[]) AND status = 'active'`,
    [poiIds],
  );
  return rows;
}

async function readStances(tx: pg.PoolClient, tripId: string, poiIds: readonly string[]) {
  const { rows } = await tx.query<{ poi_id: string; want: number; rather_not: number }>(
    `SELECT poi_id, count(*) FILTER (WHERE stance = 'want')::int AS want,
            count(*) FILTER (WHERE stance = 'rather_not')::int AS rather_not
       FROM place_stances WHERE trip_id = $1 AND poi_id = ANY($2::uuid[]) GROUP BY poi_id`,
    [tripId, poiIds],
  );
  return new Map(rows.map((row) => [row.poi_id, { want: row.want, ratherNot: row.rather_not }]));
}

/** Fit places for `poiIds` in a trip, with its plan's own items for places already in it. */
export async function readFitPlaces(
  tx: pg.PoolClient,
  tripId: string,
  poiIds: readonly string[],
  inPlan: ReadonlyMap<string, string>,
): Promise<FitPlaceFacts[]> {
  const rows = await readPlaceRows(tx, poiIds);
  const ids = rows.map((row) => row.id);
  const [crowds, stances] = await Promise.all([
    readCrowdWeeks(tx, ids),
    readStances(tx, tripId, ids),
  ]);
  return rows.map((row) => ({
    row,
    place: {
      poiId: row.id,
      point: { lat: row.lat, lng: row.lng },
      category: row.category,
      hours: knownHours(row.hours),
      timeNeededMin: row.time_needed_min,
      outdoor: isOutdoorCategory(row.category),
      crowds: crowds.get(row.id) ?? null,
      stances: stances.get(row.id) ?? null,
      bestTime: row.best_time,
      stableId: inPlan.get(row.id) ?? null,
    },
  }));
}
