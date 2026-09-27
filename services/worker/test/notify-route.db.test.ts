/**
 * `notify.route` against a migrated Postgres and a real pg-boss: fan-out per recipient, one
 * notification per recipient per event (replays find it), budget and quiet hours rolling BUDGET
 * items into the roundup while ALWAYS goes through, the trip zone deciding a traveller's day, no
 * device meaning a recorded drop, and the whole path from an appended domain event.
 */
import {
  appendDomainEvent,
  onEventAppended,
  resetEventAppendedHooksForTests,
  withSystem,
} from '@cp/db';
import { registerNotificationTrigger, resetNotificationTriggersForTests } from '@cp/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  crewAudience,
  notifyRouteJob,
  registerNotification,
  resetNotificationRegistrationsForTests,
  routeEventHook,
  routeNotification,
  type NotifyRouteDeps,
} from '../src/jobs/notify';
import { createCopyRenderer } from '../src/push/render';
import {
  insertCrew,
  insertDevice,
  insertEvent,
  insertTripUnderWay,
  insertUser,
  queuedJobs,
  startNotifyDb,
  until,
  type NotifyDb,
} from './notify-fixtures';

let db: NotifyDb;
const renderer = createCopyRenderer();
/** 12:00 in Ho Chi Minh City (UTC+7). */
const NOON_SAIGON = new Date('2026-09-27T05:00:00Z');
const deps = (now = NOON_SAIGON): NotifyRouteDeps => ({ renderer, now: () => now });

beforeAll(async () => {
  db = await startNotifyDb();
  await db.startBoss();
}, 240_000);

afterAll(async () => {
  await db.stop();
});

beforeEach(() => {
  resetNotificationRegistrationsForTests();
  resetNotificationTriggersForTests();
  registerNotificationTrigger('crew.member_joined', 'member_joined');
  registerNotificationTrigger('crew.member_left', 'crew_ping');
  registerNotification({
    key: 'member_joined',
    event: 'crew.member_joined',
    audience: (tx, event) =>
      crewAudience(tx, String(event.payload['crew_id']), [String(event.payload['user_id'])]),
    compose: (_tx, event) =>
      Promise.resolve({
        title: { id: 'notifications.test.memberJoined.title', message: 'Bali crew' },
        body: { id: 'notifications.test.memberJoined.body', message: '{name} joined the crew' },
        vars: { name: 'Mai' },
        sender: { kind: 'member', id: String(event.payload['user_id']), name: 'Mai' },
        crewId: String(event.payload['crew_id']),
      }),
  });
  registerNotification({
    key: 'crew_ping',
    event: 'crew.member_left',
    audience: (tx, event) => crewAudience(tx, String(event.payload['crew_id'])),
    compose: () =>
      Promise.resolve({
        title: { id: 'notifications.test.ping.title', message: 'Mai' },
        body: { id: 'notifications.test.ping.body', message: 'On my way' },
        sender: { kind: 'member', id: 'mai', name: 'Mai' },
      }),
  });
});

async function notificationsFor(uid: string) {
  const { rows } = await db.pool.query<{
    id: string;
    state: string;
    class: string;
    drop_reason: string | null;
    title: string;
    body: string;
    local_date: string;
    collapse_key: string | null;
  }>(
    `SELECT id, state, class, drop_reason, title, body, local_date::text, collapse_key
     FROM notifications WHERE user_id = $1 ORDER BY created_at`,
    [uid],
  );
  return rows;
}

async function ledger(uid: string) {
  const { rows } = await db.pool.query<{
    local_date: string;
    sent_budgeted: number;
    sent_always: number;
    queued: number;
  }>(
    'SELECT local_date::text, sent_budgeted, sent_always, queued FROM ping_ledger WHERE user_id = $1',
    [uid],
  );
  return rows;
}

async function joinedEvent(crewId: string, joiner: string): Promise<string> {
  return insertEvent(
    db.pool,
    'crew.member_joined',
    { crew_id: crewId, user_id: joiner },
    { crewId },
  );
}

describe('registration', () => {
  it('refuses a notification whose trigger is not declared in the shared catalogue', () => {
    expect(() =>
      registerNotification({
        key: 'recap_ready',
        event: 'trip.status_changed',
        audience: () => Promise.resolve([]),
        compose: () => Promise.resolve(null),
      }),
    ).toThrow(/NOTIFICATION_TRIGGERS/);
  });
});

describe('fan-out', () => {
  it('enqueues one routing job per recipient, keyed by event, key and uid', async () => {
    const [joiner, a, b] = [
      await insertUser(db.pool),
      await insertUser(db.pool),
      await insertUser(db.pool),
    ];
    const crewId = await insertCrew(db.pool, [joiner, a, b]);
    const eventId = await joinedEvent(crewId, joiner);

    const outcome = await routeNotification(db.pool, deps(), {
      event_id: eventId,
      key: 'member_joined',
    });
    expect(outcome).toEqual({ outcome: 'fanned_out', recipients: 2 });
    const keys = (await queuedJobs(db.pool, 'notify.route')).map((job) => job.singleton_key);
    expect(keys).toEqual(
      expect.arrayContaining([`${eventId}:member_joined:${a}`, `${eventId}:member_joined:${b}`]),
    );
  });
});

describe('per recipient', () => {
  it('sends a budgeted push, books the ledger, and finds it again on replay', async () => {
    const joiner = await insertUser(db.pool);
    const uid = await insertUser(db.pool);
    const { deviceId } = await insertDevice(db.pool, uid, { tz: 'Asia/Ho_Chi_Minh' });
    const crewId = await insertCrew(db.pool, [joiner, uid]);
    const eventId = await joinedEvent(crewId, joiner);
    const data = { event_id: eventId, key: 'member_joined', uid };

    const first = await routeNotification(db.pool, deps(), data);
    expect(first).toMatchObject({
      outcome: 'routed',
      class: 'budgeted',
      decision: { action: 'send' },
    });
    const replay = await routeNotification(db.pool, deps(), data);
    expect(replay).toEqual({ outcome: 'duplicate' });

    const rows = await notificationsFor(uid);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      state: 'queued',
      title: 'Bali crew',
      body: 'Mai joined the crew',
      local_date: '2026-09-27',
    });
    expect(await ledger(uid)).toEqual([
      { local_date: '2026-09-27', sent_budgeted: 1, sent_always: 0, queued: 0 },
    ]);
    const pushes = await queuedJobs(db.pool, 'push.send');
    expect(pushes.filter((job) => job.data['notification_id'] === rows[0]!.id)).toEqual([
      {
        singleton_key: `${rows[0]!.id}:${deviceId}`,
        data: { notification_id: rows[0]!.id, device_id: deviceId },
      },
    ]);
  });

  it('rolls BUDGET into the roundup once the day’s budget is spent, but sends ALWAYS', async () => {
    const joiner = await insertUser(db.pool);
    const uid = await insertUser(db.pool);
    await insertDevice(db.pool, uid, { tz: 'Asia/Ho_Chi_Minh' });
    await db.pool.query('INSERT INTO notification_prefs (user_id, budget_per_day) VALUES ($1, 1)', [
      uid,
    ]);
    const crewId = await insertCrew(db.pool, [joiner, uid]);

    await routeNotification(db.pool, deps(), {
      event_id: await joinedEvent(crewId, joiner),
      key: 'member_joined',
      uid,
    });
    const second = await routeNotification(db.pool, deps(), {
      event_id: await joinedEvent(crewId, joiner),
      key: 'member_joined',
      uid,
    });
    expect(second).toMatchObject({ decision: { action: 'roundup', reason: 'budget_exhausted' } });
    const ping = await insertEvent(db.pool, 'crew.member_left', { crew_id: crewId }, { crewId });
    const always = await routeNotification(db.pool, deps(), {
      event_id: ping,
      key: 'crew_ping',
      uid,
    });
    expect(always).toMatchObject({ class: 'always', decision: { action: 'send' } });

    expect((await notificationsFor(uid)).map((row) => row.state)).toEqual([
      'queued',
      'rolled_into_roundup',
      'queued',
    ]);
    expect(await ledger(uid)).toEqual([
      { local_date: '2026-09-27', sent_budgeted: 1, sent_always: 1, queued: 1 },
    ]);
  });

  it('holds BUDGET in quiet hours, in the zone of the trip the recipient is on', async () => {
    const joiner = await insertUser(db.pool);
    const uid = await insertUser(db.pool);
    // The device still says Saigon, but the recipient is travelling in Tokyo (UTC+9).
    await insertDevice(db.pool, uid, { tz: 'Asia/Ho_Chi_Minh' });
    const crewId = await insertCrew(db.pool, [joiner, uid]);
    await insertTripUnderWay(db.pool, crewId, 'Asia/Tokyo', [uid]);
    // 13:30 UTC = 20:30 Saigon (not quiet) = 22:30 Tokyo (quiet).
    const evening = new Date('2026-09-27T13:30:00Z');

    const outcome = await routeNotification(db.pool, deps(evening), {
      event_id: await joinedEvent(crewId, joiner),
      key: 'member_joined',
      uid,
    });
    expect(outcome).toMatchObject({ decision: { action: 'roundup', reason: 'quiet_hours' } });
    const ping = await insertEvent(db.pool, 'crew.member_left', { crew_id: crewId }, { crewId });
    expect(
      await routeNotification(db.pool, deps(evening), { event_id: ping, key: 'crew_ping', uid }),
    ).toMatchObject({
      decision: { action: 'send' },
    });
  });

  it('records a drop when the recipient has no device to push to', async () => {
    const joiner = await insertUser(db.pool);
    const uid = await insertUser(db.pool, { tz: 'Asia/Ho_Chi_Minh' });
    const crewId = await insertCrew(db.pool, [joiner, uid]);
    const outcome = await routeNotification(db.pool, deps(), {
      event_id: await joinedEvent(crewId, joiner),
      key: 'member_joined',
      uid,
    });
    expect(outcome).toMatchObject({ decision: { action: 'drop', reason: 'no_push_token' } });
    expect(await notificationsFor(uid)).toEqual([
      expect.objectContaining({ state: 'dropped', drop_reason: 'no_push_token' }),
    ]);
    expect(await ledger(uid)).toEqual([
      { local_date: '2026-09-27', sent_budgeted: 0, sent_always: 0, queued: 0 },
    ]);
  });
});

describe('from an appended domain event', () => {
  it('routes exactly one notification to each other member, even when the jobs run twice', async () => {
    resetEventAppendedHooksForTests();
    onEventAppended(routeEventHook);
    const boss = await db.startBoss([notifyRouteJob(deps())]);
    const joiner = await insertUser(db.pool);
    const a = await insertUser(db.pool);
    const b = await insertUser(db.pool);
    await insertDevice(db.pool, a, { tz: 'Asia/Ho_Chi_Minh' });
    await insertDevice(db.pool, b, { tz: 'Asia/Ho_Chi_Minh' });
    const crewId = await insertCrew(db.pool, [joiner, a, b]);

    const event = await withSystem(db.pool, (tx) =>
      appendDomainEvent(tx, {
        type: 'crew.member_joined',
        aggregateKind: 'crew',
        aggregateId: crewId,
        actorKind: 'user',
        actorId: joiner,
        crewId,
        payload: { crew_id: crewId, user_id: joiner },
      }),
    );
    const delivered = async () =>
      (await notificationsFor(a)).length + (await notificationsFor(b)).length === 2;
    await until(delivered);
    // A second delivery of the same routing job (a retry after a crash) changes nothing.
    await boss.send('notify.route', { event_id: event.id, key: 'member_joined', uid: a });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await notificationsFor(a)).toHaveLength(1);
    expect(await notificationsFor(b)).toHaveLength(1);
    expect(await notificationsFor(joiner)).toHaveLength(0);
    resetEventAppendedHooksForTests();
  });
});
