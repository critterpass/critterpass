/**
 * The restart-proof FSQ OS export against real Postgres, with a local parquet standing in for the
 * Places Portal table (same query, different `FROM`): chunks land once, the run fans out exactly
 * once when the last chunk lands, a destination reads only its rows and releases them, and a new
 * run replaces the old one.
 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import { DuckDBInstance } from '@duckdb/node-api';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  claimFanOut,
  exportFsqChunk,
  fsqRunReader,
  releaseRunRows,
  runSlugs,
  startFsqExportRun,
} from '../../src/places/fsq-export-runs';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let root: string;
let from: string;

const KYOTO = { slug: 'kyoto', minLat: 34.9, maxLat: 35.1, minLng: 135.6, maxLng: 135.85 };
const HOI_AN = { slug: 'vn-hoi-an', minLat: 15.85, maxLat: 15.92, minLng: 108.28, maxLng: 108.42 };

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);

  const cache = path.resolve(import.meta.dirname, '../../../../node_modules/.cache');
  await mkdir(cache, { recursive: true });
  root = await mkdtemp(path.join(cache, 'cp-fsq-runs-'));
  const fixture = path.join(root, 'places-os.parquet');
  from = `read_parquet('${fixture}')`;
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  const fresh = "strftime(current_date - 30, '%Y-%m-%d')";
  try {
    await connection.run(`
      COPY (SELECT * FROM (VALUES
        ('k1', 'Nishiki Market', ['Market'], 35.0051, 135.7651, 'Nakagyo', 'https://nishiki.example', NULL, NULL, NULL::VARCHAR[], ${fresh}),
        ('k2', 'Closed Ramen', ['Ramen'], 35.01, 135.76, NULL, NULL, NULL, '2024-01-01', NULL, ${fresh}),
        ('h1', 'Morning Glory', ['Vietnamese Restaurant'], 15.877, 108.328, NULL, NULL, '+84 235', NULL, NULL, ${fresh}),
        ('x1', 'Somewhere Else', ['Cafe'], 48.85, 2.35, NULL, NULL, NULL, NULL, NULL, ${fresh})
      ) AS t(fsq_place_id, name, fsq_category_labels, latitude, longitude, address, website, tel,
             date_closed, unresolved_flags, date_refreshed))
      TO '${fixture}' (FORMAT PARQUET)`);
  } finally {
    connection.closeSync();
  }
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
  await rm(root, { recursive: true, force: true });
});

describe('FSQ OS export runs', { timeout: 60_000 }, () => {
  it('lands each chunk once and fans out once, after the last chunk', async () => {
    const run = await startFsqExportRun(pool, [KYOTO, HOI_AN], ['a', 'b', 'c', 'd', 'e', 'f']);
    expect(run.chunks).toBe(2);

    expect(await exportFsqChunk(pool, run.runId, 0, from)).toBe(2);
    expect(await claimFanOut(pool, run.runId)).toBe(false);
    // A retried chunk that already landed writes nothing again.
    expect(await exportFsqChunk(pool, run.runId, 0, from)).toBeNull();
    expect(await exportFsqChunk(pool, run.runId, 1, from)).toBe(2);
    expect(await claimFanOut(pool, run.runId)).toBe(true);
    expect(await claimFanOut(pool, run.runId)).toBe(false);
    expect(await runSlugs(pool, run.runId)).toEqual(['kyoto', 'vn-hoi-an']);

    const hoiAn = await fsqRunReader(pool, run.runId, 'vn-hoi-an');
    expect(await hoiAn!(HOI_AN)).toEqual([
      expect.objectContaining({ sourceId: 'h1', name: 'Morning Glory', phone: '+84 235' }),
    ]);
    const kyoto = await fsqRunReader(pool, run.runId, 'kyoto');
    expect((await kyoto!(KYOTO)).map((row) => row.sourceId)).toEqual(['k1']);

    await releaseRunRows(pool, run.runId, 'kyoto');
    expect(await kyoto!(KYOTO)).toEqual([]);
    expect(await hoiAn!(HOI_AN)).toHaveLength(1);
  });

  it('replaces the previous run', async () => {
    const first = await startFsqExportRun(pool, [KYOTO], ['a']);
    await exportFsqChunk(pool, first.runId, 0, from);
    const second = await startFsqExportRun(pool, [HOI_AN], ['a']);

    expect(await fsqRunReader(pool, first.runId, 'kyoto')).toBeNull();
    const { rows } = await pool.query<{ n: string }>(
      'SELECT count(*) AS n FROM fsq_os_export_rows',
    );
    expect(Number(rows[0]!.n)).toBe(0);
    expect(await fsqRunReader(pool, second.runId, 'vn-hoi-an')).not.toBeNull();
  });
});
