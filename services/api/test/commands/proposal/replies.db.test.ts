/**
 * The quieter replies to a sent proposal, against a migrated Postgres through `/v1/cmd`: a public
 * reaction that moves the hype bar, a private "ask me later" that replaces the one before it and
 * names nobody, and the option a member picks in their private thread ("ask the crew" writes one
 * nameless line, and only in a crew of four or more). All three belong to recipients only.
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

const TZ = 'Asia/Ho_Chi_Minh';
const TZ_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

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

/** A wall time `days` from now in `TZ`, and the instant it stands for. */
function localIn(days: number): { atLocal: string; instant: string } {
  const minute = Math.floor((Date.now() + days * DAY_MS) / 60_000) * 60_000;
  return {
    atLocal: new Date(minute + TZ_OFFSET_MS).toISOString().slice(0, 16),
    instant: new Date(minute).toISOString(),
  };
}

const reactions = (uid: string) =>
  q<{ kind: string }>(
    'SELECT kind FROM proposal_reactions WHERE proposal_id = $1 AND user_id = $2 ORDER BY id',
    [proposalId, uid],
  );
const followups = (uid: string) =>
  q<{ status: string; due_at: Date }>(
    `SELECT status, due_at FROM proposal_followups
      WHERE proposal_id = $1 AND user_id = $2 AND kind = 'followup' ORDER BY created_at, id`,
    [proposalId, uid],
  );

async function seedThread(owner: SignedIn, options: readonly Record<string, unknown>[]) {
  const [row] = await q<{ id: string }>(
    `INSERT INTO private_guide_threads (trip_id, proposal_id, owner_id, reason, offered_options)
     VALUES ($1, $2, $3, 'cost', $4::jsonb) RETURNING id`,
    [fx.tripId, proposalId, owner.uid, JSON.stringify(options)],
  );
  return row!.id;
}

const option = (id: string, kind: string, shared: boolean) => ({
  id,
  kind,
  label: id,
  delta_minor: null,
  display_delta_minor: null,
  currency: null,
  shared,
});
const ASK_CREW = option('ask_crew', 'ask_crew', true);
const FOLLOW_UP = option('follow_up', 'follow_up', false);

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
}, 240_000);

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await harness?.stop();
});

describe('before the proposal is sent', () => {
  it('takes no reaction and no follow-up from a member', async () => {
    const reacted = await run(m(1), 'react_proposal', {
      proposal_id: proposalId,
      reaction: 'im_in',
    });
    expect(reacted.status).not.toBe(200);
    const later = await run(m(1), 'schedule_proposal_followup', {
      proposal_id: proposalId,
      at_local: localIn(2).atLocal,
      tz: TZ,
    });
    expect(later.status).not.toBe(200);
    expect(await reactions(m(1).uid)).toEqual([]);
    expect(await followups(m(1).uid)).toEqual([]);

    expect((await run(organiser, 'send_proposal', { proposal_id: proposalId })).status).toBe(200);
  });
});

describe('react_proposal', () => {
  it('posts the reaction, tells the crew and moves the hype bar', async () => {
    const reacted = await run(m(1), 'react_proposal', {
      proposal_id: proposalId,
      reaction: 'okay_wow',
    });
    expect(reacted.status).toBe(200);
    // One of seven recipients has reacted and nobody has boarded yet.
    expect(reacted.body.result['hype_pct']).toBe(14);
    expect(await reactions(m(1).uid)).toEqual([{ kind: 'okay_wow' }]);
    const { rows: events } = await harness.pool.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM domain_events WHERE type = 'proposal.reacted' AND aggregate_id = $1`,
      [proposalId],
    );
    expect(events.map((event) => event.payload)).toEqual([
      { trip_id: fx.tripId, proposal_id: proposalId, user_id: m(1).uid, reaction: 'okay_wow' },
    ]);

    const second = await run(m(2), 'react_proposal', { proposal_id: proposalId, reaction: 'fire' });
    expect(second.body.result['hype_pct']).toBe(29);
    // The same member reacting again adds a reaction, not a second person.
    const again = await run(m(1), 'react_proposal', { proposal_id: proposalId, reaction: 'heart' });
    expect(again.body.result['hype_pct']).toBe(29);
    const [hype] = await q<{ reacted_count: number; recipients: number }>(
      'SELECT reacted_count, recipients FROM hype_aggregates WHERE proposal_id = $1',
      [proposalId],
    );
    expect(hype).toEqual({ reacted_count: 2, recipients: 7 });
  });

  it('refuses the organiser who sent it, and someone outside the crew', async () => {
    const own = await run(organiser, 'react_proposal', {
      proposal_id: proposalId,
      reaction: 'fire',
    });
    expect(own.body.error).toMatchObject({
      code: 'NOT_ELIGIBLE',
      detail: { reason: 'not_a_recipient' },
    });
    const stranger = await run(outsider, 'react_proposal', {
      proposal_id: proposalId,
      reaction: 'fire',
    });
    expect(stranger.status).not.toBe(200);
    expect(await reactions(organiser.uid)).toEqual([]);
    expect(await reactions(outsider.uid)).toEqual([]);
  });

  it('refuses a reaction once the proposal is locked', async () => {
    await q("UPDATE proposals SET status = 'locked' WHERE id = $1", [proposalId]);
    try {
      const late = await run(m(3), 'react_proposal', { proposal_id: proposalId, reaction: 'fire' });
      expect(late.body.error).toMatchObject({ code: 'STATE_INVALID', detail: { state: 'locked' } });
      expect(await reactions(m(3).uid)).toEqual([]);
    } finally {
      await q("UPDATE proposals SET status = 'sent' WHERE id = $1", [proposalId]);
    }
  });
});

describe('schedule_proposal_followup', () => {
  it('schedules at the member’s local time, and a later one replaces it', async () => {
    const first = localIn(2);
    const scheduled = await run(m(4), 'schedule_proposal_followup', {
      proposal_id: proposalId,
      at_local: first.atLocal,
      tz: TZ,
    });
    expect(scheduled.status).toBe(200);
    expect(scheduled.body.result['due_at']).toBe(first.instant);

    const second = localIn(4);
    const moved = await run(m(4), 'schedule_proposal_followup', {
      proposal_id: proposalId,
      at_local: second.atLocal,
      tz: TZ,
    });
    expect(moved.body.result['due_at']).toBe(second.instant);
    const rows = await followups(m(4).uid);
    expect(rows.map((row) => [row.status, row.due_at.toISOString()])).toEqual([
      ['cancelled', first.instant],
      ['scheduled', second.instant],
    ]);
  });

  it('names nobody in the event it leaves', async () => {
    const { rows: events } = await harness.pool.query<{
      actor_id: string | null;
      payload: unknown;
    }>(
      `SELECT actor_id, payload FROM domain_events
        WHERE type = 'followup.scheduled' AND trip_id = $1`,
      [fx.tripId],
    );
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.actor_id === null)).toBe(true);
    expect(JSON.stringify(events)).not.toContain(m(4).uid);
  });

  it('refuses a time in the past and a zone that does not exist', async () => {
    const past = await run(m(5), 'schedule_proposal_followup', {
      proposal_id: proposalId,
      at_local: '2020-01-05T09:00',
      tz: TZ,
    });
    expect(past.body.error).toMatchObject({
      code: 'VALIDATION',
      detail: { field: 'at_local', reason: 'in_past' },
    });
    const nowhere = await run(m(5), 'schedule_proposal_followup', {
      proposal_id: proposalId,
      at_local: localIn(2).atLocal,
      tz: 'Mars/Olympus_Mons',
    });
    expect(nowhere.body.error).toMatchObject({ code: 'VALIDATION', detail: { field: 'tz' } });
    expect(await followups(m(5).uid)).toEqual([]);
  });

  it('refuses the organiser and someone outside the crew', async () => {
    const payload = { proposal_id: proposalId, at_local: localIn(2).atLocal, tz: TZ };
    const own = await run(organiser, 'schedule_proposal_followup', payload);
    expect(own.body.error.code).toBe('NOT_ELIGIBLE');
    const stranger = await run(outsider, 'schedule_proposal_followup', payload);
    expect(stranger.status).not.toBe(200);
    expect(await followups(organiser.uid)).toEqual([]);
    expect(await followups(outsider.uid)).toEqual([]);
  });
});

describe('choose_private_option', () => {
  let threadId: string;
  const thread = (id: string) =>
    q<{ chosen_option: string | null; suggestion: string | null }>(
      `SELECT chosen_option, anonymous_suggestion_id::text AS suggestion
         FROM private_guide_threads WHERE id = $1`,
      [id],
    );
  const suggestions = () =>
    q<{ topic: string }>('SELECT topic FROM anonymous_suggestions WHERE proposal_id = $1', [
      proposalId,
    ]);

  it('keeps a personal option on the thread without telling the crew', async () => {
    threadId = await seedThread(m(2), [FOLLOW_UP, ASK_CREW]);
    const chosen = await run(m(2), 'choose_private_option', {
      thread_id: threadId,
      option_id: 'follow_up',
    });
    expect(chosen.body.result).toEqual({
      thread_id: threadId,
      option_id: 'follow_up',
      anonymous: false,
    });
    expect(await thread(threadId)).toEqual([{ chosen_option: 'follow_up', suggestion: null }]);
    expect(await suggestions()).toEqual([]);
  });

  it('refuses an option the thread never offered, and anyone but its owner', async () => {
    const invented = await run(m(2), 'choose_private_option', {
      thread_id: threadId,
      option_id: 'skip_everything',
    });
    expect(invented.body.error).toMatchObject({
      code: 'VALIDATION',
      detail: { field: 'option_id', reason: 'not_offered' },
    });
    for (const other of [m(1), organiser, outsider]) {
      const peeked = await run(other, 'choose_private_option', {
        thread_id: threadId,
        option_id: 'ask_crew',
      });
      expect(peeked.body.error).toMatchObject({ code: 'NOT_FOUND', detail: { reason: 'thread' } });
    }
    expect(await thread(threadId)).toEqual([{ chosen_option: 'follow_up', suggestion: null }]);
    expect(await suggestions()).toEqual([]);
  });

  it('writes one nameless line for "ask the crew", however often it is chosen', async () => {
    const payload = { thread_id: threadId, option_id: 'ask_crew' };
    const asked = await run(m(2), 'choose_private_option', payload);
    expect(asked.body.result).toMatchObject({ option_id: 'ask_crew', anonymous: true });
    expect((await run(m(2), 'choose_private_option', payload)).status).toBe(200);
    expect(await suggestions()).toEqual([{ topic: 'cost' }]);
    const [row] = await thread(threadId);
    expect(row).toMatchObject({ chosen_option: 'ask_crew' });
    expect(row!.suggestion).not.toBeNull();
    const line = await q<Record<string, unknown>>(
      'SELECT * FROM anonymous_suggestions WHERE proposal_id = $1',
      [proposalId],
    );
    expect(JSON.stringify(line)).not.toContain(m(2).uid);
  });

  it('refuses "ask the crew" in a crew of three, where the timing alone would name them', async () => {
    const small = await seedThread(m(1), [ASK_CREW]);
    // Five of the eight leave: the organiser, m1 and m2 remain.
    await q(
      "UPDATE crew_members SET status = 'left' WHERE crew_id = $1 AND user_id = ANY($2::uuid[])",
      [fx.crewId, members.slice(2).map((member) => member.uid)],
    );
    const asked = await run(m(1), 'choose_private_option', {
      thread_id: small,
      option_id: 'ask_crew',
    });
    expect(asked.body.error).toMatchObject({ code: 'K_ANON_UNAVAILABLE', detail: { min_crew: 4 } });
    expect(await thread(small)).toEqual([{ chosen_option: null, suggestion: null }]);
    expect(await suggestions()).toHaveLength(1);
  });
});
