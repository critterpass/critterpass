/**
 * `GET /v1/map/regions/wanted`: the destinations people are planning for that have no region pack
 * yet, for the scheduled `map regions` workflow, which builds and publishes their packs. That
 * makes the app's "a detailed map is on its way" true with no credential beyond the bucket token
 * the workflow already holds.
 *
 * It answers slugs and boxes only: a destination with a trip or a pitch in the last 30 days and no
 * `map_regions` row, the one asked for longest ago first. Nothing about people, how many trips, or
 * when. The box is the place's own (`place_bounds`, else its geofence) widened by the 30 km
 * day-trip reach the route server's tiles use (tools/routing-tiles/src/boxes.ts); a destination
 * with no box is left out until it has one.
 *
 * The route needs no session, so the work behind it is bounded here: the list is read at most once
 * every five minutes per api instance, whoever asks and however often.
 */
import { withSystem } from '@cp/db';
import type pg from 'pg';

export const WANTED_WINDOW_DAYS = 30;
export const WANTED_MAX = 20;
export const WANTED_CACHE_MS = 5 * 60 * 1000;
const REACH_KM = 30;
const KM_PER_DEGREE = 111.32;

export interface WantedRegion {
  readonly slug: string;
  /** `[minLon, minLat, maxLon, maxLat]`, the place's box widened to its day trips. */
  readonly bounds: readonly [number, number, number, number];
}

interface WantedRow {
  readonly slug: string;
  readonly min_lon: number;
  readonly min_lat: number;
  readonly max_lon: number;
  readonly max_lat: number;
}

const round = (value: number) => Math.round(value * 1e4) / 1e4;

/** Widens a box by `REACH_KM` on every side (longitude degrees shrink with latitude). */
export function widenToDayTrips(row: Omit<WantedRow, 'slug'>): WantedRegion['bounds'] {
  const dLat = REACH_KM / KM_PER_DEGREE;
  const middle = ((row.min_lat + row.max_lat) / 2) * (Math.PI / 180);
  const dLon = REACH_KM / (KM_PER_DEGREE * Math.max(Math.cos(middle), 0.1));
  return [
    round(Math.max(row.min_lon - dLon, -180)),
    round(Math.max(row.min_lat - dLat, -85)),
    round(Math.min(row.max_lon + dLon, 180)),
    round(Math.min(row.max_lat + dLat, 85)),
  ];
}

export async function listWantedRegions(pool: pg.Pool): Promise<WantedRegion[]> {
  const rows = await withSystem(pool, async (tx) => {
    const result = await tx.query<WantedRow>(
      `WITH asked AS (
         SELECT destination_id, min(created_at) AS first_asked
           FROM (SELECT destination_id, created_at FROM trips
                  WHERE destination_id IS NOT NULL
                    AND created_at >= now() - make_interval(days => $1)
                 UNION ALL
                 SELECT destination_id, created_at FROM pitches
                  WHERE created_at >= now() - make_interval(days => $1)) requests
          GROUP BY destination_id
       ), boxed AS (
         SELECT d.slug, a.first_asked,
                COALESCE(ST_Envelope(d.place_bounds::geometry),
                         ST_Envelope(d.geofence::geometry)) AS box
           FROM asked a
           JOIN destinations d ON d.id = a.destination_id
          WHERE NOT EXISTS (SELECT 1 FROM map_regions m WHERE m.destination_id = d.id)
       )
       SELECT slug, ST_XMin(box) AS min_lon, ST_YMin(box) AS min_lat,
              ST_XMax(box) AS max_lon, ST_YMax(box) AS max_lat
         FROM boxed
        WHERE box IS NOT NULL
        ORDER BY first_asked, slug
        LIMIT $2`,
      [WANTED_WINDOW_DAYS, WANTED_MAX],
    );
    return result.rows;
  });
  return rows.map((row) => ({ slug: row.slug, bounds: widenToDayTrips(row) }));
}

/** The list, read at most once per `WANTED_CACHE_MS`; concurrent callers share one read. */
export function createWantedRegionsReader(
  pool: pg.Pool,
  now: () => number = Date.now,
): () => Promise<readonly WantedRegion[]> {
  let cached: { readonly at: number; readonly regions: Promise<readonly WantedRegion[]> } | null =
    null;
  return () => {
    if (cached !== null && now() - cached.at < WANTED_CACHE_MS) return cached.regions;
    const regions = listWantedRegions(pool);
    const entry = { at: now(), regions };
    cached = entry;
    // A failed read is not kept: the next caller asks the database again.
    regions.catch(() => {
      if (cached === entry) cached = null;
    });
    return regions;
  };
}
