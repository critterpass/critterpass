/**
 * `lock_in_plan` (docs/api-contracts-proposal.md): the organiser locks the plan in when there is
 * nobody to send it to (a solo trip, or a crew whose friends have not joined yet). In one
 * transaction the plan version is published exactly as SEND publishes it (crew-visible, the trip's
 * current version), a proposal row records it, and the trip is confirmed through the one lock
 * path; nobody is pushed and no card is posted. A friend who joins later is seated on the
 * confirmed trip and reads this plan. With anyone to send it to, the plan goes out as a proposal
 * instead (`has_recipients`).
 */
import { lockProposalAndConfirm, isConfirmedOrLater, moveTripStatus } from '@cp/db';
import {
  defaultReplyBy,
  DomainError,
  earliestFreeCancel,
  generateUuidV7,
  liveFreeCancels,
  lockInPlanPayloadSchema,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { proposalPlanVersion, proposalRecipients, replyByFacts } from './create-proposal';
import { publishProposedPlan } from './send-proposal';

const LOCKABLE_TRIP_STATUSES = new Set(['draft_review', 'proposed']);

export interface LockInPlanResult {
  readonly proposal_id: string;
  readonly trip_status: 'confirmed';
}

export const lockInPlanCommand = defineCommand({
  name: 'lock_in_plan',
  v: 1,
  schema: lockInPlanPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const { rows } = await tx.query<{ status: string; organiser: boolean }>(
      'SELECT status, app.is_trip_organiser(id) AS organiser FROM trips WHERE id = $1',
      [payload.trip_id],
    );
    const trip = rows[0];
    if (trip === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
    if (!trip.organiser) throw new DomainError('FORBIDDEN', { reason: 'organiser_only' });
    if (!LOCKABLE_TRIP_STATUSES.has(trip.status)) {
      throw new DomainError('STATE_INVALID', { state: trip.status });
    }
  },
  handle: async (tx, payload, ctx): Promise<LockInPlanResult> => {
    const tripId = payload.trip_id;
    const people = await proposalRecipients(tx, tripId, ctx.uid);
    if (people.length > 0) throw new DomainError('STATE_INVALID', { reason: 'has_recipients' });
    const facts = await replyByFacts(tx, tripId);
    const now = ctx.clock.serverNow;
    const actor = { kind: 'user' as const, id: ctx.uid };
    return asSystemRole(tx, async () => {
      const trip = await proposalPlanVersion(tx, tripId);
      if (trip === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
      if (trip.version_id === null) throw new DomainError('STATE_INVALID', { reason: 'no_plan' });
      const proposalId = generateUuidV7();
      await tx.query(
        `UPDATE proposals SET status = 'superseded' WHERE trip_id = $1 AND status <> 'superseded'`,
        [tripId],
      );
      // Recorded as sent to nobody, so the one lock path finds a proposal to lock.
      await tx.query(
        `INSERT INTO proposals (id, trip_id, version_id, created_by, reply_by,
                                stay_free_cancel_until, status, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          proposalId,
          tripId,
          trip.version_id,
          ctx.uid,
          defaultReplyBy({ ...facts, now }),
          earliestFreeCancel(liveFreeCancels(facts.freeCancelDeadlines, now)),
          'sent',
          now,
        ],
      );
      await tx.query(
        'INSERT INTO hype_aggregates (proposal_id, trip_id, recipients) VALUES ($1, $2, 0)',
        [proposalId, tripId],
      );
      await publishProposedPlan(tx, { trip_id: tripId, version_id: trip.version_id });
      await moveTripStatus(tx, { tripId, from: 'draft_review', to: 'proposed', actor });
      const status = await lockProposalAndConfirm(tx, {
        proposalId,
        tripId,
        crewId: trip.crew_id,
        actor,
        now,
        unanswered: 0,
      });
      if (!isConfirmedOrLater(status)) throw new DomainError('STATE_INVALID', { state: status });
      return { proposal_id: proposalId, trip_status: 'confirmed' };
    });
  },
});
