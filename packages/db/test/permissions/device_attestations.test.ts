/**
 * `device_attestations`: RLS class S (docs/data-model.md §3.1) — no app_user policy at all, so
 * FORCE RLS leaves it unreadable/unwritable by app_user regardless of grants; only app_system
 * (services/api/src/abuse/attestation/) ever touches it. Same shape as
 * packages/db/test/permissions/infra.test.ts's cmd_log/domain_events checks.
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

describe('device_attestations: owner-less system table', () => {
  it('denies app_user SELECT and INSERT entirely', async () => {
    const installId = randomUUID();
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO device_attestations (install_id, platform, key_id, public_key, verdict)
         VALUES ($1, 'ios', $2, 'pk', 'genuine')`,
        [installId, randomUUID()],
      ),
    );

    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query('SELECT 1 FROM device_attestations WHERE install_id = $1', [installId]),
      ),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query(
          `INSERT INTO device_attestations (install_id, platform, key_id, public_key, verdict)
           VALUES ($1, 'ios', $2, 'pk', 'genuine')`,
          [randomUUID(), randomUUID()],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('lets app_system record, update and read an attestation', async () => {
    const installId = randomUUID();
    const keyId = randomUUID();
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO device_attestations (install_id, platform, key_id, public_key, verdict)
         VALUES ($1, 'android', $2, 'pk', 'MEETS_DEVICE_INTEGRITY')`,
        [installId, keyId],
      ),
    );
    await withSystem(db.pool, (tx) =>
      tx.query(
        `UPDATE device_attestations SET counter = counter + 1, last_assertion_at = now()
         WHERE install_id = $1`,
        [installId],
      ),
    );
    const { rows } = await withSystem(db.pool, (tx) =>
      tx.query<{ counter: number; last_assertion_at: Date | null }>(
        'SELECT counter, last_assertion_at FROM device_attestations WHERE install_id = $1',
        [installId],
      ),
    );
    expect(rows[0]?.counter).toBe(1);
    expect(rows[0]?.last_assertion_at).not.toBeNull();
  });

  it('rejects a platform outside ios/android', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          `INSERT INTO device_attestations (install_id, platform, key_id, public_key, verdict)
           VALUES ($1, 'windows', $2, 'pk', 'genuine')`,
          [randomUUID(), randomUUID()],
        ),
      ),
    ).rejects.toThrow(/violates check constraint/i);
  });

  it('enforces one row per install_id', async () => {
    const installId = randomUUID();
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO device_attestations (install_id, platform, key_id, public_key, verdict)
         VALUES ($1, 'ios', $2, 'pk', 'genuine')`,
        [installId, randomUUID()],
      ),
    );
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          `INSERT INTO device_attestations (install_id, platform, key_id, public_key, verdict)
           VALUES ($1, 'ios', $2, 'pk', 'genuine')`,
          [installId, randomUUID()],
        ),
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('never publishes device_attestations on the powersync publication', async () => {
    const { rows } = await db.pool.query(
      "SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'device_attestations'",
    );
    expect(rows).toEqual([]);
  });
});
