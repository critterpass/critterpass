/**
 * A saved ping budget, as the router sees it: with `notification_prefs` holding the budget of 3
 * that `set_notification_prefs` writes (services/api/test/notification-prefs proves the write),
 * the first three BUDGET items of the recipient's day are sent and the fourth waits for the
 * evening roundup instead of being dropped.
 */
import { registerNotificationTrigger, resetNotificationTriggersForTests } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  crewAudience,
  registerNotification,
  resetNotificationRegistrationsForTests,
  routeNotification,
  type NotifyRouteDeps,
} from '../../src/jobs/notify';
import { createCopyRenderer } from '../../src/push/render';
import {
  insertCrew,
  insertDevice,
  insertEvent,
  insertUser,
  startNotifyDb,
  type NotifyDb,
} from '../notify-fixtures';

let db: NotifyDb;
const renderer = createCopyRenderer();
/** 12:00 in Ho Chi Minh City (UTC+7): outside the default quiet hours. */
const NOON_SAIGON = new Date('2026-09-27T05:00:00Z');
const deps: NotifyRouteDeps = { renderer, now: () => NOON_SAIGON };

beforeAll(async () => {
  db = await startNotifyDb();
  await db.startBoss();
  resetNotificationRegistrationsForTests();
  resetNotificationTriggersForTests();
  registerNotificationTrigger('crew.member_joined', 'member_joined');
  registerNotification({
    key: 'member_joined',
    event: 'crew.member_joined',
    audience: (tx, event) =>
      crewAudience(tx, String(event.payload['crew_id']), [String(event.payload['user_id'])]),
    compose: (_tx, event) =>
      Promise.resolve({
        title: { id: 'notifications.test.memberJoined.title', message: 'Da Nang crew' },
        body: { id: 'notifications.test.memberJoined.body', message: '{name} joined the crew' },
        vars: { name: 'Mai' },
        sender: { kind: 'member', id: String(event.payload['user_id']), name: 'Mai' },
        crewId: String(event.payload['crew_id']),
      }),
  });
}, 240_000);

afterAll(async () => {
  resetNotificationRegistrationsForTests();
  resetNotificationTriggersForTests();
  await db?.stop();
});

describe('a saved ping budget of 3', () => {
  it('sends three BUDGET items and routes the fourth of the day to the roundup', async () => {
    const joiner = await insertUser(db.pool);
    const uid = await insertUser(db.pool);
    await insertDevice(db.pool, uid, { tz: 'Asia/Ho_Chi_Minh' });
    await db.pool.query('INSERT INTO notification_prefs (user_id) VALUES ($1)', [uid]);
    await db.pool.query('UPDATE notification_prefs SET budget_per_day = 3 WHERE user_id = $1', [
      uid,
    ]);
    const crewId = await insertCrew(db.pool, [joiner, uid]);

    const decisions: unknown[] = [];
    for (let item = 0; item < 4; item += 1) {
      const eventId = await insertEvent(
        db.pool,
        'crew.member_joined',
        { crew_id: crewId, user_id: joiner },
        { crewId },
      );
      const routed = await routeNotification(db.pool, deps, {
        event_id: eventId,
        key: 'member_joined',
        uid,
      });
      decisions.push((routed as { decision?: unknown }).decision);
    }
    expect(decisions).toEqual([
      { action: 'send' },
      { action: 'send' },
      { action: 'send' },
      { action: 'roundup', reason: 'budget_exhausted' },
    ]);

    const { rows } = await db.pool.query<{ state: string }>(
      'SELECT state FROM notifications WHERE user_id = $1 ORDER BY created_at',
      [uid],
    );
    expect(rows.map((row) => row.state)).toEqual([
      'queued',
      'queued',
      'queued',
      'rolled_into_roundup',
    ]);
    const ledger = await db.pool.query<{ sent_budgeted: number; queued: number }>(
      'SELECT sent_budgeted, queued FROM ping_ledger WHERE user_id = $1',
      [uid],
    );
    expect(ledger.rows).toEqual([{ sent_budgeted: 3, queued: 1 }]);
  });
});
