/**
 * `device_action_keys`: RLS class O (docs/data-model.md §3.1) — the owning user may read/revoke
 * their own rows; app_system issues/rotates/revokes on merge, deletion, and admin actions. No DELETE
 * grant to either role (retention keeps a revoked row auditable for 30 d).
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { buildPermissionFixture, type PermissionFixture } from '../helpers/fixtures';
import { anonymousActor } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: PermissionFixture;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildPermissionFixture(db.pool);
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

/** A real install row for `userId`: every action key belongs to one. */
async function insertDevice(userId: string): Promise<string> {
  const id = randomUUID();
  await withSystem(db.pool, (tx) =>
    tx.query(
      `INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
       VALUES ($1, $2, 'ios', '1.0.0', 'en', 'UTC')`,
      [id, userId],
    ),
  );
  return id;
}

async function insertKey(userId: string, keyId = randomUUID()): Promise<string> {
  const deviceId = await insertDevice(userId);
  await withSystem(db.pool, (tx) =>
    tx.query(
      `INSERT INTO device_action_keys (key_id, device_id, user_id, secret_enc, scopes, expires_at)
       VALUES ($1, $2, $3, 'enc', ARRAY['ballot'], now() + interval '30 days')`,
      [keyId, deviceId, userId],
    ),
  );
  return keyId;
}

describe('device_action_keys: owner-only, system-issued', () => {
  it('lets the owning user select their own key but not another user’s', async () => {
    const keyId = await insertKey(fixture.actors.organiser);
    const own = await withUser(db.pool, fixture.actors.organiser, anonymousActor().device, (tx) =>
      tx.query('SELECT 1 FROM device_action_keys WHERE key_id = $1', [keyId]),
    );
    expect(own.rowCount).toBe(1);

    const other = await withUser(db.pool, fixture.actors.outsider, anonymousActor().device, (tx) =>
      tx.query('SELECT 1 FROM device_action_keys WHERE key_id = $1', [keyId]),
    );
    expect(other.rowCount).toBe(0);
  });

  it('lets a user insert their own key but not one for another user', async () => {
    const ownKeyId = randomUUID();
    const organiserDevice = await insertDevice(fixture.actors.organiser);
    await expect(
      withUser(db.pool, fixture.actors.organiser, anonymousActor().device, (tx) =>
        tx.query(
          `INSERT INTO device_action_keys (key_id, device_id, user_id, secret_enc, scopes, expires_at)
           VALUES ($1, $2, $3, 'enc', ARRAY['ballot'], now() + interval '30 days')`,
          [ownKeyId, organiserDevice, fixture.actors.organiser],
        ),
      ),
    ).resolves.toBeDefined();

    await expect(
      withUser(db.pool, fixture.actors.outsider, anonymousActor().device, (tx) =>
        tx.query(
          `INSERT INTO device_action_keys (key_id, device_id, user_id, secret_enc, scopes, expires_at)
           VALUES ($1, $2, $3, 'enc', ARRAY['ballot'], now() + interval '30 days')`,
          [randomUUID(), organiserDevice, fixture.actors.organiser],
        ),
      ),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it('lets app_system issue, use, and revoke a key', async () => {
    const keyId = await insertKey(fixture.actors.member);
    await withSystem(db.pool, (tx) =>
      tx.query('UPDATE device_action_keys SET last_used_at = now() WHERE key_id = $1', [keyId]),
    );
    await withSystem(db.pool, (tx) =>
      tx.query('UPDATE device_action_keys SET revoked_at = now() WHERE key_id = $1', [keyId]),
    );
    const { rows } = await withSystem(db.pool, (tx) =>
      tx.query<{ revoked_at: Date | null; last_used_at: Date | null }>(
        'SELECT revoked_at, last_used_at FROM device_action_keys WHERE key_id = $1',
        [keyId],
      ),
    );
    expect(rows[0]?.revoked_at).not.toBeNull();
    expect(rows[0]?.last_used_at).not.toBeNull();
  });

  it('rejects an empty scopes array', async () => {
    const organiserDevice = await insertDevice(fixture.actors.organiser);
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          `INSERT INTO device_action_keys (key_id, device_id, user_id, secret_enc, scopes, expires_at)
           VALUES ($1, $2, $3, 'enc', ARRAY[]::text[], now() + interval '30 days')`,
          [randomUUID(), organiserDevice, fixture.actors.organiser],
        ),
      ),
    ).rejects.toThrow(/violates check constraint/i);
  });

  it('never grants DELETE to app_user or app_system', async () => {
    const { rows } = await db.pool.query(
      `SELECT grantee FROM information_schema.role_table_grants
       WHERE table_name = 'device_action_keys' AND privilege_type = 'DELETE'
         AND grantee IN ('app_user', 'app_system')`,
    );
    expect(rows).toEqual([]);
  });

  it('never grants guide_reader a table privilege', async () => {
    const { rows } = await db.pool.query(
      `SELECT 1 FROM information_schema.role_table_grants
       WHERE table_name = 'device_action_keys' AND grantee = 'guide_reader'`,
    );
    expect(rows).toEqual([]);
  });

  it('never publishes device_action_keys on the powersync publication', async () => {
    const { rows } = await db.pool.query(
      "SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'device_action_keys'",
    );
    expect(rows).toEqual([]);
  });
});
