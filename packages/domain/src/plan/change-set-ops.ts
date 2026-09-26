/**
 * `change_sets.ops` structural shape — the single schema every ChangeSet op is validated against,
 * wherever it is proposed or applied from. Kinds mirror `app.apply_change_set`'s migration comment
 * (add/move/remove/retime/swap, keyed by `stable_id`). Structural only: this schema does not know
 * whether an op is a sane *plan* (e.g. a `retime` inside the trip's dates) — `packages/planner`
 * validates semantics before a change set may be approved.
 */
import { z } from 'zod';

import { planItemSnapshotSchema } from './plan-item';

export const CHANGE_SET_OP_KINDS = ['add', 'move', 'remove', 'retime', 'swap'] as const;
export const changeSetOpKindSchema = z.enum(CHANGE_SET_OP_KINDS);
export type ChangeSetOpKind = z.infer<typeof changeSetOpKindSchema>;

export const changeSetOpSchema = z.object({
  op: changeSetOpKindSchema,
  /** The plan item's `stable_id`; for `add`, the client-chosen id of the item being created. */
  target: z.uuid(),
  before: planItemSnapshotSchema.nullable().optional(),
  after: planItemSnapshotSchema.nullable().optional(),
  reason: z.string().min(1),
  affected_user_ids: z.array(z.uuid()),
  booking_impact: z.boolean(),
  source_ids: z.array(z.string().min(1)).optional(),
});
export type ChangeSetOp = z.infer<typeof changeSetOpSchema>;

export const changeSetOpsSchema = z.array(changeSetOpSchema).min(1);
export type ChangeSetOps = z.infer<typeof changeSetOpsSchema>;
