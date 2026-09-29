/**
 * The destination vote's writes, shared by `create_trip` and `add_poll_candidate`: a place pitched
 * to a crew lands on the open board, starts a new vote (a voting trip and its destination poll in
 * one transaction, so a voting trip without a poll never commits), or waits in the queue while a
 * final is on. Runs as the system after the caller's checks.
 */
import { appendDomainEvent, armPollTimers, loadPollState, publishPollHints, tallyOf } from '@cp/db';
import {
  BOARD_MAX_CANDIDATES,
  BOARD_WINDOW_MS,
  DomainError,
  generateUuidV7,
  initialEligibleVoters,
  type PitchToCrewResult,
} from '@cp/domain';
import type pg from 'pg';

import {
  ensurePitch,
  insertOption,
  openDestinationPoll,
  postPollCard,
  resolvePlace,
  type OpenBoard,
  type Place,
  type PitchRow,
} from './candidates';
import { activeMemberIds } from './shared';

export { resolvePlace, type Place } from './candidates';

export interface StartVoteInput {
  readonly crewId: string;
  readonly tripId: string;
  readonly place: Place;
  readonly pitchId?: string | undefined;
  readonly month?: number | undefined;
  readonly uid: string;
  readonly now: Date;
}

/** A voting trip, its destination board with the place (and any queued pitches) on it. */
export async function startDestinationVote(
  tx: pg.PoolClient,
  input: StartVoteInput,
): Promise<PitchToCrewResult> {
  const { crewId, tripId, uid, now } = input;
  await tx.query(`INSERT INTO trips (id, crew_id, status, seat_cap) VALUES ($1, $2, 'voting', 6)`, [
    tripId,
    crewId,
  ]);
  await tx.query(
    `INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'organiser', 'in')`,
    [tripId, uid],
  );
  for (const [type, payload] of [
    ['trip.created', { trip_id: tripId, crew_id: crewId }],
    ['trip.status_changed', { trip_id: tripId, from: null, to: 'voting' }],
  ] as const) {
    await appendDomainEvent(tx, {
      type,
      aggregateKind: 'trip',
      aggregateId: tripId,
      actorKind: 'user',
      actorId: uid,
      payload,
      crewId,
      tripId,
    });
  }
  const eligible = initialEligibleVoters({
    kind: 'destination',
    tripId,
    activeMemberIds: await activeMemberIds(tx, crewId),
  });
  const closesAt = new Date(now.getTime() + BOARD_WINDOW_MS);
  const { rows } = await tx.query<OpenBoard>(
    `INSERT INTO polls (crew_id, trip_id, kind, stage, created_by, eligible_voter_ids, closes_at,
       tie_rule, stage_changed_at)
     VALUES ($1, $2, 'destination', 'board', $3, $4::uuid[], $5, 'organiser_pick', $6)
     RETURNING id, trip_id, stage, eligible_voter_ids`,
    [crewId, tripId, uid, eligible, closesAt, now],
  );
  const poll = rows[0];
  if (poll === undefined) throw new Error('poll insert returned no row');
  await appendDomainEvent(tx, {
    type: 'poll.created',
    aggregateKind: 'poll',
    aggregateId: poll.id,
    actorKind: 'user',
    actorId: uid,
    payload: {
      poll_id: poll.id,
      crew_id: crewId,
      trip_id: tripId,
      kind: 'destination',
      created_by: uid,
    },
    crewId,
    tripId,
  });
  const pitch = await ensurePitch(tx, {
    crewId,
    place: input.place,
    pitchId: input.pitchId,
    uid,
    month: input.month,
  });
  const optionId = await insertOption(tx, { poll, crewId, place: input.place, pitch, uid, now });
  // Places pitched while the last final was on join this new board.
  const queued = await tx.query<PitchRow & { place_id: string }>(
    `SELECT p.id, p.crew_id, p.destination_id, p.status, p.month, p.destination_id AS place_id
       FROM pitches p WHERE p.crew_id = $1 AND p.status = 'queued' AND p.destination_id <> $2
      ORDER BY p.created_at LIMIT $3`,
    [crewId, input.place.id, BOARD_MAX_CANDIDATES - 1],
  );
  for (const row of queued.rows) {
    const place = await resolvePlace(tx, row.destination_id);
    await insertOption(tx, { poll, crewId, place, pitch: row, uid, now });
  }
  await armPollTimers(tx, poll.id, 'board', closesAt, now);
  await postPollCard(tx, { crewId, tripId, pollId: poll.id, uid, body: input.place.name });
  return {
    outcome: 'board_created',
    crew_id: crewId,
    poll_id: poll.id,
    trip_id: tripId,
    option_id: optionId,
    pitch_id: pitch.id,
    pitch_status: 'on_board',
    voted: 0,
    eligible: eligible.length,
  };
}

export interface PitchToCrewInput {
  readonly crewId: string;
  readonly place: Place;
  readonly pitchId?: string | undefined;
  readonly month?: number | undefined;
  /** Id for the trip a new vote creates (the client's, for offline replays). */
  readonly newTripId?: string | undefined;
  readonly uid: string;
  readonly now: Date;
}

/** Puts a place in front of the crew: on the open board, into a new vote, or in the queue. */
export async function pitchToCrew(
  tx: pg.PoolClient,
  input: PitchToCrewInput,
): Promise<PitchToCrewResult> {
  const { crewId, place, uid, now } = input;
  const open = await openDestinationPoll(tx, crewId);
  if (open === undefined) {
    return startDestinationVote(tx, {
      crewId,
      tripId: input.newTripId ?? generateUuidV7(),
      place,
      pitchId: input.pitchId,
      month: input.month,
      uid,
      now,
    });
  }
  const state = await loadPollState(tx, open.id);
  if (state === undefined) throw new Error('open poll vanished');
  const tally = tallyOf(state);
  const counts = { voted: tally.total, eligible: tally.eligibleCount };
  const existing = state.options.find(
    (option) => option.ref_id === place.id && option.eliminated_at === null,
  );
  if (existing !== undefined) {
    return {
      outcome: 'already_on_board',
      crew_id: crewId,
      poll_id: open.id,
      trip_id: open.trip_id,
      option_id: existing.id,
      pitch_id: existing.pitch_id ?? existing.id,
      pitch_status: open.stage === 'final' ? 'final' : 'on_board',
      ...counts,
    };
  }
  const pitch = await ensurePitch(tx, {
    crewId,
    place,
    pitchId: input.pitchId,
    uid,
    month: input.month,
  });
  if (open.stage === 'final') {
    await tx.query("UPDATE pitches SET status = 'queued' WHERE id = $1", [pitch.id]);
    await appendDomainEvent(tx, {
      type: 'pitch.queued',
      aggregateKind: 'pitch',
      aggregateId: pitch.id,
      actorKind: 'user',
      actorId: uid,
      payload: { pitch_id: pitch.id, crew_id: crewId, destination_id: place.id },
      crewId,
    });
    return {
      outcome: 'queued',
      crew_id: crewId,
      poll_id: open.id,
      trip_id: open.trip_id,
      option_id: null,
      pitch_id: pitch.id,
      pitch_status: 'queued',
      ...counts,
    };
  }
  const live = state.options.filter((option) => option.eliminated_at === null);
  if (live.length >= BOARD_MAX_CANDIDATES) {
    throw new DomainError('STATE_INVALID', { reason: 'board_full', max: BOARD_MAX_CANDIDATES });
  }
  const optionId = await insertOption(tx, { poll: open, crewId, place, pitch, uid, now });
  const after = await loadPollState(tx, open.id);
  if (after !== undefined) await publishPollHints(tx, after, tallyOf(after), 'poll.updated');
  return {
    outcome: 'added',
    crew_id: crewId,
    poll_id: open.id,
    trip_id: open.trip_id,
    option_id: optionId,
    pitch_id: pitch.id,
    pitch_status: 'on_board',
    ...counts,
  };
}
