/**
 * The crew's own news as pushes, against a migrated Postgres: a new member is announced to the
 * crew they joined (never to themselves, and not once they have left again), and a member's own
 * answer to a trip reaches its organisers (never an answer someone else set for them, never the
 * mere opening of a proposal, and never an answer that has changed since).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerInviteNotifications } from '../src/jobs/invites/notifications';
import { routeNotification, type NotifyRouteDeps } from '../src/jobs/notify';
import { registerProposalNotifications } from '../src/jobs/proposal/notify';
import { createCopyRenderer } from '../src/push/render';
import {
  insertCrew,
  insertDevice,
  insertEvent,
  insertUser,
  queuedJobs,
  startNotifyDb,
  type NotifyDb,
} from './notify-fixtures';

let db: NotifyDb;
/** 12:00 in Ho Chi Minh City (UTC+7): outside quiet hours. */
const NOON_SAIGON = new Date('2026-09-27T05:00:00Z');
const deps: NotifyRouteDeps = { renderer: createCopyRenderer(), now: () => NOON_SAIGON };

beforeAll(async () => {
  db = await startNotifyDb();
  await db.startBoss();
  registerInviteNotifications();
  registerProposalNotifications();
}, 240_000);

afterAll(async () => {
  await db.stop();
});

async function person(name: string): Promise<string> {
  const uid = await insertUser(db.pool);
  await db.pool.query('UPDATE users SET display_name = $2 WHERE id = $1', [uid, `${name} Test`]);
  await insertDevice(db.pool, uid, { tz: 'Asia/Ho_Chi_Minh' });
  return uid;
}

async function trip(crewId: string, organiser: string, members: readonly string[]) {
  const { rows } = await db.pool.query<{ id: string }>(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'setup') RETURNING id",
    [crewId],
  );
  const tripId = rows[0]!.id;
  await db.pool.query(
    "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'organiser', 'in')",
    [tripId, organiser],
  );
  for (const uid of members) {
    await db.pool.query(
      "INSERT INTO trip_participants (trip_id, user_id, rsvp) VALUES ($1, $2, 'opened')",
      [tripId, uid],
    );
  }
  return tripId;
}

async function answer(tripId: string, crewId: string, member: string, rsvp: string, actor: string) {
  if (rsvp !== 'stale') {
    await db.pool.query(
      'UPDATE trip_participants SET rsvp = $3 WHERE trip_id = $1 AND user_id = $2',
      [tripId, member, rsvp],
    );
  }
  return insertEvent(
    db.pool,
    'rsvp.changed',
    { trip_id: tripId, user_id: member, rsvp: rsvp === 'stale' ? 'maybe' : rsvp },
    { crewId, tripId, actorId: actor, occurredAt: NOON_SAIGON },
  );
}

async function notificationsFor(uid: string) {
  const { rows } = await db.pool.query<{
    key: string;
    class: string;
    state: string;
    title: string;
    body: string;
    collapse_key: string | null;
    deep_link: string | null;
  }>(
    `SELECT key, class, state, title, body, collapse_key, deep_link FROM notifications
      WHERE user_id = $1 ORDER BY created_at`,
    [uid],
  );
  return rows;
}

describe('a new crew member', () => {
  it('is announced to the members already there, as a budgeted push from the joiner', async () => {
    const [maya, rin, dev] = [await person('Maya'), await person('Rin'), await person('Dev')];
    const crewId = await insertCrew(db.pool, [maya, rin, dev]);
    const eventId = await insertEvent(
      db.pool,
      'crew.member_joined',
      { crew_id: crewId, user_id: dev },
      { crewId, actorId: dev, occurredAt: NOON_SAIGON },
    );

    const fanOut = await routeNotification(db.pool, deps, {
      event_id: eventId,
      key: 'member_joined',
    });
    expect(fanOut).toEqual({ outcome: 'fanned_out', recipients: 2 });
    const keys = (await queuedJobs(db.pool, 'notify.route')).map((job) => job.singleton_key);
    expect(keys).not.toContain(`${eventId}:member_joined:${dev}`);

    const routed = await routeNotification(db.pool, deps, {
      event_id: eventId,
      key: 'member_joined',
      uid: maya,
    });
    expect(routed).toMatchObject({ outcome: 'routed', decision: { action: 'send' } });
    expect(await notificationsFor(maya)).toEqual([
      {
        key: 'member_joined',
        class: 'budgeted',
        state: 'queued',
        title: 'Dev joined Bali crew',
        body: 'Say hi in the crew chat.',
        collapse_key: null,
        deep_link: `/crew/${crewId}/chat`,
      },
    ]);
  });

  it('is not announced once they have left again', async () => {
    const [maya, dev] = [await person('Maya'), await person('Dev')];
    const crewId = await insertCrew(db.pool, [maya, dev]);
    const eventId = await insertEvent(
      db.pool,
      'crew.member_joined',
      { crew_id: crewId, user_id: dev },
      { crewId, actorId: dev, occurredAt: NOON_SAIGON },
    );
    await db.pool.query(
      "UPDATE crew_members SET status = 'left' WHERE crew_id = $1 AND user_id = $2",
      [crewId, dev],
    );
    const routed = await routeNotification(db.pool, deps, {
      event_id: eventId,
      key: 'member_joined',
      uid: maya,
    });
    expect(routed).toEqual({ outcome: 'skipped', reason: 'nothing_to_send' });
    expect(await notificationsFor(maya)).toEqual([]);
  });
});

describe('a member’s answer to a trip', () => {
  it('reaches the organisers, collapsing per trip, and nobody else', async () => {
    const [maya, rin, dev] = [await person('Maya'), await person('Rin'), await person('Dev')];
    const crewId = await insertCrew(db.pool, [maya, rin, dev]);
    const tripId = await trip(crewId, maya, [rin, dev]);
    const eventId = await answer(tripId, crewId, rin, 'in', rin);

    const fanOut = await routeNotification(db.pool, deps, {
      event_id: eventId,
      key: 'rsvp_changed',
    });
    expect(fanOut).toEqual({ outcome: 'fanned_out', recipients: 1 });
    await routeNotification(db.pool, deps, { event_id: eventId, key: 'rsvp_changed', uid: maya });
    expect(await notificationsFor(maya)).toEqual([
      {
        key: 'rsvp_changed',
        class: 'budgeted',
        state: 'queued',
        title: 'Rin is in',
        body: 'See who is coming to Bali crew.',
        collapse_key: `rsvp:${tripId}`,
        deep_link: `/hub/${tripId}`,
      },
    ]);
    expect(await notificationsFor(dev)).toEqual([]);
  });

  it('stays silent for an answer someone else set, and for opening the proposal', async () => {
    const [maya, rin] = [await person('Maya'), await person('Rin')];
    const crewId = await insertCrew(db.pool, [maya, rin]);
    const tripId = await trip(crewId, maya, [rin]);
    const setByOrganiser = await answer(tripId, crewId, rin, 'maybe', maya);
    const opened = await answer(tripId, crewId, rin, 'opened', rin);
    for (const eventId of [setByOrganiser, opened]) {
      expect(
        await routeNotification(db.pool, deps, { event_id: eventId, key: 'rsvp_changed' }),
      ).toEqual({ outcome: 'fanned_out', recipients: 0 });
    }
  });

  it('says nothing about an answer that has changed since', async () => {
    const [maya, rin] = [await person('Maya'), await person('Rin')];
    const crewId = await insertCrew(db.pool, [maya, rin]);
    const tripId = await trip(crewId, maya, [rin]);
    await answer(tripId, crewId, rin, 'in', rin);
    const stale = await answer(tripId, crewId, rin, 'stale', rin);
    const routed = await routeNotification(db.pool, deps, {
      event_id: stale,
      key: 'rsvp_changed',
      uid: maya,
    });
    expect(routed).toEqual({ outcome: 'skipped', reason: 'nothing_to_send' });
  });
});
