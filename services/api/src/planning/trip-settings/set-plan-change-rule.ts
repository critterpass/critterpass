/**
 * `set_plan_change_rule` (docs/api-contracts-planning.md, commands): an organiser decides who may
 * change the crew's plan, from the trip's settings. The rule rides the trip row to every member's
 * phone, so their plan screens pick it up through sync; a change set already sent keeps its vote.
 * A trip that is over or called off keeps its rule (`STATE_INVALID{reason: trip_closed}`).
 */
import {
  DomainError,
  setPlanChangeRulePayloadSchema,
  type SetPlanChangeRuleResult,
} from '@cp/domain';

import { defineCommand } from '../../commands/_framework/define-command';
import { lockTripStatus, requireOrganiser } from '../../commands/trips/removal-shared';

const CLOSED = new Set(['post_trip', 'archived', 'cancelled']);

export const setPlanChangeRuleCommand = defineCommand({
  name: 'set_plan_change_rule',
  v: 1,
  schema: setPlanChangeRulePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (tx, payload) => requireOrganiser(tx, payload.trip_id),
  handle: async (tx, payload): Promise<SetPlanChangeRuleResult> => {
    const status = await lockTripStatus(tx, payload.trip_id);
    if (CLOSED.has(status)) throw new DomainError('STATE_INVALID', { reason: 'trip_closed' });
    const { rowCount } = await tx.query(
      `UPDATE trips SET plan_change_rule = $2
        WHERE id = $1 AND plan_change_rule IS DISTINCT FROM $2`,
      [payload.trip_id, payload.rule],
    );
    return { trip_id: payload.trip_id, rule: payload.rule, changed: (rowCount ?? 0) > 0 };
  },
});
