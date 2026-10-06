/**
 * The console's crew-plan contracts (docs/api-contracts.md §4.17): the list of plans crews have
 * published (or that came down) with how they are doing and how many open reports they have, and
 * the command that takes one down with a reason. Only what any traveller browsing crew plans
 * already sees is listed: the title, the place, the size of the trip and its counts.
 */
import { z } from 'zod';

const isoDate = z.iso.datetime({ offset: true });

export const ADMIN_SHARED_PLAN_STATUSES = ['published', 'unpublished'] as const;

export const adminSharedPlanSchema = z.object({
  id: z.uuid(),
  status: z.enum(ADMIN_SHARED_PLAN_STATUSES),
  title: z.string().nullable(),
  destination_name: z.string().nullable(),
  days_count: z.number().int(),
  crew_size: z.number().int(),
  rating_avg: z.number().nullable(),
  rating_count: z.number().int(),
  copies_count: z.number().int(),
  saves_count: z.number().int(),
  open_reports: z.number().int(),
  published_at: isoDate.nullable(),
  unpublished_at: isoDate.nullable(),
  unpublish_reason: z.string().nullable(),
});
export type AdminSharedPlan = z.infer<typeof adminSharedPlanSchema>;

export const adminSharedPlansQuerySchema = z.object({
  status: z.enum(ADMIN_SHARED_PLAN_STATUSES).default('published'),
});
export const adminSharedPlansResponseSchema = z.object({ items: z.array(adminSharedPlanSchema) });

/** Takes a published plan down for every crew; its own crew is told in their chat. */
export const adminUnpublishSharedPlanPayloadSchema = z.object({
  id: z.uuid(),
  reason: z.string().trim().min(3).max(500),
});
export type AdminUnpublishSharedPlanPayload = z.infer<typeof adminUnpublishSharedPlanPayloadSchema>;
