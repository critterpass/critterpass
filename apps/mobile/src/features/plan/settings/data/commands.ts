/** Client specs for the trip settings commands (docs/api-contracts-planning.md). */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type { SetPlanChangeRulePayload } from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const setPlanChangeRuleCommand = defineClientCommand<SetPlanChangeRulePayload>({
  name: 'set_plan_change_rule',
  offline: true,
  summarize: () => msg({ id: 'plan.settings.queued.rule', message: 'Who can change the plan' }),
});
