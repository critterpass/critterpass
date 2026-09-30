/**
 * `signup_quest`: a traveller joins an optional quest on their own trip (crew quests already count
 * every traveller). Signing up twice changes nothing; a finished, failed or expired quest cannot be
 * joined.
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, signupQuestPayloadSchema, type SignupQuestPayload } from '@cp/domain';
import type pg from 'pg';

import { defineCommand } from '../_framework/define-command';

interface QuestSeat {
  readonly trip_id: string;
  readonly status: string;
  readonly on_trip: boolean;
}

async function questSeat(tx: pg.PoolClient, questId: string, uid: string): Promise<QuestSeat> {
  const { rows } = await tx.query<QuestSeat>(
    `SELECT q.trip_id, q.status,
            EXISTS (SELECT 1 FROM trip_participants p
                     WHERE p.trip_id = q.trip_id AND p.user_id = $2
                       AND p.rsvp NOT IN ('out', 'waitlisted')) AS on_trip
       FROM quests q WHERE q.id = $1`,
    [questId, uid],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'quest' });
  return row;
}

export const signupQuestCommand = defineCommand({
  name: 'signup_quest',
  v: 1,
  schema: signupQuestPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload: SignupQuestPayload, ctx) => {
    const seat = await questSeat(tx, payload.quest_id, ctx.uid);
    if (!seat.on_trip) throw new DomainError('NOT_ELIGIBLE', { reason: 'not_on_trip' });
    if (seat.status !== 'offered' && seat.status !== 'active') {
      throw new DomainError('STATE_INVALID', { reason: 'quest_closed' });
    }
  },
  handle: async (tx, payload, ctx) => {
    const seat = await questSeat(tx, payload.quest_id, ctx.uid);
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO quest_signups (quest_id, trip_id, user_id) VALUES ($1, $2, $3)
       ON CONFLICT (quest_id, user_id) DO NOTHING RETURNING id`,
      [payload.quest_id, seat.trip_id, ctx.uid],
    );
    const signedUp = rows[0] !== undefined;
    if (signedUp) {
      await appendDomainEvent(tx, {
        type: 'quest.signed_up',
        aggregateKind: 'quest',
        aggregateId: payload.quest_id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: seat.trip_id,
        payload: { trip_id: seat.trip_id, quest_id: payload.quest_id, user_id: ctx.uid },
      });
    }
    return { quest_id: payload.quest_id, signed_up: signedUp };
  },
});
