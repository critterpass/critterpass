/**
 * The building blocks of a destination candidate: the place, its pitch (the one the caller
 * streamed, or a bare one), the board option with its frozen fare, and the vote's chat card.
 * Runs as the system after the caller's checks.
 */
import { appendDomainEvent, outbox } from '@cp/db';
import { DomainError, generateUuidV7, channelName } from '@cp/domain';
import type pg from 'pg';

import { freezeCandidateQuote } from './fares';

export interface Place {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly coverage: 'live' | 'guest';
}

export async function resolvePlace(tx: pg.PoolClient, placeId: string): Promise<Place> {
  const { rows } = await tx.query<Place>(
    'SELECT id, slug, name, coverage FROM destinations WHERE id = $1',
    [placeId],
  );
  const place = rows[0];
  if (place === undefined) throw new DomainError('NOT_FOUND', { reason: 'place' });
  return place;
}

export function pitchCacheKey(placeId: string, month: number | null | undefined): string {
  return `${placeId}:${month ?? 'any'}`;
}

export interface PitchRow {
  readonly id: string;
  readonly crew_id: string;
  readonly destination_id: string;
  readonly status: string;
  readonly month: number | null;
}

/** The pitch the caller streamed, or a bare one for a place pitched straight from search. */
export async function ensurePitch(
  tx: pg.PoolClient,
  input: {
    crewId: string;
    place: Place;
    pitchId?: string | undefined;
    uid: string;
    month?: number | undefined;
  },
): Promise<PitchRow> {
  if (input.pitchId !== undefined) {
    const { rows } = await tx.query<PitchRow>(
      'SELECT id, crew_id, destination_id, status, month FROM pitches WHERE id = $1',
      [input.pitchId],
    );
    const pitch = rows[0];
    if (
      pitch === undefined ||
      pitch.crew_id !== input.crewId ||
      pitch.destination_id !== input.place.id
    ) {
      throw new DomainError('NOT_FOUND', { reason: 'pitch' });
    }
    return pitch;
  }
  const { rows } = await tx.query<PitchRow>(
    `INSERT INTO pitches (crew_id, destination_id, pitched_by, month, cache_key)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, crew_id, destination_id, status, month`,
    [
      input.crewId,
      input.place.id,
      input.uid,
      input.month ?? null,
      pitchCacheKey(input.place.id, input.month),
    ],
  );
  const pitch = rows[0];
  if (pitch === undefined) throw new Error('pitch insert returned no row');
  await appendDomainEvent(tx, {
    type: 'pitch.created',
    aggregateKind: 'pitch',
    aggregateId: pitch.id,
    actorKind: 'user',
    actorId: input.uid,
    payload: { pitch_id: pitch.id, crew_id: input.crewId, destination_id: input.place.id },
    crewId: input.crewId,
  });
  return pitch;
}

export interface OpenBoard {
  readonly id: string;
  readonly trip_id: string;
  readonly stage: 'board' | 'final';
  readonly eligible_voter_ids: string[];
}

export async function openDestinationPoll(
  tx: pg.PoolClient,
  crewId: string,
): Promise<OpenBoard | undefined> {
  const { rows } = await tx.query<OpenBoard>(
    `SELECT id, trip_id, stage, eligible_voter_ids FROM polls
      WHERE crew_id = $1 AND kind = 'destination' AND status = 'open' FOR UPDATE`,
    [crewId],
  );
  return rows[0];
}

export interface AddOptionInput {
  readonly poll: OpenBoard;
  readonly crewId: string;
  readonly place: Place;
  readonly pitch: PitchRow;
  readonly uid: string;
  readonly now: Date;
}

export async function insertOption(tx: pg.PoolClient, input: AddOptionInput): Promise<string> {
  const quoteId = await freezeCandidateQuote(tx, {
    tripId: input.poll.trip_id,
    place: input.place,
    voterIds: input.poll.eligible_voter_ids,
    month: input.pitch.month,
    now: input.now,
  });
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO poll_options (poll_id, crew_id, kind, ref_id, label, frozen_quote_id, pitch_id,
       proposed_by, position)
     VALUES ($1, $2, 'destination', $3, $4, $5, $6, $7,
       (SELECT coalesce(max(position) + 1, 0) FROM poll_options WHERE poll_id = $1))
     RETURNING id`,
    [
      input.poll.id,
      input.crewId,
      input.place.id,
      input.place.name.slice(0, 80),
      quoteId,
      input.pitch.id,
      input.uid,
    ],
  );
  const optionId = rows[0]?.id;
  if (optionId === undefined) throw new Error('poll option insert returned no row');
  await tx.query("UPDATE pitches SET status = 'on_board', trip_id = $2 WHERE id = $1", [
    input.pitch.id,
    input.poll.trip_id,
  ]);
  await appendDomainEvent(tx, {
    type: 'poll.candidate_added',
    aggregateKind: 'poll',
    aggregateId: input.poll.id,
    actorKind: 'user',
    actorId: input.uid,
    payload: {
      poll_id: input.poll.id,
      option_id: optionId,
      destination_id: input.place.id,
      pitch_id: input.pitch.id,
      proposed_by: input.uid,
    },
    crewId: input.crewId,
    tripId: input.poll.trip_id,
  });
  return optionId;
}

/** Posts the vote's card in crew chat (the chat renders it from the synced poll rows). */
export async function postPollCard(
  tx: pg.PoolClient,
  input: { crewId: string; tripId: string | null; pollId: string; uid: string; body: string },
): Promise<void> {
  const messageId = generateUuidV7();
  const { rows } = await tx.query<{ seq: string }>(
    `INSERT INTO messages (id, crew_id, trip_id, sender_kind, sender_id, type, body, ref_kind, ref_id)
     VALUES ($1, $2, $3, 'user', $4, 'poll', $5, 'poll', $6) RETURNING seq`,
    [messageId, input.crewId, input.tripId, input.uid, input.body.slice(0, 4000), input.pollId],
  );
  await outbox(tx, channelName('crew_chat', input.crewId), 'message.created', {
    crew_id: input.crewId,
    message_id: messageId,
    seq: Number(rows[0]?.seq),
  });
}
