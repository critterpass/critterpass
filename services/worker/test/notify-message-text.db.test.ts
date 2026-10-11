/**
 * Hiding message text on the lock screen, through `notify.route` against a migrated Postgres: a
 * crew chat push reaches someone who hides it as "New message in {crew}" and a push the guide
 * writes as a line naming the guide, with the sender kept in the title; a crewmate who does not
 * hide it reads the words themselves.
 */
import { registerNotificationTrigger, resetNotificationTriggersForTests } from '@cp/domain';
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
  registerNotificationTrigger('crew.member_joined', 'crew_chat');
  registerNotificationTrigger('crew.member_joined', 'nudge');
  const crewOf = (payload: Record<string, unknown>) => String(payload['crew_id']);
  registerNotification({
    key: 'crew_chat',
    event: 'crew.member_joined',
    audience: (tx, event) => crewAudience(tx, crewOf(event.payload)),
    compose: (_tx, event) =>
      Promise.resolve({
        title: { id: 'notifications.crew_chat.title', message: '{sender} · {crew}' },
        body: { id: 'notifications.crew_chat.text', message: '{text}' },
        vars: { sender: 'Rin', crew: 'Bali crew', text: 'My room code is 4471' },
        sender: { kind: 'member', id: 'rin', name: 'Rin' },
        crewId: crewOf(event.payload),
      }),
  });
  registerNotification({
    key: 'nudge',
    event: 'crew.member_joined',
    audience: (tx, event) => crewAudience(tx, crewOf(event.payload)),
    compose: (_tx, event) =>
      Promise.resolve({
        title: { id: 'notifications.test.nudge_title', message: 'Tokek' },
        body: { id: 'notifications.test.nudge_body', message: 'Pack the rain jacket for {place}.' },
        vars: { place: 'Ubud' },
        sender: { kind: 'guide', id: 'tokek', name: 'Tokek' },
        crewId: crewOf(event.payload),
      }),
  });
});

async function pushFor(eventId: string, key: string, uid: string) {
  await routeNotification(db.pool, deps, { event_id: eventId, key, uid });
  const { rows } = await db.pool.query<{ title: string; body: string }>(
    'SELECT title, body FROM notifications WHERE user_id = $1 AND key = $2',
    [uid, key],
  );
  return rows[0];
}

describe('hide message text on the lock screen', () => {
  it('says only that something is waiting, for the person who hides it', async () => {
    const [hider, reader] = [await insertUser(db.pool), await insertUser(db.pool)];
    for (const uid of [hider, reader]) await insertDevice(db.pool, uid, { tz: 'Asia/Ho_Chi_Minh' });
    await db.pool.query(
      `INSERT INTO notification_prefs (user_id, hide_message_text) VALUES ($1, true)
       ON CONFLICT (user_id) DO UPDATE SET hide_message_text = true`,
      [hider],
    );
    const crewId = await insertCrew(db.pool, [hider, reader]);
    const eventId = await insertEvent(
      db.pool,
      'crew.member_joined',
      { crew_id: crewId, user_id: reader },
      { crewId },
    );
    expect(await pushFor(eventId, 'crew_chat', hider)).toEqual({
      title: 'Rin · Bali crew',
      body: 'New message in Bali crew',
    });
    expect(await pushFor(eventId, 'nudge', hider)).toEqual({
      title: 'Tokek',
      body: 'Tokek has something for you. Open CritterPass to read it.',
    });
    expect(await pushFor(eventId, 'crew_chat', reader)).toEqual({
      title: 'Rin · Bali crew',
      body: 'My room code is 4471',
    });
    expect(await pushFor(eventId, 'nudge', reader)).toEqual({
      title: 'Tokek',
      body: 'Pack the rain jacket for Ubud.',
    });
  });
});
