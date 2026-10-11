/**
 * `cancel_draft` (doc delta, docs/api-contracts.md §4.6): stops the trip's live drafting job at its
 * next step and puts the trip back where it was: into setup, or back to reviewing the guide's
 * earlier draft when it had one (a draft made again from new answers). Nothing was saved or spent,
 * so nothing is undone.
 */
import { emitEvent } from '@cp/db';
import { cancelDraftPayloadSchema, DomainError } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import {
  liveJob,
  loadSetupTrip,
  publishDraftDone,
  requireOrganiser,
  STATUS_AFTER_DRAFTING,
} from './shared';

export const cancelDraftCommand = defineCommand({
  name: 'cancel_draft',
  v: 1,
  schema: cancelDraftPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireOrganiser(tx, payload.trip_id);
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      const trip = await loadSetupTrip(tx, payload.trip_id, true);
      const running = await liveJob(tx, trip.id, 'draft');
      if (running === undefined && trip.status !== 'drafting') {
        throw new DomainError('STATE_INVALID', { reason: 'no_draft_running' });
      }
      if (running !== undefined) {
        await tx.query("UPDATE agent_jobs SET status = 'cancelled' WHERE id = $1", [running.id]);
        await publishDraftDone(tx, trip.id, {
          job_id: running.id,
          status: 'cancelled',
          version_id: null,
        });
        await emitEvent(tx, {
          type: 'draft.cancelled',
          aggregateKind: 'trip',
          aggregateId: trip.id,
          actorKind: 'user',
          actorId: ctx.uid,
          crewId: trip.crew_id,
          tripId: trip.id,
          payload: { trip_id: trip.id, job_id: running.id },
        });
      }
      if (trip.status === 'drafting') {
        await tx.query(`UPDATE trips SET status = ${STATUS_AFTER_DRAFTING} WHERE id = $1`, [
          trip.id,
        ]);
      }
      return { trip_id: trip.id, cancelled_job_id: running?.id ?? null };
    }),
});
