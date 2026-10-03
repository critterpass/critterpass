/**
 * The tiled place ingest end to end on real Postgres and pg-boss: a destination job plans tiles
 * from its stored FSQ OS rows, the tile jobs write each place once (a pair split by a tile edge and
 * a place on the edge included), and the run's finish reads OpenStreetMap once for the whole box,
 * releases the stored rows and reports the active count. Overture and OSM are the network
 * boundary, faked by readers that honour the bbox they are given.
 */
import type { PgBoss } from 'pg-boss';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PLACES_INGEST_TILE_QUEUE } from '../../src/jobs/places/ingest-tile';
import { PLACES_INGEST_QUEUE, placesJobs } from '../../src/jobs/places';
import { planDestinationTiles } from '../../src/places/ingest-tile-run';
import type { DestinationPlaceBounds } from '../../src/places/place-bounds';
import type { BoundingBox, PlaceSourceRow } from '../../src/places/source-readers';
import { startJobsHarness, until, type JobsHarness } from '../helpers/jobs-harness';

const BOX: BoundingBox = { minLat: 34.9, maxLat: 35.1, minLng: 135.6, maxLng: 135.8 };
const MAX_TILE_ROWS = 60;
const OFFSET = 0.0002; // about 18 m east-west at this latitude

let harness: JobsHarness;

beforeAll(async () => {
  harness = await startJobsHarness();
}, 180_000);

afterEach(async () => {
  await harness.stopAll();
});

afterAll(async () => {
  await harness?.close();
});

interface FsqRow {
  readonly id: string;
  readonly name: string;
  readonly labels: readonly string[];
  readonly lat: number;
  readonly lng: number;
}

async function insertFsqRows(runId: string, slug: string, rows: readonly FsqRow[]): Promise<void> {
  await harness.pool.query(
    `INSERT INTO fsq_os_export_rows (run_id, slug, fsq_place_id, name, category_labels, lat, lng)
     SELECT $1, $2, r.id, r.name, ARRAY(SELECT jsonb_array_elements_text(r.labels)), r.lat, r.lng
     FROM jsonb_to_recordset($3::jsonb) AS r(id text, name text, labels jsonb, lat float8, lng float8)`,
    [runId, slug, JSON.stringify(rows)],
  );
}

function inBox(row: { readonly lat: number; readonly lng: number }, box: BoundingBox): boolean {
  return (
    row.lat >= box.minLat && row.lat <= box.maxLat && row.lng >= box.minLng && row.lng <= box.maxLng
  );
}

describe('tiled places ingest', { timeout: 180_000 }, () => {
  it('writes every place once across tiles and finishes the run once', async () => {
    const slug = `kyoto-tiles-${Date.now()}`;
    const { rows: destination } = await harness.pool.query<{ id: string }>(
      `INSERT INTO destinations (slug, name, coverage, tz, place_bounds)
       VALUES ($1, 'Kyoto', 'live', 'Asia/Tokyo', ST_MakeEnvelope($2, $3, $4, $5, 4326)::geography)
       RETURNING id`,
      [slug, BOX.minLng, BOX.minLat, BOX.maxLng, BOX.maxLat],
    );
    const target: DestinationPlaceBounds = {
      id: destination[0]!.id,
      slug,
      tz: 'Asia/Tokyo',
      bbox: BOX,
    };
    const { rows: run } = await harness.pool.query<{ id: string }>(
      "INSERT INTO fsq_os_export_runs (targets, chunk_count) VALUES ('[]', 0) RETURNING id",
    );
    const fsqRunId = run[0]!.id;

    // A dense block of cafes in the west of the box: enough rows to split it into tiles.
    const cafes: FsqRow[] = [];
    for (let i = 0; i < 240; i += 1) {
      cafes.push({
        id: `fsq-cafe-${i}`,
        name: `Cafe Number ${i}`,
        labels: ['Coffee Shop'],
        lat: 34.95 + (i % 20) * 0.005,
        lng: 135.61 + Math.floor(i / 20) * 0.007,
      });
    }
    await insertFsqRows(fsqRunId, slug, cafes);
    const planned = await planDestinationTiles(harness.pool, target, fsqRunId, MAX_TILE_ROWS);
    expect(planned.length).toBeGreaterThan(1);

    // Nishiki Market sits on an inner tile edge: its FSQ row just west of it, its Overture twin
    // just east, and Gion Corner exactly on the edge line.
    const westTile = planned.find((tile) => tile.maxLng < BOX.maxLng)!;
    const edge = westTile.maxLng;
    const lat = (westTile.minLat + westTile.maxLat) / 2;
    await insertFsqRows(fsqRunId, slug, [
      { id: 'fsq-nishiki', name: 'Nishiki Market', labels: ['Market'], lat, lng: edge - OFFSET },
    ]);
    expect(await planDestinationTiles(harness.pool, target, fsqRunId, MAX_TILE_ROWS)).toEqual(
      planned,
    );

    const overture: PlaceSourceRow[] = [
      {
        sourceId: 'ov-nishiki',
        name: 'Nishiki Market',
        categoryLabels: ['market'],
        lat,
        lng: edge + OFFSET,
        confidence: 0.9,
      },
      {
        sourceId: 'ov-gion',
        name: 'Gion Corner',
        categoryLabels: ['theatre'],
        lat,
        lng: edge,
        confidence: 0.9,
      },
    ];
    const osmReads: BoundingBox[] = [];
    const boss: PgBoss = await harness.startRuntime(
      placesJobs({
        sources: {
          readOverturePlaces: (box) => Promise.resolve(overture.filter((row) => inBox(row, box))),
          readOsmPlaces: (box) => {
            osmReads.push(box);
            return Promise.resolve([]);
          },
        },
        maxTileFsqRows: MAX_TILE_ROWS,
      }),
    );
    await boss.send(PLACES_INGEST_QUEUE, { slug, fsqRunId });

    let finish: Record<string, unknown> | undefined;
    await until(async () => {
      const jobs = await boss.findJobs(PLACES_INGEST_TILE_QUEUE, {
        data: { slug, stage: 'finish' },
      });
      const done = jobs.find((job) => job.state === 'completed');
      finish = done?.output as Record<string, unknown> | undefined;
      return finish !== undefined;
    }, 150_000);

    const tileJobs = await boss.findJobs(PLACES_INGEST_TILE_QUEUE, {
      data: { slug, stage: 'sources' },
    });
    expect(tileJobs).toHaveLength(planned.length);
    expect(tileJobs.every((job) => job.state === 'completed')).toBe(true);

    const { rows: pois } = await harness.pool.query<{ source_ids: Record<string, string> }>(
      'SELECT source_ids FROM pois WHERE destination_id = $1',
      [target.id],
    );
    expect(pois).toHaveLength(cafes.length + 2);
    const nishiki = pois.filter(
      (poi) =>
        poi.source_ids['fsq_os'] === 'fsq-nishiki' || poi.source_ids['overture'] === 'ov-nishiki',
    );
    expect(nishiki.map((poi) => poi.source_ids)).toEqual([
      { fsq_os: 'fsq-nishiki', overture: 'ov-nishiki' },
    ]);
    expect(pois.filter((poi) => poi.source_ids['overture'] === 'ov-gion')).toHaveLength(1);

    expect(osmReads).toEqual([BOX]);
    expect(finish).toMatchObject({
      slug,
      tiles: planned.length,
      failedTiles: 0,
      fsqOsRows: cafes.length + 1,
      overtureRows: 2,
      inserted: cafes.length + 2,
      activeCount: cafes.length + 2,
      sparseCoverage: false,
    });
    const { rows: left } = await harness.pool.query(
      'SELECT 1 FROM fsq_os_export_rows WHERE run_id = $1 AND slug = $2',
      [fsqRunId, slug],
    );
    expect(left).toHaveLength(0);
  });
});
