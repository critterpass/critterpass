/**
 * The personal "just me" overlay (docs/product-decisions.md Q-35, Q-44): a member applies the ops
 * they accepted to their own plan only. The rows (`personal_plan_ops`) are owner-only; the group
 * plan never changes except that a skipped item drops the member from its attendees, which is all
 * the crew ever learns. `planner/overlay` merges the group version with these rows on the device.
 */
import { z } from 'zod';

import { changeSetOpsSchema } from './change-set-ops';

export const PERSONAL_PLAN_OP_STATUSES = ['active', 'dropped'] as const;
export const personalPlanOpStatusSchema = z.enum(PERSONAL_PLAN_OP_STATUSES);
export type PersonalPlanOpStatus = z.infer<typeof personalPlanOpStatusSchema>;

export const personalPlanOpsRowSchema = z.object({
  id: z.uuid(),
  trip_id: z.uuid(),
  user_id: z.uuid(),
  change_set_id: z.uuid().nullable(),
  base_version_id: z.uuid(),
  ops: changeSetOpsSchema,
  status: personalPlanOpStatusSchema,
});
export type PersonalPlanOpsRow = z.infer<typeof personalPlanOpsRowSchema>;

/**
 * Keep or drop personal ops that clash with the crew plan. Keep re-bases them on the current
 * version (the member's version wins again); drop retires them.
 */
export const resolveOverlayClashPayloadSchema = z.object({
  personal_ops_id: z.uuid(),
  keep: z.boolean(),
});
