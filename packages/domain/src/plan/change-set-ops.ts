/**
 * `change_sets.ops` structural shape — the single schema every ChangeSet op is validated against,
 * wherever it is proposed or applied from. Plan item kinds mirror `app.apply_change_set`'s
 * migration comment (add/move/remove/retime/swap, keyed by `stable_id`); `assign_provider` sets a
 * driver on days of the trip and is keyed by the provider's id. Structural only: this schema does
 * not know whether an op is a sane *plan* (e.g. a `retime` inside the trip's dates) —
 * `packages/planner` validates semantics before a change set may be approved.
 */
import { z } from 'zod';

import { providerAssignmentSchema } from '../drivers/schemas';
import { planItemSnapshotSchema } from './plan-item';

/** The kinds that change a plan item. */
export const CHANGE_SET_OP_KINDS = ['add', 'move', 'remove', 'retime', 'swap'] as const;
export const changeSetOpKindSchema = z.enum(CHANGE_SET_OP_KINDS);
export type ChangeSetOpKind = z.infer<typeof changeSetOpKindSchema>;

/** The crew's pick of a driver, decided like any other change (`target` is the provider). */
export const ASSIGN_PROVIDER_OP = 'assign_provider';

export const changeSetOpSchema = z
  .object({
    op: z.enum([...CHANGE_SET_OP_KINDS, ASSIGN_PROVIDER_OP]),
    /**
     * The plan item's `stable_id`; for `add`, the client-chosen id of the item being created; for
     * `assign_provider`, the provider's id.
     */
    target: z.uuid(),
    before: planItemSnapshotSchema.nullable().optional(),
    after: planItemSnapshotSchema.nullable().optional(),
    /** `assign_provider` only: the days and the terms voted on. */
    assignment: providerAssignmentSchema.optional(),
    reason: z.string().min(1),
    affected_user_ids: z.array(z.uuid()),
    booking_impact: z.boolean(),
    source_ids: z.array(z.string().min(1)).optional(),
    /** The reviewer's toggle on the review screen; absent means accepted. Rejected ops never apply. */
    accepted: z.boolean().optional(),
  })
  .superRefine((op, ctx) => {
    if (op.op === ASSIGN_PROVIDER_OP) {
      if (op.assignment === undefined) {
        ctx.addIssue({ code: 'custom', path: ['assignment'], message: 'required' });
      }
      if (op.before != null || op.after != null) {
        ctx.addIssue({ code: 'custom', path: ['after'], message: 'not a plan item change' });
      }
    } else if (op.assignment !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['assignment'], message: 'assign_provider only' });
    }
  });
export type ChangeSetOp = z.infer<typeof changeSetOpSchema>;
export type PlanItemChangeSetOp = ChangeSetOp & { readonly op: ChangeSetOpKind };
export type AssignProviderChangeSetOp = ChangeSetOp & {
  readonly op: typeof ASSIGN_PROVIDER_OP;
  readonly assignment: NonNullable<ChangeSetOp['assignment']>;
};

export const changeSetOpsSchema = z.array(changeSetOpSchema).min(1);
export type ChangeSetOps = z.infer<typeof changeSetOpsSchema>;

export function isAssignProviderOp(op: ChangeSetOp): op is AssignProviderChangeSetOp {
  return op.op === ASSIGN_PROVIDER_OP && op.assignment !== undefined;
}

/** The ops that change plan items: what a replay, an overlay or a personal apply works on. */
export function planItemOps(ops: readonly ChangeSetOp[]): PlanItemChangeSetOp[] {
  return ops.filter((op): op is PlanItemChangeSetOp => op.op !== ASSIGN_PROVIDER_OP);
}
