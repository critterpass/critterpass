/**
 * Lists the destinations people are planning trips to that have no region pack yet, most trips
 * first, so the next packs to build are the ones being waited for. Read-only: it selects from
 * `trips`, `destinations` and `map_regions` and writes nothing.
 *
 *   railway run --service api --environment staging -- pnpm --filter @cp/maps missing:regions
 *   … -- pnpm --filter @cp/maps missing:regions --days 90
 *
 * Each line carries the place's own box (`destinations.place_bounds`, else its geofence, else the
 * extent of its places). That box is the town itself: widen it to the day trips before building
 * (`build-pmtiles.ts --destination <slug> --bounds <box> --geofabrik-region <region>`, or the
 * `map regions` workflow), then record the box used in `destinations.ts`. Reads
 * `DATABASE_DIRECT_URL`, like `upload-r2.ts`.
 */
import { createPool, withSystem } from '@cp/db';

import { GUEST_PLACE_EXTRACTS, GUIDE_DESTINATION_EXTRACTS } from './destinations';

const DEFAULT_DAYS = 30;

interface Row {
  readonly slug: string;
  readonly name: string;
  readonly trips: number;
  readonly latest_trip: string;
  readonly min_lon: number | null;
  readonly min_lat: number | null;
  readonly max_lon: number | null;
  readonly max_lat: number | null;
}

const QUERY = `
  WITH wanted AS (
    SELECT t.destination_id, count(*)::int AS trips, max(t.created_at) AS latest_trip
      FROM trips t
     WHERE t.destination_id IS NOT NULL
       AND t.created_at >= now() - make_interval(days => $1)
     GROUP BY t.destination_id
  ), extent AS (
    SELECT d.slug, d.name, w.trips, w.latest_trip,
           COALESCE(ST_Envelope(d.place_bounds::geometry),
                    ST_Envelope(d.geofence::geometry),
                    (SELECT ST_Extent(p.location::geometry)::geometry
                       FROM pois p WHERE p.destination_id = d.id)) AS box
      FROM wanted w
      JOIN destinations d ON d.id = w.destination_id
     WHERE NOT EXISTS (SELECT 1 FROM map_regions m WHERE m.destination_id = d.id)
  )
  SELECT slug, name, trips, to_char(latest_trip, 'YYYY-MM-DD') AS latest_trip,
         ST_XMin(box) AS min_lon, ST_YMin(box) AS min_lat,
         ST_XMax(box) AS max_lon, ST_YMax(box) AS max_lat
    FROM extent
   ORDER BY trips DESC, slug`;

export interface MissingRegion {
  readonly slug: string;
  readonly name: string;
  readonly trips: number;
  readonly latestTrip: string;
  /** `minLon,minLat,maxLon,maxLat` of the place itself; null when nothing places it yet. */
  readonly placeBox: string | null;
  /** The box and extract already on record for it in `destinations.ts`, ready to build. */
  readonly onRecord: { readonly bounds: string; readonly geofabrikRegion: string } | null;
}

function toMissingRegion(row: Row): MissingRegion {
  const corners = [row.min_lon, row.min_lat, row.max_lon, row.max_lat];
  const known = [...GUIDE_DESTINATION_EXTRACTS, ...GUEST_PLACE_EXTRACTS].find(
    (entry) => entry.slug === row.slug,
  );
  return {
    slug: row.slug,
    name: row.name,
    trips: row.trips,
    latestTrip: row.latest_trip,
    placeBox: corners.some((corner) => corner === null) ? null : corners.join(','),
    onRecord:
      known === undefined ? null : { bounds: known.bounds, geofabrikRegion: known.geofabrikRegion },
  };
}

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_DIRECT_URL'];
  if (connectionString === undefined) throw new Error('DATABASE_DIRECT_URL is required');
  const flag = process.argv.indexOf('--days');
  const days = flag === -1 ? DEFAULT_DAYS : Number(process.argv[flag + 1]);
  if (!Number.isInteger(days) || days < 1) throw new Error('--days takes a whole number of days');

  const pool = createPool({ connectionString, max: 1 });
  try {
    const { rows } = await withSystem(pool, (tx) => tx.query<Row>(QUERY, [days]));
    for (const row of rows) console.log(JSON.stringify(toMissingRegion(row)));
    console.error(
      JSON.stringify({ msg: 'tiles missing-regions: done', days, destinations: rows.length }),
    );
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
