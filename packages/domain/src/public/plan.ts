/**
 * A published crew plan as the web shows it to a stranger holding its link
 * (docs/api-contracts.md §5.6 `GET /v1/public/plan/{token}`): only what every traveller agreed to
 * publish, cut further for the open web. First names only when the crew turned names on; never
 * costs, photos, tips, notes, chat or who anyone is.
 */
import { z } from 'zod';

import { POI_CATEGORIES } from '../places/categories';

/** The most places one day lists on the web. */
export const PUBLIC_PLAN_PLACES_PER_DAY = 12;

export const publicPlanDaySchema = z.object({
  day_no: z.number().int().positive(),
  theme: z.string().nullable(),
  places: z
    .array(z.object({ name: z.string(), category: z.enum(POI_CATEGORIES) }))
    .max(PUBLIC_PLAN_PLACES_PER_DAY),
});
export type PublicPlanDay = z.infer<typeof publicPlanDaySchema>;

export const publicPlanSchema = z.object({
  kind: z.literal('plan'),
  /** The published plan's id: what the app opens to copy it into a trip. */
  shared_plan_id: z.uuid(),
  title: z.string().nullable(),
  destination_name: z.string(),
  days_count: z.number().int().nonnegative(),
  travel_month: z.number().int().min(1).max(12).nullable(),
  travel_year: z.number().int().nullable(),
  crew_size: z.number().int().positive(),
  /** The travellers' first names, only when the crew published them. */
  crew_names: z.array(z.string()).nullable(),
  /** True once the trip has ended; false for a plan not travelled yet. */
  travelled: z.boolean(),
  tags: z.array(z.string()),
  days: z.array(publicPlanDaySchema).max(60),
  rating_avg: z.number().nullable(),
  rating_count: z.number().int().nonnegative(),
  copies_count: z.number().int().nonnegative(),
});
export type PublicPlan = z.infer<typeof publicPlanSchema>;
