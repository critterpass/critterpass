/**
 * `install_attributions`: RLS class S (docs/data-model.md §3.1) — system-only skeleton; the
 * attribution pipeline itself is a later phase's job.
 */
import { randomUUID } from 'node:crypto';

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
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('install_attributions: owner-less system table', () => {
  it('denies app_user SELECT and INSERT entirely', async () => {
    const deviceId = randomUUID();
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO install_attributions (device_id, channel, source) VALUES ($1, 'organic', 'app_store')`,
        [deviceId],
      ),
    );

    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query('SELECT 1 FROM install_attributions WHERE device_id = $1', [deviceId]),
      ),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query(
          `INSERT INTO install_attributions (device_id, channel, source) VALUES ($1, 'organic', 'app_store')`,
          [randomUUID()],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('lets app_system record and update an attribution', async () => {
    const deviceId = randomUUID();
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO install_attributions (device_id, channel, source) VALUES ($1, 'paid', 'meta')`,
        [deviceId],
      ),
    );
    await withSystem(db.pool, (tx) =>
      tx.query('UPDATE install_attributions SET claimed_at = now() WHERE device_id = $1', [
        deviceId,
      ]),
    );
    const { rows } = await withSystem(db.pool, (tx) =>
      tx.query<{ claimed_at: Date | null }>(
        'SELECT claimed_at FROM install_attributions WHERE device_id = $1',
        [deviceId],
      ),
    );
    expect(rows[0]?.claimed_at).not.toBeNull();
  });

  it('enforces one row per device_id', async () => {
    const deviceId = randomUUID();
    await withSystem(db.pool, (tx) =>
      tx.query('INSERT INTO install_attributions (device_id) VALUES ($1)', [deviceId]),
    );
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query('INSERT INTO install_attributions (device_id) VALUES ($1)', [deviceId]),
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('never publishes install_attributions on the powersync publication', async () => {
    const { rows } = await db.pool.query(
      "SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'install_attributions'",
    );
    expect(rows).toEqual([]);
  });
});
