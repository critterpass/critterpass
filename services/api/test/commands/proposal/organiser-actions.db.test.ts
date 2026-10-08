/**
 * What the organiser does from the RSVP tracker, against a migrated Postgres through `/v1/cmd`:
 * acting on a guide suggestion (a resend scheduled for the member, an offer published to all
 * without naming who asked), dismissing one, and choosing whether a member who dropped out keeps
 * reading the crew chat. Members never see the suggestions, and an offer needs a crew of four.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerProposalCommands } from '../../../src/commands/proposal';
import { startJobProducer } from '../../../src/jobs/producer';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../../routes/command-doors-harness';
import { seedProposalTrip, type ProposalFixture } from './fixture';

interface CommandBody {
  readonly result: Record<string, unknown>;
  readonly error: { code: string; detail: Record<string, unknown> };
}

let harness: CommandDoorsHarness;
let boss: PgBoss;
let organiser: SignedIn;
let members: SignedIn[];
let outsider: SignedIn;
let fx: ProposalFixture;
let proposalId: string;

const m = (n: number) => members[n - 1]!;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function run(who: SignedIn, cmd: string, payload: unknown) {
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify(envelope(cmd, payload, { actor: { uid: who.uid, via: 'app' } })),
  });
  return { status: response.status, body: (await response.json()) as CommandBody };
}

async function suggest(
  kind: 'resend' | 'offer' | 'nudge',
  payload: Record<string, unknown>,
  targetUid: string | null = null,
): Promise<string> {
  const [row] = await q<{ id: string }>(
    `INSERT INTO rsvp_suggestions (proposal_id, trip_id, kind, target_uid, payload, copy, dedupe_key)
     VALUES ($1, $2, $3, $4, $5::jsonb, 'Guide suggestion', $6) RETURNING id`,
    [proposalId, fx.tripId, kind, targetUid, JSON.stringify(payload), generateUuidV7()],
  );
  return row!.id;
}

const statusOf = async (id: string) =>
  (await q<{ status: string }>('SELECT status FROM rsvp_suggestions WHERE id = $1', [id]))[0]!
    .status;
const eventsOf = async (type: string) =>
  (
    await harness.pool.query<{ actor_id: string | null; payload: Record<string, unknown> }>(
      'SELECT actor_id, payload FROM domain_events WHERE type = $1 AND trip_id = $2',
      [type, fx.tripId],
    )
  ).rows;

beforeAll(async () => {
  harness = await startCommandDoors(registerProposalCommands);
  boss = await startJobProducer({
    connectionString: (harness.pool.options as { connectionString: string }).connectionString,
    logger: pino({ level: 'silent' }),
    startAttempts: 5,
  });
  organiser = await harness.signInAnonymously();
  members = [];
  for (let i = 0; i < 7; i += 1) members.push(await harness.signInAnonymously());
  outsider = await harness.signInAnonymously();
  fx = await seedProposalTrip(harness.pool, organiser, members);
  const created = await run(organiser, 'create_proposal', { trip_id: fx.tripId, config: {} });
  expect(created.status).toBe(200);
  proposalId = created.body.result['proposal_id'] as string;
  expect((await run(organiser, 'send_proposal', { proposal_id: proposalId })).status).toBe(200);
}, 240_000);

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await harness?.stop();
});

describe('execute_rsvp_suggestion', () => {
  it('schedules a resend for the member at the suggested time, once', async () => {
    const dueAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const id = await suggest('resend', { due_at: dueAt }, m(5).uid);
    const done = await run(organiser, 'execute_rsvp_suggestion', { suggestion_id: id });
    expect(done.body.result).toEqual({ suggestion_id: id, status: 'executed' });
    expect(await statusOf(id)).toBe('executed');
    const followups = await q<{ due_at: Date; status: string }>(
      `SELECT due_at, status FROM proposal_followups
        WHERE proposal_id = $1 AND user_id = $2 AND kind = 'resend'`,
      [proposalId, m(5).uid],
    );
    expect(followups.map((f) => [f.due_at.toISOString(), f.status])).toEqual([
      [dueAt, 'scheduled'],
    ]);
    expect((await eventsOf('suggestion.executed')).map((e) => e.actor_id)).toEqual([organiser.uid]);

    const again = await run(organiser, 'execute_rsvp_suggestion', { suggestion_id: id });
    expect(again.body.error).toMatchObject({
      code: 'STATE_INVALID',
      detail: { state: 'executed' },
    });
  });

  it('publishes an offer to everyone without naming anyone', async () => {
    const id = await suggest('offer', { option: { kind: 'skip_day', id: 'day-3' } });
    const done = await run(organiser, 'execute_rsvp_suggestion', { suggestion_id: id });
    expect(done.body.result).toEqual({ suggestion_id: id, status: 'executed' });
    const offers = await eventsOf('proposal.offer_published');
    expect(offers).toHaveLength(1);
    expect(offers[0]!.payload).toEqual({
      trip_id: fx.tripId,
      proposal_id: proposalId,
      topic: 'plan',
    });
    for (const member of members) expect(JSON.stringify(offers)).not.toContain(member.uid);
  });

  it('is hidden from members and strangers, and refuses one that does not exist', async () => {
    const id = await suggest('nudge', {}, m(6).uid);
    for (const who of [m(1), outsider]) {
      const peeked = await run(who, 'execute_rsvp_suggestion', { suggestion_id: id });
      expect(peeked.body.error).toMatchObject({
        code: 'NOT_FOUND',
        detail: { reason: 'suggestion' },
      });
    }
    const unknown = await run(organiser, 'execute_rsvp_suggestion', {
      suggestion_id: generateUuidV7(),
    });
    expect(unknown.body.error.code).toBe('NOT_FOUND');
    expect(await statusOf(id)).toBe('open');
  });
});

describe('dismiss_rsvp_suggestion', () => {
  it('takes the suggestion off the tracker without acting on it', async () => {
    const id = await suggest(
      'resend',
      { due_at: new Date(Date.now() + 86_400_000).toISOString() },
      m(7).uid,
    );
    const byMember = await run(m(7), 'dismiss_rsvp_suggestion', { suggestion_id: id });
    expect(byMember.body.error.code).toBe('NOT_FOUND');

    const dismissed = await run(organiser, 'dismiss_rsvp_suggestion', { suggestion_id: id });
    expect(dismissed.body.result).toEqual({ suggestion_id: id, status: 'dismissed' });
    expect(await statusOf(id)).toBe('dismissed');
    const followups = await q(
      "SELECT 1 FROM proposal_followups WHERE user_id = $1 AND kind = 'resend'",
      [m(7).uid],
    );
    expect(followups).toEqual([]);
    expect(await eventsOf('suggestion.dismissed')).toHaveLength(1);

    const executed = await run(organiser, 'execute_rsvp_suggestion', { suggestion_id: id });
    expect(executed.body.error).toMatchObject({
      code: 'STATE_INVALID',
      detail: { state: 'dismissed' },
    });
  });
});

describe('set_keep_in_chat', () => {
  const keep = async (uid: string) =>
    (
      await q<{ keep_in_chat: boolean }>(
        'SELECT keep_in_chat FROM crew_members WHERE crew_id = $1 AND user_id = $2',
        [fx.crewId, uid],
      )
    )[0]?.keep_in_chat;

  it('lets an organiser keep a member in the chat, and change their mind', async () => {
    const kept = await run(organiser, 'set_keep_in_chat', {
      crew_id: fx.crewId,
      uid: m(3).uid,
      keep: true,
    });
    expect(kept.body.result).toEqual({ crew_id: fx.crewId, uid: m(3).uid, keep: true });
    expect(await keep(m(3).uid)).toBe(true);
    await run(organiser, 'set_keep_in_chat', { crew_id: fx.crewId, uid: m(3).uid, keep: false });
    expect(await keep(m(3).uid)).toBe(false);
    expect(await eventsOfCrew('crew.member_updated')).toBe(2);
  });

  it('is the organisers’ alone, and only for someone in the crew', async () => {
    for (const who of [m(1), outsider]) {
      const refused = await run(who, 'set_keep_in_chat', {
        crew_id: fx.crewId,
        uid: m(3).uid,
        keep: true,
      });
      expect(refused.body.error).toMatchObject({
        code: 'FORBIDDEN',
        detail: { reason: 'organiser_only' },
      });
    }
    expect(await keep(m(3).uid)).toBe(false);
    const stranger = await run(organiser, 'set_keep_in_chat', {
      crew_id: fx.crewId,
      uid: outsider.uid,
      keep: true,
    });
    expect(stranger.body.error).toMatchObject({ code: 'NOT_FOUND', detail: { reason: 'member' } });
  });
});

describe('an offer in a crew of three', () => {
  it('is refused, since the timing alone would name who asked', async () => {
    await q(
      "UPDATE crew_members SET status = 'left' WHERE crew_id = $1 AND user_id = ANY($2::uuid[])",
      [fx.crewId, members.slice(2).map((member) => member.uid)],
    );
    const id = await suggest('offer', { option: { kind: 'cheaper_room', id: 'room-2' } });
    const refused = await run(organiser, 'execute_rsvp_suggestion', { suggestion_id: id });
    expect(refused.body.error).toMatchObject({ code: 'K_ANON_UNAVAILABLE' });
    expect(await statusOf(id)).toBe('open');
  });
});

async function eventsOfCrew(type: string): Promise<number> {
  const { rows } = await harness.pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM domain_events WHERE type = $1 AND crew_id = $2',
    [type, fx.crewId],
  );
  return rows[0]!.n;
}
