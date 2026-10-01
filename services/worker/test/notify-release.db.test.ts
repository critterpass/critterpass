/**
 * What quiet hours held, against a migrated Postgres and a real pg-boss: a BUDGET push that
 * arrives at night is kept back with the time quiet hours end and sent as itself by the release
 * scan once they have (never before, never twice); at release an expired one is dropped, one the
 * day's budget cannot cover or one that is half a day late joins the evening roundup, and crew
 * chat goes out without spending the budget.
 */
import { registerNotificationTrigger, resetNotificationTriggersForTests } from '@cp/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  crewAudience,
  notifyReleaseJob,
  registerNotification,
  releaseHeldNotifications,
  resetNotificationRegistrationsForTests,
  routeNotification,
  type NotifyRouteDeps,
} from '../src/jobs/notify';
import { createCopyRenderer } from '../src/push/render';
import {
  insertCrew,
  insertDevice,
  insertEvent,
  insertUser,
  queuedJobs,
  startNotifyDb,
  until,
  type NotifyDb,
} from './notify-fixtures';

let db: NotifyDb;
const renderer = createCopyRenderer();
/** Ho Chi Minh City is UTC+7: 23:30 on 27 September, then the morning of the 28th. */
const NIGHT = new Date('2026-09-27T16:30:00Z');
const BEFORE_SEVEN = new Date('2026-09-27T23:55:00Z');
const SEVEN = new Date('2026-09-28T00:00:00Z');
const deps = (now: Date): NotifyRouteDeps => ({ renderer, now: () => now });

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
  for (const [event, key] of [
    ['crew.member_joined', 'member_joined'],
    ['crew.member_removed', 'crew_chat'],
  ] as const) {
    registerNotificationTrigger(event, key);
    registerNotification({
      key,
      event,
      audience: (tx, routed) => crewAudience(tx, String(routed.payload['crew_id'])),
      compose: (_tx, routed) =>
        Promise.resolve({
          title: { id: `notifications.test.${key}.title`, message: 'Bali crew' },
          body: { id: `notifications.test.${key}.body`, message: 'Mai says hi' },
          sender: { kind: 'member', id: 'mai', name: 'Mai' },
          crewId: String(routed.payload['crew_id']),
          collapseVars: { crew_id: String(routed.payload['crew_id']) },
        }),
    });
  }
});

async function recipient(budget?: number) {
  const other = await insertUser(db.pool);
  const uid = await insertUser(db.pool);
  const { deviceId } = await insertDevice(db.pool, uid, { tz: 'Asia/Ho_Chi_Minh' });
  if (budget !== undefined) {
    await db.pool.query(
      'INSERT INTO notification_prefs (user_id, budget_per_day) VALUES ($1, $2)',
      [uid, budget],
    );
  }
  const crewId = await insertCrew(db.pool, [other, uid]);
  return { uid, deviceId, crewId };
}

/** Routes one push to `uid` at `at`; resolves to the notification's id. */
async function arrive(
  who: { uid: string; crewId: string },
  at: Date,
  kind: 'member_joined' | 'crew_chat' = 'member_joined',
): Promise<string> {
  const event = kind === 'member_joined' ? 'crew.member_joined' : 'crew.member_removed';
  const outcome = await routeNotification(db.pool, deps(at), {
    event_id: await insertEvent(
      db.pool,
      event,
      { crew_id: who.crewId },
      { crewId: who.crewId, occurredAt: at },
    ),
    key: kind,
    uid: who.uid,
  });
  if (outcome.outcome !== 'routed') throw new Error(`not routed: ${JSON.stringify(outcome)}`);
  return outcome.notificationId;
}

async function row(id: string) {
  const { rows } = await db.pool.query<{
    state: string;
    drop_reason: string | null;
    not_before: Date | null;
  }>('SELECT state, drop_reason, not_before FROM notifications WHERE id = $1', [id]);
  return rows[0];
}

const pushesFor = async (id: string) =>
  (await queuedJobs(db.pool, 'push.send')).filter((job) => job.data['notification_id'] === id);

async function ledger(uid: string, localDate: string) {
  const { rows } = await db.pool.query<{ sent_budgeted: number; queued: number }>(
    'SELECT sent_budgeted, queued FROM ping_ledger WHERE user_id = $1 AND local_date = $2',
    [uid, localDate],
  );
  return rows[0];
}

describe('a push that arrives in quiet hours', () => {
  it('is held until they end, then sent once as itself and booked on that morning', async () => {
    const who = await recipient();
    const id = await arrive(who, NIGHT);
    expect(await row(id)).toEqual({ state: 'queued', drop_reason: null, not_before: SEVEN });
    expect(await pushesFor(id)).toEqual([]);
    expect(await ledger(who.uid, '2026-09-27')).toEqual({ sent_budgeted: 0, queued: 0 });

    await releaseHeldNotifications(db.pool, BEFORE_SEVEN);
    expect(await pushesFor(id)).toEqual([]);

    await releaseHeldNotifications(db.pool, SEVEN);
    await releaseHeldNotifications(db.pool, new Date(SEVEN.getTime() + 5 * 60_000));
    expect(await row(id)).toEqual({ state: 'queued', drop_reason: null, not_before: null });
    expect((await pushesFor(id)).map((job) => job.data['device_id'])).toEqual([who.deviceId]);
    expect(await ledger(who.uid, '2026-09-28')).toEqual({ sent_budgeted: 1, queued: 0 });
  });

  it('joins the evening roundup when the morning’s budget cannot cover it, oldest first', async () => {
    const who = await recipient(1);
    const first = await arrive(who, NIGHT);
    const second = await arrive(who, new Date(NIGHT.getTime() + 60_000));
    await releaseHeldNotifications(db.pool, SEVEN);
    expect(await row(first)).toMatchObject({ state: 'queued', not_before: null });
    expect(await row(second)).toMatchObject({ state: 'rolled_into_roundup', not_before: null });
    expect(await pushesFor(second)).toEqual([]);
    expect(await ledger(who.uid, '2026-09-28')).toEqual({ sent_budgeted: 1, queued: 1 });
  });

  it('sends held crew chat without spending the budget', async () => {
    const who = await recipient(1);
    const chat = await arrive(who, NIGHT, 'crew_chat');
    const joined = await arrive(who, new Date(NIGHT.getTime() + 60_000));
    await releaseHeldNotifications(db.pool, SEVEN);
    expect(await pushesFor(chat)).toHaveLength(1);
    expect(await pushesFor(joined)).toHaveLength(1);
    expect(await ledger(who.uid, '2026-09-28')).toEqual({ sent_budgeted: 1, queued: 0 });
  });

  it('is dropped when it has expired by the time quiet hours end', async () => {
    const who = await recipient();
    const id = await arrive(who, NIGHT);
    await db.pool.query('UPDATE notifications SET expires_at = $2 WHERE id = $1', [
      id,
      BEFORE_SEVEN,
    ]);
    await releaseHeldNotifications(db.pool, SEVEN);
    expect(await row(id)).toEqual({ state: 'dropped', drop_reason: 'expired', not_before: null });
    expect(await pushesFor(id)).toEqual([]);
  });

  it('goes to the evening roundup, not the lock screen, when its release is half a day late', async () => {
    const who = await recipient();
    const id = await arrive(who, NIGHT);
    // The scan first runs at 19:30 the next evening: 12.5 hours after quiet hours ended.
    await releaseHeldNotifications(db.pool, new Date(SEVEN.getTime() + 12.5 * 3_600_000));
    expect(await row(id)).toMatchObject({ state: 'rolled_into_roundup', not_before: null });
    expect(await pushesFor(id)).toEqual([]);
  });

  it('is dropped when there is no device left to reach', async () => {
    const who = await recipient();
    const id = await arrive(who, NIGHT);
    await db.pool.query('UPDATE push_tokens SET invalid_at = now() WHERE device_id = $1', [
      who.deviceId,
    ]);
    await releaseHeldNotifications(db.pool, SEVEN);
    expect(await row(id)).toMatchObject({ state: 'dropped', drop_reason: 'no_push_token' });
  });

  it('is released by the scan job through pg-boss', async () => {
    const who = await recipient();
    const id = await arrive(who, NIGHT);
    const boss = await db.startBoss([notifyReleaseJob(() => SEVEN)]);
    await boss.send('notify.release', {});
    await until(async () => (await pushesFor(id)).length === 1);
  });
});
