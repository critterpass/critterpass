/**
 * The one-scan FSQ OS export for many destinations, against a local parquet fixture with the
 * catalog's columns standing in for the Places Portal table (same query, different `FROM`).
 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import { DuckDBInstance } from '@duckdb/node-api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { exportFsqOsForDestinations, fsqExportReader } from '../../src/places/fsq-export';

const FIXTURE_ROOT = path.resolve(import.meta.dirname, '../../../../node_modules/.cache');
let root: string;
let fixture: string;

const KYOTO = { minLat: 34.9, maxLat: 35.1, minLng: 135.6, maxLng: 135.85 };
const HOI_AN = { minLat: 15.85, maxLat: 15.92, minLng: 108.28, maxLng: 108.42 };
const NOWHERE = { minLat: -1, maxLat: 1, minLng: -1, maxLng: 1 };

beforeAll(async () => {
  await mkdir(FIXTURE_ROOT, { recursive: true });
  root = await mkdtemp(path.join(FIXTURE_ROOT, 'cp-fsq-export-'));
  fixture = path.join(root, 'places-os.parquet');
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  const fresh = "strftime(current_date - 30, '%Y-%m-%d')";
  try {
    await connection.run(`
      COPY (SELECT * FROM (VALUES
        ('k1', 'Nishiki Market', ['Market'], 35.0051, 135.7651, 'Nakagyo', 'https://nishiki.example', NULL, NULL, NULL::VARCHAR[], ${fresh}),
        ('k2', 'Closed Ramen', ['Ramen'], 35.01, 135.76, NULL, NULL, NULL, '2024-01-01', NULL, ${fresh}),
        ('h1', 'Morning Glory', ['Vietnamese Restaurant'], 15.8770, 108.3280, NULL, NULL, '+84 235', NULL, NULL, ${fresh}),
        ('x1', 'Somewhere Else', ['Cafe'], 48.85, 2.35, NULL, NULL, NULL, NULL, NULL, ${fresh})
      ) AS t(fsq_place_id, name, fsq_category_labels, latitude, longitude, address, website, tel,
             date_closed, unresolved_flags, date_refreshed))
      TO '${fixture}' (FORMAT PARQUET)`);
  } finally {
    connection.closeSync();
  }
}, 60_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('exportFsqOsForDestinations', { timeout: 60_000 }, () => {
  it('writes each destination its own open rows and nothing outside every box', async () => {
    const dir = path.join(root, 'export');
    const manifest = await exportFsqOsForDestinations(
      [
        { slug: 'kyoto', bbox: KYOTO },
        { slug: 'vn-hoi-an', bbox: HOI_AN },
        { slug: 'empty', bbox: NOWHERE },
      ],
      dir,
      `read_parquet('${fixture}')`,
    );
    expect(manifest.slugs).toEqual(['kyoto', 'vn-hoi-an', 'empty']);

    const kyoto = await fsqExportReader(dir, 'kyoto');
    expect((await kyoto!(KYOTO)).map((row) => row.sourceId)).toEqual(['k1']);
    const hoiAn = await fsqExportReader(dir, 'vn-hoi-an');
    expect(await hoiAn!(HOI_AN)).toEqual([
      expect.objectContaining({ sourceId: 'h1', name: 'Morning Glory', phone: '+84 235' }),
    ]);
    expect(await (await fsqExportReader(dir, 'empty'))!(NOWHERE)).toEqual([]);
    expect(await fsqExportReader(dir, 'not-exported')).toBeNull();
  });

  it('has no reader without a finished export', async () => {
    expect(await fsqExportReader(path.join(root, 'missing'), 'kyoto')).toBeNull();
  });
});
