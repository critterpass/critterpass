/**
 * `review_hand_plan` (docs/api-contracts.md §4.6): the organiser takes the plan she built by hand
 * on to review without asking the guide for a draft, so she can build the proposal and send it.
 * It needs what a guide draft needs (locked dates, a destination, no draft job running) and at
 * least one stop of hers on the plan; budget, rooms and must-dos stay optional, as they are for a
 * draft. The plan gets its numbers and must-do coverage and the trip moves to draft review, where
 * the proposal is built as from any draft. Nothing reaches the crew until the proposal is sent.
 */
import { DomainError, reviewHandPlanPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { lockTripDraft } from '../../plan/draft-versioning';
import { defineCommand } from '../_framework/define-command';
import { liveJob, loadSetupTrip, requireOrganiser } from './shared';
import { firstNumbers } from './versions';

export const reviewHandPlanCommand = defineCommand({
  name: 'review_hand_plan',
  v: 1,
  schema: reviewHandPlanPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireOrganiser(tx, payload.trip_id);
  },
  handle: (tx, payload) =>
    asSystemRole(tx, async () => {
      const head = await lockTripDraft(tx, payload.trip_id);
      if (head.status !== 'setup') {
        throw new DomainError('STATE_INVALID', { reason: 'trip_status', state: head.status });
      }
      if (head.startDate === null || head.endDate === null) {
        throw new DomainError('STATE_INVALID', { reason: 'dates_not_locked' });
      }
      const trip = await loadSetupTrip(tx, payload.trip_id);
      if (trip.destination_id === null) {
        throw new DomainError('STATE_INVALID', { reason: 'no_destination' });
      }
      const running = await liveJob(tx, head.tripId, 'draft');
      if (running !== undefined) {
        throw new DomainError('STATE_INVALID', { reason: 'draft_running', job_id: running.id });
      }
      const draft = head.draftVersionId;
      if (draft === null || head.currentVersionId !== null) {
        throw new DomainError('STATE_INVALID', { reason: 'no_plan' });
      }
      if (draft !== payload.base_version) {
        throw new DomainError('PLAN_VERSION_CONFLICT', { latest: draft });
      }
      const { rows } = await tx.query<{ stops: number; members: number }>(
        `SELECT (SELECT count(*)::int FROM plan_items
                  WHERE version_id = $2 AND booking_id IS NULL) AS stops,
                (SELECT count(*)::int FROM trip_participants
                  WHERE trip_id = $1 AND rsvp NOT IN ('out', 'waitlisted')) AS members`,
        [head.tripId, draft],
      );
      if ((rows[0]?.stops ?? 0) === 0) {
        throw new DomainError('STATE_INVALID', { reason: 'no_stops' });
      }
      await firstNumbers(
        tx,
        draft,
        { id: head.tripId, start: head.startDate, end: head.endDate },
        Math.max(1, rows[0]?.members ?? 1),
      );
      // The trip reaches review the way a drafted one does: through drafting, here in one step.
      await tx.query("UPDATE trips SET status = 'drafting' WHERE id = $1", [head.tripId]);
      await tx.query("UPDATE trips SET status = 'draft_review' WHERE id = $1", [head.tripId]);
      return { trip_id: head.tripId, version_id: draft };
    }),
});
