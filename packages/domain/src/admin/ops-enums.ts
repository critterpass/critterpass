/**
 * Ops-console enums (docs/data-model.md §3.15, §3.16). The migration's CHECK constraints are
 * generated from these lists, so the database and every caller validate against the same values.
 */
import { z } from 'zod';

export const CONCIERGE_TASK_KINDS = [
  'vendor_message',
  'clinic_handoff',
  'partner_booking',
  'review',
] as const;
export const conciergeTaskKindSchema = z.enum(CONCIERGE_TASK_KINDS);
export type ConciergeTaskKind = z.infer<typeof conciergeTaskKindSchema>;

export const CONCIERGE_TASK_STATUSES = [
  'new',
  'in_progress',
  'waiting_user',
  'done',
  'cancelled',
] as const;
export const conciergeTaskStatusSchema = z.enum(CONCIERGE_TASK_STATUSES);
export type ConciergeTaskStatus = z.infer<typeof conciergeTaskStatusSchema>;

/** Supplier partners with an adapter in `packages/suppliers` (docs/product-decisions.md §5). */
export const PARTNER_KEYS = [
  'agoda_demand',
  'klook_activity',
  'trip_com_at',
  'viator_booking',
  'gyg_api',
] as const;
export const partnerKeySchema = z.enum(PARTNER_KEYS);
export type PartnerKey = z.infer<typeof partnerKeySchema>;

/** `link` = affiliate-link copy; `booking` = in-app booking copy once the partner approved it. */
export const PARTNER_COPY_MODES = ['link', 'booking'] as const;
export const partnerCopyModeSchema = z.enum(PARTNER_COPY_MODES);
export type PartnerCopyMode = z.infer<typeof partnerCopyModeSchema>;

export const MODERATION_REPORT_STATUSES = ['open', 'actioned', 'dismissed'] as const;
export const moderationReportStatusSchema = z.enum(MODERATION_REPORT_STATUSES);
export type ModerationReportStatus = z.infer<typeof moderationReportStatusSchema>;

export const MODERATION_VERDICTS = ['approve', 'hide', 'remove', 'ban_author'] as const;
export const moderationVerdictSchema = z.enum(MODERATION_VERDICTS);
export type ModerationVerdict = z.infer<typeof moderationVerdictSchema>;

/**
 * Report subject kinds are registered by the phases that own the reported content, so the column
 * only enforces the snake_case shape, never a closed list.
 */
export const MODERATION_SUBJECT_KIND_PATTERN = /^[a-z][a-z_]*$/;
