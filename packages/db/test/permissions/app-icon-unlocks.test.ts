/**
 * `app_icon_unlocks`: RLS class O read / S write (docs/data-model.md §3.1). Only the unlock job
 * (app_system) writes; the owner reads their own unlocks; nobody reads anyone else's.
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

async function unlock(userId: string, icon = 'pon'): Promise<void> {
  await withSystem(db.pool, (tx) =>
    tx.query(
      "INSERT INTO app_icon_unlocks (user_id, icon_key, source) VALUES ($1, $2, 'form_found')",
      [userId, icon],
    ),
  );
}

describe('app_icon_unlocks: owner reads, system writes', () => {
  it('lets the owner read their unlocks and hides them from everyone else', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    const other = await withSystem(db.pool, (tx) => insertUser(tx));
    await unlock(owner);
    const own = await withUser(db.pool, owner, device, (tx) =>
      tx.query('SELECT icon_key FROM app_icon_unlocks WHERE user_id = $1', [owner]),
    );
    expect(own.rows).toEqual([{ icon_key: 'pon' }]);
    const foreign = await withUser(db.pool, other, device, (tx) =>
      tx.query('SELECT 1 FROM app_icon_unlocks WHERE user_id = $1', [owner]),
    );
    expect(foreign.rowCount).toBe(0);
  });

  it('refuses an unlock the user writes for themselves', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    await expect(
      withUser(db.pool, owner, device, (tx) =>
        tx.query(
          "INSERT INTO app_icon_unlocks (user_id, icon_key, source) VALUES ($1, 'golden', 'form_found')",
          [owner],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('refuses an update from the owner (seen state goes through the system step)', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    await unlock(owner);
    await expect(
      withUser(db.pool, owner, device, (tx) =>
        tx.query('UPDATE app_icon_unlocks SET seen_at = now() WHERE user_id = $1', [owner]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keeps one unlock per user and icon', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    await unlock(owner, 'golden');
    await expect(unlock(owner, 'golden')).rejects.toThrow(/duplicate key|unique/i);
  });

  it('rejects an unknown unlock source', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          "INSERT INTO app_icon_unlocks (user_id, icon_key, source) VALUES ($1, 'pon', 'purchase')",
          [owner],
        ),
      ),
    ).rejects.toThrow(/check constraint/i);
  });
});
