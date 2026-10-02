/**
 * Hiding details on the lock screen, through `notify.route` against a migrated Postgres: a money
 * push and a leave-by alarm reach someone who hides details without the amount or the place, worded
 * as whole sentences, while a crewmate who does not hide them gets the usual copy.
 */
import {
  MONEY_PUSH_BODY,
  registerNotificationTrigger,
  resetNotificationTriggersForTests,
  TRIP_DAY_PUSH,
} from '@cp/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  crewAudience,
  registerNotification,
  resetNotificationRegistrationsForTests,
  routeNotification,
} from '../src/jobs/notify';
import { createCopyRenderer } from '../src/push/render';
import {
  insertCrew,
  insertDevice,
  insertEvent,
  insertUser,
  startNotifyDb,
  type NotifyDb,
} from './notify-fixtures';

let db: NotifyDb;
const deps = { renderer: createCopyRenderer(), now: () => new Date('2026-09-27T05:00:00Z') };

beforeAll(async () => {
  db = await startNotifyDb();
  await db.startBoss();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

beforeEach(() => {
  resetNotificationRegistrationsForTests();
  resetNotificationTriggersForTests();
  registerNotificationTrigger('crew.member_joined', 'member_joined');
  registerNotification({
    key: 'member_joined',
    event: 'crew.member_joined',
    audience: (tx, event) => crewAudience(tx, String(event.payload['crew_id'])),
    compose: (_tx, event) =>
      Promise.resolve({
        title: TRIP_DAY_PUSH.alarmTitle,
        body: MONEY_PUSH_BODY.requested,
        vars: { payee: 'Rin', amount: '1.200.000 ₫', time: '03:10', place: 'Mount Batur' },
        sender: { kind: 'member', id: 'rin', name: 'Rin' },
        crewId: String(event.payload['crew_id']),
      }),
  });
});

async function pushFor(eventId: string, uid: string) {
  await routeNotification(db.pool, deps, { event_id: eventId, key: 'member_joined', uid });
  const { rows } = await db.pool.query<{ title: string; body: string }>(
    'SELECT title, body FROM notifications WHERE user_id = $1',
    [uid],
  );
  return rows[0];
}

describe('hide details on the lock screen', () => {
  it('drops amounts and places for the person who hides them, and only for them', async () => {
    const [hider, sharer] = [await insertUser(db.pool), await insertUser(db.pool)];
    for (const uid of [hider, sharer]) await insertDevice(db.pool, uid, { tz: 'Asia/Ho_Chi_Minh' });
    await db.pool.query(
      `INSERT INTO user_settings (user_id, hide_lockscreen_details) VALUES ($1, true)
       ON CONFLICT (user_id) DO UPDATE SET hide_lockscreen_details = true`,
      [hider],
    );
    const crewId = await insertCrew(db.pool, [hider, sharer]);
    const eventId = await insertEvent(
      db.pool,
      'crew.member_joined',
      { crew_id: crewId, user_id: sharer },
      { crewId },
    );
    expect(await pushFor(eventId, hider)).toEqual({
      title: 'Leave by 03:10',
      body: 'Rin asked you to settle up.',
    });
    expect(await pushFor(eventId, sharer)).toEqual({
      title: 'Leave by 03:10 · Mount Batur',
      body: 'Rin asked you for 1.200.000 ₫.',
    });
  });
});
