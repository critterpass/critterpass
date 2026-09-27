/**
 * The plan item shape ChangeSet ops diff against (docs/data-model.md §3.3). `stable_id` is the key
 * that survives across itinerary versions; everything else here is what a `move`/`retime`/`swap`/
 * `add` op's `before`/`after` snapshot may carry. This is structural only — semantic validation
 * (e.g. a `retime` landing inside the trip's date range) is the planner's job.
 */
import { z } from 'zod';

import { generateUuidV7 } from '../ids';
import { PLAN_ITEM_COST_MODELS, PLAN_ITEM_STATUSES } from '../enums/plan';

/** A fresh stable_id for a plan item created outside `apply_change_set` (e.g. an `add` op's target). */
export function generateStableId(): string {
  return generateUuidV7();
}

export const planItemSnapshotSchema = z.object({
  /** Which day of the *target* version this item sits on; resolved to a `day_id` at apply time. */
  day_no: z.number().int().positive().optional(),
  starts_at: z.iso.datetime({ offset: true }).optional(),
  ends_at: z.iso.datetime({ offset: true }).optional(),
  tz: z.string().min(1).optional(),
  lane: z.string().min(1).optional(),
  attendee_ids: z.array(z.uuid()).optional(),
  poi_id: z.uuid().nullable().optional(),
  provider_id: z.uuid().nullable().optional(),
  booking_id: z.uuid().nullable().optional(),
  must_do_id: z.uuid().nullable().optional(),
  category: z.string().min(1).optional(),
  cost_model: z.enum(PLAN_ITEM_COST_MODELS).optional(),
  amount_minor: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  status: z.enum(PLAN_ITEM_STATUSES).optional(),
  flexibility: z.string().min(1).nullable().optional(),
  is_outdoor: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export type PlanItemSnapshot = z.infer<typeof planItemSnapshotSchema>;
