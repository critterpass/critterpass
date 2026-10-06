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
let destinationId: string;
let poiId: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  uid = await insertUser(db.pool);
  ({ destinationId, poiId } = await withSystem(db.pool, async (tx) => {
    const dest = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name, country) VALUES ('brief-town', 'Brief Town', 'VN') RETURNING id",
    );
    const destination = firstRow(dest.rows).id;
    const poi = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng, status)
       VALUES ($1, 'Old Palace', 'museum', 11.9, 108.4, 'active') RETURNING id`,
      [destination],
    );
    return { destinationId: destination, poiId: firstRow(poi.rows).id };
  }));
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

const device = () => anonymousActor().device;

describe('destination_briefs RLS: readable by every signed-in reader, written by the worker (class R)', () => {
  it('lets app_system write a brief and app_user read it and its essential ranks', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO destination_briefs (destination_id, status, essentials)
         VALUES ($1, 'ready', jsonb_build_array(jsonb_build_object('poi_id', $2::text, 'rank', 1)))`,
        [destinationId, poiId],
      ),
    );
    const { rows } = await withUser(db.pool, uid, device(), (tx) =>
      tx.query<{ status: string; rank: number | null }>(
        `SELECT status, app.brief_essential_rank(destination_id, $2) AS rank
           FROM destination_briefs WHERE destination_id = $1`,
        [destinationId, poiId],
      ),
    );
    expect(rows).toEqual([{ status: 'ready', rank: 1 }]);
  });

  it('refuses every app_user write', async () => {
    await expect(
      withUser(db.pool, uid, device(), (tx) =>
        tx.query("UPDATE destination_briefs SET status = 'failed' WHERE destination_id = $1", [
          destinationId,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, uid, device(), (tx) =>
        tx.query('DELETE FROM destination_briefs WHERE destination_id = $1', [destinationId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keeps a reviewed origin on every editorial brief', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query("UPDATE destination_briefs SET origin = 'editorial' WHERE destination_id = $1", [
          destinationId,
        ]),
      ),
    ).rejects.toThrow(/check constraint/i);
  });

  it('never enters the powersync publication', async () => {
    const { rows } = await db.pool.query(
      `SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync'
         AND tablename = 'destination_briefs'`,
    );
    expect(rows).toEqual([]);
  });
});
