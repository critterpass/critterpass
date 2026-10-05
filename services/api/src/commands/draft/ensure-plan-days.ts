/**
 * `ensure_plan_days` (docs/api-contracts.md §4.6): the plan screens ask for the trip's empty plan
 * when an organiser opens a trip that has locked dates and no plan yet. It writes an organiser-only
 * draft with a day for every trip date and no stops, once: a trip that already has a draft or a
 * crew plan, or whose dates are still open, is left as it is.
 */
import { ensurePlanDaysPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { ensureDraftDays } from '../../plan/draft-days';
import { lockTripDraft } from '../../plan/draft-versioning';
import { defineCommand } from '../_framework/define-command';
import { requireOrganiser } from './shared';

export const ensurePlanDaysCommand = defineCommand({
  name: 'ensure_plan_days',
  v: 1,
  schema: ensurePlanDaysPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireOrganiser(tx, payload.trip_id);
  },
  handle: (tx, payload) =>
    asSystemRole(tx, async () => {
      const head = await lockTripDraft(tx, payload.trip_id);
      const ensured = await ensureDraftDays(tx, head);
      return { trip_id: head.tripId, version_id: ensured.versionId, created: ensured.created };
    }),
});
