/**
 * Live Activity commands against a migrated Postgres, through `/v1/cmd`: tokens register on the
 * caller's own install only and a replay returns the stored result; an update token binds to the
 * activity a push-to-start opened; a dismissal is remembered; the crew lock screen is a Boost perk;
 * and every event that moves an activity queues the orchestrator in the same transaction.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import pino from 'pino';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerLiveActivities } from '../../src/commands/live-activities';
import { registerTripDayCommands } from '../../src/commands/trip-day';
import { startJobProducer } from '../../src/jobs/producer';
import {
  startActionDoors,
  type ActionDoorsHarness,
  type SignedIn,
} from '../routes/action-doors-harness';
import { envelope } from '../routes/command-doors-harness';

let harness: ActionDoorsHarness;
let boss: PgBoss;
let maya: SignedIn;
let rin: SignedIn;
let tripId: string;
let leaveById: string;
let meetupId: string;
const mayaPhone = randomUUID();
const rinPhone = randomUUID();

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function run(
  who: SignedIn,
  cmd: string,
  payload: unknown,
  deviceId: string,
  opId = generateUuidV7(),
) {
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify(
      envelope(cmd, payload, {
        op_id: opId,
        actor: { uid: who.uid, via: 'app' },
        device: { id: deviceId, platform: 'ios', app_version: '1.0.0', tz: 'Asia/Ho_Chi_Minh' },
      }),
    ),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function orchestrateJobs(): Promise<string[]> {
  const rows = await harness.pool.query<{ key: string }>(
    "SELECT singleton_key AS key FROM pgboss.job WHERE name = 'la.orchestrate' ORDER BY created_on",
  );
  return rows.rows.map((row) => row.key);
}

const TOKEN = 'a'.repeat(64);

beforeAll(async () => {
  harness = await startActionDoors();
  registerTripDayCommands(harness.registry);
  registerLiveActivities(harness);
  boss = await startJobProducer({
    connectionString: harness.connectionString,
    logger: pino({ level: 'silent' }),
    startAttempts: 5,
  });
  [maya, rin] = await Promise.all([harness.signInAnonymously(), harness.signInAnonymously()]);
  for (const [who, device] of [
    [maya, mayaPhone],
    [rin, rinPhone],
  ] as const) {
    const registered = await run(
      who,
      'register_device',
      { platform: 'ios', tz: 'Asia/Ho_Chi_Minh', locale: 'en', app_version: '1.0.0' },
      device,
    );
    expect(registered.status).toBe(200);
  }
  ({ tripId, leaveById, meetupId } = await withSystem(harness.pool, async (tx) => {
    const one = async (sql: string, params: unknown[]) =>
      (await tx.query<{ id: string }>(sql, params)).rows[0]!.id;
    const crew = await one(
      "INSERT INTO crews (name, created_by) VALUES ('Da Nang', $1) RETURNING id",
      [maya.uid],
    );
    await tx.query(
      `INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser'), ($1, $3, 'member')`,
      [crew, maya.uid, rin.uid],
    );
    const trip = await one(
      "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
      [crew],
    );
    await tx.query(
      `INSERT INTO trip_participants (trip_id, user_id, role, rsvp)
       VALUES ($1, $2, 'organiser', 'in'), ($1, $3, 'member', 'in')`,
      [trip, maya.uid, rin.uid],
    );
    const version = await one(
      "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
      [trip],
    );
    const day = await one(
      'INSERT INTO plan_days (version_id, trip_id, day_no) VALUES ($1, $2, 1) RETURNING id',
      [version, trip],
    );
    const item = await one(
      `INSERT INTO plan_items (version_id, day_id, trip_id, starts_at, tz, category)
       VALUES ($1, $2, $3, now() + interval '3 hours', 'Asia/Ho_Chi_Minh', 'activity') RETURNING id`,
      [version, day, trip],
    );
    const leaveBy = await one(
      `INSERT INTO leave_bys (trip_id, plan_item_id, plan_item_stable_id, local_date, starts_at,
         leave_at, tz, participant_ids)
       SELECT $1, id, stable_id, current_date, starts_at, starts_at - interval '1 hour',
              'Asia/Ho_Chi_Minh', $3 FROM plan_items WHERE id = $2 RETURNING id`,
      [trip, item, [maya.uid, rin.uid]],
    );
    await tx.query(
      `INSERT INTO readiness (leave_by_id, trip_id, user_id) SELECT $1, $2, uid FROM unnest($3::uuid[]) uid`,
      [leaveBy, trip, [maya.uid, rin.uid]],
    );
    const meetup = await one(
      `INSERT INTO meetups (trip_id, place_name, lat, lng, meet_at, created_by)
       VALUES ($1, 'My Khe beach', 16.06, 108.25, now() + interval '2 hours', $2) RETURNING id`,
      [trip, maya.uid],
    );
    return { tripId: trip, leaveById: leaveBy, meetupId: meetup };
  }));
}, 240_000);

afterAll(async () => {
  await boss.stop({ graceful: false });
  await harness.stop();
});

describe('register_la_token', () => {
  it('stores a push-to-start token, replays the stored result and rotates to the newest', async () => {
    const opId = generateUuidV7();
    const payload = { kind: 'push_to_start', activity_type: 'flight', token: TOKEN.toUpperCase() };
    const first = await run(maya, 'register_la_token', payload, mayaPhone, opId);
    expect(first.status).toBe(200);
    expect(first.body['result']).toMatchObject({ activity_type: 'flight', kind: 'push_to_start' });
    const replay = await run(maya, 'register_la_token', payload, mayaPhone, opId);
    expect(replay.body).toMatchObject({ status: 'duplicate' });
    await run(maya, 'register_la_token', { ...payload, token: 'b'.repeat(64) }, mayaPhone);
    const rows = await q<{ token: string }>(
      "SELECT token FROM la_push_to_start_tokens WHERE device_id = $1 AND activity_type = 'flight'",
      [mayaPhone],
    );
    expect(rows).toEqual([{ token: 'b'.repeat(64) }]);
  });

  it('refuses a token for someone else’s install', async () => {
    const response = await run(
      rin,
      'register_la_token',
      { kind: 'push_to_start', activity_type: 'leave_by', token: TOKEN },
      mayaPhone,
    );
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('binds an update token to the activity a push-to-start opened', async () => {
    await q(
      `INSERT INTO device_activities (device_id, user_id, trip_id, kind, ref_id, started_via, state)
       VALUES ($1, $2, $3, 'leave_by', $4, 'push_to_start', 'pending')`,
      [rinPhone, rin.uid, tripId, leaveById],
    );
    const osId = randomUUID().toUpperCase();
    const response = await run(
      rin,
      'register_la_token',
      {
        kind: 'update',
        activity_type: 'leave_by',
        token: TOKEN,
        activity_id: osId,
        ref_id: leaveById,
      },
      rinPhone,
    );
    expect(response.status).toBe(200);
    const rows = await q<Record<string, unknown>>(
      `SELECT os_activity_id, activity_push_token, state, started_via FROM device_activities
        WHERE device_id = $1 AND kind = 'leave_by'`,
      [rinPhone],
    );
    expect(rows).toEqual([
      {
        os_activity_id: osId,
        activity_push_token: TOKEN,
        state: 'active',
        started_via: 'push_to_start',
      },
    ]);
  });

  it('records an activity the app started itself, with its trip', async () => {
    const osId = randomUUID();
    await run(
      maya,
      'register_la_token',
      {
        kind: 'update',
        activity_type: 'leave_by',
        token: TOKEN,
        activity_id: osId,
        ref_id: leaveById,
        started_via: 'scheduled',
      },
      mayaPhone,
    );
    const rows = await q<Record<string, unknown>>(
      'SELECT trip_id, started_via, state FROM device_activities WHERE os_activity_id = $1',
      [osId],
    );
    expect(rows).toEqual([{ trip_id: tripId, started_via: 'scheduled', state: 'active' }]);
  });
});

describe('report_la_state', () => {
  it('remembers a dismissal and reports it once', async () => {
    const osId = randomUUID();
    const payload = { activity_id: osId, kind: 'flight', ref_id: randomUUID(), state: 'active' };
    await run(rin, 'report_la_state', payload, rinPhone);
    const dismissed = await run(
      rin,
      'report_la_state',
      { ...payload, state: 'dismissed' },
      rinPhone,
    );
    expect(dismissed.body['result']).toMatchObject({ state: 'dismissed', changed: true });
    const again = await run(rin, 'report_la_state', { ...payload, state: 'dismissed' }, rinPhone);
    expect(again.body['result']).toMatchObject({ changed: false });
    const rows = await q<Record<string, unknown>>(
      'SELECT state, end_reason FROM device_activities WHERE os_activity_id = $1',
      [osId],
    );
    expect(rows).toEqual([{ state: 'dismissed', end_reason: 'user_dismissed' }]);
    const { rows: events } = await harness.pool.query(
      'SELECT 1 FROM domain_events WHERE type = $1',
      ['la.state_reported'],
    );
    expect(events).toHaveLength(2);
  });

  it('keeps an ended activity ended: no late revival, and clearing it is not a dismissal', async () => {
    const osId = randomUUID();
    const payload = { activity_id: osId, kind: 'flight', ref_id: randomUUID(), state: 'active' };
    await run(rin, 'report_la_state', payload, rinPhone);
    await run(rin, 'report_la_state', { ...payload, state: 'ended' }, rinPhone);
    for (const state of ['active', 'dismissed']) {
      const late = await run(rin, 'report_la_state', { ...payload, state }, rinPhone);
      expect(late.body['result']).toMatchObject({ changed: false });
    }
    const rows = await q<Record<string, unknown>>(
      'SELECT state, end_reason FROM device_activities WHERE os_activity_id = $1',
      [osId],
    );
    expect(rows).toEqual([{ state: 'ended', end_reason: 'ended_on_device' }]);
  });
});

describe('request_crew_lock_screen', () => {
  it('answers an unboosted trip with the Boost offer', async () => {
    const response = await run(maya, 'request_crew_lock_screen', { trip_id: tripId }, mayaPhone);
    expect(response.status).toBe(402);
    expect(response.body).toMatchObject({
      error: { code: 'ENTITLEMENT_REQUIRED', detail: { perk: 'boost_active' } },
    });
  });

  it('puts a boosted trip’s meet-up on the lock screen and queues the orchestrator', async () => {
    await q(
      `INSERT INTO trip_entitlements (trip_id, boost_active) VALUES ($1, true)
       ON CONFLICT (trip_id) DO UPDATE SET boost_active = true`,
      [tripId],
    );
    const response = await run(rin, 'request_crew_lock_screen', { trip_id: tripId }, rinPhone);
    expect(response.body).toMatchObject({ status: 'applied' });
    expect(response.status).toBe(200);
    const result = response.body['result'] as { meetup_id: string; starts_at: string };
    expect(result.meetup_id).toBe(meetupId);
    expect(new Date(result.starts_at).getTime()).toBeGreaterThan(Date.now() + 80 * 60_000);
    expect(await orchestrateJobs()).toContain(`meet_up:${meetupId}`);
    const states = await q('SELECT phase FROM la_object_states WHERE ref_id = $1', [meetupId]);
    expect(states).toEqual([{ phase: 'live' }]);
  });
});

describe('orchestration hook', () => {
  it('queues the leave-by’s activities when a member taps I’M UP', async () => {
    const response = await run(
      maya,
      'set_readiness',
      { leave_by_id: leaveById, state: 'up', source: 'la' },
      mayaPhone,
    );
    expect(response.status).toBe(200);
    expect(await orchestrateJobs()).toContain(`leave_by:${leaveById}`);
  });
});
