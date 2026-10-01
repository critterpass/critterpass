/**
 * `data_exports`: RLS class O read / S write (docs/data-model.md §3.17). The owner reads their
 * own exports; only the system writes; at most one export is queued or building per user.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, insertUser } from '../helpers/actors';
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

const device = anonymousActor().device;

function queueExport(userId: string) {
  return withSystem(db.pool, (tx) =>
    tx.query<{ id: string }>('INSERT INTO data_exports (user_id) VALUES ($1) RETURNING id', [
      userId,
    ]),
  );
}

describe('data_exports: owner reads, system writes', () => {
  it('shows the owner their export and nobody else', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    const other = await withSystem(db.pool, (tx) => insertUser(tx));
    await queueExport(owner);
    const own = await withUser(db.pool, owner, device, (tx) =>
      tx.query('SELECT status FROM data_exports WHERE user_id = $1', [owner]),
    );
    expect(own.rows).toEqual([{ status: 'queued' }]);
    const foreign = await withUser(db.pool, other, device, (tx) =>
      tx.query('SELECT 1 FROM data_exports WHERE user_id = $1', [owner]),
    );
    expect(foreign.rowCount).toBe(0);
  });

  it('refuses inserts and updates through the request role', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    await expect(
      withUser(db.pool, owner, device, (tx) =>
        tx.query('INSERT INTO data_exports (user_id) VALUES ($1)', [owner]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await queueExport(owner);
    await expect(
      withUser(db.pool, owner, device, (tx) =>
        tx.query("UPDATE data_exports SET status = 'ready' WHERE user_id = $1", [owner]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('allows one export in flight per user, and a new one once it is done', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    const first = await queueExport(owner);
    await expect(queueExport(owner)).rejects.toThrow(/duplicate key|unique/i);
    await withSystem(db.pool, (tx) =>
      tx.query(
        `UPDATE data_exports SET status = 'ready', r2_key = 'exports/' || user_id || '/' || id || '.zip',
           ready_at = now(), expires_at = now() + interval '7 days' WHERE id = $1`,
        [first.rows[0]?.id],
      ),
    );
    await expect(queueExport(owner)).resolves.toBeDefined();
  });

  it('refuses a ready export without its object key and expiry', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    const queued = await queueExport(owner);
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query("UPDATE data_exports SET status = 'ready' WHERE id = $1", [queued.rows[0]?.id]),
      ),
    ).rejects.toThrow(/check constraint/i);
  });
});
