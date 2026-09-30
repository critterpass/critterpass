/**
 * `start_swipe_session` (docs/api-contracts.md §4.6): any participant starts swiping the trip's
 * destination; a trip holds one open session, so a second start (or a replay) joins it. Solo trips
 * match at one yes, crews at two. The deck is built by `ai.swipe_deck`, queued with the session.
 */
import { appendDomainEvent, sendInTx } from '@cp/db';
import {
  DomainError,
  EXPLORE_QUEUES,
  generateUuidV7,
  matchRuleFor,
  startSwipeSessionPayloadSchema,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireSwipeParticipant } from './swipe-access';

export interface StartSwipeResult {
  readonly session_id: string;
  readonly status: string;
  readonly match_rule: number;
  readonly joined: boolean;
}

async function openSession(tx: pg.PoolClient, tripId: string): Promise<StartSwipeResult | null> {
  const { rows } = await tx.query<{ id: string; status: string; match_rule: number }>(
    "SELECT id, status, match_rule FROM swipe_sessions WHERE trip_id = $1 AND status <> 'ended'",
    [tripId],
  );
  const row = rows[0];
  return row === undefined
    ? null
    : { session_id: row.id, status: row.status, match_rule: row.match_rule, joined: true };
}

export const startSwipeSessionCommand = defineCommand({
  name: 'start_swipe_session',
  v: 1,
  schema: startSwipeSessionPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (tx, payload) => requireSwipeParticipant(tx, payload.trip_id),
  handle: async (tx, payload, ctx): Promise<StartSwipeResult> => {
    const existing = await openSession(tx, payload.trip_id);
    if (existing !== null) return existing;
    const { rows: trips } = await tx.query<{ destination_id: string | null; crew_id: string }>(
      'SELECT destination_id, crew_id FROM trips WHERE id = $1',
      [payload.trip_id],
    );
    const trip = trips[0];
    if (trip?.destination_id === null || trip === undefined) {
      throw new DomainError('STATE_INVALID', { reason: 'no_destination' });
    }
    const { rows: seats } = await tx.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM trip_participants WHERE trip_id = $1 AND rsvp IS DISTINCT FROM 'out'",
      [payload.trip_id],
    );
    const matchRule = matchRuleFor(seats[0]?.n ?? 1);
    const sessionId = payload.session_id ?? generateUuidV7();
    const inserted = await asSystemRole(tx, () =>
      tx.query(
        `INSERT INTO swipe_sessions (id, trip_id, destination_id, started_by, match_rule)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (trip_id) WHERE status <> 'ended' DO NOTHING`,
        [sessionId, payload.trip_id, trip.destination_id, ctx.uid, matchRule],
      ),
    );
    if ((inserted.rowCount ?? 0) === 0) {
      const raced = await openSession(tx, payload.trip_id);
      if (raced !== null) return raced;
      throw new DomainError('STATE_INVALID', { reason: 'session_conflict' });
    }
    await appendDomainEvent(tx, {
      type: 'swipe.started',
      aggregateKind: 'swipe_session',
      aggregateId: sessionId,
      actorKind: 'user',
      actorId: ctx.uid,
      crewId: trip.crew_id,
      tripId: payload.trip_id,
      payload: {
        trip_id: payload.trip_id,
        session_id: sessionId,
        destination_id: trip.destination_id,
        started_by: ctx.uid,
      },
    });
    await sendInTx(
      tx,
      EXPLORE_QUEUES.swipeDeck,
      { session_id: sessionId },
      { singletonKey: sessionId },
    );
    return { session_id: sessionId, status: 'building', match_rule: matchRule, joined: false };
  },
});
