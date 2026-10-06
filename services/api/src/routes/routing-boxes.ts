/**
 * `GET /v1/routing/boxes`: the boxes the routing tile build (`.github/workflows/routing-tiles.yml`)
 * cuts from OpenStreetMap. One per destination the planning legs need: every live destination and
 * every destination with a trip in planning, pre or in. The box is the destination's `place_bounds`
 * (the area place search covers), else its geofence envelope, else the extent of its places; a
 * destination with none of them is left out until it has one. The build widens each box by 30 km.
 *
 * It answers slugs and boxes only: nothing about people, how many trips, or when. The route needs
 * no session, so the work behind it is bounded here: the list is read at most once every five
 * minutes per api instance, whoever asks and however often.
 */
import { withSystem } from '@cp/db';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';

export const ROUTING_BOXES_CACHE_MS = 5 * 60 * 1000;

export interface RoutingBox {
  readonly slug: string;
  /** A live destination, or one with a trip in planning, pre or in. */
  readonly reason: 'live' | 'active_trip';
  /** `[minLon, minLat, maxLon, maxLat]`, WGS84, before the build's 30 km widening. */
  readonly bbox: readonly [number, number, number, number];
}

export interface RoutingBoxes {
  /** When the list was read (ISO date). */
  readonly generatedAt: string;
  readonly boxes: readonly RoutingBox[];
}

interface BoxRow {
  readonly slug: string;
  readonly reason: RoutingBox['reason'];
  readonly min_lon: number | null;
  readonly min_lat: number | null;
  readonly max_lon: number | null;
  readonly max_lat: number | null;
}

const QUERY = `
  WITH needed AS (
    SELECT d.id, d.slug, d.place_bounds, d.geofence,
           CASE WHEN d.coverage = 'live' THEN 'live' ELSE 'active_trip' END AS reason
      FROM destinations d
     WHERE d.coverage = 'live'
        OR EXISTS (SELECT 1 FROM trips t
                    WHERE t.destination_id = d.id AND t.phase IN ('planning', 'pre', 'in'))
  ), extent AS (
    SELECT n.slug, n.reason,
           COALESCE(ST_Envelope(n.place_bounds::geometry),
                    ST_Envelope(n.geofence::geometry),
                    (SELECT ST_Extent(p.location::geometry)::geometry
                       FROM pois p WHERE p.destination_id = n.id)) AS box
      FROM needed n
  )
  SELECT slug, reason,
         ST_XMin(box) AS min_lon, ST_YMin(box) AS min_lat,
         ST_XMax(box) AS max_lon, ST_YMax(box) AS max_lat
    FROM extent
   ORDER BY slug`;

const round = (value: number) => Math.round(value * 10_000) / 10_000;

/** The row's box; a single place has a zero-area extent, so it gets a sliver of width. */
export function toRoutingBox(row: BoxRow): RoutingBox | null {
  const { min_lon, min_lat, max_lon, max_lat } = row;
  if (min_lon === null || min_lat === null || max_lon === null || max_lat === null) return null;
  const pad = (min: number, max: number) => (max - min < 0.002 ? 0.001 : 0);
  const lonPad = pad(min_lon, max_lon);
  const latPad = pad(min_lat, max_lat);
  return {
    slug: row.slug,
    reason: row.reason,
    bbox: [
      round(min_lon - lonPad),
      round(min_lat - latPad),
      round(max_lon + lonPad),
      round(max_lat + latPad),
    ],
  };
}

export async function listRoutingBoxes(pool: pg.Pool): Promise<RoutingBoxes> {
  const rows = await withSystem(pool, async (tx) => (await tx.query<BoxRow>(QUERY)).rows);
  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    boxes: rows.map(toRoutingBox).filter((box): box is RoutingBox => box !== null),
  };
}

/** The list, read at most once per `ROUTING_BOXES_CACHE_MS`; concurrent callers share one read. */
export function createRoutingBoxesReader(
  pool: pg.Pool,
  now: () => number = Date.now,
): () => Promise<RoutingBoxes> {
  let cached: { readonly at: number; readonly boxes: Promise<RoutingBoxes> } | null = null;
  return () => {
    if (cached !== null && now() - cached.at < ROUTING_BOXES_CACHE_MS) return cached.boxes;
    const boxes = listRoutingBoxes(pool);
    const entry = { at: now(), boxes };
    cached = entry;
    // A failed read is not kept: the next caller asks the database again.
    boxes.catch(() => {
      if (cached === entry) cached = null;
    });
    return boxes;
  };
}

export function registerRoutingBoxesRoute(
  app: OpenAPIHono<AppEnv>,
  deps: { readonly pool: pg.Pool; readonly now?: () => number },
): void {
  const read = createRoutingBoxesReader(deps.pool, deps.now);
  app.get('/v1/routing/boxes', async (c) => {
    const body = await read();
    c.header('Cache-Control', 'public, max-age=300');
    return c.json(body);
  });
}
