/**
 * `account_deletions`: RLS class O (docs/data-model.md §3.17) — self-service open/read; at most one
 * open (not restored, not purged) request per user.
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

async function requestDeletion(userId: string): Promise<void> {
  await withUser(db.pool, userId, anonymousActor().device, (tx) =>
    tx.query(
      `INSERT INTO account_deletions (user_id, purge_at, source) VALUES ($1, now() + interval '30 days', 'app')`,
      [userId],
    ),
  );
}

describe('account_deletions: self-service, one open request per user', () => {
  it('lets the owning user request and read their own deletion row', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    await requestDeletion(owner);
    const { rowCount } = await withUser(db.pool, owner, anonymousActor().device, (tx) =>
      tx.query('SELECT 1 FROM account_deletions WHERE user_id = $1', [owner]),
    );
    expect(rowCount).toBe(1);
  });

  it('denies reading another user’s deletion row', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    const other = await withSystem(db.pool, (tx) => insertUser(tx));
    await requestDeletion(owner);
    const { rowCount } = await withUser(db.pool, other, anonymousActor().device, (tx) =>
      tx.query('SELECT 1 FROM account_deletions WHERE user_id = $1', [owner]),
    );
    expect(rowCount).toBe(0);
  });

  it('rejects a second open deletion request for the same user', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    await requestDeletion(owner);
    await expect(requestDeletion(owner)).rejects.toThrow(/duplicate key|unique/i);
  });

  it('allows a new request once the prior one is purged', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    await requestDeletion(owner);
    await withSystem(db.pool, (tx) =>
      tx.query('UPDATE account_deletions SET purged_at = now() WHERE user_id = $1', [owner]),
    );
    await expect(requestDeletion(owner)).resolves.toBeUndefined();
  });

  it('rejects a source outside app/web', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          `INSERT INTO account_deletions (user_id, purge_at, source) VALUES ($1, now() + interval '30 days', 'carrier-pigeon')`,
          [owner],
        ),
      ),
    ).rejects.toThrow(/violates check constraint/i);
  });
});
