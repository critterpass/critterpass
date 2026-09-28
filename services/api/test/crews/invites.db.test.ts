/**
 * Invite lifecycle through the real `/v1/cmd` door against a migrated Postgres: generic codes and
 * personal links, forwarded links, anonymous joiners, the seat limit at invite time, the waitlist
 * and seat offers, in-app invites answered later or declined, and 50 simultaneous joins of a
 * 6-seat trip with 4 seats taken seating exactly 2 and waitlisting 48.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCommand } from '../location/location-fixture';
import type { CommandDoorsHarness, SignedIn } from '../routes/command-doors-harness';
import {
  errorOf,
  queuedCards,
  resultOf,
  startCrew,
  startInviteHarness,
  tripWithSeats,
} from './invite-fixture';

let harness: CommandDoorsHarness;
let inviter: SignedIn;

beforeAll(async () => {
  harness = await startInviteHarness();
  inviter = await harness.signInAnonymously();
  await harness.promoteToRegistered(inviter.uid);
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const cmd = (who: SignedIn, name: string, payload: unknown) =>
  runCommand(harness, who, name, payload);

async function sql<T>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await harness.pool.query(text, params)).rows as T[];
}

describe('who may invite', () => {
  it('asks an anonymous inviter to sign in, and lets an anonymous invitee join', async () => {
    const anonymous = await harness.signInAnonymously();
    const crewId = await startCrew(harness, anonymous);
    const refused = await cmd(anonymous, 'create_invite', { crew_id: crewId, channel: 'link' });
    expect(refused.status).toBe(401);
    expect(errorOf(refused.body).code).toBe('AUTH_REQUIRED');

    const crew = await startCrew(harness, inviter);
    const invite = await cmd(inviter, 'create_invite', { crew_id: crew, channel: 'code' });
    expect(invite.status).toBe(200);
    const { code, url } = resultOf(invite.body) as { code: string; url: string };
    expect(url).toMatch(new RegExp(`/i/${code}$`));
    // Its share card is queued for drawing in the same transaction.
    expect(await queuedCards(harness)).toContainEqual({ kind: 'invite', token: code });

    const joiner = await harness.signInAnonymously();
    const joined = await cmd(joiner, 'accept_invite', { code: code.toLowerCase() });
    expect(joined.status).toBe(200);
    expect(resultOf(joined.body)).toMatchObject({ crew_id: crew, joined: true, seated: false });
    expect(
      await sql('SELECT colour FROM crew_members WHERE crew_id = $1 AND user_id = $2', [
        crew,
        joiner.uid,
      ]),
    ).toEqual([{ colour: 'orange' }]);
  });

  it('answers every unknown or dead code with the same CODE_INVALID', async () => {
    const joiner = await harness.signInAnonymously();
    for (const code of ['ZZZZ22', 'nope!']) {
      const response = await cmd(joiner, 'accept_invite', { code });
      expect(errorOf(response.body).code).toBe('CODE_INVALID');
    }
  });
});

describe('personal links', () => {
  it('stores the prefill encrypted, seats the named invitee, and treats a forward as generic', async () => {
    const crew = await startCrew(harness, inviter);
    const tripId = await tripWithSeats(harness, crew, inviter, 1);
    const created = await cmd(inviter, 'create_invite', {
      crew_id: crew,
      trip_id: tripId,
      channel: 'contact',
      share_via: 'wa',
      contact: { name: 'Dev Patel', phone_e164: '+6591234567', home_hint: 'SIN' },
      note: 'loves night markets',
      tags: ['markets', 'street_food'],
    });
    expect(created.status).toBe(200);
    const { invite_id: inviteId, link, url } = resultOf(created.body) as Record<string, string>;
    expect(url).toContain('?c=wa');
    const [, , code, seat] = link!.split('/');

    const [prefill] = await sql<Record<string, unknown>>(
      'SELECT name_enc, inviter_note_enc, phone_hash, home_hint, tags FROM invite_prefill WHERE invite_id = $1',
      [inviteId],
    );
    expect(prefill?.['name_enc']).not.toContain('Dev');
    expect(prefill?.['inviter_note_enc']).not.toContain('night');
    expect(prefill?.['phone_hash']).toMatch(/^[0-9a-f]{64}$/);
    expect(prefill).toMatchObject({ home_hint: 'SIN', tags: ['markets', 'street_food'] });

    const dev = await harness.signInAnonymously();
    const claimed = await cmd(dev, 'accept_invite', { code, seat });
    expect(resultOf(claimed.body)).toMatchObject({
      invite_id: inviteId,
      seated: true,
      forwarded: false,
    });

    const friend = await harness.signInAnonymously();
    const forwarded = await cmd(friend, 'accept_invite', { code, seat });
    expect(resultOf(forwarded.body)).toMatchObject({
      invite_id: null,
      joined: true,
      forwarded: true,
    });
    expect(await sql('SELECT status, claimed_by FROM invites WHERE id = $1', [inviteId])).toEqual([
      { status: 'claimed', claimed_by: dev.uid },
    ]);
  });

  it('rejects a tampered seat token and says when a named seat expired or was revoked', async () => {
    const crew = await startCrew(harness, inviter);
    const make = async () => {
      const created = await cmd(inviter, 'create_invite', {
        crew_id: crew,
        channel: 'contact',
        contact: { name: 'Sam' },
      });
      const { invite_id: id, link } = resultOf(created.body) as Record<string, string>;
      const [, , code, seat] = link!.split('/');
      return { id: id!, code: code!, seat: seat! };
    };
    const joiner = await harness.signInAnonymously();

    const tampered = await make();
    const bad = `${tampered.seat.slice(0, 30)}${tampered.seat[30] === 'A' ? 'B' : 'A'}${tampered.seat.slice(31)}`;
    const refused = await cmd(joiner, 'accept_invite', { code: tampered.code, seat: bad });
    expect(errorOf(refused.body).code).toBe('CODE_INVALID');

    const revoked = await make();
    expect((await cmd(inviter, 'revoke_invite', { invite_id: revoked.id })).status).toBe(200);
    const onRevoked = await cmd(joiner, 'accept_invite', {
      code: revoked.code,
      seat: revoked.seat,
    });
    expect(errorOf(onRevoked.body).code).toBe('INVITE_REVOKED');

    const expired = await make();
    await withSystem(harness.pool, (tx) =>
      tx.query("UPDATE invites SET expires_at = now() - interval '1 minute' WHERE id = $1", [
        expired.id,
      ]),
    );
    const onExpired = await cmd(joiner, 'accept_invite', {
      code: expired.code,
      seat: expired.seat,
    });
    expect(errorOf(onExpired.body).code).toBe('INVITE_EXPIRED');
  });
});

describe('seat cap', () => {
  it('answers the 7th named seat with SEAT_LIMIT, and waitlists it when asked', async () => {
    const crew = await startCrew(harness, inviter);
    const tripId = await tripWithSeats(harness, crew, inviter, 6);
    const full = await cmd(inviter, 'create_invite', {
      crew_id: crew,
      trip_id: tripId,
      channel: 'contact',
      contact: { name: 'Kai' },
    });
    expect(full.status).toBe(402);
    expect(errorOf(full.body)).toMatchObject({
      code: 'SEAT_LIMIT',
      detail: { cap: 6, offer: 'boost', trip_id: tripId, invitee: 'Kai', seats_taken: 6 },
    });

    const waitlist = await cmd(inviter, 'create_invite', {
      crew_id: crew,
      trip_id: tripId,
      channel: 'contact',
      contact: { name: 'Kai' },
      on_full: 'waitlist',
    });
    const { link } = resultOf(waitlist.body) as Record<string, string>;
    expect(resultOf(waitlist.body)).toMatchObject({ waitlisted: true });
    const [, , code, seat] = link!.split('/');
    const kai = await harness.signInAnonymously();
    const joined = await cmd(kai, 'accept_invite', { code, seat });
    expect(joined.status).toBe(200);
    expect(resultOf(joined.body)).toMatchObject({ waitlisted: true, waitlist_position: 1 });
  });

  it('offers a freed seat to the next person waiting and seats them only when they accept', async () => {
    const crew = await startCrew(harness, inviter);
    const tripId = await tripWithSeats(harness, crew, inviter, 6);
    const { rows } = await harness.pool.query<{ code: string }>(
      "SELECT code FROM join_codes WHERE crew_id = $1 AND status = 'active'",
      [crew],
    );
    const tripCode = await cmd(inviter, 'rotate_join_code', { crew_id: crew, trip_id: tripId });
    const code = (resultOf(tripCode.body) as { code: string }).code;
    expect(rows).toHaveLength(1);
    const waiter = await harness.signInAnonymously();
    expect(resultOf((await cmd(waiter, 'accept_invite', { code })).body)).toMatchObject({
      waitlisted: true,
    });

    const [leaver] = await sql<{ user_id: string }>(
      `SELECT user_id FROM trip_participants WHERE trip_id = $1 AND role = 'member' AND rsvp = 'in' LIMIT 1`,
      [tripId],
    );
    await withSystem(harness.pool, async (tx) => {
      await tx.query(
        "UPDATE trip_participants SET rsvp = 'out' WHERE trip_id = $1 AND user_id = $2",
        [tripId, leaver!.user_id],
      );
    });
    const offers = await withSystem(harness.pool, (tx) =>
      tx.query<{ offer_id: string; offered_user: string }>(
        "SELECT * FROM app.offer_freed_seats($1, interval '24 hours')",
        [tripId],
      ),
    );
    expect(offers.rows.map((row) => row.offered_user)).toEqual([waiter.uid]);
    expect(
      await sql('SELECT rsvp FROM trip_participants WHERE trip_id = $1 AND user_id = $2', [
        tripId,
        waiter.uid,
      ]),
    ).toEqual([{ rsvp: 'waitlisted' }]);

    const outsider = await harness.signInAnonymously();
    const stolen = await cmd(outsider, 'accept_seat_offer', { offer_id: offers.rows[0]!.offer_id });
    expect(stolen.status).toBe(404);
    const taken = await cmd(waiter, 'accept_seat_offer', { offer_id: offers.rows[0]!.offer_id });
    expect(taken.status).toBe(200);
    expect(
      await sql('SELECT rsvp FROM trip_participants WHERE trip_id = $1 AND user_id = $2', [
        tripId,
        waiter.uid,
      ]),
    ).toEqual([{ rsvp: 'in' }]);
  });
});

describe('in-app invites', () => {
  it('lets an existing user park an invite for later, then decline it', async () => {
    const shared = await startCrew(harness, inviter);
    const friend = await harness.signInAnonymously();
    await withSystem(harness.pool, (tx) =>
      tx.query('INSERT INTO crew_members (crew_id, user_id) VALUES ($1, $2)', [shared, friend.uid]),
    );
    const other = await startCrew(harness, inviter);
    const created = await cmd(inviter, 'create_invite', {
      crew_id: other,
      channel: 'link',
      share_via: 'app',
      invitee_uid: friend.uid,
    });
    const { invite_id: inviteId } = resultOf(created.body) as Record<string, string>;
    expect((await cmd(friend, 'defer_invite', { invite_id: inviteId })).body).toMatchObject({
      result: { status: 'later' },
    });
    expect((await cmd(friend, 'decline_invite', { invite_id: inviteId })).body).toMatchObject({
      result: { status: 'declined' },
    });
    const late = await cmd(friend, 'accept_invite', { invite_id: inviteId });
    expect(errorOf(late.body)).toMatchObject({ code: 'STATE_INVALID' });

    const stranger = await harness.signInAnonymously();
    const notShared = await cmd(inviter, 'create_invite', {
      crew_id: other,
      channel: 'link',
      invitee_uid: stranger.uid,
    });
    expect(notShared.status).toBe(404);
  });
});

describe('50 simultaneous joins', { timeout: 180_000 }, () => {
  it('seats exactly the two free seats of a 6-seat trip and waitlists the other 48', async () => {
    const crew = await startCrew(harness, inviter);
    const tripId = await tripWithSeats(harness, crew, inviter, 4);
    await withSystem(harness.pool, (tx) =>
      tx.query('UPDATE crews SET member_ceiling = 64 WHERE id = $1', [crew]),
    );
    const invite = await cmd(inviter, 'create_invite', {
      crew_id: crew,
      trip_id: tripId,
      channel: 'code',
    });
    const { code } = resultOf(invite.body) as { code: string };
    const joiners = await Promise.all(
      Array.from({ length: 50 }, () => harness.signInAnonymously()),
    );
    const results = await Promise.all(joiners.map((who) => cmd(who, 'accept_invite', { code })));
    expect(results.every((response) => response.status === 200)).toBe(true);
    const outcomes = results.map((response) => resultOf(response.body));
    expect(outcomes.filter((o) => o['seated'] === true)).toHaveLength(2);
    expect(outcomes.filter((o) => o['waitlisted'] === true)).toHaveLength(48);
    const positions = outcomes
      .map((o) => o['waitlist_position'])
      .filter((p): p is number => typeof p === 'number')
      .sort((a, b) => a - b);
    expect(positions).toEqual(Array.from({ length: 48 }, (_, i) => i + 1));
  });
});
