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

const WAY = {
  mode: 'flight',
  minutes: 85,
  cost_pp_minor: 900000,
  cost_currency: 'VND',
  note: {},
  sources: [{ url: 'https://example.vn/a', title: 'A', quote: 'takes 1 hour 25 minutes' }],
};

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  uid = await insertUser(db.pool);
  destinationId = await withSystem(db.pool, async (tx) => {
    const dest = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name, country) VALUES ('home-link-town', 'Link Town', 'VN') RETURNING id",
    );
    return firstRow(dest.rows).id;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

const device = () => anonymousActor().device;

describe('destination_home_links RLS: readable by every signed-in reader, written by the worker (class R)', () => {
  it('lets app_system write a pair of places and app_user read it', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO destination_home_links (destination_id, origin_key, origin_name, status, ways)
         VALUES ($1, 'SGN', 'Ho Chi Minh City', 'ready', $2)`,
        [destinationId, JSON.stringify([WAY])],
      ),
    );
    const { rows } = await withUser(db.pool, uid, device(), (tx) =>
      tx.query<{ origin_key: string; status: string }>(
        'SELECT origin_key, status FROM destination_home_links WHERE destination_id = $1',
        [destinationId],
      ),
    );
    expect(rows).toEqual([{ origin_key: 'SGN', status: 'ready' }]);
  });

  it('refuses every app_user write', async () => {
    await expect(
      withUser(db.pool, uid, device(), (tx) =>
        tx.query(
          `INSERT INTO destination_home_links (destination_id, origin_key, origin_name)
           VALUES ($1, 'HAN', 'Hanoi')`,
          [destinationId],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, uid, device(), (tx) =>
        tx.query("UPDATE destination_home_links SET status = 'failed' WHERE destination_id = $1", [
          destinationId,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, uid, device(), (tx) =>
        tx.query('DELETE FROM destination_home_links WHERE destination_id = $1', [destinationId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('holds one row per pair of places, a place key only, and no ready row without a way', async () => {
    const insert = (key: string, status: string, ways: unknown[]) =>
      withSystem(db.pool, (tx) =>
        tx.query(
          `INSERT INTO destination_home_links (destination_id, origin_key, origin_name, status, ways)
           VALUES ($1, $2, 'Somewhere', $3, $4)`,
          [destinationId, key, status, JSON.stringify(ways)],
        ),
      );
    await expect(insert('SGN', 'pending', [])).rejects.toThrow(/destination_home_links_pair_key/u);
    await expect(insert('a traveller', 'pending', [])).rejects.toThrow(/check constraint/iu);
    await expect(insert('HAN', 'ready', [])).rejects.toThrow(/check constraint/iu);
    const { rows } = await db.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'destination_home_links' AND column_name ~ '(user|trip|crew|member)'`,
    );
    expect(rows).toEqual([]);
  });

  it('keeps the links run record server-only', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query('INSERT INTO destination_link_runs (destination_id) VALUES ($1)', [destinationId]),
    );
    await expect(
      withUser(db.pool, uid, device(), (tx) => tx.query('SELECT 1 FROM destination_link_runs')),
    ).rejects.toThrow(/permission denied/i);
  });

  it('never enters the powersync publication', async () => {
    const { rows } = await db.pool.query(
      `SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync'
         AND tablename IN ('destination_home_links', 'destination_link_runs')`,
    );
    expect(rows).toEqual([]);
  });
});
