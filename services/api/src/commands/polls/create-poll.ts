/**
 * `create_poll` (docs/api-contracts.md §4.4): a chat poll from the `+` sheet (question, two to six
 * answers, an optional deadline, whether minds may change), or a day option, approval or decision
 * poll on a trip. Approvals and decisions are the trip organiser's; everyone eligible is snapshot
 * now. The poll's card lands in crew chat. Destination votes start with `create_trip`.
 */
import { appendDomainEvent, armPollTimers } from '@cp/db';
import {
  createPollPayloadSchema,
  DomainError,
  generateUuidV7,
  initialEligibleVoters,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { postPollCard } from './candidates';
import { activeMemberIds, isTripOrganiser, requireCrewMember } from './shared';

/** Deadlines between five minutes and thirty days out. */
const MIN_WINDOW_MS = 5 * 60 * 1000;
const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

async function seatHolders(tx: pg.PoolClient, tripId: string): Promise<string[]> {
  const { rows } = await tx.query<{ user_id: string }>(
    'SELECT user_id FROM trip_participants WHERE trip_id = $1 AND holds_seat',
    [tripId],
  );
  return rows.map((row) => row.user_id);
}

export const createPollCommand = defineCommand({
  name: 'create_poll',
  v: 1,
  schema: createPollPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireCrewMember(tx, payload.crew_id);
    if (payload.trip_id !== undefined) {
      const { rows } = await tx.query('SELECT 1 FROM trips WHERE id = $1 AND crew_id = $2', [
        payload.trip_id,
        payload.crew_id,
      ]);
      if (rows.length === 0) throw new DomainError('NOT_FOUND', { reason: 'trip' });
    }
    const organiserOnly = payload.kind === 'changeset_approval' || payload.kind === 'decision';
    if (organiserOnly && !(await isTripOrganiser(tx, payload.trip_id ?? null))) {
      throw new DomainError('FORBIDDEN', { reason: 'organiser_only' });
    }
  },
  handle: async (tx, payload, ctx): Promise<{ poll_id: string }> => {
    const now = ctx.clock.serverNow;
    const closesAt = payload.closes_at === undefined ? null : new Date(payload.closes_at);
    if (closesAt !== null) {
      const window = closesAt.getTime() - now.getTime();
      if (window < MIN_WINDOW_MS || window > MAX_WINDOW_MS) {
        throw new DomainError('VALIDATION', { reason: 'closes_at_out_of_range' });
      }
    }
    const tripId = payload.trip_id ?? null;
    const eligible = initialEligibleVoters({
      kind: payload.kind,
      tripId,
      activeMemberIds: await activeMemberIds(tx, payload.crew_id),
      ...(tripId === null ? {} : { seatHolderIds: await seatHolders(tx, tripId) }),
      ...(payload.affected_user_ids === undefined
        ? {}
        : { affectedUserIds: payload.affected_user_ids }),
    });
    if (eligible.length === 0) throw new DomainError('VALIDATION', { reason: 'no_voters' });
    const pollId = payload.poll_id ?? generateUuidV7();
    return asSystemRole(tx, async () => {
      await tx.query(
        `INSERT INTO polls (id, crew_id, trip_id, kind, question, created_by, eligible_voter_ids,
           decider_policy, threshold, closes_at, allow_change)
         VALUES ($1, $2, $3, $4, $5, $6, $7::uuid[], $8, $9, $10, $11)`,
        [
          pollId,
          payload.crew_id,
          tripId,
          payload.kind,
          payload.question,
          ctx.uid,
          eligible,
          payload.decider_policy ?? null,
          payload.threshold ?? null,
          closesAt,
          payload.allow_change,
        ],
      );
      for (const [position, option] of payload.options.entries()) {
        await tx.query(
          `INSERT INTO poll_options (poll_id, crew_id, kind, ref_id, label, proposed_by, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            pollId,
            payload.crew_id,
            option.kind,
            option.ref_id ?? null,
            option.label,
            ctx.uid,
            position,
          ],
        );
      }
      await appendDomainEvent(tx, {
        type: 'poll.created',
        aggregateKind: 'poll',
        aggregateId: pollId,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: {
          poll_id: pollId,
          crew_id: payload.crew_id,
          trip_id: tripId,
          kind: payload.kind,
          created_by: ctx.uid,
        },
        crewId: payload.crew_id,
        ...(tripId === null ? {} : { tripId }),
      });
      await armPollTimers(tx, pollId, null, closesAt, now);
      await postPollCard(tx, {
        crewId: payload.crew_id,
        tripId,
        pollId,
        uid: ctx.uid,
        body: payload.question,
      });
      return { poll_id: pollId };
    });
  },
});
