/**
 * A destination's place ingest end to end on real Postgres and pg-boss: the destination job queues
 * its tile run, the tile writes only the lean Overture rows (travel kinds, transit hubs, at or
 * above the confidence floor), the finish reads OpenStreetMap once for the whole box and adds its
 * sights, and nothing reads FSQ OS, starts an FSQ export or queues machine picks, even with the
 * FSQ catalog configured. Overture and OSM are read through fake readers that honour the bbox they
 * are given (the network boundary).
 */
import { classifyOsmTags, type OsmClassification } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PLACES_INGEST_TILE_QUEUE } from '../../src/jobs/places/ingest-tile';
import { PLACES_INGEST_QUEUE, placesJobs } from '../../src/jobs/places';
import type { OsmPlaceRow } from '../../src/places/osm-reader';
import type { BoundingBox, PlaceSourceRow } from '../../src/places/source-readers';
import { startJobsHarness, until, type JobsHarness } from '../helpers/jobs-harness';

const BOX: BoundingBox = { minLat: 15.86, maxLat: 15.9, minLng: 108.3, maxLng: 108.36 };
const FSQ_ENV = ['FSQ_PLACES_PORTAL_TOKEN', 'FSQ_OS_PLACES_PARQUET_URI'] as const;

let harness: JobsHarness;
const savedEnv = new Map<string, string | undefined>();

beforeAll(async () => {
  harness = await startJobsHarness();
  for (const name of FSQ_ENV) {
    savedEnv.set(name, process.env[name]);
    process.env[name] = 'configured';
  }
}, 180_000);

afterEach(async () => {
  await harness.stopAll();
});

afterAll(async () => {
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await harness?.close();
});

function overtureRow(
  sourceId: string,
  name: string,
  label: string,
  confidence: number,
  offset: number,
): PlaceSourceRow {
  return {
    sourceId,
    name,
    categoryLabels: [label],
    lat: 15.87 + offset * 0.002,
    lng: 108.31 + offset * 0.002,
    confidence,
  };
}

function osmRow(sourceId: string, name: string, tags: Record<string, string>): OsmPlaceRow {
  return {
    sourceId,
    name,
    nameLocal: undefined,
    classification: classifyOsmTags({ name, ...tags }) as OsmClassification,
    lat: 15.89,
    lng: 108.35,
    address: undefined,
    openingHours: undefined,
    website: undefined,
    phone: undefined,
    wikidata: undefined,
  };
}

function inBox(row: { readonly lat: number; readonly lng: number }, box: BoundingBox): boolean {
  return (
    row.lat >= box.minLat && row.lat <= box.maxLat && row.lng >= box.minLng && row.lng <= box.maxLng
  );
}

async function jobNames(): Promise<string[]> {
  const { rows } = await harness.pool.query<{ name: string }>(
    'SELECT DISTINCT name FROM pgboss.job ORDER BY name',
  );
  return rows.map((row) => row.name);
}

describe('a lean place ingest', { timeout: 180_000 }, () => {
  it('writes only lean Overture rows and OSM sights, and never reads FSQ OS', async () => {
    const slug = `hoi-an-lean-${Date.now()}`;
    const { rows: destination } = await harness.pool.query<{ id: string }>(
      `INSERT INTO destinations (slug, name, coverage, tz, place_bounds)
       VALUES ($1, 'Hội An', 'guest', 'Asia/Ho_Chi_Minh',
               ST_MakeEnvelope($2, $3, $4, $5, 4326)::geography)
       RETURNING id`,
      [slug, BOX.minLng, BOX.minLat, BOX.maxLng, BOX.maxLat],
    );
    const destinationId = destination[0]!.id;

    const overture: PlaceSourceRow[] = [
      overtureRow('ov-cao-lau', 'Cao Lầu Thanh', 'vietnamese_restaurant', 0.9, 0),
      overtureRow('ov-pagoda', 'Chùa Cầu', 'buddhist_temple', 0.61, 1),
      overtureRow('ov-airport', 'Sân bay Đà Nẵng', 'airport', 0.95, 2),
      // Below the floor, not a travel kind, and transit that is not a hub: none is written.
      overtureRow('ov-cafe-low', 'Cà Phê Nhỏ', 'cafe', 0.55, 3),
      overtureRow('ov-mall', 'Vincom Plaza', 'shopping_center', 0.95, 4),
      overtureRow('ov-pharmacy', 'Nhà Thuốc Long Châu', 'pharmacy', 0.95, 5),
      overtureRow('ov-bus-stop', 'Trạm xe buýt số 3', 'bus_stop', 0.95, 6),
    ];
    const osm: OsmPlaceRow[] = [
      osmRow('n1', 'Rừng dừa Bảy Mẫu', { tourism: 'attraction' }),
      osmRow('n2', 'Bãi biển An Bàng', { natural: 'beach' }),
    ];
    const osmReads: BoundingBox[] = [];
    const boss: PgBoss = await harness.startRuntime(
      placesJobs({
        sources: {
          readOverturePlaces: (box) => Promise.resolve(overture.filter((row) => inBox(row, box))),
          readOsmPlaces: (box) => {
            osmReads.push(box);
            return Promise.resolve(osm);
          },
        },
      }),
    );
    await boss.send(PLACES_INGEST_QUEUE, { slug });

    let finish: Record<string, unknown> | undefined;
    await until(async () => {
      const jobs = await boss.findJobs(PLACES_INGEST_TILE_QUEUE, {
        data: { slug, stage: 'finish' },
      });
      finish = jobs.find((job) => job.state === 'completed')?.output as
        Record<string, unknown> | undefined;
      return finish !== undefined;
    }, 150_000);

    const { rows: pois } = await harness.pool.query<{ name: string; category: string }>(
      'SELECT name, category FROM pois WHERE destination_id = $1 ORDER BY name',
      [destinationId],
    );
    expect(pois).toEqual([
      { name: 'Bãi biển An Bàng', category: 'beach' },
      { name: 'Cao Lầu Thanh', category: 'food' },
      { name: 'Chùa Cầu', category: 'temple_shrine' },
      { name: 'Rừng dừa Bảy Mẫu', category: 'other' },
      { name: 'Sân bay Đà Nẵng', category: 'transit' },
    ]);
    expect(osmReads).toEqual([BOX]);
    expect(finish).toMatchObject({
      slug,
      tiles: 1,
      failedTiles: 0,
      overtureRows: 3,
      inserted: 3,
      activeCount: 5,
    });
    expect(finish).not.toHaveProperty('fsqOsRows');

    const names = await jobNames();
    expect(names).not.toContain('places.fsq_export_chunk');
    expect(names).not.toContain('places.pick');
  });
});
