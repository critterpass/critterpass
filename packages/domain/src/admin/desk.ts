/**
 * Concierge / ops desk (docs/api-contracts.md §4.17): the task status machine, SLA bands, the
 * console's task commands and the user's `approve_ops_action`. A vendor message or partner booking
 * leaves only after the user approved the exact text (`ops.approvals`); the api enforces that with
 * `assertApproved` before any outbound action.
 */
import { z } from 'zod';

import {
  MODERATION_SUBJECT_KIND_PATTERN,
  conciergeTaskKindSchema,
  conciergeTaskStatusSchema,
  type ConciergeTaskStatus,
} from './ops-enums';

const isoDate = z.iso.datetime({ offset: true });

/** Allowed status moves; `done` and `cancelled` are final. */
export const CONCIERGE_TASK_TRANSITIONS: Readonly<
  Record<ConciergeTaskStatus, readonly ConciergeTaskStatus[]>
> = {
  new: ['in_progress', 'waiting_user', 'cancelled'],
  in_progress: ['waiting_user', 'done', 'cancelled'],
  waiting_user: ['in_progress', 'done', 'cancelled'],
  done: [],
  cancelled: [],
};

export function canMoveConciergeTask(from: ConciergeTaskStatus, to: ConciergeTaskStatus): boolean {
  return CONCIERGE_TASK_TRANSITIONS[from].includes(to);
}

export const OPEN_CONCIERGE_STATUSES: readonly ConciergeTaskStatus[] = [
  'new',
  'in_progress',
  'waiting_user',
];

/** A task due within this window counts as "due soon" (home counter, amber). */
export const DESK_DUE_SOON_MS = 2 * 60 * 60 * 1000;

export const DESK_SLA_STATES = ['overdue', 'due_soon', 'ok', 'none'] as const;
export type DeskSla = (typeof DESK_SLA_STATES)[number];

export function deskSla(dueAt: Date | null, status: ConciergeTaskStatus, now: Date): DeskSla {
  if (dueAt === null || !OPEN_CONCIERGE_STATUSES.includes(status)) return 'none';
  const left = dueAt.getTime() - now.getTime();
  if (left < 0) return 'overdue';
  return left <= DESK_DUE_SOON_MS ? 'due_soon' : 'ok';
}

const note = z.string().trim().min(1).max(2000);

export const createConciergeTaskPayloadSchema = z.object({
  kind: conciergeTaskKindSchema,
  trip_id: z.uuid().nullable().default(null),
  requested_by: z.uuid().nullable().default(null),
  due_at: isoDate.nullable().default(null),
  note: note.nullable().default(null),
});
export type CreateConciergeTaskPayload = z.infer<typeof createConciergeTaskPayloadSchema>;

export const updateConciergeTaskPayloadSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    status: conciergeTaskStatusSchema.optional(),
    /** `self` takes the task, `null` hands it back to the queue. */
    assignee: z.union([z.literal('self'), z.null()]).optional(),
    note: note.optional(),
  })
  .refine(
    (payload) =>
      payload.status !== undefined || payload.assignee !== undefined || payload.note !== undefined,
    { message: 'nothing to change' },
  );
export type UpdateConciergeTaskPayload = z.infer<typeof updateConciergeTaskPayloadSchema>;

export const approvalSubjectKindSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(MODERATION_SUBJECT_KIND_PATTERN, 'snake_case kind');

export const approveOpsActionPayloadSchema = z.object({
  subject_kind: approvalSubjectKindSchema,
  subject_id: z.uuid(),
  /** Exactly the text the user saw and approved, stored verbatim. */
  text_shown: z.string().min(1).max(4000),
});
export type ApproveOpsActionPayload = z.infer<typeof approveOpsActionPayloadSchema>;

export const deskApprovalSchema = z.object({
  id: z.uuid(),
  text_shown: z.string(),
  approved_at: isoDate,
  op_id: z.uuid().nullable(),
});

export const deskTaskSchema = z.object({
  id: z.uuid(),
  kind: conciergeTaskKindSchema,
  status: conciergeTaskStatusSchema,
  trip_id: z.uuid().nullable(),
  requested_by: z.uuid().nullable(),
  requester_name: z.string().nullable(),
  assignee: z.string().nullable(),
  assigned_to_me: z.boolean(),
  due_at: isoDate.nullable(),
  sla: z.enum(DESK_SLA_STATES),
  notes: z.array(z.object({ at: isoDate, admin: z.string(), text: z.string() })),
  version: z.number().int(),
  created_at: isoDate,
  approval: deskApprovalSchema.nullable(),
});
export type DeskTask = z.infer<typeof deskTaskSchema>;

export const deskQuerySchema = z.object({ status: conciergeTaskStatusSchema.default('new') });
export const deskResponseSchema = z.object({ items: z.array(deskTaskSchema) });
export const deskSummarySchema = z.object({
  open: z.number().int().nonnegative(),
  due_soon: z.number().int().nonnegative(),
});
