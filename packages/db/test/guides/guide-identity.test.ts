/**
 * The guide identity columns: the app reads a guide's critter and accent and a destination's
 * critter, the console reads them too, nobody but the system writes them or runs the functions
 * that keep them, and an accent is a lowercase hex colour.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  await withSystem(db.pool, async (tx) => {
    await tx.query(
      `INSERT INTO guides (slug, name, colour, accent, critter_key)
       VALUES ('ngua', 'Ngựa', 'cream', '#fff1d6', 'cp-006')`,
    );
    await tx.query(
      `INSERT INTO destinations (slug, name, coverage, critter_key)
       VALUES ('vn-da-lat', 'Đà Lạt', 'guest', 'cp-006')`,
    );
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

const asUser = <T>(fn: (tx: pg.PoolClient) => Promise<T>) =>
  withUser(db.pool, anonymousActor().uid, anonymousActor().device, fn);

async function asAdminReader<T>(fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE admin_reader');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

const READ = `SELECT g.slug, g.accent, g.critter_key, d.slug AS destination
                FROM guides g JOIN destinations d ON d.critter_key = g.critter_key`;
const NGUA = { slug: 'ngua', accent: '#fff1d6', critter_key: 'cp-006', destination: 'vn-da-lat' };

describe('guide identity columns', () => {
  it('are readable by the app and by the console', async () => {
    expect((await asUser((tx) => tx.query(READ))).rows).toEqual([NGUA]);
    expect((await asAdminReader((tx) => tx.query(READ))).rows).toEqual([NGUA]);
  });

  it('are never written by the app', async () => {
    await expect(
      asUser((tx) => tx.query("UPDATE guides SET accent = '#000000' WHERE slug = 'ngua'")),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser((tx) => tx.query("UPDATE destinations SET critter_key = 'cp-001'")),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keep the guide functions to the system', async () => {
    await expect(
      asUser((tx) => tx.query("SELECT app.sync_critter_guides('{}'::jsonb)")),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser((tx) => tx.query('SELECT app.destination_guide_id(id) FROM destinations')),
    ).rejects.toThrow(/permission denied/i);
    const written = await withSystem(db.pool, (tx) =>
      tx.query<{ n: number }>("SELECT app.sync_critter_guides('{}'::jsonb) AS n"),
    );
    expect(written.rows[0]?.n).toBe(0);
  });

  it('hold one guide per critter and a lowercase hex accent', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          "INSERT INTO guides (slug, name, colour, critter_key) VALUES ('twin', 'Twin', 'cream', 'cp-006')",
        ),
      ),
    ).rejects.toThrow(/guides_critter_key_key/);
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query("UPDATE guides SET accent = 'cream' WHERE slug = 'ngua'"),
      ),
    ).rejects.toThrow(/guides_accent_check/);
  });
});
