/**
 * Plan editing, change review and comment domain events (docs/api-contracts.md §4.2, §4.6). The
 * change set lifecycle's proposed/applied/rejected/reverted events predate this module and live in
 * ../events/catalogue.ts. Payloads carry ids, counts and enum values only: never a comment body,
 * an item title or a time.
 */
import { z } from 'zod';

import { commentAnchorKindSchema } from './comments';

export const PLAN_EVENT_TYPES = [
  'plan.ops_applied',
  'change_set.created',
  'change_set.item_toggled',
  'change_set.decided',
  'change_set.stale',
  'change_set.expired',
  'comment.added',
  'comment.edited',
  'comment.deleted',
  'comment.plusoned',
  'comment.unplusoned',
] as const;
export type PlanEventType = (typeof PLAN_EVENT_TYPES)[number];

export const PLAN_OPS_SOURCES = ['ops', 'changeset', 'attendance'] as const;

const changeSet = z.object({ trip_id: z.uuid(), change_set_id: z.uuid() });
const comment = z.object({ trip_id: z.uuid(), comment_id: z.uuid() });

export const PLAN_EVENT_PAYLOADS = {
  // Aggregate is the trip; a new current version replaced `base_version_id`.
  'plan.ops_applied': z.object({
    trip_id: z.uuid(),
    version_id: z.uuid(),
    base_version_id: z.uuid(),
    op_count: z.number().int().nonnegative(),
    source: z.enum(PLAN_OPS_SOURCES),
  }),
  'change_set.created': changeSet.extend({ source: z.enum(['user', 'guide_suggestion']) }),
  'change_set.item_toggled': changeSet.extend({ target: z.uuid(), accepted: z.boolean() }),
  'change_set.decided': changeSet.extend({ user_id: z.uuid(), decision: z.enum(['yes', 'no']) }),
  'change_set.stale': changeSet,
  'change_set.expired': changeSet,
  'comment.added': comment.extend({ anchor_kind: commentAnchorKindSchema }),
  'comment.edited': comment,
  'comment.deleted': comment,
  'comment.plusoned': comment.extend({ user_id: z.uuid() }),
  'comment.unplusoned': comment.extend({ user_id: z.uuid() }),
} as const satisfies Record<PlanEventType, z.ZodType>;
