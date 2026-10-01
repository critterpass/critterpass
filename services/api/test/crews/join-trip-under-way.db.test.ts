/**
 * Getting on a trip that is already locked in, through the real `/v1/cmd` door against a migrated
 * Postgres. A friend who joins with the crew's code while the trip is under way is on the trip:
 * IN, one more seat taken, the plan readable as them, and the reply announced like an RSVP. The
 * seventh person on an unboosted trip waits. A trip that is over, or not locked in yet, leaves the
 * joiner in the crew alone, and once it is confirmed they join it themselves; nobody outside the
 * crew can.
 */
import { randomUUID } from 'node:crypto';

import { withSystem, withUser } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCommand } from '../location/location-fixture';
import type { CommandDoorsHarness, SignedIn } from '../routes/command-doors-harness';
import { errorOf, resultOf, startCrew, startInviteHarness } from './invite-fixture';

const PATH = [
  'won',
  'setup',
  'drafting',
  'draft_review',
  'proposed',
  'confirmed',
  'pre_trip',
  'in_trip',
  'post_trip',
];

let harness: CommandDoorsHarness;
let organiser: SignedIn;

beforeAll(async () => {
  harness = await startInviteHarness();
  organiser = await harness.signInAnonymously();
  await harness.promoteToRegistered(organiser.uid);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const cmd = (who: SignedIn, name: string, payload: unknown) =>
  runCommand(harness, who, name, payload);

async function sys<T>(text: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(text, params)).rows as T[]);
}

/** The code the crew got when it was started (a crew code: it names no trip). */
async function crewCode(crewId: string): Promise<string> {
  const [row] = await sys<{ code: string }>(
    "SELECT code FROM join_codes WHERE crew_id = $1 AND target_kind = 'crew' AND status = 'active'",
    [crewId],
  );
  return (row as { code: string }).code;
}

/** A trip of the crew walked to `status`, the organiser and `others` fresh crew members IN. */
async function tripAt(crewId: string, status: string, others = 0): Promise<string> {
  const [trip] = await sys<{ id: string }>(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
    [crewId],
  );
  const tripId = (trip as { id: string }).id;
  await sys(
    "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'organiser', 'in')",
    [tripId, organiser.uid],
  );
  for (let i = 0; i < others; i += 1) {
    const [user] = await sys<{ id: string }>(
      "INSERT INTO users (id, status) VALUES (uuidv7(), 'registered') RETURNING id",
    );
    const uid = (user as { id: string }).id;
    await sys('INSERT INTO crew_members (crew_id, user_id) VALUES ($1, $2)', [crewId, uid]);
    await sys("INSERT INTO trip_participants (trip_id, user_id, rsvp) VALUES ($1, $2, 'in')", [
      tripId,
      uid,
    ]);
  }
  await moveTo(tripId, status, 0);
  return tripId;
}

/** Walks the trip along its lifecycle from the step after `from` to `status`. */
async function moveTo(tripId: string, status: string, from: number): Promise<void> {
  for (const step of PATH.slice(from, PATH.indexOf(status) + 1)) {
    await sys('UPDATE trips SET status = $2 WHERE id = $1', [tripId, step]);
  }
}

const participant = async (tripId: string, uid: string) =>
  (
    await sys<{ rsvp: string; role: string; waitlist_position: number | null }>(
      'SELECT rsvp, role, waitlist_position FROM trip_participants WHERE trip_id = $1 AND user_id = $2',
      [tripId, uid],
    )
  )[0] ?? null;

const seatsHeld = async (tripId: string) =>
  (
    await sys<{ n: number }>(
      'SELECT count(*)::int AS n FROM trip_participants WHERE trip_id = $1 AND holds_seat',
      [tripId],
    )
  )[0]?.n;

// The event log is not app_system's to read; the owner connection reads it.
const replies = async (tripId: string, uid: string) =>
  (
    await harness.pool.query<{ rsvp: string }>(
      `SELECT payload->>'rsvp' AS rsvp FROM domain_events
        WHERE type = 'rsvp.changed' AND trip_id = $1 AND payload->>'user_id' = $2
        ORDER BY occurred_at, id`,
      [tripId, uid],
    )
  ).rows.map((row) => row.rsvp);

describe('joining a crew whose trip is locked in', () => {
  it('puts a friend who joins with the crew code mid-trip on the trip', async () => {
    const crewId = await startCrew(harness, organiser);
    const tripId = await tripAt(crewId, 'in_trip', 1);
    const [version] = await sys<{ id: string }>(
      `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current')
       RETURNING id`,
      [tripId],
    );
    await sys(
      `INSERT INTO plan_days (version_id, trip_id, day_no, date, theme)
       VALUES ($1, $2, 1, current_date, 'Beach day')`,
      [(version as { id: string }).id, tripId],
    );
    expect(await seatsHeld(tripId)).toBe(2);

    const friend = await harness.signInAnonymously();
    const joined = await cmd(friend, 'accept_invite', { code: await crewCode(crewId) });
    expect(joined.status).toBe(200);
    expect(resultOf(joined.body)).toMatchObject({
      crew_id: crewId,
      trip_id: tripId,
      joined: true,
      seated: true,
      waitlisted: false,
      waitlist_position: null,
    });
    expect(await participant(tripId, friend.uid)).toEqual({
      rsvp: 'in',
      role: 'member',
      waitlist_position: null,
    });
    expect(await seatsHeld(tripId)).toBe(3);
    expect(await replies(tripId, friend.uid)).toEqual(['in']);

    // As the friend, under RLS: the trip, who is on it and the plan's day.
    const seen = await withUser(harness.pool, friend.uid, randomUUID(), async (tx) => ({
      trip: (await tx.query('SELECT status FROM trips WHERE id = $1', [tripId])).rows,
      roster: (
        await tx.query('SELECT count(*)::int AS n FROM trip_participants WHERE trip_id = $1', [
          tripId,
        ])
      ).rows,
      days: (await tx.query('SELECT theme FROM plan_days WHERE trip_id = $1', [tripId])).rows,
    }));
    expect(seen).toEqual({
      trip: [{ status: 'in_trip' }],
      roster: [{ n: 3 }],
      days: [{ theme: 'Beach day' }],
    });
  });

  it('waitlists the seventh person on a trip that is not boosted', async () => {
    const crewId = await startCrew(harness, organiser);
    const tripId = await tripAt(crewId, 'confirmed', 5);
    expect(await seatsHeld(tripId)).toBe(6);

    const seventh = await harness.signInAnonymously();
    const joined = await cmd(seventh, 'accept_invite', { code: await crewCode(crewId) });
    expect(resultOf(joined.body)).toMatchObject({
      trip_id: tripId,
      joined: true,
      seated: false,
      waitlisted: true,
      waitlist_position: 1,
    });
    expect(await participant(tripId, seventh.uid)).toMatchObject({
      rsvp: 'waitlisted',
      waitlist_position: 1,
    });
    expect(await seatsHeld(tripId)).toBe(6);
    expect(await replies(tripId, seventh.uid)).toEqual(['waitlisted']);
  });

  it('seats a joiner on every trip of the crew that is locked in, the one under way first', async () => {
    const crewId = await startCrew(harness, organiser);
    const later = await tripAt(crewId, 'confirmed');
    const now = await tripAt(crewId, 'in_trip');

    const friend = await harness.signInAnonymously();
    const joined = await cmd(friend, 'accept_invite', { code: await crewCode(crewId) });
    expect(resultOf(joined.body)).toMatchObject({ trip_id: now, seated: true });
    expect(await participant(now, friend.uid)).toMatchObject({ rsvp: 'in' });
    expect(await participant(later, friend.uid)).toMatchObject({ rsvp: 'in' });
  });

  it('leaves a joiner in the crew alone when the trip is over or not locked in yet', async () => {
    const crewId = await startCrew(harness, organiser);
    const over = await tripAt(crewId, 'post_trip');
    const proposed = await tripAt(crewId, 'proposed');

    const friend = await harness.signInAnonymously();
    const joined = await cmd(friend, 'accept_invite', { code: await crewCode(crewId) });
    expect(joined.status).toBe(200);
    expect(resultOf(joined.body)).toMatchObject({
      crew_id: crewId,
      trip_id: null,
      joined: true,
      seated: false,
      waitlisted: false,
    });
    expect(await participant(over, friend.uid)).toBeNull();
    expect(await participant(proposed, friend.uid)).toBeNull();
  });

  it('does not seat someone already in the crew who opens its code again', async () => {
    const crewId = await startCrew(harness, organiser);
    const member = await harness.signInAnonymously();
    const code = await crewCode(crewId);
    await cmd(member, 'accept_invite', { code });
    const tripId = await tripAt(crewId, 'confirmed');

    const again = await cmd(member, 'accept_invite', { code });
    expect(resultOf(again.body)).toMatchObject({ joined: false, trip_id: null, seated: false });
    expect(await participant(tripId, member.uid)).toBeNull();
  });
});

describe('join_trip', () => {
  it('lets a crew member who is not on the trip join it once it is confirmed', async () => {
    const crewId = await startCrew(harness, organiser);
    const tripId = await tripAt(crewId, 'proposed');
    // Joined after the proposal went out: in the crew, on no trip.
    const member = await harness.signInAnonymously();
    await cmd(member, 'accept_invite', { code: await crewCode(crewId) });
    expect(await participant(tripId, member.uid)).toBeNull();

    const early = await cmd(member, 'join_trip', { trip_id: tripId });
    expect(early.status).toBe(409);
    expect(errorOf(early.body)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'trip_status', state: 'proposed' },
    });
    expect(await participant(tripId, member.uid)).toBeNull();

    await moveTo(tripId, 'confirmed', PATH.indexOf('confirmed'));
    const joined = await cmd(member, 'join_trip', { trip_id: tripId });
    expect(joined.status).toBe(200);
    expect(resultOf(joined.body)).toEqual({
      trip_id: tripId,
      seated: true,
      waitlisted: false,
      waitlist_position: null,
    });
    expect(await participant(tripId, member.uid)).toMatchObject({ rsvp: 'in', role: 'member' });
    expect(await seatsHeld(tripId)).toBe(2);

    // A second tap changes nothing and announces nothing.
    const again = await cmd(member, 'join_trip', { trip_id: tripId });
    expect(resultOf(again.body)).toMatchObject({ seated: true, waitlisted: false });
    expect(await seatsHeld(tripId)).toBe(2);
    expect(await replies(tripId, member.uid)).toEqual(['in']);
  });

  it('waitlists a member when the trip is full, and keeps their place on a second try', async () => {
    const crewId = await startCrew(harness, organiser);
    const tripId = await tripAt(crewId, 'proposed', 5);
    const member = await harness.signInAnonymously();
    await cmd(member, 'accept_invite', { code: await crewCode(crewId) });
    await moveTo(tripId, 'in_trip', PATH.indexOf('confirmed'));

    const joined = await cmd(member, 'join_trip', { trip_id: tripId });
    expect(resultOf(joined.body)).toEqual({
      trip_id: tripId,
      seated: false,
      waitlisted: true,
      waitlist_position: 1,
      cap: 6,
      boost_active: false,
    });
    const again = await cmd(member, 'join_trip', { trip_id: tripId });
    expect(resultOf(again.body)).toMatchObject({ waitlisted: true, waitlist_position: 1 });
    expect(await replies(tripId, member.uid)).toEqual(['waitlisted']);
  });

  it('refuses a trip that is over', async () => {
    const crewId = await startCrew(harness, organiser);
    const tripId = await tripAt(crewId, 'proposed');
    const member = await harness.signInAnonymously();
    await cmd(member, 'accept_invite', { code: await crewCode(crewId) });
    await moveTo(tripId, 'post_trip', PATH.indexOf('confirmed'));

    const refused = await cmd(member, 'join_trip', { trip_id: tripId });
    expect(errorOf(refused.body)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'trip_closed', state: 'post_trip' },
    });
    expect(await participant(tripId, member.uid)).toBeNull();
  });

  it('answers someone outside the crew as if the trip did not exist', async () => {
    const crewId = await startCrew(harness, organiser);
    const tripId = await tripAt(crewId, 'in_trip');
    const stranger = await harness.signInAnonymously();

    const refused = await cmd(stranger, 'join_trip', { trip_id: tripId });
    expect(refused.status).toBe(404);
    expect(errorOf(refused.body).code).toBe('NOT_FOUND');
    expect(await participant(tripId, stranger.uid)).toBeNull();
    expect(await seatsHeld(tripId)).toBe(1);
  });
});
