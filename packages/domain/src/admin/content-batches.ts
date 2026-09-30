/**
 * Content batches in the ops console (docs/api-contracts.md §4.17, §5.9): what the factory queued
 * for review, per-item validator reports and verdicts, and the commands that review, approve,
 * reject and roll back releases. Reviewers (content) mark items and reject batches; only the owner
 * approves, and approval publishes a new release.
 */
import { z } from 'zod';

export const CONTENT_RELEASE_KINDS = [
  'sets',
  'critters',
  'forms',
  'spawns',
  'windows',
  'personas',
  'places',
  'phrases',
  'taste_quiz',
  'help',
  'emergency',
  'facilities',
  'insurance',
  'ride_tariffs',
] as const;
export const contentReleaseKindSchema = z.enum(CONTENT_RELEASE_KINDS);
export type ContentReleaseKind = z.infer<typeof contentReleaseKindSchema>;

export const CONTENT_RELEASE_STATUSES = [
  'draft',
  'review',
  'blocked',
  'approved',
  'published',
  'superseded',
  'rejected',
] as const;
export const CONTENT_STAGES = [
  'brief',
  'generate',
  'validate',
  'render',
  'review',
  'approve',
  'publish',
] as const;

const severitySchema = z.enum(['pass', 'warn', 'fail']);
const verdictSchema = z.enum(['pending', 'keep', 'reject']);

export const contentBatchSummarySchema = z.object({
  id: z.uuid(),
  kind: contentReleaseKindSchema,
  version: z.number().int(),
  batch_key: z.string(),
  title: z.string(),
  status: z.enum(CONTENT_RELEASE_STATUSES),
  stage: z.enum(CONTENT_STAGES),
  gate: z.string().nullable(),
  blocked_reason: z.string().nullable(),
  ip_status: z.enum(['not_applicable', 'open', 'clear', 'flagged']),
  item_count: z.number().int(),
  severity: z.object({ pass: z.number().int(), warn: z.number().int(), fail: z.number().int() }),
  verdicts: z.object({
    pending: z.number().int(),
    keep: z.number().int(),
    reject: z.number().int(),
  }),
  route: z.string().nullable(),
  model: z.string().nullable(),
  tokens: z.number().int(),
  cost_micros: z.number().int(),
  notes: z.string().nullable(),
  created_at: z.iso.datetime({ offset: true }),
  approved_at: z.iso.datetime({ offset: true }).nullable(),
  published_at: z.iso.datetime({ offset: true }).nullable(),
});
export type ContentBatchSummary = z.infer<typeof contentBatchSummarySchema>;

export const liveReleaseSchema = z.object({
  kind: contentReleaseKindSchema,
  version: z.number().int(),
  published_at: z.iso.datetime({ offset: true }).nullable(),
});
export type LiveRelease = z.infer<typeof liveReleaseSchema>;

export const contentBatchListSchema = z.object({
  items: z.array(contentBatchSummarySchema),
  live: z.array(liveReleaseSchema),
});
export type ContentBatchList = z.infer<typeof contentBatchListSchema>;

export const contentBatchItemSchema = z.object({
  ref: z.string(),
  severity: severitySchema,
  checks: z.array(
    z.object({ id: z.string(), severity: z.enum(['warn', 'fail']), message: z.string() }),
  ),
  verdict: verdictSchema,
  notes: z.string().nullable(),
  /** The item as this batch has it. */
  item: z.record(z.string(), z.unknown()),
  /** The same item in the live release, when it exists. */
  previous: z.record(z.string(), z.unknown()).nullable(),
});
export type ContentBatchItem = z.infer<typeof contentBatchItemSchema>;

export const contentBatchDetailSchema = contentBatchSummarySchema.extend({
  items: z.array(contentBatchItemSchema),
  live_version: z.number().int().nullable(),
});
export type ContentBatchDetail = z.infer<typeof contentBatchDetailSchema>;

export const reviewContentItemPayloadSchema = z.object({
  batch_id: z.uuid(),
  item_ref: z.string().min(1),
  verdict: z.enum(['keep', 'reject']),
  notes: z.string().max(1000).optional(),
});

export const approveContentBatchPayloadSchema = z.object({
  batch_id: z.uuid(),
  notes: z.string().max(1000).optional(),
  /** The owner has worked through the batch's IP checklist. */
  ip_signed_off: z.boolean().optional(),
});

export const rejectContentBatchPayloadSchema = z.object({
  batch_id: z.uuid(),
  notes: z.string().min(1).max(2000),
});

export const rollbackContentReleasePayloadSchema = z.object({
  kind: contentReleaseKindSchema,
  to_version: z.number().int().min(1),
});

/** Opening hours researched from official sites, waiting for a person to verify them. */
export const hoursProposalSchema = z.object({
  id: z.uuid(),
  poi_id: z.uuid(),
  poi_name: z.string(),
  destination: z.string(),
  hours: z.record(z.string(), z.unknown()),
  source_url: z.string(),
  fetched_at: z.iso.datetime({ offset: true }),
  batch_key: z.string(),
});
export type HoursProposalRow = z.infer<typeof hoursProposalSchema>;
export const hoursProposalListSchema = z.object({ items: z.array(hoursProposalSchema) });

export const verifyPoiHoursPayloadSchema = z.object({
  proposal_id: z.uuid(),
  verdict: z.enum(['verify', 'reject']),
});
