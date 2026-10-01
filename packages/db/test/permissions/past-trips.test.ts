/**
 * `past_trips`: RLS class O (docs/data-model.md §3.1). The owner writes and reads their own
 * self-reported trips; removal is a soft delete because `app_user` holds no DELETE grant.
 */
import { generateUuidV7 } from '@cp/domain';
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

function addPastTrip(asUser: string, forUser: string, month = '2023-05-01') {
  return withUser(db.pool, asUser, device, (tx) =>
    tx.query("INSERT INTO past_trips (id, user_id, country, month) VALUES ($1, $2, 'TH', $3)", [
      generateUuidV7(),
      forUser,
      month,
    ]),
  );
}

describe('past_trips: self-service history', () => {
  it('lets the owner add, read and soft-delete their past trips', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    await addPastTrip(owner, owner);
    await withUser(db.pool, owner, device, (tx) =>
      tx.query('UPDATE past_trips SET deleted_at = now() WHERE user_id = $1', [owner]),
    );
    const { rows } = await withUser(db.pool, owner, device, (tx) =>
      tx.query<{ deleted: boolean }>(
        'SELECT deleted_at IS NOT NULL AS deleted FROM past_trips WHERE user_id = $1',
        [owner],
      ),
    );
    expect(rows).toEqual([{ deleted: true }]);
  });

  it('hides a past trip from another user and refuses writing one for them', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    const other = await withSystem(db.pool, (tx) => insertUser(tx));
    await addPastTrip(owner, owner);
    const seen = await withUser(db.pool, other, device, (tx) =>
      tx.query('SELECT 1 FROM past_trips WHERE user_id = $1', [owner]),
    );
    expect(seen.rowCount).toBe(0);
    await expect(addPastTrip(other, owner)).rejects.toThrow(/row-level security/i);
  });

  it('never lets the owner hard-delete', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    await addPastTrip(owner, owner);
    await expect(
      withUser(db.pool, owner, device, (tx) =>
        tx.query('DELETE FROM past_trips WHERE user_id = $1', [owner]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('stores months only: a date that is not the first of a month is refused', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    await expect(addPastTrip(owner, owner, '2023-05-14')).rejects.toThrow(/check constraint/i);
  });
});
