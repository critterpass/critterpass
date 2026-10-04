import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, firstRow, insertUser } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let uid: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  uid = await insertUser(db.pool);
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

function reserve(cap: number, now: Date): Promise<boolean> {
  return withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ ok: boolean }>(
      'SELECT app.reserve_mapbox_geocode_call($1, $2) AS ok',
      [cap, now],
    );
    return firstRow(rows).ok;
  });
}

describe('mapbox_geocode_usage RLS: server-only (class S)', () => {
  it('keeps the counts and the counter from every app_user', async () => {
    await reserve(5, new Date('2026-09-10T00:00:00Z'));
    const device = anonymousActor().device;
    await expect(
      withUser(db.pool, uid, device, (tx) => tx.query('SELECT 1 FROM mapbox_geocode_usage')),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, uid, device, (tx) => tx.query('SELECT app.reserve_mapbox_geocode_call(5)')),
    ).rejects.toThrow(/permission denied/i);
  });

  it('never enters the powersync publication', async () => {
    const { rows } = await db.pool.query(
      `SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync'
         AND tablename = 'mapbox_geocode_usage'`,
    );
    expect(rows).toEqual([]);
  });
});

describe('app.reserve_mapbox_geocode_call: the monthly cap', () => {
  it('counts calls per UTC month and refuses past the cap', async () => {
    const october = new Date('2026-10-31T23:30:00Z');
    expect(await reserve(2, october)).toBe(true);
    expect(await reserve(2, october)).toBe(true);
    expect(await reserve(2, october)).toBe(false);
    // A new UTC month starts a fresh count.
    expect(await reserve(2, new Date('2026-11-01T00:30:00Z'))).toBe(true);

    const { rows } = await withSystem(db.pool, (tx) =>
      tx.query(
        `SELECT month, calls, refused_calls FROM mapbox_geocode_usage
         WHERE month IN ('2026-10', '2026-11') ORDER BY month`,
      ),
    );
    expect(rows).toEqual([
      { month: '2026-10', calls: 2, refused_calls: 1 },
      { month: '2026-11', calls: 1, refused_calls: 0 },
    ]);
  });

  it('never overshoots the cap under concurrent reservations', async () => {
    const december = new Date('2026-12-10T00:00:00Z');
    const results = await Promise.all(Array.from({ length: 12 }, () => reserve(5, december)));
    expect(results.filter(Boolean)).toHaveLength(5);
  });
});
