/**
 * Cost index review in the ops console (content role): each destination's editorial price bands
 * per stay type (nightly stay range, food and fun per person per day) with their review state.
 * Rows load as drafts and reach travellers only once approved through the audited
 * `review_cost_index` command, as they are or with edited amounts.
 */
import { z } from 'zod';

export const COST_REVIEW_STATES = ['pending', 'approved'] as const;
export const costReviewStateSchema = z.enum(COST_REVIEW_STATES);
export type CostReviewState = z.infer<typeof costReviewStateSchema>;

export const costReviewQuerySchema = z.object({
  state: costReviewStateSchema.default('pending'),
  destination_id: z.uuid().optional(),
});
export type CostReviewQuery = z.infer<typeof costReviewQuerySchema>;

const minor = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const costIndexAmountsSchema = z
  .object({
    /** Per person per night. */
    nightly_minor_low: minor,
    nightly_minor_high: minor,
    /** Per person per day. */
    food_pp_day_minor: minor,
    fun_pp_day_minor: minor,
  })
  .strict()
  .refine((amounts) => amounts.nightly_minor_high >= amounts.nightly_minor_low, {
    message: 'The nightly high must not be below the low',
    path: ['nightly_minor_high'],
  });
export type CostIndexAmounts = z.infer<typeof costIndexAmountsSchema>;

/**
 * An index is an estimate when it cites no source page: the editorial seed is authored from
 * general price levels, so only a row with a checked link counts as sourced.
 */
export function isEstimatedCostIndex(row: { source_url: string | null }): boolean {
  return row.source_url === null;
}

export const costReviewIndexSchema = z.object({
  id: z.uuid(),
  destination_id: z.uuid(),
  destination_name: z.string(),
  stay_type: z.string(),
  nightly_minor_low: minor,
  nightly_minor_high: minor,
  food_pp_day_minor: minor,
  fun_pp_day_minor: minor,
  currency: z.string(),
  source: z.string(),
  source_url: z.string().nullable(),
  sourced_on: z.iso.date(),
  estimated: z.boolean(),
  reviewed_at: z.string().nullable(),
});
export type CostReviewIndex = z.infer<typeof costReviewIndexSchema>;

export const costReviewIndicesSchema = z.object({ items: z.array(costReviewIndexSchema) });

export const costReviewDestinationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  pending: z.number().int().nonnegative(),
});

export const costReviewSummarySchema = z.object({
  pending: z.number().int().nonnegative(),
  destinations: z.array(costReviewDestinationSchema),
});
export type CostReviewSummary = z.infer<typeof costReviewSummarySchema>;

/** Approves one index; with `amounts`, the edited values are saved in the same step. */
export const reviewCostIndexInputSchema = z
  .object({
    index_id: z.uuid(),
    amounts: costIndexAmountsSchema.optional(),
  })
  .strict();
export type ReviewCostIndexInput = z.infer<typeof reviewCostIndexInputSchema>;

export const reviewCostIndexResultSchema = z.object({
  index_id: z.uuid(),
  destination_id: z.uuid(),
  edited: z.boolean(),
  reviewed_at: z.string(),
});
export type ReviewCostIndexResult = z.infer<typeof reviewCostIndexResultSchema>;
