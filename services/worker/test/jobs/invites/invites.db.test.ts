/**
 * Invite, code and waitlist jobs against a real migrated Postgres, run as app_system as in
 * production: hourly expiry with the 7-day prefill purge, the waitlist sweep that offers freed
 * seats (never a join), lapsing unanswered offers to the next person, the single nudge to an
 * installed in-app invitee, and the crew growth push registrations.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { expireInvitesAndCodes } from '../../../src/jobs/invites/expire';
import { OG_WARM_USER_AGENT, ogRenderJob } from '../../../src/jobs/og/render';
import { registerInviteNotifications } from '../../../src/jobs/invites/notifications';
import { nudgeInvitees } from '../../../src/jobs/invites/nudge';
import { lapseSeatOffers } from '../../../src/jobs/invites/offer-expire';
import { offerFreedSeats, tripsWithWaiters } from '../../../src/jobs/invites/waitlist-offer';
import { getRegistration } from '../../../src/jobs/notify/register';
import { startJobsHarness, until, type JobsHarness } from '../../helpers/jobs-harness';

let harness: JobsHarness;
let owner: string;
let crewId: string;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await harness.pool.query(sql, params)).rows as T[];
}

async function user(): Promise<string> {
  const id = randomUUID();
  await q("INSERT INTO users (id, status) VALUES ($1, 'registered')", [id]);
  await q('INSERT INTO crew_members (crew_id, user_id) VALUES ($1, $2)', [crewId, id]);
  return id;
}

async function invite(options: {
  status?: string;
  expiresIn?: string;
  claimedAgo?: string;
  createdAgo?: string;
  invitee?: string | null;
}): Promise<string> {
  const [row] = await q<{ id: string }>(
    `INSERT INTO invites (crew_id, inviter_id, kind, status, invitee_user_id, expires_at,
       claimed_at, created_at)
     VALUES ($1, $2, 'generic', $3, $4, now() + $5::interval,
       CASE WHEN $6::interval IS NULL THEN NULL ELSE now() - $6::interval END,
       now() - $7::interval)
     RETURNING id`,
    [
      crewId,
      owner,
      options.status ?? 'pending',
      options.invitee ?? null,
      options.expiresIn ?? '14 days',
      options.claimedAgo ?? null,
      options.createdAgo ?? '0 seconds',
    ],
  );
  return row!.id;
}

beforeAll(async () => {
  harness = await startJobsHarness();
  owner = randomUUID();
  await q("INSERT INTO users (id, status) VALUES ($1, 'registered')", [owner]);
  const [crew] = await q<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Jobs', $1) RETURNING id",
    [owner],
  );
  crewId = crew!.id;
  await q("INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser')", [
    crewId,
    owner,
  ]);
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe('maint.codes', () => {
  it('expires open invites and codes, and purges prefill a week after the answer', async () => {
    const lapsed = await invite({ expiresIn: '-1 minute' });
    const old = await invite({ status: 'claimed', claimedAgo: '8 days' });
    const fresh = await invite({ status: 'claimed', claimedAgo: '2 days' });
    for (const id of [old, fresh]) {
      await q(
        "INSERT INTO invite_prefill (invite_id, inviter_id, home_hint) VALUES ($1, $2, 'SIN')",
        [id, owner],
      );
    }
    await q(
      `INSERT INTO join_codes (code, target_kind, target_id, crew_id, created_by, expires_at)
       VALUES ('XPRD22', 'crew', $1, $1, $2, now() - interval '1 minute')`,
      [crewId, owner],
    );

    // The web Worker, answering 404 for a code that stopped resolving (and dropping its card).
    const asked: { url: string; userAgent: string | null }[] = [];
    const web: typeof fetch = (input, init) => {
      asked.push({
        url: input instanceof Request ? input.url : input.toString(),
        userAgent: new Headers(init?.headers).get('user-agent'),
      });
      return Promise.resolve(new Response('Not found', { status: 404 }));
    };
    const boss = await harness.startRuntime([
      ogRenderJob({ webBaseUrl: 'https://critterpass.test', fetch: web }),
    ]);

    const report = await expireInvitesAndCodes(harness.pool);
    expect(report).toMatchObject({ invitesExpired: 1, codesExpired: 1, prefillPurged: 1 });
    await until(() => asked.length === 1, 20_000);
    expect(asked).toEqual([
      {
        url: 'https://critterpass.test/og/invite/XPRD22.png?warm=1',
        userAgent: OG_WARM_USER_AGENT,
      },
    ]);
    await harness.stopRuntime(boss);
    expect(await q('SELECT status FROM invites WHERE id = $1', [lapsed])).toEqual([
      { status: 'expired' },
    ]);
    expect(
      await q('SELECT invite_id FROM invite_prefill WHERE invite_id = ANY($1) ORDER BY invite_id', [
        [old, fresh],
      ]),
    ).toEqual([{ invite_id: fresh }]);
  });
});

describe('waitlist offers', () => {
  it('offers a freed seat to the first person waiting, once, and passes it on when ignored', async () => {
    const [trip] = await q<{ id: string }>(
      "INSERT INTO trips (crew_id, status) VALUES ($1, 'setup') RETURNING id",
      [crewId],
    );
    const tripId = trip!.id;
    for (let i = 0; i < 5; i += 1) {
      await q("INSERT INTO trip_participants (trip_id, user_id, rsvp) VALUES ($1, $2, 'in')", [
        tripId,
        await user(),
      ]);
    }
    const first = await user();
    const second = await user();
    await q(
      `INSERT INTO trip_participants (trip_id, user_id, rsvp, waitlist_position)
       VALUES ($1, $2, 'waitlisted', 1), ($1, $3, 'waitlisted', 2)`,
      [tripId, first, second],
    );

    expect(await tripsWithWaiters(harness.pool)).toContain(tripId);
    const offers = await offerFreedSeats(harness.pool, tripId);
    expect(offers.map((o) => o.offered_user)).toEqual([first]);
    expect(await offerFreedSeats(harness.pool, tripId)).toEqual([]);
    expect(
      await q('SELECT rsvp FROM trip_participants WHERE trip_id = $1 AND user_id = $2', [
        tripId,
        first,
      ]),
    ).toEqual([{ rsvp: 'waitlisted' }]);
    expect(
      await q(
        "SELECT payload->>'user_id' AS uid FROM domain_events WHERE type = 'trip.seat_opened' AND trip_id = $1",
        [tripId],
      ),
    ).toEqual([{ uid: first }]);

    await q(
      "UPDATE seat_waitlist_offers SET offered_at = now() - interval '2 days', expires_at = now() - interval '1 minute' WHERE trip_id = $1",
      [tripId],
    );
    expect(await lapseSeatOffers(harness.pool)).toEqual({ lapsed: 1, reoffered: 1 });
    expect(
      await q(
        'SELECT user_id, status FROM seat_waitlist_offers WHERE trip_id = $1 ORDER BY created_at',
        [tripId],
      ),
    ).toEqual([
      { user_id: first, status: 'expired' },
      { user_id: second, status: 'offered' },
    ]);
    expect(
      await q(
        'SELECT waitlist_position FROM trip_participants WHERE trip_id = $1 AND user_id = $2',
        [tripId, first],
      ),
    ).toEqual([{ waitlist_position: 3 }]);
  });
});

describe('invites.nudge', () => {
  it('nudges an installed in-app invitee once after a day, and nobody else', async () => {
    const installed = randomUUID();
    const notInstalled = randomUUID();
    for (const id of [installed, notInstalled]) {
      await q("INSERT INTO users (id, status) VALUES ($1, 'registered')", [id]);
    }
    await q(
      `INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
       VALUES ($1, $2, 'ios', '1.0.0', 'en', 'Asia/Singapore')`,
      [randomUUID(), installed],
    );
    const due = await invite({ invitee: installed, createdAgo: '25 hours' });
    await invite({ invitee: notInstalled, createdAgo: '25 hours' });
    await invite({ invitee: installed, createdAgo: '2 hours' });

    expect(await nudgeInvitees(harness.pool)).toBe(1);
    expect(await nudgeInvitees(harness.pool)).toBe(0);
    expect(await q("SELECT aggregate_id FROM domain_events WHERE type = 'invite.nudged'")).toEqual([
      { aggregate_id: due },
    ]);
  });
});

describe('crew growth pushes', () => {
  it('registers the seat-opened, invite and nudge pushes to the one person they concern', async () => {
    registerInviteNotifications();
    const registration = getRegistration('trip.seat_opened', 'seat_opened');
    expect(registration).toBeDefined();
    const uid = randomUUID();
    const client = await harness.pool.connect();
    try {
      const audience = await registration!.audience(client, {
        id: randomUUID(),
        type: 'trip.seat_opened',
        payload: { user_id: uid },
        crewId,
        tripId: null,
        actorId: null,
        occurredAt: new Date(),
      });
      expect(audience).toEqual([uid]);
    } finally {
      client.release();
    }
    expect(getRegistration('invite.created', 'crew_invite_received')).toBeDefined();
    expect(getRegistration('invite.nudged', 'nudge')).toBeDefined();
  });
});
