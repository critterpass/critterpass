/**
 * Widget tables (docs/data-model.md §3.11): an owner reads their own widget token and installed
 * widgets and nobody else's (outsider, ex-member, crewmate or organiser alike); nobody writes them
 * through app_user; the push ledger is app_system's alone; guide_reader and the replication role
 * see none of them, none is published to sync, and they go with the install.
 */
import { randomBytes, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { buildPermissionFixture, type PermissionFixture } from '../helpers/fixtures';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: PermissionFixture;
let memberDevice: string;

const TABLES = ['widget_push_tokens', 'installed_widgets', 'widget_push_ledger'] as const;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildPermissionFixture(db.pool);
  memberDevice = randomUUID();
  await withSystem(db.pool, async (tx) => {
    await tx.query(
      `INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
       VALUES ($1, $2, 'ios', '1.0.0', 'en', 'UTC')`,
      [memberDevice, fixture.actors.member],
    );
    await tx.query(
      `INSERT INTO widget_push_tokens (device_id, user_id, token, env)
       VALUES ($1, $2, $3, 'prod')`,
      [memberDevice, fixture.actors.member, randomBytes(32).toString('hex')],
    );
    await tx.query(
      `INSERT INTO installed_widgets (device_id, user_id, kind, family, config)
       VALUES ($1, $2, 'balances', 'system_small', $3::jsonb)`,
      [memberDevice, fixture.actors.member, JSON.stringify({ trip_id: fixture.tripId })],
    );
    await tx.query(
      'INSERT INTO widget_push_ledger (device_id, utc_date, sent) VALUES ($1, current_date, 2)',
      [memberDevice],
    );
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

function asUser<T>(uid: string, fn: Parameters<typeof withUser<T>>[3]): Promise<T> {
  return withUser(db.pool, uid, randomUUID(), fn);
}

async function asRole(role: string, sql: string): Promise<unknown> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    return await client.query(sql);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

const visible = (uid: string) =>
  asUser(uid, async (tx) => ({
    tokens: (
      await tx.query('SELECT 1 FROM widget_push_tokens WHERE device_id = $1', [memberDevice])
    ).rowCount,
    widgets: (
      await tx.query('SELECT 1 FROM installed_widgets WHERE device_id = $1', [memberDevice])
    ).rowCount,
  }));

describe('widget tables', () => {
  it('lets the owner read their own token and installed widgets', async () => {
    expect(await visible(fixture.actors.member)).toEqual({ tokens: 1, widgets: 1 });
  });

  it.each(['outsider', 'exMember', 'anonymous', 'coOrganiser', 'organiser'] as const)(
    'hides them from %s',
    async (actor) => {
      expect(await visible(fixture.actors[actor])).toEqual({ tokens: 0, widgets: 0 });
    },
  );

  it('refuses app_user writes even to the owner’s own rows', async () => {
    const uid = fixture.actors.member;
    await expect(
      asUser(uid, (tx) =>
        tx.query(
          `INSERT INTO installed_widgets (device_id, user_id, kind, family)
           VALUES ($1, $2, 'vote', 'system_small')`,
          [memberDevice, uid],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(uid, (tx) =>
        tx.query("UPDATE widget_push_tokens SET env = 'sandbox' WHERE device_id = $1", [
          memberDevice,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(uid, (tx) =>
        tx.query('DELETE FROM installed_widgets WHERE device_id = $1', [memberDevice]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keeps the push ledger to app_system', async () => {
    await expect(
      asUser(fixture.actors.member, (tx) => tx.query('SELECT 1 FROM widget_push_ledger')),
    ).rejects.toThrow(/permission denied/i);
  });

  it('gives guide_reader and the replication role nothing, and publishes nothing', async () => {
    for (const table of TABLES) {
      for (const role of ['guide_reader', 'powersync_repl']) {
        await expect(
          asRole(role, `SELECT 1 FROM ${table} LIMIT 1`),
          `${role} ${table}`,
        ).rejects.toThrow(/permission denied/i);
      }
    }
    const { rows } = await db.pool.query(
      "SELECT tablename FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = ANY($1)",
      [TABLES],
    );
    expect(rows).toEqual([]);
  });

  it('rejects a widget kind or family the product does not have', async () => {
    const insert = (kind: string, family: string) =>
      withSystem(db.pool, (tx) =>
        tx.query(
          'INSERT INTO installed_widgets (device_id, user_id, kind, family) VALUES ($1, $2, $3, $4)',
          [memberDevice, fixture.actors.member, kind, family],
        ),
      );
    await expect(insert('weather', 'system_small')).rejects.toThrow(/installed_widgets_kind_check/);
    await expect(insert('vote', 'huge')).rejects.toThrow(/installed_widgets_family_check/);
  });

  it('removes an install’s widget rows with the install', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query('DELETE FROM devices WHERE id = $1', [memberDevice]),
    );
    const { rows } = await db.pool.query<{ n: number }>(
      `SELECT (SELECT count(*) FROM widget_push_tokens WHERE device_id = $1)
            + (SELECT count(*) FROM installed_widgets WHERE device_id = $1)
            + (SELECT count(*) FROM widget_push_ledger WHERE device_id = $1) AS n`,
      [memberDevice],
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });
});
