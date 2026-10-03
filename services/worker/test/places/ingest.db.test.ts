/**
 * Ingest orchestration against real Postgres (Testcontainers): upsert idempotency, curation
 * defaults, sparse-coverage flagging and the editorial-overlay path. Both source readers are faked
 * here (network boundary) except where a test specifically exercises the real FSQ gating logic,
 * which never touches the network when neither `FSQ_PLACES_PORTAL_TOKEN` nor
 * `FSQ_OS_PLACES_PARQUET_URI` is set (see `source-readers.ts`).
 */
import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  editorialOverlayKey,
  ingestDestination,
  type BoundingBox,
  type PlaceSourceRow,
} from '../../src/places/ingest';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let destinationId: string;

const KYOTO_BBOX: BoundingBox = { minLat: 34.9, maxLat: 35.1, minLng: 135.6, maxLng: 135.8 };

function fixedReader(rows: readonly PlaceSourceRow[]) {
  return () => Promise.resolve(rows);
}

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({
    connectionString: postgres.getConnectionUri(),
    connectionTimeoutMillis: 2000,
  });
  await runMigrations(pool);
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

beforeEach(async () => {
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name, coverage) VALUES ($1, 'Kyoto', 'live') RETURNING id",
    [`kyoto-${Date.now()}-${Math.random().toString(36).slice(2)}`],
  );
  destinationId = rows[0]!.id;
});

describe('ingestDestination', () => {
  it('upserts a conflated pair and two unmatched rows', async () => {
    const overture: PlaceSourceRow[] = [
      {
        sourceId: 'overture-nishiki',
        name: 'Nishiki Market',
        categoryLabels: ['market'],
        lat: 35.0051,
        lng: 135.7651,
      },
      {
        sourceId: 'overture-only',
        name: 'Kyoto City Hall',
        categoryLabels: ['government_office'],
        lat: 35.011,
        lng: 135.768,
      },
    ];
    const fsq: PlaceSourceRow[] = [
      {
        sourceId: 'fsq-nishiki',
        name: 'Nishiki Market',
        categoryLabels: ['Market'],
        lat: 35.0052,
        lng: 135.7652,
      },
      {
        sourceId: 'fsq-only',
        name: 'Ganko Nishikitei',
        categoryLabels: ['Restaurant'],
        lat: 35.002,
        lng: 135.766,
      },
    ];

    const result = await ingestDestination(
      pool,
      { destinationId, bbox: KYOTO_BBOX },
      { readOverturePlaces: fixedReader(overture), readFsqOsPlaces: fixedReader(fsq) },
    );

    expect(result.upserted).toBe(3);
    expect(result.activeCount).toBe(3);
    expect(result.sparseCoverage).toBe(true);

    const { rows } = await pool.query<{
      name: string;
      source_ids: Record<string, string>;
      curation: string;
    }>('SELECT name, source_ids, curation FROM pois WHERE destination_id = $1 ORDER BY name', [
      destinationId,
    ]);
    expect(rows).toHaveLength(3);
    const nishiki = rows.find((row) => row.name === 'Nishiki Market');
    expect(nishiki?.source_ids).toEqual({ fsq_os: 'fsq-nishiki', overture: 'overture-nishiki' });
    expect(rows.every((row) => row.curation === 'auto')).toBe(true);
  });

  it('is idempotent: a rerun with the same source rows creates no new ids', async () => {
    const overture: PlaceSourceRow[] = [
      {
        sourceId: 'overture-a',
        name: 'Fushimi Inari Taisha',
        categoryLabels: ['shrine'],
        lat: 34.9671,
        lng: 135.7727,
      },
    ];
    const readers = { readOverturePlaces: fixedReader(overture), readFsqOsPlaces: fixedReader([]) };

    await ingestDestination(pool, { destinationId, bbox: KYOTO_BBOX }, readers);
    const { rows: firstRun } = await pool.query<{ id: string }>(
      'SELECT id FROM pois WHERE destination_id = $1 ORDER BY id',
      [destinationId],
    );

    const secondResult = await ingestDestination(
      pool,
      { destinationId, bbox: KYOTO_BBOX },
      readers,
    );
    const { rows: secondRun } = await pool.query<{ id: string }>(
      'SELECT id FROM pois WHERE destination_id = $1 ORDER BY id',
      [destinationId],
    );

    expect(secondResult.upserted).toBe(1);
    expect(secondRun.map((row) => row.id)).toEqual(firstRun.map((row) => row.id));
  });

  it('applies an editorial overlay by source key, marking that POI curation=editorial with verified hours', async () => {
    const overture: PlaceSourceRow[] = [
      {
        sourceId: 'overture-b',
        name: 'Kiyomizu-dera',
        categoryLabels: ['temple'],
        lat: 34.9948,
        lng: 135.785,
      },
    ];
    const key = editorialOverlayKey({
      name: 'Kiyomizu-dera',
      category: 'temple_shrine',
      lat: 34.9948,
      lng: 135.785,
      sourceIds: { overture: 'overture-b' },
    });
    const hoursVerifiedAt = new Date('2026-09-01T00:00:00Z');

    await ingestDestination(
      pool,
      {
        destinationId,
        bbox: KYOTO_BBOX,
        editorialBySourceKey: new Map([
          [
            key,
            {
              editorial: { must_see: true, tips: ['Go at sunrise'] },
              hoursOsm: 'Mo-Su 06:00-18:00',
              hoursVerifiedAt,
            },
          ],
        ]),
      },
      { readOverturePlaces: fixedReader(overture), readFsqOsPlaces: fixedReader([]) },
    );

    const { rows } = await pool.query<{
      curation: string;
      editorial: { must_see: boolean };
      hours: { weekly: { mo: { start: string; end: string }[] } };
      hours_verified_at: Date;
    }>('SELECT curation, editorial, hours, hours_verified_at FROM pois WHERE destination_id = $1', [
      destinationId,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.curation).toBe('editorial');
    expect(rows[0]?.editorial.must_see).toBe(true);
    expect(rows[0]?.hours.weekly.mo).toEqual([{ start: '06:00', end: '18:00' }]);
    expect(rows[0]?.hours_verified_at.toISOString()).toBe(hoursVerifiedAt.toISOString());
  });

  it('keeps a previous editorial pass on a rerun that supplies no overlay', async () => {
    const overture: PlaceSourceRow[] = [
      {
        sourceId: 'overture-c',
        name: 'Arashiyama Bamboo Grove',
        categoryLabels: ['park'],
        lat: 35.017,
        lng: 135.672,
      },
    ];
    const key = editorialOverlayKey({
      name: 'Arashiyama Bamboo Grove',
      category: 'nature',
      lat: 35.017,
      lng: 135.672,
      sourceIds: { overture: 'overture-c' },
    });

    await ingestDestination(
      pool,
      {
        destinationId,
        bbox: KYOTO_BBOX,
        editorialBySourceKey: new Map([[key, { editorial: { must_see: true } }]]),
      },
      { readOverturePlaces: fixedReader(overture), readFsqOsPlaces: fixedReader([]) },
    );

    await ingestDestination(
      pool,
      { destinationId, bbox: KYOTO_BBOX },
      { readOverturePlaces: fixedReader(overture), readFsqOsPlaces: fixedReader([]) },
    );

    const { rows } = await pool.query<{ curation: string; editorial: { must_see: boolean } }>(
      'SELECT curation, editorial FROM pois WHERE destination_id = $1',
      [destinationId],
    );
    expect(rows[0]?.curation).toBe('editorial');
    expect(rows[0]?.editorial.must_see).toBe(true);
  });

  it('flags sparse coverage under 50 active POIs ("no curated places yet")', async () => {
    const result = await ingestDestination(
      pool,
      { destinationId, bbox: KYOTO_BBOX },
      { readOverturePlaces: fixedReader([]), readFsqOsPlaces: fixedReader([]) },
    );
    expect(result.activeCount).toBe(0);
    expect(result.sparseCoverage).toBe(true);
  });

  it('reports the real FSQ OS Places gate without touching the network (no readFsqOsPlaces override)', async () => {
    delete process.env['FSQ_OS_PLACES_PARQUET_URI'];
    delete process.env['FSQ_PLACES_PORTAL_TOKEN'];
    const result = await ingestDestination(
      pool,
      { destinationId, bbox: KYOTO_BBOX },
      { readOverturePlaces: fixedReader([]) },
    );
    expect(result.fsqOsGated).toBe(true);
  });
});
