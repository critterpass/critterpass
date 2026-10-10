/**
 * `start_draft` (docs/api-contracts.md §4.6). DRAFT MY TRIP starts one private drafting job for
 * the trip (one at a time, however many organisers tap it) once its dates are locked, with whatever
 * the crew has answered so far; the job and its queue entry commit with the command. From the
 * review of an earlier draft it drafts again with the answers that came in since (the earlier
 * draft stays restorable). System AI: no quota. A trip left drafting with no live job (its job
 * died before it could give the trip back) may start again.
 */
import { startAgentJob } from '@cp/ai';
import { emitEvent, sendInTx } from '@cp/db';
import { DomainError, DRAFT_QUEUES, DRAFT_STEP_IDS, startDraftPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { liveJob, loadSetupTrip, requireOrganiser, requireStatus } from './shared';

const DRAFTABLE = ['setup', 'drafting', 'draft_review'] as const;

export const startDraftCommand = defineCommand({
  name: 'start_draft',
  v: 1,
  schema: startDraftPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    requireStatus(await requireOrganiser(tx, payload.trip_id), DRAFTABLE);
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      const trip = await loadSetupTrip(tx, payload.trip_id, true);
      requireStatus(trip, DRAFTABLE);
      if (trip.start_date === null || trip.end_date === null) {
        throw new DomainError('STATE_INVALID', { reason: 'dates_not_locked' });
      }
      if (trip.destination_id === null) {
        throw new DomainError('STATE_INVALID', { reason: 'no_destination' });
      }
      if (trip.status === 'draft_review') {
        const shared = await tx.query(
          'SELECT 1 FROM trips WHERE id = $1 AND current_version_id IS NOT NULL',
          [trip.id],
        );
        if ((shared.rowCount ?? 0) > 0) {
          throw new DomainError('STATE_INVALID', { reason: 'plan_shared' });
        }
      }
      const running = await liveJob(tx, trip.id, 'draft');
      if (running !== undefined) {
        throw new DomainError('STATE_INVALID', { reason: 'draft_running', job_id: running.id });
      }
      const { rows } = await tx.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM agent_jobs WHERE trip_id = $1 AND kind = 'draft'",
        [trip.id],
      );
      const job = await startAgentJob(
        tx,
        (queue, data, options) => sendInTx(tx, queue, data, options),
        {
          kind: 'draft',
          queue: DRAFT_QUEUES.draft,
          userId: ctx.uid,
          tripId: trip.id,
          input: { trip_id: trip.id, draft_seq: (rows[0]?.n ?? 0) + 1 },
          stepIds: DRAFT_STEP_IDS,
        },
      );
      if (trip.status !== 'drafting') {
        await tx.query("UPDATE trips SET status = 'drafting' WHERE id = $1", [trip.id]);
      }
      await emitEvent(tx, {
        type: 'draft.requested',
        aggregateKind: 'trip',
        aggregateId: trip.id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: trip.crew_id,
        tripId: trip.id,
        payload: { trip_id: trip.id, job_id: job.id },
      });
      return { trip_id: trip.id, job_id: job.id };
    }),
});
