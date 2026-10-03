/**
 * `readFsqOsPlaces` on its parquet path against a small fixture built here with DuckDB, using the
 * columns of the Places Portal table `fsq.datasets.places_os` (checked with `DESCRIBE`):
 * fsq_place_id, name, latitude, longitude, address, fsq_category_labels, date_closed, website, tel,
 * unresolved_flags, date_refreshed. The Iceberg path runs the same query against the catalog.
 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import { DuckDBInstance } from '@duckdb/node-api';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
          ('fsq-kyoto-1', 'Nishiki Market', 35.0051, 135.7651, 'Nakagyo Ward', ['Market'], NULL::VARCHAR, 'https://www.kyoto-nishiki.or.jp', '+81 75-211-3882', NULL::VARCHAR[], strftime(current_date - 30, '%Y-%m-%d')),
          ('fsq-kyoto-2', 'Fushimi Inari Taisha', 34.9671, 135.7727, 'Fukakusa Yabunouchicho 68', ['Shrine'], NULL, NULL, NULL, [], strftime(current_date - 200, '%Y-%m-%d')),
          ('fsq-kyoto-3', 'Closed Ramen Shop', 35.01, 135.76, 'Somewhere', ['Ramen Restaurant'], '2024-01-01', NULL, NULL, NULL, strftime(current_date - 30, '%Y-%m-%d')),
          ('fsq-kyoto-4', 'Flagged Duplicate', 35.01, 135.76, 'Somewhere', ['Cafe'], NULL, NULL, NULL, ['duplicate'], strftime(current_date - 30, '%Y-%m-%d')),
          ('fsq-kyoto-6', 'Tea' || chr(0) || 'house', 35.02, 135.77, 'Gion' || chr(0), ['Tea Room'], NULL, NULL, NULL, NULL, strftime(current_date - 30, '%Y-%m-%d')),
          ('fsq-kyoto-5', 'Stale Teahouse', 35.01, 135.76, 'Somewhere', ['Tea Room'], NULL, NULL, NULL, NULL, strftime(current_date - 400, '%Y-%m-%d'))
        ) AS t(fsq_place_id, name, latitude, longitude, address, fsq_category_labels, date_closed,
               website, tel, unresolved_flags, date_refreshed)
      ) TO '${fixturePath}' (FORMAT PARQUET)
    `);
  } finally {
    connection.closeSync();
  }
}, 60_000);

afterEach(() => {
  delete process.env['FSQ_OS_PLACES_PARQUET_URI'];
});

beforeEach(() => {
  // The parquet path is the one under test; a portal token would switch to the live catalog.
  delete process.env['FSQ_PLACES_PORTAL_TOKEN'];
});

afterAll(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

describe('readFsqOsPlaces', { timeout: 60_000 }, () => {
  it('returns no rows when neither the portal token nor a parquet export is configured', async () => {
    const rows = await readFsqOsPlaces({ minLat: 34, maxLat: 36, minLng: 135, maxLng: 136 });
    expect(rows).toEqual([]);
  });

  it('reads the bbox with Foursquare filters: open, unflagged, refreshed within a year', async () => {
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
          website: 'https://www.kyoto-nishiki.or.jp',
          phone: '+81 75-211-3882',
        }),
        expect.objectContaining({ sourceId: 'fsq-kyoto-2', name: 'Fushimi Inari Taisha' }),
      ]),
    );
    // Closed, flagged and stale rows are excluded even though they fall inside the bbox.
    expect(rows.map((row) => row.sourceId).sort()).toEqual([
      'fsq-kyoto-1',
      'fsq-kyoto-2',
      'fsq-kyoto-6',
    ]);
    // Postgres text cannot hold NUL, which open data occasionally carries.
    expect(rows.find((row) => row.sourceId === 'fsq-kyoto-6')).toMatchObject({
      name: 'Teahouse',
      address: 'Gion',
    });
  });

  it('excludes rows outside the requested bbox', async () => {
    process.env['FSQ_OS_PLACES_PARQUET_URI'] = fixturePath;
    const rows = await readFsqOsPlaces({ minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 });
    expect(rows).toEqual([]);
  });
});
