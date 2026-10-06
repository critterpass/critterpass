/**
 * Places as fit reads them: our own stored hours (never a live third-party attribute), the
 * editors' visit length and best-time line, outdoor by kind, the crowd week and where the crew
 * stands on it. Only active places are read.
 */
import { knownHours } from '@cp/domain';
import { isOutdoorCategory, type FitPlace } from '@cp/planner';
import type pg from 'pg';

import { asSystemRole } from '../../../admin/command';
import { placeAreaSql } from '../area-places';
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
  /** What our editors wrote about when to go, and the place's tags: the time of day it is for. */
  readonly best_time_text: string | null;
  readonly tags: string[];
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
            editorial->>'best_time' AS best_time_text, tags,
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
/**
 * On a trip of several areas, the one each place lies in: of the trip's areas whose place box holds
 * it (or that own it), the smallest, so a day-trip area claims what lies inside its city's box too.
 * A trip of one destination gets none, and every place may go on every day.
 */
async function readPlaceAreas(
  tx: pg.PoolClient,
  tripId: string,
  ids: readonly string[],
): Promise<Map<string, string>> {
  // Place boxes are not the traveller's to read; the caller already checked the trip.
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ id: string; area_id: string | null }>(
      `SELECT p.id, ${placeAreaSql('p', '$1')} AS area_id
         FROM pois p
        WHERE p.id = ANY($2::uuid[]) AND (SELECT count(*) FROM app.trip_area_ids($1, true)) > 1`,
      [tripId, ids],
    ),
  );
  return new Map(rows.flatMap((row) => (row.area_id === null ? [] : [[row.id, row.area_id]])));
}

export async function readFitPlaces(
  tx: pg.PoolClient,
  tripId: string,
  poiIds: readonly string[],
  inPlan: ReadonlyMap<string, string>,
): Promise<FitPlaceFacts[]> {
  const rows = await readPlaceRows(tx, poiIds);
  const ids = rows.map((row) => row.id);
  const [crowds, stances, areas] = await Promise.all([
    readCrowdWeeks(tx, ids),
    readStances(tx, tripId, ids),
    readPlaceAreas(tx, tripId, ids),
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
      name: row.name,
      tags: row.tags,
      bestTimeText: row.best_time_text,
      stableId: inPlan.get(row.id) ?? null,
      areaId: areas.get(row.id) ?? null,
    },
  }));
}
