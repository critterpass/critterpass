/**
 * Trip day commands against a migrated Postgres, through `/v1/cmd` and the device action-key door
 * (`/v1/actions`, as the alarm and Live Activity send them): readiness reaches `trip_dayof:` and
 * replays change nothing, the second snooze asks the crew to knock exactly once, packing keeps a
 * personal row to its owner, a briefing NUDGE nudges its targets and shows SENT on every matching
 * item, running late posts to the crew chat, the buffer is the organiser's, and a phone mirrors its
 * alarm.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import pino from 'pino';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerTripDayCommands } from '../../src/commands/trip-day';
import { routeNotificationsFromApiEvents, startJobProducer } from '../../src/jobs/producer';
import {
  signedHeaders,
  startActionDoors,
  type ActionDoorsHarness,
  type SignedIn,
} from '../routes/action-doors-harness';
import { envelope } from '../routes/command-doors-harness';

let harness: ActionDoorsHarness;
let boss: PgBoss;
let maya: SignedIn;
let rin: SignedIn;
let dev: SignedIn;
let outsider: SignedIn;
let tripId: string;
let crewId: string;
let itemId: string;
let leaveById: string;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function events<T>(type: string): Promise<T[]> {
  const { rows } = await harness.pool.query(
    'SELECT payload FROM domain_events WHERE type = $1 AND trip_id = $2 ORDER BY occurred_at, id',
    [type, tripId],
  );
  return rows.map((row: { payload: T }) => row.payload);
}

async function dayOf(type: string): Promise<Record<string, unknown>[]> {
  const rows = await q<{ data: Record<string, unknown> }>(
    `SELECT payload->'data' AS data FROM rt_outbox
      WHERE channel = 'trip_dayof:' || $1 AND payload->>'type' = $2 ORDER BY id`,
    [tripId, type],
  );
  return rows.map((row) => row.data);
}

async function run(
  who: SignedIn,
  cmd: string,
  payload: unknown,
  opId = generateUuidV7(),
  deviceId = randomUUID(),
) {
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify(
      envelope(cmd, payload, {
        op_id: opId,
        actor: { uid: who.uid, via: 'app' },
        device: { id: deviceId, platform: 'ios', app_version: '1.0.0', tz: 'Asia/Makassar' },
      }),
    ),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function install(who: SignedIn, scopes: string[]) {
  const deviceId = randomUUID();
  const registered = await run(
    who,
    'register_device',
    { platform: 'ios', tz: 'Asia/Makassar', locale: 'en', app_version: '1.0.0' },
    generateUuidV7(),
    deviceId,
  );
  expect(registered.status).toBe(200);
  const issued = await harness.request(`/v1/devices/${deviceId}/action-keys`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify({ scopes }),
  });
  expect(issued.status).toBe(201);
  return { deviceId, key: (await issued.json()) as { key_id: string; secret: string } };
}

beforeAll(async () => {
  harness = await startActionDoors();
  registerTripDayCommands(harness.registry);
  boss = await startJobProducer({
    connectionString: harness.connectionString,
    logger: pino({ level: 'silent' }),
    startAttempts: 5,
  });
  routeNotificationsFromApiEvents();
  [maya, rin, dev, outsider] = await Promise.all([
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
  ]);
  const ids = await withSystem(harness.pool, async (tx) => {
    const one = async (sql: string, params: unknown[]) =>
      (await tx.query<{ id: string }>(sql, params)).rows[0]!.id;
    await tx.query("UPDATE users SET display_name = 'Maya Tan' WHERE id = $1", [maya.uid]);
    await tx.query("UPDATE users SET display_name = 'Rin Sato' WHERE id = $1", [rin.uid]);
    await tx.query("UPDATE users SET display_name = 'Dev Rao' WHERE id = $1", [dev.uid]);
    const crew = await one(
      "INSERT INTO crews (name, created_by) VALUES ('Bali Six', $1) RETURNING id",
      [maya.uid],
    );
    await tx.query(
      `INSERT INTO crew_members (crew_id, user_id, role)
       VALUES ($1, $2, 'organiser'), ($1, $3, 'member'), ($1, $4, 'member')`,
      [crew, maya.uid, rin.uid, dev.uid],
    );
    const trip = await one(
      "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
      [crew],
    );
    await tx.query(
      `INSERT INTO trip_participants (trip_id, user_id, role, rsvp)
       VALUES ($1, $2, 'organiser', 'in'), ($1, $3, 'member', 'in'), ($1, $4, 'member', 'in')`,
      [trip, maya.uid, rin.uid, dev.uid],
    );
    const version = await one(
      "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
      [trip],
    );
    const day = await one(
      'INSERT INTO plan_days (version_id, trip_id, day_no) VALUES ($1, $2, 4) RETURNING id',
      [version, trip],
    );
    const item = await one(
      `INSERT INTO plan_items (version_id, day_id, trip_id, starts_at, tz, category)
       VALUES ($1, $2, $3, now() + interval '10 hours', 'Asia/Makassar', 'activity') RETURNING id`,
      [version, day, trip],
    );
    // Batur is for Maya, Rin and Dev.
    const leaveBy = await one(
      `INSERT INTO leave_bys (trip_id, plan_item_id, plan_item_stable_id, local_date, starts_at,
         leave_at, tz, participant_ids)
       SELECT $1, id, stable_id, current_date, starts_at, starts_at - interval '1 hour',
              'Asia/Makassar', $3 FROM plan_items WHERE id = $2 RETURNING id`,
      [trip, item, [maya.uid, rin.uid, dev.uid]],
    );
    await tx.query(
      `INSERT INTO readiness (leave_by_id, trip_id, user_id)
       SELECT $1, $2, uid FROM unnest($3::uuid[]) AS uid`,
      [leaveBy, trip, [maya.uid, rin.uid, dev.uid]],
    );
    return { crew, trip, item, leaveBy };
  });
  ({ crew: crewId, trip: tripId, item: itemId, leaveBy: leaveById } = ids);
}, 240_000);

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await harness?.stop();
});

describe('set_readiness', () => {
  it('marks a member up, tells the crew on trip_dayof and replays as a duplicate', async () => {
    const opId = generateUuidV7();
    const payload = { leave_by_id: leaveById, state: 'up', source: 'app' };
    const first = await run(rin, 'set_readiness', payload, opId);
    expect(first.status).toBe(200);
    expect(first.body['result']).toMatchObject({ state: 'up', changed: true });
    const replay = await run(rin, 'set_readiness', payload, opId);
    expect(replay.body).toMatchObject({ status: 'duplicate' });
    expect(await events('readiness.changed')).toHaveLength(1);
    const published = await dayOf('readiness');
    expect(published.at(-1)).toMatchObject({ leave_by_id: leaveById, up: [rin.uid], total: 3 });
  });

  it('takes I’M UP from the alarm through a device action key and publishes it', async () => {
    const device = await install(dev, ['readiness']);
    const body = JSON.stringify(
      envelope(
        'set_readiness',
        { leave_by_id: leaveById, state: 'up', source: 'alarm' },
        {
          actor: { uid: randomUUID(), via: 'app_intent' },
          device: { id: device.deviceId, platform: 'ios', app_version: '1.0.0', tz: 'UTC' },
        },
      ),
    );
    const response = await harness.request('/v1/actions', {
      method: 'POST',
      headers: signedHeaders(device.key, 'POST', '/v1/actions', body),
      body,
    });
    expect(response.status).toBe(200);
    const [row] = await q<{ state: string; source: string }>(
      'SELECT state, source FROM readiness WHERE leave_by_id = $1 AND user_id = $2',
      [leaveById, dev.uid],
    );
    expect(row).toEqual({ state: 'up', source: 'alarm' });
    const published = await dayOf('readiness');
    expect((published.at(-1)?.['up'] as string[]).sort()).toEqual([rin.uid, dev.uid].sort());
  });

  it('refuses a key without the readiness scope, and anyone the item is not for', async () => {
    const device = await install(rin, ['ballot']);
    const body = JSON.stringify(
      envelope(
        'set_readiness',
        { leave_by_id: leaveById, state: 'up', source: 'widget' },
        {
          actor: { uid: randomUUID(), via: 'widget' },
          device: { id: device.deviceId, platform: 'ios', app_version: '1.0.0', tz: 'UTC' },
        },
      ),
    );
    const refused = await harness.request('/v1/actions', {
      method: 'POST',
      headers: signedHeaders(device.key, 'POST', '/v1/actions', body),
      body,
    });
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe(
      'ACTION_KEY_SCOPE',
    );
    const stranger = await run(outsider, 'set_readiness', {
      leave_by_id: leaveById,
      state: 'up',
      source: 'app',
    });
    expect(stranger.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});

describe('snooze_leave_by', () => {
  it('asks the crew to knock at the second snooze, exactly once', async () => {
    const first = await run(maya, 'snooze_leave_by', { leave_by_id: leaveById });
    expect(first.body['result']).toMatchObject({ count: 1, crew_knocked: false });
    const second = await run(maya, 'snooze_leave_by', { leave_by_id: leaveById });
    expect(second.body['result']).toMatchObject({ count: 2, crew_knocked: true });
    const third = await run(maya, 'snooze_leave_by', { leave_by_id: leaveById });
    expect(third.body['result']).toMatchObject({ count: 3, crew_knocked: false });
    const knocks = await events<{ user_id: string; reason: string }>('leave_by.knocked');
    expect(knocks).toEqual([
      expect.objectContaining({ user_id: maya.uid, reason: 'snooze', leave_by_id: leaveById }),
    ]);
    // The knock goes out through the notification router in the same transaction.
    const routed = await q<{ n: string }>(
      "SELECT count(*) AS n FROM pgboss.job WHERE name = 'notify.route'",
    );
    expect(Number(routed[0]?.n)).toBeGreaterThan(0);
  });
});

describe('packing', () => {
  const shared = generateUuidV7();
  const personal = generateUuidV7();

  it('adds shared and personal rows and keeps the personal one to its owner', async () => {
    const base = { trip_id: tripId, day: '2026-10-15' };
    expect(
      (
        await run(maya, 'add_packing_item', {
          ...base,
          item_id: shared,
          label: 'Headlamp',
          personal: false,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await run(maya, 'add_packing_item', {
          ...base,
          item_id: personal,
          label: 'Lenses',
          personal: true,
        })
      ).status,
    ).toBe(200);
    const hidden = await run(rin, 'check_packing_item', { item_id: personal, checked: true });
    expect(hidden.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('broadcasts a shared tick and never a personal one', async () => {
    expect((await run(rin, 'check_packing_item', { item_id: shared, checked: true })).status).toBe(
      200,
    );
    expect(
      (await run(maya, 'check_packing_item', { item_id: personal, checked: true })).status,
    ).toBe(200);
    const published = await dayOf('packing.checked');
    expect(published).toEqual([{ item_id: shared, checked: true, by: rin.uid }]);
    expect((await run(rin, 'remove_packing_item', { item_id: shared })).status).toBe(200);
    const [row] = await q<{ deleted: boolean }>(
      'SELECT deleted_at IS NOT NULL AS deleted FROM packing_items WHERE id = $1',
      [shared],
    );
    expect(row?.deleted).toBe(true);
  });
});

describe('act_briefing_item', () => {
  let mayaItem: string;
  let devItem: string;

  beforeAll(async () => {
    const insert = async (uid: string) =>
      (
        await q<{ id: string }>(
          `WITH b AS (
             INSERT INTO briefings (trip_id, user_id, local_date, tz)
             VALUES ($1, $2, '2026-10-15', 'Asia/Makassar') RETURNING id)
           INSERT INTO briefing_items (briefing_id, trip_id, user_id, icon, text, action,
             target_user_ids, dedupe_key)
           SELECT b.id, $1, $2, 'wallet', 'Rin still needs visa cash.', 'nudge', $3, 'visa_cash:rin'
             FROM b RETURNING id`,
          [tripId, uid, [rin.uid]],
        )
      )[0]!.id;
    mayaItem = await insert(maya.uid);
    devItem = await insert(dev.uid);
  });

  it('nudges the member the fact concerns and shows SENT on every matching item', async () => {
    const acted = await run(maya, 'act_briefing_item', { item_id: mayaItem, action: 'nudge' });
    expect(acted.body['result']).toMatchObject({
      status: 'nudged',
      nudged: [rin.uid],
      nudged_names: ['Rin'],
    });
    const statuses = await q<{ status: string }>(
      'SELECT status FROM briefing_items WHERE id = ANY($1)',
      [[mayaItem, devItem]],
    );
    expect(statuses.map((row) => row.status)).toEqual(['nudged', 'nudged']);
    const nudges = await q<{ target_id: string; reason: string }>(
      'SELECT target_id, reason FROM nudges WHERE sender_id = $1',
      [maya.uid],
    );
    expect(nudges).toEqual([{ target_id: rin.uid, reason: 'readiness' }]);
    const again = await run(maya, 'act_briefing_item', { item_id: mayaItem, action: 'nudge' });
    expect(again.body['result']).toMatchObject({ status: 'nudged', nudged: [] });
  });

  it('never lets anyone act on another member’s item', async () => {
    const other = await run(rin, 'act_briefing_item', { item_id: devItem, action: 'nudge' });
    expect(other.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});

describe('report_running_late, set_leave_by_buffer and mirror_alarm_state', () => {
  it('posts the late line to the crew chat and pings the rest', async () => {
    const late = await run(dev, 'report_running_late', {
      trip_id: tripId,
      item_id: itemId,
      minutes: 10,
    });
    expect(late.status).toBe(200);
    const [message] = await q<{ body: string; sender_id: string }>(
      "SELECT body, sender_id FROM messages WHERE crew_id = $1 AND ref_kind = 'plan_item'",
      [crewId],
    );
    expect(message).toEqual({ body: 'Running 10 min late.', sender_id: dev.uid });
    expect(await events('member.running_late')).toHaveLength(1);
  });

  it('lets only the organiser change the buffer, and queues the recompute', async () => {
    const member = await run(rin, 'set_leave_by_buffer', {
      leave_by_id: leaveById,
      buffer_min: 20,
    });
    expect(member.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
    const organiser = await run(maya, 'set_leave_by_buffer', {
      leave_by_id: leaveById,
      buffer_min: 20,
    });
    expect(organiser.status).toBe(200);
    const jobs = await q<{ data: { trip_id: string } }>(
      "SELECT data FROM pgboss.job WHERE name = 'leaveby.recompute'",
    );
    expect(jobs.map((job) => job.data.trip_id)).toContain(tripId);
  });

  it('mirrors the phone’s alarm for its own device only', async () => {
    const device = await install(maya, ['readiness']);
    const payload = {
      device_id: device.deviceId,
      leave_by_id: leaveById,
      state: 'scheduled',
      fire_at: new Date(Date.now() + 3_600_000).toISOString(),
    };
    expect((await run(maya, 'mirror_alarm_state', payload)).status).toBe(200);
    const snoozed = await run(maya, 'mirror_alarm_state', { ...payload, state: 'snoozed' });
    expect(snoozed.body['result']).toMatchObject({ state: 'snoozed', sync_version: 2 });
    const stolen = await run(rin, 'mirror_alarm_state', payload);
    expect(stolen.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});
