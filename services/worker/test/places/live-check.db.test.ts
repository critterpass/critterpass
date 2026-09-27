import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { checkPoiLiveStatus, type LiveCheckHttpClient } from '../../src/places/live-check';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;

function fakeClient(body: unknown, status = 200): LiveCheckHttpClient {
  return {
    fetch: () =>
      Promise.resolve({
        ok: status < 400,
        status,
        json: () => Promise.resolve(body),
      } as Response),
  };
}

async function insertPoi(
  sourceIds: Record<string, string>,
  lastLiveCheckAt: Date | null,
): Promise<string> {
  const { rows: destinationRows } = await pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name, coverage) VALUES ($1, 'X', 'live') RETURNING id",
    [`d-${Date.now()}-${Math.random().toString(36).slice(2)}`],
  );
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, source_ids, last_live_check_at)
     VALUES ($1, 'Test Place', 'other', 0, 0, $2::jsonb, $3) RETURNING id`,
    [destinationRows[0]!.id, JSON.stringify(sourceIds), lastLiveCheckAt],
  );
  return rows[0]!.id;
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
  await pool.end();
  await postgres.stop();
});

describe('checkPoiLiveStatus', () => {
  it('skips a POI with no fsq_os source id', async () => {
    const poiId = await insertPoi({ overture: 'o-1' }, null);
    const result = await checkPoiLiveStatus(pool, poiId, { apiKey: 'k' }, fakeClient({}));
    expect(result).toEqual({ ran: false });
  });

  it('skips a POI checked within the last 24h', async () => {
    const poiId = await insertPoi({ fsq_os: 'f-1' }, new Date());
    const result = await checkPoiLiveStatus(pool, poiId, { apiKey: 'k' }, fakeClient({}));
    expect(result).toEqual({ ran: false });
  });

  it('checks, upserts poi_live_checks and bumps last_live_check_at', async () => {
    const poiId = await insertPoi({ fsq_os: 'f-2' }, null);
    const client = fakeClient({ hours: { open_now: true }, date_closed: null });
    const result = await checkPoiLiveStatus(pool, poiId, { apiKey: 'k' }, client);
    expect(result.ran).toBe(true);
    expect(result.result?.isOpenNow).toBe(true);

    const { rows } = await pool.query<{ is_open_now: boolean }>(
      'SELECT is_open_now FROM poi_live_checks WHERE poi_id = $1',
      [poiId],
    );
    expect(rows).toEqual([{ is_open_now: true }]);

    const { rows: poiRows } = await pool.query<{ last_live_check_at: Date }>(
      'SELECT last_live_check_at FROM pois WHERE id = $1',
      [poiId],
    );
    expect(poiRows[0]?.last_live_check_at).toBeInstanceOf(Date);
  });

  it('records the check as gated without advancing last_live_check_at, so the next open detail view retries', async () => {
    const poiId = await insertPoi({ fsq_os: 'f-3' }, null);
    const client = fakeClient({ message: 'Your account has no API credits remaining.' }, 429);
    const result = await checkPoiLiveStatus(pool, poiId, { apiKey: 'k' }, client);
    expect(result.result?.gated).toBe(true);

    const { rows } = await pool.query<{ last_live_check_at: Date | null }>(
      'SELECT last_live_check_at FROM pois WHERE id = $1',
      [poiId],
    );
    expect(rows[0]?.last_live_check_at).toBeNull();
  });
});
