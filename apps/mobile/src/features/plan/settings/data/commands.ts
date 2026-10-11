/** Client specs for the trip settings commands (docs/api-contracts-planning.md). */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type { CancelTripPayload, LeaveTripPayload, SetPlanChangeRulePayload } from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const setPlanChangeRuleCommand = defineClientCommand<SetPlanChangeRulePayload>({
  name: 'set_plan_change_rule',
  offline: true,
  summarize: () => msg({ id: 'plan.settings.queued.rule', message: 'Who can change the plan' }),
});

/** Calling the trip off and leaving it need the server's answer there and then. */
export const cancelTripCommand = defineClientCommand<CancelTripPayload>({
  name: 'cancel_trip',
  offline: false,
});

export const leaveTripCommand = defineClientCommand<LeaveTripPayload>({
  name: 'leave_trip',
  offline: false,
});
