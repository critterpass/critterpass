/**
 * The poll jobs against a migrated Postgres with pinned clocks: the deadline closes a final on the
 * frozen-price tie rule (trip won, reveals filed, vote cards settled) once; the board's deadline
 * advances the top two, asks the organiser on a tie, crowns a lone place or waits when empty;
 * reminders reach only the voters who have not voted; the inbox files a vote card per voter and
 * a ballot settles it.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fanOutEvent, registerHomeInboxFanouts } from '../../src/jobs/inbox';
import { getRegistration, type RoutedEvent } from '../../src/jobs/notify/register';
import {
  advanceBoardAtDeadline,
  closePollAtDeadline,
  registerPollFanouts,
  remindPendingVoters,
} from '../../src/jobs/polls';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

const NOW = new Date('2026-10-20T08:00:00Z');
const PAST = new Date('2026-10-20T07:00:00Z');
const FUTURE = new Date('2026-10-21T08:00:00Z');

let harness: JobsHarness;
let crewId: string;
let voters: string[];

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await harness.pool.query(sql, params)).rows as T[];
}

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const [row] = await q<T>(sql, params);
  if (row === undefined) throw new Error(`no row: ${sql}`);
  return row;
}

interface Built {
  pollId: string;
  tripId: string;
  options: Record<string, string>;
  places: Record<string, string>;
}

/** A voting trip with a destination poll in `stage`, its places and the given ballots. */
async function destinationVote(
  stage: 'board' | 'final',
  labels: readonly string[],
  ballots: Readonly<Record<number, string>>,
  closesAt: Date,
): Promise<Built> {
  await q("UPDATE polls SET status = 'cancelled' WHERE crew_id = $1 AND status = 'open'", [crewId]);
  const { id: tripId } = await one<{ id: string }>(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
    [crewId],
  );
  await q(
    "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'organiser', 'in')",
    [tripId, voters[0]],
  );
  const { id: pollId } = await one<{ id: string }>(
    `INSERT INTO polls (crew_id, trip_id, kind, stage, created_by, eligible_voter_ids, closes_at, tie_rule)
     VALUES ($1, $2, 'destination', $3, $4, $5::uuid[], $6, $7) RETURNING id`,
    [
      crewId,
      tripId,
      stage,
      voters[0],
      voters,
      closesAt,
      stage === 'final' ? 'cheaper_for_majority_origin' : 'organiser_pick',
    ],
  );
  const options: Record<string, string> = {};
  const places: Record<string, string> = {};
  for (const [position, label] of labels.entries()) {
    const { id: place } = await one<{ id: string }>(
      "INSERT INTO destinations (slug, name, coverage) VALUES ($1, $2, 'guest') RETURNING id",
      [`${label.toLowerCase()}-${randomUUID().slice(0, 6)}`, label],
    );
    const { id: pitch } = await one<{ id: string }>(
      `INSERT INTO pitches (crew_id, trip_id, destination_id, cache_key, status)
       VALUES ($1, $2, $3, 'k', $4) RETURNING id`,
      [crewId, tripId, place, stage === 'final' ? 'final' : 'on_board'],
    );
    const { id } = await one<{ id: string }>(
      `INSERT INTO poll_options (poll_id, crew_id, kind, ref_id, label, pitch_id, position)
       VALUES ($1, $2, 'destination', $3, $4, $5, $6) RETURNING id`,
      [pollId, crewId, place, label, pitch, position],
    );
    options[label] = id;
    places[label] = place;
  }
  for (const [voter, label] of Object.entries(ballots)) {
    await q(
      `INSERT INTO ballots (poll_id, option_id, crew_id, user_id, op_id, cast_at)
       VALUES ($1, $2, $3, $4, gen_random_uuid(), $5)`,
      [pollId, options[label], crewId, voters[Number(voter)], PAST],
    );
  }
  return { pollId, tripId, options, places };
}

async function lastEvent(type: string, aggregateId: string) {
  return one<{
    id: string;
    type: string;
    payload: Record<string, unknown>;
    crew_id: string;
    trip_id: string | null;
    occurred_at: Date;
  }>(
    'SELECT id, type, payload, crew_id, trip_id, occurred_at FROM domain_events WHERE type = $1 AND aggregate_id = $2 ORDER BY occurred_at DESC LIMIT 1',
    [type, aggregateId],
  );
}

function routed(event: Awaited<ReturnType<typeof lastEvent>>): RoutedEvent {
  return {
    id: event.id,
    type: event.type,
    payload: event.payload,
    crewId: event.crew_id,
    tripId: event.trip_id,
    actorId: null,
    occurredAt: event.occurred_at,
  };
}

beforeAll(async () => {
  harness = await startJobsHarness();
  registerHomeInboxFanouts();
  registerPollFanouts();
  voters = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  for (const [i, id] of voters.entries()) {
    await q(
      "INSERT INTO users (id, status, home_airport, display_name) VALUES ($1, 'registered', $2, $3)",
      [id, i === 3 ? 'SGN' : 'SIN', `Voter${i} Tan`],
    );
  }
  ({ id: crewId } = await one<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Vote crew', $1) RETURNING id",
    [voters[0]],
  ));
  for (const [i, id] of voters.entries()) {
    await q('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crewId,
      id,
      i === 0 ? 'organiser' : 'member',
    ]);
  }
}, 240_000);

afterAll(async () => {
  await harness.close();
});

describe('poll.close at the deadline', () => {
  it('breaks a 2–2 final on the frozen price and settles the trip once', async () => {
    const vote = await destinationVote(
      'final',
      ['Kyoto', 'Lisbon'],
      { 0: 'Lisbon', 1: 'Kyoto', 2: 'Kyoto', 3: 'Lisbon' },
      PAST,
    );
    for (const [label, amount] of [
      ['Kyoto', 41_200],
      ['Lisbon', 85_200],
    ] as const) {
      await q(
        `WITH quote AS (
           INSERT INTO price_quotes (trip_id, kind, origin, destination_id, amount_minor, currency, source, fetched_at, frozen_at)
           VALUES ($1, 'flight', 'SIN', $2, $3, 'USD', 'travelpayouts', $4, $4) RETURNING id)
         UPDATE poll_options SET frozen_quote_id = (SELECT id FROM quote) WHERE id = $5`,
        [vote.tripId, vote.places[label], amount, PAST, vote.options[label]],
      );
    }
    await q(
      `INSERT INTO inbox_items (user_id, kind, needs_you, resolve_key) VALUES ($1, 'poll.vote_needed', true, $2)`,
      [voters[1], `poll:${voters[1]}:${vote.pollId}`],
    );
    expect(await closePollAtDeadline(harness.pool, vote.pollId, NOW)).toBe('closed');
    expect(await closePollAtDeadline(harness.pool, vote.pollId, NOW)).toBe('already_closed');
    const poll = await one<{
      winner_option_id: string;
      close_reason: string;
      result: { tie: { cheaper_by_minor: number; member_count: number } };
    }>('SELECT winner_option_id, close_reason, result FROM polls WHERE id = $1', [vote.pollId]);
    expect(poll.winner_option_id).toBe(vote.options['Kyoto']);
    expect(poll.close_reason).toBe('deadline');
    expect(poll.result.tie).toMatchObject({ cheaper_by_minor: 44_000, member_count: 3 });
    expect(
      await one('SELECT status, destination_id FROM trips WHERE id = $1', [vote.tripId]),
    ).toEqual({
      status: 'won',
      destination_id: vote.places['Kyoto'],
    });
    expect(
      await q('SELECT 1 FROM poll_reveals WHERE poll_id = $1 AND seen_at IS NULL', [vote.pollId]),
    ).toHaveLength(4);
    expect(
      await q('SELECT 1 FROM inbox_items WHERE resolve_key = $1 AND resolved_at IS NOT NULL', [
        `poll:${voters[1]}:${vote.pollId}`,
      ]),
    ).toHaveLength(1);
    const winner = getRegistration('poll.closed', 'winner_revealed');
    const closed = routed(await lastEvent('poll.closed', vote.pollId));
    const push = await harness.pool.connect();
    try {
      expect(await winner!.audience(push, closed)).toHaveLength(4);
      const composed = await winner!.compose(push, closed, voters[1]!);
      expect(composed?.vars).toMatchObject({ place: 'Kyoto', score: '2–2' });
    } finally {
      push.release();
    }
  });

  it('leaves a poll whose deadline moved later alone', async () => {
    const vote = await destinationVote('final', ['Oslo', 'Rome'], {}, FUTURE);
    expect(await closePollAtDeadline(harness.pool, vote.pollId, NOW)).toBe('not_due');
  });
});

describe('poll.board_advance', () => {
  it('advances the top two and drops the other ballots', async () => {
    const vote = await destinationVote(
      'board',
      ['Bali', 'Porto', 'Hanoi'],
      { 0: 'Bali', 1: 'Bali', 2: 'Porto', 3: 'Hanoi' },
      PAST,
    );
    await q('UPDATE polls SET closes_at = $2 WHERE id = $1', [vote.pollId, PAST]);
    // Hanoi and Porto tie for the second spot: the organiser is asked.
    expect(await advanceBoardAtDeadline(harness.pool, vote.pollId, NOW)).toBe('needs_pick');
    const pick = await lastEvent('poll.pick_needed', vote.pollId);
    const filed = await fanOutEvent(harness.pool, pick.id, NOW);
    expect(filed.filed).toBe(1);
    expect(await q("SELECT user_id FROM inbox_items WHERE kind = 'poll.pick_needed'")).toEqual([
      { user_id: voters[0] },
    ]);
    await q('DELETE FROM ballots WHERE poll_id = $1 AND user_id = $2', [vote.pollId, voters[3]]);
    await q('UPDATE polls SET closes_at = $2 WHERE id = $1', [vote.pollId, PAST]);
    expect(await advanceBoardAtDeadline(harness.pool, vote.pollId, NOW)).toBe('advanced');
    const poll = await one<{ stage: string; closes_at: Date }>(
      'SELECT stage, closes_at FROM polls WHERE id = $1',
      [vote.pollId],
    );
    expect(poll.stage).toBe('final');
    expect(poll.closes_at.getTime()).toBe(NOW.getTime() + 72 * 3600 * 1000);
    const stage = await lastEvent('poll.stage_changed', vote.pollId);
    await fanOutEvent(harness.pool, stage.id, NOW);
    expect(
      await q("SELECT 1 FROM inbox_items WHERE kind = 'poll.pick_needed' AND resolved_at IS NULL"),
    ).toEqual([]);
    const finalCards = await q<{ user_id: string }>(
      "SELECT user_id FROM inbox_items WHERE kind = 'poll.final_open'",
    );
    expect(finalCards.map((row) => row.user_id)).toEqual([voters[3]]);
  });

  it('crowns a lone place and waits on an empty board', async () => {
    const lone = await destinationVote('board', ['Cusco'], {}, PAST);
    expect(await advanceBoardAtDeadline(harness.pool, lone.pollId, NOW)).toBe('single_winner');
    expect(await one('SELECT status FROM trips WHERE id = $1', [lone.tripId])).toEqual({
      status: 'won',
    });
    const empty = await destinationVote('board', [], {}, PAST);
    expect(await advanceBoardAtDeadline(harness.pool, empty.pollId, NOW)).toBe('extended');
    expect(
      await q(
        "SELECT 1 FROM scheduled_events WHERE kind = 'poll.board_advance' AND ref_id = $1 AND status = 'pending'",
        [empty.pollId],
      ),
    ).toHaveLength(1);
  });
});

describe('reminders and the inbox', () => {
  it('reminds only the voters who have not voted', async () => {
    const vote = await destinationVote(
      'final',
      ['Seoul', 'Taipei'],
      { 0: 'Seoul', 1: 'Taipei' },
      FUTURE,
    );
    expect(await remindPendingVoters(harness.pool, vote.pollId, '24h', NOW)).toBe('reminded');
    const reminder = getRegistration('poll.closing_soon', 'vote_closing');
    const client = await harness.pool.connect();
    try {
      const audience = await reminder!.audience(
        client,
        routed(await lastEvent('poll.closing_soon', vote.pollId)),
      );
      expect([...audience].sort()).toEqual([voters[2], voters[3]].sort());
    } finally {
      client.release();
    }
    expect(await remindPendingVoters(harness.pool, vote.pollId, 'soon', NOW)).toBe('skipped');
  });

  it('files a vote card for every voter but the asker, settled by their ballot', async () => {
    const vote = await destinationVote('final', ['Nara', 'Kobe'], {}, FUTURE);
    await q(
      `INSERT INTO domain_events (id, type, aggregate_kind, aggregate_id, actor_kind, actor_id, payload, crew_id, trip_id)
       VALUES (uuidv7(), 'poll.created', 'poll', $1, 'user', $2, $3::jsonb, $4, $5)`,
      [
        vote.pollId,
        voters[0],
        JSON.stringify({
          poll_id: vote.pollId,
          crew_id: crewId,
          trip_id: vote.tripId,
          kind: 'destination',
          created_by: voters[0],
        }),
        crewId,
        vote.tripId,
      ],
    );
    const created = await lastEvent('poll.created', vote.pollId);
    await fanOutEvent(harness.pool, created.id, NOW);
    const cards = await q<{ user_id: string; actions: { command?: string }[] }>(
      "SELECT user_id, actions FROM inbox_items WHERE kind = 'poll.vote_needed' AND data->>'poll_id' = $1",
      [vote.pollId],
    );
    expect(cards.map((c) => c.user_id).sort()).toEqual(voters.slice(1).sort());
    expect(cards[0]?.actions.map((a) => a.command)).toEqual(['cast_ballot', 'cast_ballot']);
    await q(
      `INSERT INTO domain_events (id, type, aggregate_kind, aggregate_id, actor_kind, actor_id, payload, crew_id)
       VALUES (uuidv7(), 'ballot.cast', 'poll', $1, 'user', $2, $3::jsonb, $4)`,
      [
        vote.pollId,
        voters[2],
        JSON.stringify({
          poll_id: vote.pollId,
          user_id: voters[2],
          option_id: vote.options['Nara'],
          source: 'notification',
        }),
        crewId,
      ],
    );
    await fanOutEvent(harness.pool, (await lastEvent('ballot.cast', vote.pollId)).id, NOW);
    const open = await q<{ user_id: string }>(
      "SELECT user_id FROM inbox_items WHERE kind = 'poll.vote_needed' AND data->>'poll_id' = $1 AND resolved_at IS NULL",
      [vote.pollId],
    );
    expect(open.map((c) => c.user_id).sort()).toEqual([voters[1], voters[3]].sort());
  });
});
