/**
 * `destinations.place_bounds`: the box a destination's open-data places are ingested from and the
 * area place search covers for it. Read by the ingest (this file) and by the api's search.
 *
 * A destination without one gets it from data, in this order: its `geofence` (the seeded,
 * reviewed area), the bounds an operator passes in (the region-pack extracts in
 * `tools/maps/destinations.ts`), or the Overture locality that carries its name in its country,
 * boxed around that point and sized by population (`boxSideKm`). A destination none of these
 * resolves is left without bounds and is not ingested; the report lists it.
 */
import { withSystem } from '@cp/db';
import type pg from 'pg';

import { lookupDivisionPoints, type DivisionPoint } from './division-points';
import type { BoundingBox } from './source-readers';

export interface DestinationPlaceBounds {
  readonly id: string;
  readonly slug: string;
  readonly tz: string | null;
  readonly bbox: BoundingBox;
}

/** Box side for a locality: 8 km for a town of 30k people or fewer up to 30 km for 5M or more. */
const MIN_SIDE_KM = 8;
const MAX_SIDE_KM = 30;
const SMALL_POPULATION = 30_000;
const LARGE_POPULATION = 5_000_000;
/** A matched division without a population (a park, an island, a district). */
const UNKNOWN_POPULATION_SIDE_KM = 12;

export function boxSideKm(population: number | null): number {
  if (population === null || population <= 0) return UNKNOWN_POPULATION_SIDE_KM;
  const position =
    (Math.log10(population) - Math.log10(SMALL_POPULATION)) /
    (Math.log10(LARGE_POPULATION) - Math.log10(SMALL_POPULATION));
  const side = MIN_SIDE_KM + (MAX_SIDE_KM - MIN_SIDE_KM) * Math.min(1, Math.max(0, position));
  return Math.round(side * 10) / 10;
}

const KM_PER_DEGREE_LAT = 111.32;

/** A square of `sideKm` centred on a point, in degrees (longitude widened by latitude). */
export function boxAround(lat: number, lng: number, sideKm: number): BoundingBox {
  const halfLat = sideKm / 2 / KM_PER_DEGREE_LAT;
  const halfLng = sideKm / 2 / (KM_PER_DEGREE_LAT * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const round = (value: number) => Math.round(value * 10_000) / 10_000;
  return {
    minLat: round(lat - halfLat),
    maxLat: round(lat + halfLat),
    minLng: round(lng - halfLng),
    maxLng: round(lng + halfLng),
  };
}

/** Destinations that have place bounds, optionally narrowed to `slugs`, in slug order. */
export async function loadPlaceBounds(
  pool: pg.Pool,
  slugs?: readonly string[],
): Promise<DestinationPlaceBounds[]> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{
      id: string;
      slug: string;
      tz: string | null;
      min_lng: number;
      min_lat: number;
      max_lng: number;
      max_lat: number;
    }>(
      `SELECT id, slug, tz,
              ST_XMin(g) AS min_lng, ST_YMin(g) AS min_lat, ST_XMax(g) AS max_lng, ST_YMax(g) AS max_lat
       FROM destinations, LATERAL (SELECT place_bounds::geometry AS g) b
       WHERE place_bounds IS NOT NULL AND ($1::text[] IS NULL OR slug = ANY($1::text[]))
       ORDER BY slug`,
      [slugs ?? null],
    ),
  );
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    tz: row.tz,
    bbox: { minLat: row.min_lat, maxLat: row.max_lat, minLng: row.min_lng, maxLng: row.max_lng },
  }));
}

export type PlaceBoundsSource = 'geofence' | 'given' | 'locality';

export interface PlaceBoundsBackfill {
  readonly filled: readonly { readonly slug: string; readonly source: PlaceBoundsSource }[];
  /** Destinations no source resolved: they keep no bounds and are not ingested. */
  readonly unresolved: readonly string[];
}

interface MissingRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly country_code: string | null;
  readonly has_geofence: boolean;
}

/**
 * Sets a destination's place box, replacing any value: the operator's correction when the
 * backfill found no locality or the wrong one. Returns false when the slug does not exist.
 */
export async function setPlaceBounds(
  pool: pg.Pool,
  slug: string,
  box: BoundingBox,
): Promise<boolean> {
  const { rowCount } = await withSystem(pool, (tx) =>
    tx.query(
      `UPDATE destinations SET place_bounds = ST_MakeEnvelope($2, $3, $4, $5, 4326)::geography
       WHERE slug = $1`,
      [slug, box.minLng, box.minLat, box.maxLng, box.maxLat],
    ),
  );
  return (rowCount ?? 0) > 0;
}

async function writeBox(pool: pg.Pool, id: string, box: BoundingBox): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      `UPDATE destinations SET place_bounds = ST_MakeEnvelope($2, $3, $4, $5, 4326)::geography
       WHERE id = $1 AND place_bounds IS NULL`,
      [id, box.minLng, box.minLat, box.maxLng, box.maxLat],
    ),
  );
}

/**
 * Fills `place_bounds` where it is missing (see file header for the order); never overwrites a
 * set value, so an operator's correction survives. `given` maps a slug to bounds to use before
 * the locality lookup.
 */
export async function backfillPlaceBounds(
  pool: pg.Pool,
  given: ReadonlyMap<string, BoundingBox> = new Map(),
  lookup: typeof lookupDivisionPoints = lookupDivisionPoints,
): Promise<PlaceBoundsBackfill> {
  const { rows: missing } = await withSystem(pool, (tx) =>
    tx.query<MissingRow>(
      `SELECT d.id, d.slug, d.name, upper(c.code) AS country_code, d.geofence IS NOT NULL AS has_geofence
       FROM destinations d LEFT JOIN critter_sets c ON c.id = d.critter_set_id
       WHERE d.place_bounds IS NULL ORDER BY d.slug`,
    ),
  );
  const filled: { slug: string; source: PlaceBoundsSource }[] = [];

  const fromGeofence = missing.filter((row) => row.has_geofence);
  if (fromGeofence.length > 0) {
    await withSystem(pool, (tx) =>
      tx.query(
        `UPDATE destinations
         SET place_bounds = ST_Envelope(geofence::geometry)::geography
         WHERE id = ANY($1::uuid[]) AND place_bounds IS NULL`,
        [fromGeofence.map((row) => row.id)],
      ),
    );
    filled.push(...fromGeofence.map((row) => ({ slug: row.slug, source: 'geofence' as const })));
  }

  const rest = missing.filter((row) => !row.has_geofence);
  for (const row of rest) {
    const box = given.get(row.slug);
    if (box === undefined) continue;
    await writeBox(pool, row.id, box);
    filled.push({ slug: row.slug, source: 'given' });
  }

  const toLookUp = rest.filter((row) => !given.has(row.slug) && row.country_code !== null);
  const points: ReadonlyMap<string, DivisionPoint> =
    toLookUp.length === 0
      ? new Map()
      : await lookup(
          toLookUp.map((row) => ({
            key: row.slug,
            name: row.name,
            country: row.country_code ?? '',
          })),
        );
  const unresolved: string[] = rest
    .filter((row) => !given.has(row.slug) && row.country_code === null)
    .map((row) => row.slug);
  for (const row of toLookUp) {
    const point = points.get(row.slug);
    if (point === undefined) {
      unresolved.push(row.slug);
      continue;
    }
    await writeBox(pool, row.id, boxAround(point.lat, point.lng, boxSideKm(point.population)));
    filled.push({ slug: row.slug, source: 'locality' });
  }
  return { filled, unresolved: unresolved.sort() };
}
