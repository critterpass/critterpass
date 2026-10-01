/**
 * Crew commands through the real `/v1/cmd` door against a migrated Postgres: starting a crew (its
 * organiser row, join code and active crew), renaming, switching, the notification level, code
 * rotation, leaving with organiser hand-off, and removal. A departure bumps the membership epoch,
 * queues the realtime unsubscribes for the crew and its trips in the same transaction (the relay
 * suite proves those end live Centrifugo subscriptions), frees the member's trip seats and drops
 * the crew from the member's sync membership.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerCrewCommands } from '../../src/commands/crews';
import { runCommand } from '../location/location-fixture';
import { type CommandDoorsHarness, type SignedIn } from '../routes/command-doors-harness';
import { queuedCards, startDoorsWithJobs } from './invite-fixture';

let harness: CommandDoorsHarness;

beforeAll(async () => {
  harness = await startDoorsWithJobs(registerCrewCommands);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function sql<T>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await harness.pool.query(text, params)).rows as T[];
}

async function startCrew(owner: SignedIn, name = 'Bali crew') {
  const crewId = generateUuidV7();
  const response = await runCommand(harness, owner, 'create_crew', { crew_id: crewId, name });
  expect(response.status).toBe(200);
  return { crewId, result: response.body['result'] as Record<string, unknown> };
}

async function addMember(crewId: string, user: SignedIn): Promise<void> {
  await withSystem(harness.pool, (tx) =>
    tx.query(`INSERT INTO crew_members (crew_id, user_id, colour) VALUES ($1, $2, 'orange')`, [
      crewId,
      user.uid,
    ]),
  );
}

async function addTrip(crewId: string, seats: ReadonlyArray<[SignedIn, 'organiser' | 'member']>) {
  return withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
      [crewId],
    );
    const tripId = rows[0]!.id;
    for (const [user, role] of seats) {
      await tx.query(
        "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, 'in')",
        [tripId, user.uid, role],
      );
    }
    return tripId;
  });
}

describe('create_crew', () => {
  it('seats the creator as organiser, mints a code and makes the crew active', async () => {
    const owner = await harness.signInAnonymously();
    const { crewId, result } = await startCrew(owner, '  Bali   crew ');
    expect(result).toMatchObject({
      crew_id: crewId,
      code: expect.stringMatching(/^[A-Z2-9]{6}$/) as unknown,
    });
    expect(await sql('SELECT name FROM crews WHERE id = $1', [crewId])).toEqual([
      { name: 'Bali crew' },
    ]);
    expect(await sql('SELECT role, colour FROM crew_members WHERE crew_id = $1', [crewId])).toEqual(
      [{ role: 'organiser', colour: 'yellow' }],
    );
    expect(
      await sql('SELECT active_crew_id FROM user_settings WHERE user_id = $1', [owner.uid]),
    ).toEqual([{ active_crew_id: crewId }]);
    expect(
      await sql(
        "SELECT count(*)::int AS n FROM join_codes WHERE crew_id = $1 AND status = 'active'",
        [crewId],
      ),
    ).toEqual([{ n: 1 }]);
  });

  it('refuses an eleventh active crew with crew_limit', async () => {
    const busy = await harness.signInAnonymously();
    for (let i = 0; i < 10; i += 1) await startCrew(busy, `Crew ${i}`);
    const eleventh = await runCommand(harness, busy, 'create_crew', {
      crew_id: generateUuidV7(),
      name: 'One too many',
    });
    expect(eleventh.status).toBe(409);
    expect(eleventh.body).toMatchObject({
      error: { code: 'STATE_INVALID', detail: { reason: 'crew_limit', limit: 10 } },
    });
  });
});

describe('update, switch, notify and rotate', () => {
  it('lets members rename, switch, mute and rotate, and hides the crew from outsiders', async () => {
    const owner = await harness.signInAnonymously();
    const member = await harness.signInAnonymously();
    const outsider = await harness.signInAnonymously();
    const { crewId, result } = await startCrew(owner);
    await addMember(crewId, member);

    const rename = await runCommand(harness, member, 'update_crew', {
      crew_id: crewId,
      name: 'Lombok gang',
      art: 'surf-01',
    });
    expect(rename.status).toBe(200);
    expect(await sql('SELECT name, art FROM crews WHERE id = $1', [crewId])).toEqual([
      { name: 'Lombok gang', art: 'surf-01' },
    ]);

    expect((await runCommand(harness, member, 'set_active_crew', { crew_id: crewId })).status).toBe(
      200,
    );
    const notify = await runCommand(harness, member, 'set_crew_notify', {
      crew_id: crewId,
      level: 'off',
    });
    expect(notify.body).toMatchObject({ result: { level: 'off' } });

    const rotated = await runCommand(harness, member, 'rotate_join_code', { crew_id: crewId });
    const newCode = (rotated.body['result'] as { code: string }).code;
    expect(newCode).not.toBe(result['code']);
    expect(
      await sql('SELECT code, status FROM join_codes WHERE crew_id = $1 ORDER BY created_at', [
        crewId,
      ]),
    ).toEqual([
      { code: result['code'], status: 'revoked' },
      { code: newCode, status: 'active' },
    ]);
    // The retired code's cached share card is purged; the new code is warmed once it is shared.
    expect(await queuedCards(harness)).toContainEqual({ kind: 'invite', token: result['code'] });
    expect(await queuedCards(harness)).not.toContainEqual({ kind: 'invite', token: newCode });

    for (const cmd of ['update_crew', 'set_active_crew', 'rotate_join_code']) {
      const denied = await runCommand(harness, outsider, cmd, { crew_id: crewId, name: 'Mine' });
      expect(denied.status).toBe(404);
    }
  });
});

describe('leave_crew and remove_member', () => {
  it('hands the trip and crew over, frees the seat and revokes realtime in one go', async () => {
    const owner = await harness.signInAnonymously();
    const early = await harness.signInAnonymously();
    const late = await harness.signInAnonymously();
    const { crewId } = await startCrew(owner);
    await addMember(crewId, early);
    await addMember(crewId, late);
    const tripId = await addTrip(crewId, [
      [owner, 'organiser'],
      [early, 'member'],
      [late, 'member'],
    ]);
    const [{ epoch: before } = { epoch: -1 }] = await sql<{ epoch: number }>(
      'SELECT membership_epoch AS epoch FROM crews WHERE id = $1',
      [crewId],
    );

    const left = await runCommand(harness, owner, 'leave_crew', { crew_id: crewId });
    expect(left.status).toBe(200);
    expect(left.body['result']).toEqual({
      crew_id: crewId,
      handed_off: [
        { scope: 'trip', id: tripId },
        { scope: 'crew', id: crewId },
      ],
      freed_trips: [tripId],
    });
    expect(
      await sql(
        'SELECT user_id, role, rsvp FROM trip_participants WHERE trip_id = $1 ORDER BY id',
        [tripId],
      ),
    ).toEqual([
      { user_id: owner.uid, role: 'organiser', rsvp: 'out' },
      { user_id: early.uid, role: 'organiser', rsvp: 'in' },
      { user_id: late.uid, role: 'member', rsvp: 'in' },
    ]);
    expect(
      await sql('SELECT role FROM crew_members WHERE crew_id = $1 AND user_id = $2', [
        crewId,
        early.uid,
      ]),
    ).toEqual([{ role: 'organiser' }]);
    const [{ epoch: after } = { epoch: -1 }] = await sql<{ epoch: number }>(
      'SELECT membership_epoch AS epoch FROM crews WHERE id = $1',
      [crewId],
    );
    expect(after).toBe(before + 1);
    const revocations = await sql<{ channel: string }>(
      `SELECT channel FROM rt_outbox
        WHERE kind = 'unsubscribe' AND payload->>'user_id' = $1 ORDER BY channel`,
      [owner.uid],
    );
    expect(revocations.map((row) => row.channel).sort()).toEqual(
      [`crew:${crewId}`, `trip:${tripId}`].sort(),
    );
    expect(
      await sql(
        "SELECT crew_id FROM crew_members WHERE user_id = $1 AND status = 'active' AND crew_id = $2",
        [owner.uid, crewId],
      ),
    ).toEqual([]);
    expect(
      await sql('SELECT active_crew_id FROM user_settings WHERE user_id = $1', [owner.uid]),
    ).toEqual([{ active_crew_id: null }]);
  });

  it('lets the creator remove a member but never the reverse, and not a stranger', async () => {
    const owner = await harness.signInAnonymously();
    const member = await harness.signInAnonymously();
    const other = await harness.signInAnonymously();
    const { crewId } = await startCrew(owner);
    await addMember(crewId, member);
    await addMember(crewId, other);

    const byMember = await runCommand(harness, member, 'remove_member', {
      crew_id: crewId,
      uid: other.uid,
    });
    expect(byMember.status).toBe(403);
    const creator = await runCommand(harness, member, 'remove_member', {
      crew_id: crewId,
      uid: owner.uid,
    });
    expect(creator.status).toBe(403);

    const removed = await runCommand(harness, owner, 'remove_member', {
      crew_id: crewId,
      uid: member.uid,
    });
    expect(removed.status).toBe(200);
    expect(
      await sql('SELECT status FROM crew_members WHERE crew_id = $1 AND user_id = $2', [
        crewId,
        member.uid,
      ]),
    ).toEqual([{ status: 'removed' }]);
    const again = await runCommand(harness, member, 'set_active_crew', { crew_id: crewId });
    expect(again.status).toBe(404);
  });

  it('lets an organiser of a live trip remove a member', async () => {
    const owner = await harness.signInAnonymously();
    const tripLead = await harness.signInAnonymously();
    const member = await harness.signInAnonymously();
    const { crewId } = await startCrew(owner);
    await addMember(crewId, tripLead);
    await addMember(crewId, member);
    await addTrip(crewId, [
      [tripLead, 'organiser'],
      [member, 'member'],
    ]);
    const removed = await runCommand(harness, tripLead, 'remove_member', {
      crew_id: crewId,
      uid: member.uid,
    });
    expect(removed.status).toBe(200);
  });
});
