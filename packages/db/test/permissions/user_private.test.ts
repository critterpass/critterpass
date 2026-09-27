/**
 * `user_private`: RLS class X (docs/data-model.md §3.1) — owner-only, and (unlike an ordinary O
 * table) never granted to `guide_reader` or entered into the powersync publication at all: the
 * encrypted split half of a user's identity.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
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

describe('user_private: owner-only, excluded from every derived view', () => {
  it('lets the owning user select their own row but not another user’s', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    const other = await withSystem(db.pool, (tx) => insertUser(tx));
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO user_private (user_id, phone_e164_enc, phone_hash) VALUES ($1, 'enc', $2)`,
        [owner, randomUUID()],
      ),
    );

    const own = await withUser(db.pool, owner, anonymousActor().device, (tx) =>
      tx.query('SELECT 1 FROM user_private WHERE user_id = $1', [owner]),
    );
    expect(own.rowCount).toBe(1);

    const denied = await withUser(db.pool, other, anonymousActor().device, (tx) =>
      tx.query('SELECT 1 FROM user_private WHERE user_id = $1', [owner]),
    );
    expect(denied.rowCount).toBe(0);
  });

  it('lets a user insert only their own row', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    await expect(
      withUser(db.pool, owner, anonymousActor().device, (tx) =>
        tx.query('INSERT INTO user_private (user_id) VALUES ($1)', [owner]),
      ),
    ).resolves.toBeDefined();

    const other = await withSystem(db.pool, (tx) => insertUser(tx));
    await expect(
      withUser(db.pool, other, anonymousActor().device, (tx) =>
        tx.query('INSERT INTO user_private (user_id) VALUES ($1)', [owner]),
      ),
    ).rejects.toThrow(/row-level security|permission denied|duplicate key/i);
  });

  it('denies guide_reader any access', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    await withSystem(db.pool, (tx) =>
      tx.query('INSERT INTO user_private (user_id) VALUES ($1)', [owner]),
    );
    await expect(
      withGuideReader(db.pool, owner, randomUUID(), (tx) =>
        tx.query('SELECT 1 FROM user_private WHERE user_id = $1', [owner]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('enforces uniqueness on phone_hash', async () => {
    const a = await withSystem(db.pool, (tx) => insertUser(tx));
    const b = await withSystem(db.pool, (tx) => insertUser(tx));
    const sharedHash = randomUUID();
    await withSystem(db.pool, (tx) =>
      tx.query('INSERT INTO user_private (user_id, phone_hash) VALUES ($1, $2)', [a, sharedHash]),
    );
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query('INSERT INTO user_private (user_id, phone_hash) VALUES ($1, $2)', [b, sharedHash]),
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('never grants guide_reader a table privilege', async () => {
    const { rows } = await db.pool.query(
      `SELECT 1 FROM information_schema.role_table_grants
       WHERE table_name = 'user_private' AND grantee = 'guide_reader'`,
    );
    expect(rows).toEqual([]);
  });

  it('never publishes user_private on the powersync publication', async () => {
    const { rows } = await db.pool.query(
      "SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'user_private'",
    );
    expect(rows).toEqual([]);
  });
});
