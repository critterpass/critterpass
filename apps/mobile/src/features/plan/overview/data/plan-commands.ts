/** The direct plan write the overview sends (docs/api-contracts.md §4.6 `apply_plan_ops`). */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import { msg } from '@lingui/core/macro';

import type { ApplyPlanOpsPayload } from '@cp/domain';

import { defineClientCommand } from '@/data/commands/summaries';

/** Offline-capable: a reorder made without signal is queued and replays once back online. */
export const APPLY_PLAN_OPS = defineClientCommand<ApplyPlanOpsPayload>({
  name: 'apply_plan_ops',
  offline: true,
  summarize: () => msg({ id: 'plan.overview.queued.reorder', message: 'New day order' }),
});
