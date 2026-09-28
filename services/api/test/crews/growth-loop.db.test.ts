/**
 * The growth loop end to end through the real command door: an inviter sends a named seat for a
 * trip, the invitee (a brand-new anonymous account) claims it and is attributed to the inviter, a
 * forward of the same link joins someone else through a generic seat without naming or taking the
 * named one, a revoked invite stops working, the full trip waitlists the next joiner, a member
 * leaves and frees a seat, the seat is offered to the waitlist (never auto-joined) and taken.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCommand } from '../location/location-fixture';
import type { CommandDoorsHarness, SignedIn } from '../routes/command-doors-harness';
import { errorOf, resultOf, startCrew, startInviteHarness, tripWithSeats } from './invite-fixture';

let harness: CommandDoorsHarness;
let winston: SignedIn;

beforeAll(async () => {
  harness = await startInviteHarness();
  winston = await harness.signInAnonymously();
  await harness.promoteToRegistered(winston.uid);
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const cmd = (who: SignedIn, name: string, payload: unknown) =>
  runCommand(harness, who, name, payload);

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await harness.pool.query(sql, params)).rows as T[];
}

async function personal(crew: string, tripId: string, name: string, onFull?: 'waitlist') {
  const created = await cmd(winston, 'create_invite', {
    crew_id: crew,
    trip_id: tripId,
    channel: 'contact',
    share_via: 'wa',
    contact: { name },
    ...(onFull === undefined ? {} : { on_full: onFull }),
  });
  const { invite_id: inviteId, link } = resultOf(created.body) as Record<string, string>;
  const [, , code, seat] = link!.split('/');
  return { inviteId: inviteId!, code: code!, seat: seat! };
}

describe('growth loop', { timeout: 120_000 }, () => {
  it('runs invite, forward, revoke, waitlist, dropout and seat offer end to end', async () => {
    const crew = await startCrew(harness, winston);
    const tripId = await tripWithSeats(harness, crew, winston, 4);

    // A named seat for Rin, claimed by a brand-new account and attributed to Winston.
    const rinLink = await personal(crew, tripId, 'Rin');
    const rin = await harness.signInAnonymously();
    const rinJoin = await cmd(rin, 'accept_invite', { code: rinLink.code, seat: rinLink.seat });
    expect(resultOf(rinJoin.body)).toMatchObject({
      seated: true,
      forwarded: false,
      invite_id: rinLink.inviteId,
    });
    expect(
      await rows('SELECT referrer_id, status FROM referrals WHERE referee_id = $1', [rin.uid]),
    ).toEqual([{ referrer_id: winston.uid, status: 'joined' }]);

    // Rin forwards the link: her friend joins through a generic seat, never the named one.
    const friend = await harness.signInAnonymously();
    const forwarded = await cmd(friend, 'accept_invite', {
      code: rinLink.code,
      seat: rinLink.seat,
    });
    expect(resultOf(forwarded.body)).toMatchObject({
      forwarded: true,
      invite_id: null,
      seated: true,
    });
    expect(await rows('SELECT claimed_by FROM invites WHERE id = $1', [rinLink.inviteId])).toEqual([
      { claimed_by: rin.uid },
    ]);

    // A named seat on the now-full trip goes out waitlisted; revoked, it stops working for anyone.
    const devLink = await personal(crew, tripId, 'Dev', 'waitlist');
    expect((await cmd(winston, 'revoke_invite', { invite_id: devLink.inviteId })).status).toBe(200);
    const dev = await harness.signInAnonymously();
    const refused = await cmd(dev, 'accept_invite', { code: devLink.code, seat: devLink.seat });
    expect(errorOf(refused.body).code).toBe('INVITE_REVOKED');

    // The trip is now full at six: the next joiner through the trip code waits in line.
    const [{ code: tripCode } = { code: '' }] = await rows<{ code: string }>(
      "SELECT code FROM join_codes WHERE target_kind = 'trip' AND target_id = $1 AND status = 'active'",
      [tripId],
    );
    const kai = await harness.signInAnonymously();
    const waitlisted = await cmd(kai, 'accept_invite', { code: tripCode });
    expect(resultOf(waitlisted.body)).toMatchObject({
      seated: false,
      waitlisted: true,
      waitlist_position: 1,
    });

    // Rin leaves the crew: her seat frees up and is offered to Kai, who is not seated until he takes it.
    const left = await cmd(rin, 'leave_crew', { crew_id: crew });
    expect(resultOf(left.body)).toMatchObject({ freed_trips: [tripId] });
    const offers = await withSystem(harness.pool, (tx) =>
      tx.query<{ offer_id: string; offered_user: string }>(
        "SELECT * FROM app.offer_freed_seats($1, interval '24 hours')",
        [tripId],
      ),
    );
    expect(offers.rows.map((row) => row.offered_user)).toEqual([kai.uid]);
    expect(
      await rows('SELECT rsvp FROM trip_participants WHERE trip_id = $1 AND user_id = $2', [
        tripId,
        kai.uid,
      ]),
    ).toEqual([{ rsvp: 'waitlisted' }]);
    const taken = await cmd(kai, 'accept_seat_offer', { offer_id: offers.rows[0]!.offer_id });
    expect(taken.status).toBe(200);
    expect(
      await rows(
        'SELECT count(*)::int AS seated FROM trip_participants WHERE trip_id = $1 AND holds_seat',
        [tripId],
      ),
    ).toEqual([{ seated: 6 }]);
  });
});
