/**
 * `readFsqOsPlaces` against a small recorded-shape parquet fixture: the real FSQ OS Places release
 * now needs a Places Portal account this project does not have (verified in `ingest.ts`'s file
 * header), so the reader itself is proven against a fixture built here with DuckDB, matching FSQ's
 * real documented schema (docs.foursquare.com/data-products/docs/places-os-data-schema):
 * fsq_place_id, name, latitude, longitude, address, fsq_category_labels, date_closed.
 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import { DuckDBInstance } from '@duckdb/node-api';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { readFsqOsPlaces } from '../../src/places/ingest';

// Inside the worktree's own (git-ignored) node_modules, not the shared host /tmp.
const FIXTURE_ROOT = path.resolve(import.meta.dirname, '../../../../node_modules/.cache');

let fixtureDir: string;
let fixturePath: string;

beforeAll(async () => {
  await mkdir(FIXTURE_ROOT, { recursive: true });
  fixtureDir = await mkdtemp(path.join(FIXTURE_ROOT, 'cp-fsq-fixture-'));
  fixturePath = path.join(fixtureDir, 'fsq-os-places-sample.parquet');

  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  try {
    await connection.run(`
      COPY (
        SELECT * FROM (VALUES
          ('fsq-kyoto-1', 'Nishiki Market', 35.0051, 135.7651, 'Nakagyo Ward', ['Market'], NULL::DATE),
          ('fsq-kyoto-2', 'Fushimi Inari Taisha', 34.9671, 135.7727, 'Fukakusa Yabunouchicho 68', ['Shrine'], NULL::DATE),
          ('fsq-kyoto-3', 'Closed Ramen Shop', 35.01, 135.76, 'Somewhere', ['Ramen Restaurant'], DATE '2024-01-01')
        ) AS t(fsq_place_id, name, latitude, longitude, address, fsq_category_labels, date_closed)
      ) TO '${fixturePath}' (FORMAT PARQUET)
    `);
  } finally {
    connection.closeSync();
  }
}, 60_000);

afterEach(() => {
  delete process.env['FSQ_OS_PLACES_PARQUET_URI'];
});

afterAll(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

describe('readFsqOsPlaces', () => {
  it('returns no rows when FSQ_OS_PLACES_PARQUET_URI is unset (the documented account gate)', async () => {
    const rows = await readFsqOsPlaces({ minLat: 34, maxLat: 36, minLng: 135, maxLng: 136 });
    expect(rows).toEqual([]);
  });

  it('reads a bbox-filtered, permanently-closed-excluded subset of the fixture', async () => {
    process.env['FSQ_OS_PLACES_PARQUET_URI'] = fixturePath;
    const rows = await readFsqOsPlaces({
      minLat: 34.9,
      maxLat: 35.1,
      minLng: 135.6,
      maxLng: 135.8,
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: 'fsq-kyoto-1',
          name: 'Nishiki Market',
          categoryLabels: ['Market'],
        }),
        expect.objectContaining({ sourceId: 'fsq-kyoto-2', name: 'Fushimi Inari Taisha' }),
      ]),
    );
    // date_closed IS NOT NULL: excluded even though it falls inside the bbox.
    expect(rows.map((row) => row.sourceId)).not.toContain('fsq-kyoto-3');
  });

  it('excludes rows outside the requested bbox', async () => {
    process.env['FSQ_OS_PLACES_PARQUET_URI'] = fixturePath;
    const rows = await readFsqOsPlaces({ minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 });
    expect(rows).toEqual([]);
  });
});
