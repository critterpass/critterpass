/**
 * `rejectClosedAccount` and `fanOutSessionRevoked` (docs/data-model.md §3.1: "Account state",
 * "sign-out / revoke-sessions -> rt_outbox session.revoked + revoke device action keys"). Real
 * Postgres (Testcontainers) — pure-function guards live in guards.test.ts.
 */
import { randomUUID } from 'node:crypto';

import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import { DomainError, userChannel } from '@cp/domain';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { issueActionKey } from '../../src/auth/action-keys/issue';
import { fanOutSessionRevoked, rejectClosedAccount } from '../../src/auth/guards';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
const keyring = {
  activeKeyId: 'k1',
  keys: { k1: Buffer.alloc(32, 9) },
};

async function createUser(): Promise<string> {
  const id = randomUUID();
  await pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [id]);
  return id;
}

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  await runMigrations(pool);
}, 180_000);

afterAll(async () => {
  await pool.end();
  await postgres.stop();
});

describe('rejectClosedAccount', () => {
  it('does not throw for a user with no account_deletions row', async () => {
    const userId = await createUser();
    await expect(rejectClosedAccount(pool, userId)).resolves.toBeUndefined();
  });

  it('throws ACCOUNT_CLOSED for a user with an open (unrestored, unpurged) deletion', async () => {
    const userId = await createUser();
    await pool.query(
      `INSERT INTO account_deletions (user_id, purge_at, source) VALUES ($1, now() + interval '30 days', 'app')`,
      [userId],
    );
    try {
      await rejectClosedAccount(pool, userId);
      throw new Error('expected rejectClosedAccount to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('ACCOUNT_CLOSED');
    }
  });

  it('does not throw once the deletion has been restored', async () => {
    const userId = await createUser();
    await pool.query(
      `INSERT INTO account_deletions (user_id, purge_at, source, restored_at)
       VALUES ($1, now() + interval '30 days', 'app', now())`,
      [userId],
    );
    await expect(rejectClosedAccount(pool, userId)).resolves.toBeUndefined();
  });

  it('does not throw once the deletion has been purged', async () => {
    const userId = await createUser();
    await pool.query(
      `INSERT INTO account_deletions (user_id, purge_at, source, purged_at)
       VALUES ($1, now() + interval '30 days', 'app', now())`,
      [userId],
    );
    await expect(rejectClosedAccount(pool, userId)).resolves.toBeUndefined();
  });
});

describe('fanOutSessionRevoked', () => {
  it('writes one session.revoked rt_outbox row on user:#uid', async () => {
    const userId = await createUser();
    await fanOutSessionRevoked(pool, userId);

    const { rows } = await pool.query<{ payload: { type: string } }>(
      "SELECT payload FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'session.revoked'",
      [userChannel(userId)],
    );
    expect(rows).toHaveLength(1);
  });

  it('revokes every active device action key for the user, leaving other users untouched', async () => {
    const userId = await createUser();
    const otherUserId = await createUser();
    const revokedKey = await issueActionKey(
      pool,
      { userId, deviceId: randomUUID(), scopes: ['ballot'] },
      keyring,
    );
    const untouchedKey = await issueActionKey(
      pool,
      { userId: otherUserId, deviceId: randomUUID(), scopes: ['ballot'] },
      keyring,
    );

    await fanOutSessionRevoked(pool, userId);

    const { rows } = await pool.query<{ key_id: string; revoked_at: Date | null }>(
      'SELECT key_id, revoked_at FROM device_action_keys WHERE key_id = ANY($1)',
      [[revokedKey.keyId, untouchedKey.keyId]],
    );
    const byKeyId = new Map(rows.map((row) => [row.key_id, row.revoked_at]));
    expect(byKeyId.get(revokedKey.keyId)).not.toBeNull();
    expect(byKeyId.get(untouchedKey.keyId)).toBeNull();
  });
});
