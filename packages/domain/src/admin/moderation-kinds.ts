/**
 * Moderation contracts (docs/api-contracts.md §4.17): what a user files with `report_content`, what
 * an operator decides with `moderate_item`, and the queue the console shows. Report subject kinds
 * are registered by the phases that own the reported content (a kind handler on the api side); a
 * kind is a snake_case name here, never a closed list.
 */
import { z } from 'zod';

import {
  MODERATION_SUBJECT_KIND_PATTERN,
  moderationReportStatusSchema,
  moderationVerdictSchema,
  type ModerationReportStatus,
  type ModerationVerdict,
} from './ops-enums';

/** Reports one user may file per rolling 24 h. */
export const REPORT_DAILY_LIMIT = 20;
/** A report of a subject that already has an open report this recent joins it (count + 1). */
export const REPORT_COLLAPSE_WINDOW_HOURS = 24;

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'hate',
  'sexual',
  'violence',
  'impersonation',
  'personal_info',
  'other',
] as const;
export const reportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof reportReasonSchema>;

/** Who filed a report: a user through `report_content`, or the input compliance check's review band. */
export const MODERATION_REPORT_SOURCES = ['user', 'compliance'] as const;
export const moderationReportSourceSchema = z.enum(MODERATION_REPORT_SOURCES);
export type ModerationReportSource = z.infer<typeof moderationReportSourceSchema>;

export const moderationSubjectKindSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(MODERATION_SUBJECT_KIND_PATTERN, 'snake_case kind');

export const reportContentPayloadSchema = z.object({
  kind: moderationSubjectKindSchema,
  id: z.uuid(),
  reason: reportReasonSchema,
});
export type ReportContentPayload = z.infer<typeof reportContentPayloadSchema>;

export const reportContentResultSchema = z.object({
  report_id: z.uuid(),
  /** True when the report joined an open one instead of opening a new row. */
  collapsed: z.boolean(),
});
export type ReportContentResult = z.infer<typeof reportContentResultSchema>;

export const moderateItemPayloadSchema = z.object({
  kind: moderationSubjectKindSchema,
  id: z.uuid(),
  verdict: moderationVerdictSchema,
  note: z.string().trim().min(1).max(500).nullable().default(null),
});
export type ModerateItemPayload = z.infer<typeof moderateItemPayloadSchema>;

/** `approve` keeps the content and dismisses the report; every other verdict actions it. */
export function reportStatusForVerdict(verdict: ModerationVerdict): ModerationReportStatus {
  return verdict === 'approve' ? 'dismissed' : 'actioned';
}

/** What the console shows for a reported subject, produced by the subject kind's handler. */
export const moderationPreviewSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), title: z.string(), text: z.string() }),
  z.object({
    type: z.literal('image'),
    title: z.string(),
    /** A short-lived media Worker URL (HMAC-signed), or null when media signing is not configured. */
    url: z.string().nullable(),
  }),
  z.object({
    type: z.literal('user'),
    title: z.string(),
    username: z.string().nullable(),
    status: z.string(),
    member_since: z.string().nullable(),
  }),
  /** The subject no longer exists (deleted before review). */
  z.object({ type: z.literal('missing'), title: z.string() }),
]);
export type ModerationPreview = z.infer<typeof moderationPreviewSchema>;

export const moderationQueueItemSchema = z.object({
  id: z.uuid(),
  target_kind: z.string(),
  target_id: z.uuid(),
  source: moderationReportSourceSchema,
  reason: z.string(),
  status: moderationReportStatusSchema,
  report_count: z.number().int().positive(),
  last_reported_at: z.iso.datetime({ offset: true }),
  verdict: moderationVerdictSchema.nullable(),
  decided_by: z.string().nullable(),
  decided_at: z.iso.datetime({ offset: true }).nullable(),
  /** The verdicts this subject's kind handler can carry out. */
  verdicts: z.array(moderationVerdictSchema),
  preview: moderationPreviewSchema,
});
export type ModerationQueueItem = z.infer<typeof moderationQueueItemSchema>;

export const moderationQueueQuerySchema = z.object({
  status: moderationReportStatusSchema.default('open'),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const moderationSummarySchema = z.object({ open: z.number().int().nonnegative() });
export type ModerationSummary = z.infer<typeof moderationSummarySchema>;
