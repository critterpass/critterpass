/**
 * The destination vote end to end on the real stack: board → organiser advance (with a tie for a
 * final spot) → reopen → final → close on the frozen-price tie rule. The trip goes `won` exactly
 * once, every voter gets one pending reveal that each marks seen for themselves, the loser goes
 * back in the deck. Also: removing candidates, queueing a pitch, saved places, and a manual close
 * racing ballots.
 */
import { generateUuidV7, type CreateTripResult, type PollTallyResult } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CommandDoorsHarness, SignedIn } from '../routes/command-doors-harness';
import {
  buildPollCrew,
  errorCode,
  insertPlace,
  resultOf,
  run,
  startPollDoors,
  type PollCrew,
} from './poll-fixture';

let harness: CommandDoorsHarness;
let crew: PollCrew;
let places: Record<'kyoto' | 'lisbon' | 'bali' | 'porto', string>;
let tripId: string;
let pollId: string;
const optionOf: Record<string, string> = {};

beforeAll(async () => {
  harness = await startPollDoors();
  crew = await buildPollCrew(harness, 4);
  places = {
    kyoto: await insertPlace(harness, 'Kyoto'),
    lisbon: await insertPlace(harness, 'Lisbon'),
    bali: await insertPlace(harness, 'Bali'),
    porto: await insertPlace(harness, 'Porto'),
  };
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const query = <T extends object>(sql: string, params: unknown[] = []) =>
  harness.pool.query<T>(sql, params).then((r) => r.rows);
const member = (i: number) => () => crew.members[i]!;
const [a, b, c, d] = [member(0), member(1), member(2), member(3)];
const vote = (who: SignedIn, place: string) =>
  run(harness, who, 'cast_ballot', { poll_id: pollId, option_id: optionOf[place] });

describe('destination vote', () => {
  it('opens a board with three places', async () => {
    const created = await run(harness, crew.organiser, 'create_trip', {
      crew_id: crew.crewId,
      place_id: places.kyoto,
      solo: false,
    });
    ({ trip_id: tripId, poll_id: pollId } = resultOf<CreateTripResult>(created) as {
      trip_id: string;
      poll_id: string;
    });
    await run(harness, b(), 'add_poll_candidate', {
      crew_id: crew.crewId,
      place_id: places.lisbon,
    });
    await run(harness, c(), 'add_poll_candidate', { crew_id: crew.crewId, place_id: places.bali });
    for (const row of await query<{ id: string; ref_id: string }>(
      'SELECT id, ref_id FROM poll_options WHERE poll_id = $1',
      [pollId],
    )) {
      optionOf[row.ref_id] = row.id;
    }
    expect(Object.keys(optionOf)).toHaveLength(3);
  });

  it('lets only the proposer or the organiser remove a place from the board', async () => {
    await run(harness, d(), 'add_poll_candidate', { crew_id: crew.crewId, place_id: places.porto });
    const [porto] = await query<{ id: string }>(
      'SELECT id FROM poll_options WHERE poll_id = $1 AND ref_id = $2',
      [pollId, places.porto],
    );
    const stranger = await run(harness, b(), 'remove_candidate', {
      poll_id: pollId,
      option_id: porto!.id,
    });
    expect(errorCode(stranger)).toBe('FORBIDDEN');
    const own = await run(harness, d(), 'remove_candidate', {
      poll_id: pollId,
      option_id: porto!.id,
    });
    expect(own.status).toBe(200);
    expect(await query('SELECT 1 FROM poll_options WHERE id = $1', [porto!.id])).toEqual([]);
  });

  it('asks the organiser to pick when the second final spot is tied, then advances', async () => {
    await vote(a(), places.kyoto);
    await vote(b(), places.kyoto);
    await vote(c(), places.lisbon);
    await vote(d(), places.bali);
    expect(errorCode(await run(harness, b(), 'advance_poll_stage', { poll_id: pollId }))).toBe(
      'FORBIDDEN',
    );
    const tied = await run(harness, crew.organiser, 'advance_poll_stage', { poll_id: pollId });
    expect(tied.body['error']).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'needs_pick', settled_option_ids: [optionOf[places.kyoto]] },
    });
    const advanced = await run(harness, crew.organiser, 'advance_poll_stage', {
      poll_id: pollId,
      pick: [optionOf[places.lisbon]],
    });
    expect(resultOf<PollTallyResult>(advanced)).toMatchObject({ stage: 'final', pending_count: 1 });
    const pitches = await query<{ destination_id: string; status: string }>(
      'SELECT destination_id, status FROM pitches WHERE trip_id = $1 OR destination_id = $2',
      [tripId, places.bali],
    );
    expect(Object.fromEntries(pitches.map((p) => [p.destination_id, p.status]))).toMatchObject({
      [places.kyoto]: 'final',
      [places.lisbon]: 'final',
      [places.bali]: 'back_in_deck',
    });
    expect(
      await query('SELECT 1 FROM ballots WHERE poll_id = $1 AND user_id = $2', [pollId, d().uid]),
    ).toEqual([]);
    expect(
      await query("SELECT 1 FROM scheduled_events WHERE kind = 'poll.close' AND ref_id = $1", [
        pollId,
      ]),
    ).toHaveLength(1);
  });

  it('reopens the board and advances again', async () => {
    const reopened = await run(harness, crew.organiser, 'reopen_board', { poll_id: pollId });
    expect(resultOf<PollTallyResult>(reopened).stage).toBe('board');
    expect(
      await query('SELECT 1 FROM poll_options WHERE poll_id = $1 AND eliminated_at IS NOT NULL', [
        pollId,
      ]),
    ).toEqual([]);
    const advanced = await run(harness, crew.organiser, 'advance_poll_stage', {
      poll_id: pollId,
      pick: [optionOf[places.lisbon]],
    });
    expect(resultOf<PollTallyResult>(advanced).stage).toBe('final');
  });

  it('breaks a 2–2 final on the frozen price for the majority origin, trip won exactly once', async () => {
    for (const [place, amount] of [
      [places.kyoto, 41_200],
      [places.lisbon, 85_200],
    ] as const) {
      await query(
        `WITH q AS (
           INSERT INTO price_quotes (trip_id, kind, origin, destination_id, amount_minor, currency, source,
             fetched_at, frozen_at)
           VALUES ($1, 'flight', 'SIN', $2, $3, 'USD', 'travelpayouts', now(), now()) RETURNING id)
         UPDATE poll_options SET frozen_quote_id = (SELECT id FROM q) WHERE poll_id = $4 AND ref_id = $2`,
        [tripId, place, amount, pollId],
      );
    }
    // Kyoto (A, B) and Lisbon (C) carried over from the board; D's vote makes it 2–2 and closes it.
    const close = await vote(d(), places.lisbon);
    expect(resultOf<PollTallyResult>(close)).toMatchObject({
      status: 'closed',
      winner_option_id: optionOf[places.kyoto],
    });
    const [poll] = await query<{ result: { tie: Record<string, unknown> } }>(
      'SELECT result FROM polls WHERE id = $1',
      [pollId],
    );
    expect(poll?.result.tie).toEqual({
      rule: 'cheaper_for_majority_origin',
      winner_option_id: optionOf[places.kyoto],
      runner_up_option_id: optionOf[places.lisbon],
      origin: 'SIN',
      member_count: 3,
      cheaper_by_minor: 44_000,
      currency: 'USD',
    });
    const [trip] = await query<{ status: string; destination_id: string }>(
      'SELECT status, destination_id FROM trips WHERE id = $1',
      [tripId],
    );
    expect(trip).toEqual({ status: 'won', destination_id: places.kyoto });
    const again = await run(harness, crew.organiser, 'close_poll', { poll_id: pollId });
    expect(resultOf<PollTallyResult>(again).status).toBe('closed');
    expect(
      await query(
        "SELECT 1 FROM domain_events WHERE type = 'trip.status_changed' AND aggregate_id = $1 AND payload->>'to' = 'won'",
        [tripId],
      ),
    ).toHaveLength(1);
    const pitches = await query<{ destination_id: string; status: string }>(
      'SELECT destination_id, status FROM pitches WHERE trip_id = $1',
      [tripId],
    );
    expect(Object.fromEntries(pitches.map((p) => [p.destination_id, p.status]))).toMatchObject({
      [places.kyoto]: 'won',
      [places.lisbon]: 'back_in_deck',
    });
  });

  it('files one pending reveal per voter, each seen by its own voter only once', async () => {
    const pending = await query<{ user_id: string }>(
      'SELECT user_id FROM poll_reveals WHERE poll_id = $1 AND seen_at IS NULL',
      [pollId],
    );
    expect(pending).toHaveLength(4);
    await run(harness, a(), 'mark_reveal_seen', { poll_id: pollId });
    await run(harness, a(), 'mark_reveal_seen', { poll_id: pollId });
    const seen = await query<{ user_id: string }>(
      'SELECT user_id FROM poll_reveals WHERE poll_id = $1 AND seen_at IS NOT NULL',
      [pollId],
    );
    expect(seen.map((row) => row.user_id)).toEqual([a().uid]);
    expect(
      await query(
        "SELECT 1 FROM domain_events WHERE type = 'poll.reveal_seen' AND aggregate_id = $1",
        [pollId],
      ),
    ).toHaveLength(1);
  });

  it('refuses a ballot after the close and removal outside a board', async () => {
    expect((await vote(d(), places.kyoto)).status).toBe(409);
    const removal = await run(harness, crew.organiser, 'remove_candidate', {
      poll_id: pollId,
      option_id: optionOf[places.lisbon],
    });
    expect(errorCode(removal)).toBe('STATE_INVALID');
  });
});

describe('queue_pitch and saved places', () => {
  it('queues a pitch back in the deck for the next board', async () => {
    const [pitch] = await query<{ id: string }>(
      "SELECT id FROM pitches WHERE destination_id = $1 AND status = 'back_in_deck' LIMIT 1",
      [places.bali],
    );
    const queued = await run(harness, b(), 'queue_pitch', {
      crew_id: crew.crewId,
      pitch_id: pitch!.id,
    });
    expect(resultOf<{ status: string }>(queued).status).toBe('queued');
    const next = await run(harness, crew.organiser, 'create_trip', {
      crew_id: crew.crewId,
      place_id: places.porto,
      solo: false,
    });
    const labels = await query<{ label: string }>(
      'SELECT label FROM poll_options WHERE poll_id = $1 ORDER BY position',
      [resultOf<CreateTripResult>(next).poll_id],
    );
    expect(labels.map((row) => row.label)).toEqual(['Porto', 'Bali']);
  });

  it('saves, unsaves and requests places for the caller only', async () => {
    await run(harness, c(), 'save_place', { place_id: places.lisbon });
    await run(harness, c(), 'save_place', { place_id: places.lisbon });
    expect(
      await query("SELECT 1 FROM saved_items WHERE user_id = $1 AND kind = 'place'", [c().uid]),
    ).toHaveLength(1);
    await run(harness, c(), 'unsave_place', { place_id: places.lisbon });
    expect(
      await query("SELECT 1 FROM saved_items WHERE user_id = $1 AND kind = 'place'", [c().uid]),
    ).toEqual([]);
    expect(errorCode(await run(harness, c(), 'save_place', { place_id: generateUuidV7() }))).toBe(
      'NOT_FOUND',
    );
    await run(harness, c(), 'request_place', { query: 'Tbilisi' });
    await run(harness, c(), 'request_place', { query: ' tbilisi ' });
    expect(
      await query("SELECT note FROM saved_items WHERE user_id = $1 AND kind = 'request'", [
        c().uid,
      ]),
    ).toEqual([{ note: 'Tbilisi' }]);
  });
});

describe('manual close racing ballots', { timeout: 120_000 }, () => {
  it('counts every applied ballot and refuses the rest with VOTE_CLOSED', async () => {
    const id = generateUuidV7();
    await run(harness, crew.organiser, 'create_poll', {
      poll_id: id,
      crew_id: crew.crewId,
      kind: 'generic',
      question: 'Karaoke?',
      options: [{ label: 'Yes' }, { label: 'No' }],
    });
    const [yes] = await query<{ id: string }>(
      'SELECT id FROM poll_options WHERE poll_id = $1 AND position = 0',
      [id],
    );
    const responses = await Promise.all([
      run(harness, b(), 'cast_ballot', { poll_id: id, option_id: yes!.id }),
      run(harness, crew.organiser, 'close_poll', { poll_id: id }),
      run(harness, c(), 'cast_ballot', { poll_id: id, option_id: yes!.id }),
      run(harness, d(), 'cast_ballot', { poll_id: id, option_id: yes!.id }),
    ]);
    expect(responses.every((r) => r.status === 200 || r.status === 409)).toBe(true);
    const [poll] = await query<{
      status: string;
      result: { option_tallies: Record<string, number> };
    }>('SELECT status, result FROM polls WHERE id = $1', [id]);
    const ballots = await query('SELECT 1 FROM ballots WHERE poll_id = $1', [id]);
    expect(poll?.status).toBe('closed');
    expect(poll?.result.option_tallies[yes!.id]).toBe(ballots.length);
    const refused = responses.filter((r) => r.status === 409).length;
    expect(ballots.length + refused).toBe(3);
  });
});
