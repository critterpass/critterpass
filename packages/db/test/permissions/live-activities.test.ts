/**
 * Live Activity tables (docs/data-model.md §3.11): an owner reads their own push-to-start tokens
 * and device activities and nobody else's; nobody writes either through app_user; broadcast
 * channels and the orchestrator's frames are app_system's alone; guide_reader and the replication
 * role see none of them, and none is published to sync.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { appendDomainEvent } from '../../src/events';
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

const TABLES = [
  'la_push_to_start_tokens',
  'device_activities',
  'broadcast_channels',
  'la_object_states',
] as const;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildPermissionFixture(db.pool);
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

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

async function seed(userId: string): Promise<{ deviceId: string; activityId: string }> {
  const deviceId = await insertDevice(userId);
  return withSystem(db.pool, async (tx) => {
    await tx.query(
      `INSERT INTO la_push_to_start_tokens (device_id, user_id, activity_type, token, env)
       VALUES ($1, $2, 'flight', $3, 'prod')`,
      [deviceId, userId, randomUUID().replaceAll('-', '')],
    );
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO device_activities (device_id, user_id, kind, ref_id, started_via, state)
       VALUES ($1, $2, 'leave_by', $3, 'local', 'active') RETURNING id`,
      [deviceId, userId, randomUUID()],
    );
    return { deviceId, activityId: rows[0]!.id };
  });
}

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

describe('live activity tables', () => {
  it('lets an owner read their own tokens and activities, never another user’s', async () => {
    const { activityId } = await seed(fixture.actors.member);
    const own = await asUser(fixture.actors.member, async (tx) => ({
      tokens: (await tx.query('SELECT 1 FROM la_push_to_start_tokens')).rowCount,
      activities: (await tx.query('SELECT 1 FROM device_activities WHERE id = $1', [activityId]))
        .rowCount,
    }));
    expect(own).toEqual({ tokens: 1, activities: 1 });
    const other = await asUser(fixture.actors.outsider, async (tx) => ({
      tokens: (await tx.query('SELECT 1 FROM la_push_to_start_tokens')).rowCount,
      activities: (await tx.query('SELECT 1 FROM device_activities WHERE id = $1', [activityId]))
        .rowCount,
    }));
    expect(other).toEqual({ tokens: 0, activities: 0 });
  });

  it('refuses app_user writes even to the owner’s own rows', async () => {
    const { deviceId, activityId } = await seed(fixture.actors.coOrganiser);
    const uid = fixture.actors.coOrganiser;
    await expect(
      asUser(uid, (tx) =>
        tx.query(
          `INSERT INTO la_push_to_start_tokens (device_id, user_id, activity_type, token, env)
           VALUES ($1, $2, 'vote', 'abcdef0123456789', 'prod')`,
          [deviceId, uid],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(uid, (tx) =>
        tx.query("UPDATE device_activities SET state = 'dismissed' WHERE id = $1", [activityId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keeps broadcast channels and object frames to app_system', async () => {
    await withSystem(db.pool, async (tx) => {
      await tx.query(
        `INSERT INTO broadcast_channels (kind, ref_id, env, bundle_id, apns_channel_id)
         VALUES ('leave_by', $1, 'prod', 'app.critterpass', 'dHN0LTEyMzQ1Njc4OQ==')`,
        [randomUUID()],
      );
      await tx.query("INSERT INTO la_object_states (kind, ref_id, seq) VALUES ('vote', $1, 3)", [
        randomUUID(),
      ]);
    });
    for (const table of ['broadcast_channels', 'la_object_states']) {
      await expect(
        asUser(fixture.actors.organiser, (tx) => tx.query(`SELECT 1 FROM ${table}`)),
      ).rejects.toThrow(/permission denied/i);
    }
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

  it('dedupes live activities per (device, kind, object) but keeps ended history', async () => {
    const deviceId = await insertDevice(fixture.actors.organiser);
    const refId = randomUUID();
    const insert = (state: string) =>
      withSystem(db.pool, (tx) =>
        tx.query(
          `INSERT INTO device_activities (device_id, user_id, kind, ref_id, started_via, state, ended_at)
           VALUES ($1, $2, 'meet_up', $3, 'push_to_start', $4,
                   CASE WHEN $4 IN ('ended', 'dismissed') THEN now() END)`,
          [deviceId, fixture.actors.organiser, refId, state],
        ),
      );
    await insert('ended');
    await insert('active');
    await expect(insert('pending')).rejects.toThrow(/device_activities_live_key/);
    await insert('dismissed');
  });

  it('accepts the Live Activity event types in the catalogue constraint', async () => {
    const payload = {
      user_id: fixture.actors.organiser,
      device_id: randomUUID(),
      activity_type: 'flight',
      ref_id: randomUUID(),
      state: 'dismissed',
    };
    await withSystem(db.pool, (tx) =>
      appendDomainEvent(tx, {
        type: 'la.state_reported',
        aggregateKind: 'device_activity',
        aggregateId: randomUUID(),
        actorKind: 'user',
        actorId: fixture.actors.organiser,
        payload,
      }),
    );
  });
});
