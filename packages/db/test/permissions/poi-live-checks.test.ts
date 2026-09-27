import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { computePublicationAllowList } from '../../src/publication';
import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, firstRow } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let poiId: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  const destinationId = await withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name, coverage) VALUES ('reykjavik', 'Reykjavik', 'live') RETURNING id",
    );
    return firstRow(rows).id;
  });
  poiId = await withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, 'Sundholl Reykjavikur', 'health', 64.1436, -21.9186) RETURNING id`,
      [destinationId],
    );
    return firstRow(rows).id;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('poi_live_checks RLS: Foursquare open/closed flags only (class C0, read-all)', () => {
  it('is readable by any authenticated app_user once app_system records a check', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        'INSERT INTO poi_live_checks (poi_id, is_open_now, closed_permanently) VALUES ($1, true, false)',
        [poiId],
      ),
    );
    const rows = await withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
      tx.query<{ is_open_now: boolean }>(
        'SELECT is_open_now FROM poi_live_checks WHERE poi_id = $1',
        [poiId],
      ),
    );
    expect(rows.rows).toEqual([{ is_open_now: true }]);
  });

  it('rejects an app_user write outright', async () => {
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query(
          'INSERT INTO poi_live_checks (poi_id, is_open_now) VALUES ($1, false) ON CONFLICT (poi_id) DO UPDATE SET is_open_now = false',
          [poiId],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('lets app_system upsert the single row per POI on a re-check', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO poi_live_checks (poi_id, is_open_now, checked_at) VALUES ($1, true, now())
         ON CONFLICT (poi_id) DO UPDATE SET is_open_now = EXCLUDED.is_open_now, checked_at = EXCLUDED.checked_at`,
        [poiId],
      ),
    );
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO poi_live_checks (poi_id, is_open_now, checked_at) VALUES ($1, false, now())
         ON CONFLICT (poi_id) DO UPDATE SET is_open_now = EXCLUDED.is_open_now, checked_at = EXCLUDED.checked_at`,
        [poiId],
      ),
    );
    const rows = await withSystem(db.pool, (tx) =>
      tx.query<{ count: string; is_open_now: boolean }>(
        'SELECT count(*), bool_and(is_open_now) AS is_open_now FROM poi_live_checks WHERE poi_id = $1 GROUP BY poi_id',
        [poiId],
      ),
    );
    expect(rows.rows).toEqual([{ count: '1', is_open_now: false }]);
  });

  it('cascades on the owning POI being deleted', async () => {
    await withSystem(db.pool, (tx) => tx.query('DELETE FROM pois WHERE id = $1', [poiId]));
    const rows = await withSystem(db.pool, (tx) =>
      tx.query('SELECT 1 FROM poi_live_checks WHERE poi_id = $1', [poiId]),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('is excluded from the powersync publication (not a sync stream; served via the places API)', () => {
    expect(computePublicationAllowList()).not.toContain('poi_live_checks');
  });
});
