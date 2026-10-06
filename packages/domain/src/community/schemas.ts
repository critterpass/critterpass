/**
 * Community commands and reads (docs/api-contracts.md §4.16, §5.5): publishing a crew plan with
 * every participant's consent, browsing and copying other crews' plans, and rating the places a
 * trip visited. Reporting a plan goes through `report_content` (kind `shared_plan`). Errors reuse the shared codes with a `reason` in `detail`.
 */
import { z } from 'zod';

import { POI_CATEGORIES } from '../places/categories';
import { sharedPlanProjectionSchema, sharedPlanTogglesSchema } from './projection';

export const SHARED_PLAN_STATUSES = [
  'pending_consent',
  'declined',
  'preparing',
  'published',
  'unpublished',
] as const;
export const sharedPlanStatusSchema = z.enum(SHARED_PLAN_STATUSES);
export type SharedPlanStatus = z.infer<typeof sharedPlanStatusSchema>;

export const CONSENT_DECISIONS = ['pending', 'approved', 'declined', 'withdrawn'] as const;
export const consentDecisionSchema = z.enum(CONSENT_DECISIONS);
export type ConsentDecision = z.infer<typeof consentDecisionSchema>;

export const RATING_VERDICTS = ['loved', 'fine', 'skip'] as const;
export const ratingVerdictSchema = z.enum(RATING_VERDICTS);
export type RatingVerdict = z.infer<typeof ratingVerdictSchema>;

export const TIP_STATUSES = ['none', 'pending', 'approved', 'review', 'rejected'] as const;
export const tipStatusSchema = z.enum(TIP_STATUSES);
export type TipStatus = z.infer<typeof tipStatusSchema>;

export const TIP_MAX_CHARS = 200;
const dayNoSchema = z.number().int().min(1).max(60);

// ---- commands ------------------------------------------------------------------------------

export const publishSharedPlanPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  toggles: sharedPlanTogglesSchema,
});
export const sharedPlanStateResultSchema = z.object({
  shared_plan_id: z.uuid(),
  status: sharedPlanStatusSchema,
});
export type SharedPlanStateResult = z.infer<typeof sharedPlanStateResultSchema>;

export const respondPublishConsentPayloadSchema = z.strictObject({
  shared_plan_id: z.uuid(),
  approve: z.boolean(),
});
export const sharedPlanIdPayloadSchema = z.strictObject({ shared_plan_id: z.uuid() });
export const updateSharedPlanPayloadSchema = z.strictObject({
  shared_plan_id: z.uuid(),
  toggles: sharedPlanTogglesSchema,
});

export const createPlanLinkPayloadSchema = z.strictObject({ trip_id: z.uuid() });
export const createPlanLinkResultSchema = z.object({
  link_id: z.uuid(),
  token: z.string(),
  url: z.string(),
});
export type CreatePlanLinkResult = z.infer<typeof createPlanLinkResultSchema>;
export const revokePlanLinkPayloadSchema = z.strictObject({ link_id: z.uuid() });

export const savedResultSchema = z.object({ saved: z.boolean() });

export const copySharedPlanPayloadSchema = z.strictObject({
  shared_plan_id: z.uuid(),
  trip_id: z.uuid(),
  /** Omitted: the whole plan. */
  days: z.array(dayNoSchema).min(1).max(60).optional(),
});
export const copySharedPlanResultSchema = z.object({
  idea_ids: z.array(z.uuid()),
  /** The placing job that fits the copied places into the trip's days, when the trip has a plan. */
  job_id: z.uuid().nullable(),
  places: z.number().int().min(0),
});
export type CopySharedPlanResult = z.infer<typeof copySharedPlanResultSchema>;

export const suggestSharedPlanPayloadSchema = copySharedPlanPayloadSchema;
export const suggestedResultSchema = z.object({ suggested: z.literal(true) });

export const ratePlacesPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  verdicts: z
    .array(
      z.strictObject({
        poi_id: z.uuid(),
        verdict: ratingVerdictSchema,
        tip: z.string().trim().min(1).max(TIP_MAX_CHARS).optional(),
      }),
    )
    .min(1)
    .max(100),
});
export const ratePlacesResultSchema = z.object({
  rated: z.number().int().min(0),
  tips: z.array(z.object({ poi_id: z.uuid(), status: tipStatusSchema })),
});
export type RatePlacesResult = z.infer<typeof ratePlacesResultSchema>;

export const COMMUNITY_ERROR_REASONS = {
  STATE_INVALID: ['already_shared', 'no_plan', 'not_pending', 'not_published', 'no_destination'],
  FORBIDDEN: ['not_organiser', 'not_participant', 'own_plan'],
  NOT_FOUND: ['shared_plan', 'link', 'place'],
} as const;

export const COMMUNITY_COMMANDS = {
  publish_shared_plan: {
    payload: publishSharedPlanPayloadSchema,
    result: sharedPlanStateResultSchema,
  },
  respond_publish_consent: {
    payload: respondPublishConsentPayloadSchema,
    result: sharedPlanStateResultSchema,
  },
  withdraw_publish_consent: {
    payload: sharedPlanIdPayloadSchema,
    result: sharedPlanStateResultSchema,
  },
  update_shared_plan: {
    payload: updateSharedPlanPayloadSchema,
    result: sharedPlanStateResultSchema,
  },
  unpublish_shared_plan: {
    payload: sharedPlanIdPayloadSchema,
    result: sharedPlanStateResultSchema,
  },
  create_plan_link: { payload: createPlanLinkPayloadSchema, result: createPlanLinkResultSchema },
  revoke_plan_link: {
    payload: revokePlanLinkPayloadSchema,
    result: z.object({ revoked: z.literal(true) }),
  },
  save_shared_plan: { payload: sharedPlanIdPayloadSchema, result: savedResultSchema },
  unsave_shared_plan: { payload: sharedPlanIdPayloadSchema, result: savedResultSchema },
  copy_shared_plan: { payload: copySharedPlanPayloadSchema, result: copySharedPlanResultSchema },
  suggest_shared_plan_to_organiser: {
    payload: suggestSharedPlanPayloadSchema,
    result: suggestedResultSchema,
  },
  rate_places: { payload: ratePlacesPayloadSchema, result: ratePlacesResultSchema },
} as const satisfies Record<string, { payload: z.ZodType; result: z.ZodType }>;
export type CommunityCommandName = keyof typeof COMMUNITY_COMMANDS;

// ---- reads ---------------------------------------------------------------------------------

export const sharedPlanCardSchema = z.object({
  id: z.uuid(),
  title: z.string().nullable(),
  destination_name: z.string(),
  tags: z.array(z.string()),
  days_count: z.number().int(),
  travel_month: z.number().int().nullable(),
  travel_year: z.number().int().nullable(),
  crew_size: z.number().int(),
  crew_names: z.array(z.string()).nullable(),
  cost_pp_rounded_minor: z.number().int().nullable(),
  currency: z.string().nullable(),
  rating_avg: z.number().nullable(),
  rating_count: z.number().int(),
  copies_count: z.number().int(),
  travelled: z.boolean(),
  /** 0–100 against the viewing crew; null without a viewer taste. */
  match_pct: z.number().int().min(0).max(100).nullable(),
});
export type SharedPlanCard = z.infer<typeof sharedPlanCardSchema>;

export const SHARED_PLAN_SORTS = ['match', 'newest', 'rating'] as const;
export const sharedPlansQuerySchema = z.object({
  /** The destination's id or slug. */
  destination_id: z.string().min(1).max(120),
  trip_id: z.uuid().optional(),
  days_min: z.coerce.number().int().min(1).max(60).optional(),
  days_max: z.coerce.number().int().min(1).max(60).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  crew_min: z.coerce.number().int().min(1).max(50).optional(),
  crew_max: z.coerce.number().int().min(1).max(50).optional(),
  max_cost_minor: z.coerce.number().int().min(0).optional(),
  tags: z.string().max(400).optional(),
  sort: z.enum(SHARED_PLAN_SORTS).default('match'),
  cursor: z.coerce.number().int().min(0).max(10_000).optional(),
});
export type SharedPlansQuery = z.infer<typeof sharedPlansQuerySchema>;

export const sharedPlansPageSchema = z.object({
  plans: z.array(sharedPlanCardSchema),
  /** The guide's pick for this crew: the top match, never the most copied. */
  pick_id: z.uuid().nullable(),
  total: z.number().int().min(0),
  next_cursor: z.number().int().nullable(),
});
export type SharedPlansPage = z.infer<typeof sharedPlansPageSchema>;

export const sharedPlanDetailSchema = z.object({
  status: sharedPlanStatusSchema,
  card: sharedPlanCardSchema,
  /** Null once the plan is unpublished (the tombstone). */
  projection: sharedPlanProjectionSchema.nullable(),
  photo_urls: z.array(z.string()),
  saved: z.boolean(),
});
export type SharedPlanDetail = z.infer<typeof sharedPlanDetailSchema>;

export const sharedPlanGuideNoteSchema = z.object({
  /** Days of the plan that visit a place already on the crew's trip. */
  overlap_days: z.array(z.number().int()),
  /** The plan's day with the most places the crew has not got yet. */
  best_day: z.number().int().nullable(),
  overlap_places: z.number().int().min(0),
  new_places: z.number().int().min(0),
});
export type SharedPlanGuideNote = z.infer<typeof sharedPlanGuideNoteSchema>;

export const ratingCardSchema = z.object({
  poi_id: z.uuid(),
  name: z.string(),
  category: z.enum(POI_CATEGORIES),
  day_no: z.number().int().nullable(),
  verdict: ratingVerdictSchema.nullable(),
  tip: z.string().nullable(),
  tip_status: tipStatusSchema,
});
export type RatingCard = z.infer<typeof ratingCardSchema>;

export const tripRatingCardsSchema = z.object({
  destination_name: z.string(),
  cards: z.array(ratingCardSchema),
});
export type TripRatingCards = z.infer<typeof tripRatingCardsSchema>;

export const planSkeletonSchema = z.object({
  destination_id: z.uuid(),
  destination_name: z.string(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  first_names: z.array(z.string()),
  days: z.array(
    z.object({
      day_no: z.number().int(),
      theme: z.string().nullable(),
      places: z.array(
        z.object({ poi_id: z.uuid(), name: z.string(), category: z.string().nullable() }),
      ),
    }),
  ),
  cost_pp_minor: z.number().int().nullable(),
  currency: z.string().nullable(),
  currency_exponent: z.number().int().min(0).max(4),
  photo_keys: z.array(z.string()),
  tips: z.array(z.object({ poi_id: z.uuid(), text: z.string() })),
  travelled: z.boolean(),
});

/** The trip's own publishing state, for its participants (publish sheet, manage screen). */
export const tripSharedPlanSchema = z.object({
  organiser: z.boolean(),
  plan: z
    .object({
      id: z.uuid(),
      status: sharedPlanStatusSchema,
      toggles: sharedPlanTogglesSchema,
      requested_by_me: z.boolean(),
      my_decision: consentDecisionSchema.nullable(),
      consents: z.object({ approved: z.number().int(), total: z.number().int() }),
      copies_count: z.number().int(),
      saves_count: z.number().int(),
      rating_avg: z.number().nullable(),
      rating_count: z.number().int(),
      published_at: z.string().nullable(),
    })
    .nullable(),
  /** The plan as it stands, for the sheet's live preview; null before the trip has a plan. */
  skeleton: planSkeletonSchema.nullable(),
  links: z.array(
    z.object({ id: z.uuid(), created_at: z.string(), revoked_at: z.string().nullable() }),
  ),
});
export type TripSharedPlan = z.infer<typeof tripSharedPlanSchema>;
