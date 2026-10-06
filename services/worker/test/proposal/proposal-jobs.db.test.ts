/**
 * Proposal jobs against a migrated Postgres. Only the network boundaries are replaced (DeepSeek
 * answering 503 or a recorded reply, the R2 bucket kept in memory): a version that fails three
 * times falls back to the shared one with the guide's note, the poster and postcard render to
 * private keys, an "out" reply only shows the confirm card, the dropout re-split is built once per
 * member and keeps shared costs whole, suggestion cards never tie a name to a reason, reply-by
 * reminds once and locks once, follow-ups deliver once, and a freed seat is offered to exactly one
 * person at a time. What a version is written from names the route of a trip with several stops
 * (each city, its nights and the way in) and nothing new for a one-stop trip.
 */
import { readFileSync } from 'node:fs';

import { createDecisionClient, createGateway } from '@cp/ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runDropout } from '../../src/jobs/proposal/dropout';
import { runFollowups } from '../../src/jobs/proposal/followup';
import { runReplyBy } from '../../src/jobs/proposal/reply-by';
import { decisionIntentReader, runRsvpIntent } from '../../src/jobs/proposal/rsvp-intent';
import { createShareCardRenderer } from '../../src/jobs/proposal/share-cards';
import { runSuggestions } from '../../src/jobs/proposal/suggestions';
import { loadVersionContext } from '../../src/jobs/proposal/version-context';
import { runVersion } from '../../src/jobs/proposal/versions';
import { runProposalWaitlist } from '../../src/jobs/proposal/waitlist';
import { startProposalWorld, type ProposalWorld } from './proposal-world';

let world: ProposalWorld;

const failing = () =>
  createGateway({
    apiKey: 'replay',
    maxAttempts: 1,
    fetch: () =>
      Promise.resolve(
        new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error' } }), {
          status: 503,
        }),
      ),
  });

const recorded = (fixture: string) => {
  const { response } = JSON.parse(
    readFileSync(
      new URL(`../../../../packages/ai/evals/proposal/fixtures/${fixture}.json`, import.meta.url),
      'utf8',
    ),
  ) as { response: { status: number; body: unknown } };
  return createGateway({
    apiKey: 'replay',
    maxAttempts: 1,
    fetch: () =>
      Promise.resolve(
        new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { 'content-type': 'application/json' },
        }),
      ),
  });
};

const version = async (name: keyof ProposalWorld['users']) =>
  (
    await world.q<{ id: string }>(
      'SELECT id FROM proposal_versions WHERE proposal_id = $1 AND recipient_id = $2',
      [world.proposalId, world.users[name]],
    )
  )[0]!.id;

beforeAll(async () => {
  world = await startProposalWorld();
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('personal versions', { timeout: 60_000 }, () => {
  it('falls back to the shared version after three failed tries, with the guide note', async () => {
    const stored = new Map<string, Uint8Array>();
    const outcome = await runVersion(world.harness.pool, await version('Rin'), {
      writer: () => failing(),
      render: createShareCardRenderer({
        put: (key, bytes) => {
          stored.set(key, bytes);
          return Promise.resolve();
        },
      }),
    });
    expect(outcome).toMatchObject({ status: 'fallback', attempts: 3 });
    const [row] = await world.q<{
      status: string;
      shared: boolean;
      fallback_note: string;
      poster_key: string;
    }>('SELECT status, shared, fallback_note, poster_key FROM proposal_versions WHERE id = $1', [
      await version('Rin'),
    ]);
    expect(row).toMatchObject({ status: 'fallback', shared: true });
    expect(row!.fallback_note).toMatch(/wrote the group version for Rin$/u);
    expect(row!.poster_key).toMatch(new RegExp(`^t/${world.tripId}/proposal/`, 'u'));
    const png = stored.get(row!.poster_key)!;
    expect([...png.slice(1, 4)].map((b) => String.fromCharCode(b)).join('')).toBe('PNG');
    expect(stored.size).toBe(2);
    const again = await runVersion(world.harness.pool, await version('Rin'), {
      writer: () => failing(),
    });
    expect(again.status).toBe('skipped');
  });
});

describe('reply intent', () => {
  it('turns an "out" reply into the sender\'s confirm card and nothing else', async () => {
    const decisions = createDecisionClient({ gateway: recorded('proposal-intent-02') });
    const before = await world.q(
      'SELECT rsvp FROM trip_participants WHERE trip_id = $1 ORDER BY user_id',
      [world.tripId],
    );
    const result = await runRsvpIntent(world.harness.pool, decisionIntentReader(decisions), {
      proposal_id: world.proposalId,
      user_id: world.users.Alex,
      text: "Sorry guys, I can't make it this time.",
    });
    expect(result).toEqual({ intent: 'out', card: 'confirm_out' });
    expect(
      await world.q('SELECT rsvp FROM trip_participants WHERE trip_id = $1 ORDER BY user_id', [
        world.tripId,
      ]),
    ).toEqual(before);
    expect(await world.q("SELECT 1 FROM pgboss.job WHERE name = 'trip.dropout'")).toEqual([]);
    const [sent] = await world.q<{ channel: string }>(
      "SELECT channel FROM rt_outbox WHERE payload->>'type' = 'rsvp.intent'",
    );
    expect(sent!.channel).toBe(`user:#${world.users.Alex}`);
  });
});

describe('dropout re-split', () => {
  it('builds the change list once per member and keeps shared costs whole', async () => {
    await world.q("UPDATE trip_participants SET rsvp = 'in' WHERE trip_id = $1 AND user_id <> $2", [
      world.tripId,
      world.users.Sam,
    ]);
    await world.q("UPDATE trip_participants SET rsvp = 'out' WHERE trip_id = $1 AND user_id = $2", [
      world.tripId,
      world.users.Dev,
    ]);
    const first = await runDropout(world.harness.pool, world.tripId, world.users.Dev);
    const second = await runDropout(world.harness.pool, world.tripId, world.users.Dev);
    expect(first.status).toBe('built');
    expect(second).toEqual({ status: 'already_built', dropoutId: first.dropoutId });
    const rows = await world.q<{ ops: { op: string }[]; members: { after_minor: string }[] }>(
      'SELECT ops, members FROM trip_dropouts WHERE trip_id = $1',
      [world.tripId],
    );
    expect(rows).toHaveLength(1);
    const ops = rows[0]!.ops.map((op) => op.op);
    expect(ops.filter((op) => op === 'resplit_component')).toHaveLength(2);
    expect(ops.filter((op) => op === 'remove_participant_from_item')).toHaveLength(3);
    const after = rows[0]!.members.reduce((sum, m) => sum + BigInt(m.after_minor), 0n);
    expect(after).toBe(250000n + 50000n + 12000n * 4n);
    expect(await world.q('SELECT 1 FROM change_sets WHERE trip_id = $1', [world.tripId])).toEqual(
      [],
    );
    expect(await runDropout(world.harness.pool, world.tripId, world.users.Rin)).toEqual({
      status: 'not_out',
      dropoutId: null,
    });
  });
});

describe('waitlist', () => {
  it('offers the freed seat to exactly one person, and moves on when the offer lapses', async () => {
    const [seatedOne, extra] = [crypto.randomUUID(), crypto.randomUUID()];
    for (const [id, rsvp, position] of [
      [seatedOne, 'in', null],
      [extra, 'waitlisted', 2],
    ] as const) {
      await world.q(
        "INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', 'Ines Roa')",
        [id],
      );
      await world.q('INSERT INTO crew_members (crew_id, user_id) VALUES ($1, $2)', [
        world.crewId,
        id,
      ]);
      await world.q(
        'INSERT INTO trip_participants (trip_id, user_id, rsvp, waitlist_position) VALUES ($1, $2, $3, $4)',
        [world.tripId, id, rsvp, position],
      );
    }
    const seated = await world.q<{ n: number }>(
      'SELECT count(*)::int AS n FROM trip_participants WHERE trip_id = $1 AND holds_seat',
      [world.tripId],
    );
    expect(seated[0]!.n).toBe(5);
    expect(await runProposalWaitlist(world.harness.pool, world.tripId)).toBe(1);
    expect(await runProposalWaitlist(world.harness.pool, world.tripId)).toBe(0);
    const open = () =>
      world.q<{ user_id: string }>(
        "SELECT user_id FROM seat_waitlist_offers WHERE trip_id = $1 AND status = 'offered'",
        [world.tripId],
      );
    expect(await open()).toEqual([{ user_id: world.users.Sam }]);
    await world.q("SELECT * FROM app.expire_seat_offers(now() + interval '25 hours')");
    expect(await runProposalWaitlist(world.harness.pool, world.tripId)).toBe(1);
    expect(await open()).toEqual([{ user_id: extra }]);
  });
});

describe('suggestions', () => {
  it('words resend and offer cards that never tie a name to a reason, once each', async () => {
    await world.q(
      "UPDATE trip_participants SET rsvp = 'unopened' WHERE trip_id = $1 AND user_id = $2",
      [world.tripId, world.users.Jordan],
    );
    await world.q(
      `INSERT INTO anonymous_suggestions (trip_id, proposal_id, topic, text)
       VALUES ($1, $2, 'cost', 'Someone asked about cost')`,
      [world.tripId, world.proposalId],
    );
    const first = await runSuggestions(world.harness.pool, world.proposalId, failing());
    expect(first.written).toBe(2);
    expect((await runSuggestions(world.harness.pool, world.proposalId, failing())).written).toBe(0);
    const cards = await world.q<{ kind: string; target_uid: string | null; copy: string }>(
      'SELECT kind, target_uid, copy FROM rsvp_suggestions WHERE proposal_id = $1 ORDER BY kind',
      [world.proposalId],
    );
    expect(cards.map((c) => c.kind)).toEqual(['offer', 'resend']);
    const [offer, resend] = cards;
    expect(offer!.copy).toMatch(/^Someone asked about cost/u);
    for (const name of ['Maya', 'Rin', 'Dev', 'Alex', 'Jordan', 'Sam'])
      expect(offer!.copy).not.toContain(name);
    expect(resend!.target_uid).toBe(world.users.Jordan);
    expect(resend!.copy).toMatch(/^Resend to Jordan at \d{2}:\d{2} their time\?$/u);
    expect(resend!.copy).not.toMatch(/cost|price|budget|opened|watched/iu);
    const [summary] = await world.q<{ payload: { data: unknown } }>(
      "SELECT payload FROM rt_outbox WHERE payload->>'type' = 'engagement.summary' ORDER BY id DESC LIMIT 1",
    );
    expect(summary!.payload.data).toEqual({
      proposal_id: world.proposalId,
      opened: 0,
      recipients: 5,
    });
  });
});

const tripState = async () =>
  (
    await world.q<{ trip: string; proposal: string }>(
      `SELECT t.status AS trip, p.status AS proposal FROM proposals p
         JOIN trips t ON t.id = p.trip_id WHERE p.id = $1`,
      [world.proposalId],
    )
  )[0];

describe('reply-by and follow-ups', () => {
  it('reminds once a day before, and locks once at reply-by with the unanswered on maybe', async () => {
    // Sent an hour ago with half a day to answer: its own push just went, so no reminder follows.
    await world.q(
      `UPDATE proposals SET sent_at = now() - interval '1 hour',
              reply_by = now() + interval '12 hours' WHERE id = $1`,
      [world.proposalId],
    );
    expect(await runReplyBy(world.harness.pool)).toEqual({ reminded: 0, locked: 0, confirmed: 0 });
    const early = await world.q(
      "SELECT 1 FROM domain_events WHERE type = 'proposal.reply_by_soon'",
    );
    expect(early).toEqual([]);
    // Sent three days ago, now half a day from reply-by: one reminder.
    await world.q(
      `UPDATE proposals SET sent_at = now() - interval '3 days', reminded_at = NULL WHERE id = $1`,
      [world.proposalId],
    );
    expect(await runReplyBy(world.harness.pool)).toEqual({ reminded: 1, locked: 0, confirmed: 0 });
    expect(await runReplyBy(world.harness.pool)).toEqual({ reminded: 0, locked: 0, confirmed: 0 });
    const [soon] = await world.q<{ payload: { user_ids: string[] } }>(
      "SELECT payload FROM domain_events WHERE type = 'proposal.reply_by_soon'",
    );
    expect(soon!.payload.user_ids.sort()).toEqual([world.users.Jordan, world.users.Maya].sort());
    // Only the organiser is IN: reply-by locks the proposal and leaves the trip proposed.
    await world.q(
      `UPDATE trip_participants SET rsvp = 'maybe'
        WHERE trip_id = $1 AND rsvp = 'in' AND role <> 'organiser'`,
      [world.tripId],
    );
    await world.q("UPDATE proposals SET reply_by = now() - interval '1 minute' WHERE id = $1", [
      world.proposalId,
    ]);
    expect(await runReplyBy(world.harness.pool)).toEqual({ reminded: 0, locked: 1, confirmed: 0 });
    expect(await tripState()).toEqual({ trip: 'proposed', proposal: 'locked' });
    expect(await runReplyBy(world.harness.pool)).toEqual({ reminded: 0, locked: 0, confirmed: 0 });
    const [jordan] = await world.q<{ rsvp: string }>(
      'SELECT rsvp FROM trip_participants WHERE trip_id = $1 AND user_id = $2',
      [world.tripId, world.users.Jordan],
    );
    expect(jordan!.rsvp).toBe('maybe');
  });

  it('confirms the trip at reply-by when two are in and the organiser never locked', async () => {
    await world.q(
      `UPDATE proposals SET status = 'sent', locked_at = NULL,
              reply_by = now() - interval '1 minute' WHERE id = $1`,
      [world.proposalId],
    );
    await world.q(
      `UPDATE itinerary_versions SET status = 'proposed'
        WHERE id = (SELECT current_version_id FROM trips WHERE id = $1)`,
      [world.tripId],
    );
    await world.q("UPDATE trip_participants SET rsvp = 'in' WHERE trip_id = $1 AND user_id = $2", [
      world.tripId,
      world.users.Rin,
    ]);
    expect(await runReplyBy(world.harness.pool)).toEqual({ reminded: 0, locked: 1, confirmed: 1 });
    expect(await tripState()).toEqual({ trip: 'confirmed', proposal: 'locked' });
    const [version] = await world.q<{ status: string }>(
      `SELECT v.status FROM itinerary_versions v JOIN trips t ON t.current_version_id = v.id
        WHERE t.id = $1`,
      [world.tripId],
    );
    expect(version!.status).toBe('current');
    // Nobody is moved off the trip on this path: a maybe stays a maybe.
    const [jordan] = await world.q<{ rsvp: string }>(
      'SELECT rsvp FROM trip_participants WHERE trip_id = $1 AND user_id = $2',
      [world.tripId, world.users.Jordan],
    );
    expect(jordan!.rsvp).toBe('maybe');
    const moved = await world.q<{ actor_kind: string }>(
      `SELECT actor_kind FROM domain_events WHERE type = 'trip.status_changed'
          AND aggregate_id = $1 AND payload->>'to' = 'confirmed'`,
      [world.tripId],
    );
    expect(moved).toEqual([{ actor_kind: 'system' }]);
    expect(await runReplyBy(world.harness.pool)).toEqual({ reminded: 0, locked: 0, confirmed: 0 });
  });

  it('delivers a due follow-up once, naming nobody in the event', async () => {
    await world.q(
      `INSERT INTO proposal_followups (proposal_id, trip_id, user_id, kind, due_at)
       VALUES ($1, $2, $3, 'followup', now() - interval '1 minute')`,
      [world.proposalId, world.tripId, world.users.Rin],
    );
    expect(await runFollowups(world.harness.pool)).toEqual({ delivered: 1 });
    expect(await runFollowups(world.harness.pool)).toEqual({ delivered: 0 });
    const events = await world.q<{ payload: unknown }>(
      "SELECT payload FROM domain_events WHERE type = 'followup.due'",
    );
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(world.users.Rin);
  });
});

describe('what a version is written from', () => {
  const context = async () =>
    (
      await loadVersionContext(world.harness.pool, {
        version_id: world.versionId,
        proposal_id: world.proposalId,
        trip_id: world.tripId,
        recipient_id: world.users.Rin,
        plan_version_id: world.versionId,
        show_cost: false,
        personal: true,
        status: 'pending',
        attempts: 0,
        organiser_name: 'Maya',
      })
    ).context;

  it('names the route of a two-stop trip, and nothing new for one stop', async () => {
    const city = async (name: string) =>
      (
        await world.q<{ id: string }>(
          `INSERT INTO destinations (slug, name, coverage, currency, tz)
           VALUES ($1, $2, 'guest', 'VND', 'Asia/Ho_Chi_Minh') RETURNING id`,
          [`${name.toLowerCase().replace(' ', '-')}-route`, name],
        )
      )[0]!.id;
    const daNang = await city('Da Nang');
    const hue = await city('Hue');
    await world.q(
      "UPDATE trips SET destination_id = $2, start_date = '2027-03-01', end_date = '2027-03-05' WHERE id = $1",
      [world.tripId, daNang],
    );
    const oneStop = await context();
    expect(oneStop.destination).toBe('Da Nang');
    expect('route' in oneStop).toBe(false);
    expect(oneStop.items.some((item) => 'city' in item)).toBe(false);

    await world.q(
      `INSERT INTO destination_links (key, from_destination_id, to_destination_id, kind, minutes,
                                      mode, sources)
       VALUES ('danang>hue:onward', $1, $2, 'onward', 150, 'train', $3)`,
      [
        daNang,
        hue,
        JSON.stringify([{ url: 'https://example.org/hue', title: 'Hue', quote: '2 h 30' }]),
      ],
    );
    await world.q(
      `INSERT INTO trip_stops (trip_id, crew_id, position, destination_id, nights)
       VALUES ($1, $2, 1, $3, 2), ($1, $2, 2, $4, 2)`,
      [world.tripId, world.crewId, daNang, hue],
    );
    const [day] = await world.q<{ id: string }>(
      'INSERT INTO plan_days (version_id, trip_id, day_no, destination_id) VALUES ($1, $2, 3, $3) RETURNING id',
      [world.versionId, world.tripId, hue],
    );
    const [citadel] = await world.q<{ stable_id: string }>(
      `INSERT INTO plan_items (version_id, day_id, trip_id, category)
       VALUES ($1, $2, $3, 'sight') RETURNING stable_id`,
      [world.versionId, day!.id, world.tripId],
    );
    const estimated = await context();
    expect(estimated.route).toEqual([
      { city: 'Da Nang', nights: 2, travel: null },
      { city: 'Hue', nights: 2, travel: { mode: 'train', minutes: 150 } },
    ]);
    expect(estimated.items.find((item) => item.id === citadel!.stable_id)?.city).toBe('Hue');
    expect(estimated.items.find((item) => item.id === world.items[0])?.city).toBe('Da Nang');

    // The crew's own flight on the day they reach Hue replaces the estimate.
    const [booking] = await world.q<{ id: string }>(
      `INSERT INTO bookings (trip_id, owner_id, type, title, visibility, supplier, traveller_ids)
       VALUES ($1, $2, 'flight', 'Flight', 'crew', 'airline', $3::uuid[]) RETURNING id`,
      [world.tripId, world.users.Maya, [world.users.Maya]],
    );
    await world.q(
      `INSERT INTO plan_items (version_id, day_id, trip_id, category, booking_id)
       VALUES ($1, $2, $3, 'flight', $4)`,
      [world.versionId, day!.id, world.tripId, booking!.id],
    );
    expect((await context()).route?.[1]?.travel).toEqual({ mode: 'flight', booked: true });
  });
});
