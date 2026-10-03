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
let poiId: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  uid = await insertUser(db.pool);
  poiId = await withSystem(db.pool, async (tx) => {
    const { rows: destinations } = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name, coverage) VALUES ('kyoto', 'Kyoto', 'live') RETURNING id",
    );
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, 'Fushimi Inari Taisha', 'temple_shrine', 34.9671, 135.7727) RETURNING id`,
      [firstRow(destinations).id],
    );
    return firstRow(rows).id;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

function reserve(kind: string, cap: number, now: Date): Promise<boolean> {
  return withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ ok: boolean }>(
      'SELECT app.reserve_foursquare_call($1, $2, $3) AS ok',
      [kind, cap, now],
    );
    return firstRow(rows).ok;
  });
}

describe('poi_foursquare_ids and foursquare_api_usage RLS: server-only (class S)', () => {
  it('lets app_system record a match and keeps it from every app_user', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        'INSERT INTO poi_foursquare_ids (poi_id, fsq_place_id, confidence) VALUES ($1, $2, 0.9)',
        [poiId, '4b6e5cddf964a52034ba2ce3'],
      ),
    );
    for (const table of ['poi_foursquare_ids', 'foursquare_api_usage']) {
      await expect(
        withUser(db.pool, uid, anonymousActor().device, (tx) =>
          tx.query(`SELECT 1 FROM ${table} LIMIT 1`),
        ),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('rejects an id without a confidence', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          `INSERT INTO poi_foursquare_ids (poi_id, fsq_place_id) VALUES ($1, 'x')
           ON CONFLICT (poi_id) DO UPDATE SET fsq_place_id = 'x', confidence = NULL`,
          [poiId],
        ),
      ),
    ).rejects.toThrow(/poi_foursquare_ids_match_check/);
  });

  it('never enters the powersync publication', async () => {
    const { rows } = await db.pool.query(
      `SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync'
         AND tablename IN ('poi_foursquare_ids', 'foursquare_api_usage')`,
    );
    expect(rows).toEqual([]);
  });
});

describe('app.reserve_foursquare_call: the shared monthly cap', () => {
  it('counts calls of both kinds against one cap per UTC month and refuses past it', async () => {
    const october = new Date('2026-10-31T23:30:00Z');
    expect(await reserve('details', 2, october)).toBe(true);
    expect(await reserve('match', 2, october)).toBe(true);
    expect(await reserve('details', 2, october)).toBe(false);
    // A new UTC month starts a fresh count.
    expect(await reserve('details', 2, new Date('2026-11-01T00:30:00Z'))).toBe(true);

    const { rows } = await withSystem(db.pool, (tx) =>
      tx.query(
        `SELECT month, details_calls, match_calls, refused_calls FROM foursquare_api_usage
         ORDER BY month`,
      ),
    );
    expect(rows).toEqual([
      { month: '2026-10', details_calls: 1, match_calls: 1, refused_calls: 1 },
      { month: '2026-11', details_calls: 1, match_calls: 0, refused_calls: 0 },
    ]);
  });

  it('never overshoots the cap under concurrent reservations', async () => {
    const december = new Date('2026-12-10T00:00:00Z');
    const results = await Promise.all(
      Array.from({ length: 12 }, () => reserve('details', 5, december)),
    );
    expect(results.filter(Boolean)).toHaveLength(5);
  });

  it('rejects an unknown kind', async () => {
    await expect(reserve('photos', 5, new Date())).rejects.toThrow(/unknown foursquare call kind/);
  });
});
