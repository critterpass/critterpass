/**
 * `install_attributions` claim fields (docs/data-model.md §3.1): `via`, `claimed_url` and
 * `link_kind` stay behind the table's system-only (RLS class S) boundary and only accept the known
 * attribution routes and link kinds.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { insertUser } from '../helpers/actors';
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

function claim(deviceId: string, via: string, linkKind: string) {
  return withSystem(db.pool, (tx) =>
    tx.query(
      `INSERT INTO install_attributions (device_id, channel, source, join_code, via, claimed_url, link_kind, claimed_at)
       VALUES ($1, 'wa', 'invite', 'K7M2QX', $2, 'https://critterpass.app/i/K7M2QX', $3, now())`,
      [deviceId, via, linkKind],
    ),
  );
}

describe('install_attributions claim fields', () => {
  it('records every attribution route for app_system', async () => {
    for (const via of ['referrer', 'paste', 'code', 'phone', 'clip', 'link']) {
      await claim(randomUUID(), via, 'invite');
    }
    const { rows } = await withSystem(db.pool, (tx) =>
      tx.query<{ via: string }>('SELECT DISTINCT via FROM install_attributions ORDER BY via'),
    );
    expect(rows.map((row) => row.via)).toEqual([
      'clip',
      'code',
      'link',
      'paste',
      'phone',
      'referrer',
    ]);
  });

  it('rejects an unknown route or link kind', async () => {
    await expect(claim(randomUUID(), 'guess', 'invite')).rejects.toThrow(/check constraint/i);
    await expect(claim(randomUUID(), 'paste', 'nowhere')).rejects.toThrow(/check constraint/i);
  });

  it('keeps the claimed link out of reach of every app_user, including the claimer', async () => {
    const deviceId = randomUUID();
    await claim(deviceId, 'paste', 'invite');
    const uid = await withSystem(db.pool, (tx) => insertUser(tx));
    await expect(
      withUser(db.pool, uid, deviceId, (tx) =>
        tx.query('SELECT claimed_url FROM install_attributions WHERE device_id = $1', [deviceId]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, uid, deviceId, (tx) =>
        tx.query("UPDATE install_attributions SET via = 'code' WHERE device_id = $1", [deviceId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
