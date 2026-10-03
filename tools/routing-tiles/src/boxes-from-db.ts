/**
 * Regenerates `boxes.json` from `destinations`: every live destination plus every
 * destination with a trip in planning, pre or in. The box is the destination's `place_bounds`
 * (the area place search covers), else its geofence envelope, else the extent of its places. Read-only (one
 * `READ ONLY` transaction); run it against staging and commit the result:
 *
 *   railway run --service api --environment staging -- \
 *     pnpm exec tsx <repo>/tools/routing-tiles/src/boxes-from-db.ts [--check]
 *
 * `--check` writes nothing and exits 1 when a destination that needs routing has no box in the
 * committed file (or no extent to make one from).
 */
import { writeFileSync } from 'node:fs';

import { createPool, withSystem } from '@cp/db';

import { BOXES_PATH, readBoxes, type BoxesFile, type DestinationBox } from './boxes';

interface Row {
  readonly slug: string;
  readonly reason: DestinationBox['reason'];
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

async function readNeeded(): Promise<Row[]> {
  const connectionString = process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'];
  if (connectionString === undefined) throw new Error('DATABASE_URL is required');
  const pool = createPool({ connectionString, max: 1 });
  try {
    return await withSystem(pool, async (tx) => {
      await tx.query('SET TRANSACTION READ ONLY');
      return (await tx.query<Row>(QUERY)).rows;
    });
  } finally {
    await pool.end();
  }
}

const round = (value: number) => Math.round(value * 10_000) / 10_000;

export function toBox(row: Row): DestinationBox | null {
  const { min_lon, min_lat, max_lon, max_lat } = row;
  if (min_lon === null || min_lat === null || max_lon === null || max_lat === null) return null;
  // A single curated place has a zero-area extent; the build buffer still gives it 30 km.
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

async function main(): Promise<void> {
  const rows = await readNeeded();
  const missingExtent = rows.filter((row) => toBox(row) === null).map((row) => row.slug);
  if (process.argv.includes('--check')) {
    const committed = new Set(readBoxes().boxes.map((box) => box.slug));
    const missing = rows.map((row) => row.slug).filter((slug) => !committed.has(slug));
    console.log(`destinations needing routing: ${rows.length}; without a box: ${missing.length}`);
    if (missing.length > 0) console.log(`missing: ${missing.join(', ')}`);
    if (missingExtent.length > 0) console.log(`no extent: ${missingExtent.join(', ')}`);
    process.exitCode = missing.length > 0 ? 1 : 0;
    return;
  }
  const file: BoxesFile = {
    generatedAt: new Date().toISOString().slice(0, 10),
    boxes: rows.map(toBox).filter((box): box is DestinationBox => box !== null),
  };
  writeFileSync(BOXES_PATH, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`wrote ${file.boxes.length} boxes; no extent: ${missingExtent.join(', ') || 'none'}`);
}

if (import.meta.filename === process.argv[1]) await main();
