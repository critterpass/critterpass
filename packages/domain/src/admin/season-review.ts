/**
 * Season review in the ops console (content role): each destination's month curves and the queued
 * dated events (web-research candidates and edited drafts), with their review state. Writes go
 * through the audited `upsert_season_editorial` and `review_season_event` commands.
 */
import { z } from 'zod';

import {
  seasonColourRoleSchema,
  seasonEventConfidenceSchema,
  seasonEventKindSchema,
} from '../travel-data/types';

export const SEASON_REVIEW_STATES = ['pending', 'approved'] as const;
export const seasonReviewStateSchema = z.enum(SEASON_REVIEW_STATES);
export type SeasonReviewState = z.infer<typeof seasonReviewStateSchema>;

export const seasonReviewQuerySchema = z.object({
  state: seasonReviewStateSchema.default('pending'),
  destination_id: z.uuid().optional(),
});
export type SeasonReviewQuery = z.infer<typeof seasonReviewQuerySchema>;

/**
 * A month whose value was interpolated or estimated between published figures rather than read
 * off a source; the editorial files say so in the row's cited source.
 */
export function isEstimatedSeasonSource(source: string): boolean {
  return /\b(interpolat|estimat)/i.test(source);
}

export const seasonReviewMonthSchema = z.object({
  month: z.number().int().min(1).max(12),
  crowd_index: z.number().int(),
  price_index: z.number().int().nullable(),
  price_index_source: z.string(),
  highlight_tag: z.string().nullable(),
  colour_role: seasonColourRoleSchema,
  source: z.string(),
  source_url: z.string().nullable(),
  sourced_on: z.iso.date(),
  estimated: z.boolean(),
  reviewed_at: z.string().nullable(),
});
export type SeasonReviewMonth = z.infer<typeof seasonReviewMonthSchema>;

export const seasonReviewCurveSchema = z.object({
  destination_id: z.uuid(),
  destination_name: z.string(),
  /** `pending` while any month is a draft. */
  state: seasonReviewStateSchema,
  months: z.array(seasonReviewMonthSchema),
});
export type SeasonReviewCurve = z.infer<typeof seasonReviewCurveSchema>;

export const seasonReviewEventSchema = z.object({
  id: z.uuid(),
  destination_id: z.uuid(),
  destination_name: z.string(),
  key: z.string(),
  kind: seasonEventKindSchema,
  name: z.string(),
  starts_on: z.iso.date(),
  ends_on: z.iso.date(),
  confidence: seasonEventConfidenceSchema,
  source: z.string(),
  source_url: z.string().nullable(),
  /** The day the source page was fetched (research) or checked (editorial). */
  sourced_on: z.iso.date(),
  queued_at: z.string(),
  reviewed_at: z.string().nullable(),
});
export type SeasonReviewEvent = z.infer<typeof seasonReviewEventSchema>;

export const seasonReviewDestinationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  pending_months: z.number().int().nonnegative(),
  pending_events: z.number().int().nonnegative(),
});
export type SeasonReviewDestination = z.infer<typeof seasonReviewDestinationSchema>;

export const seasonReviewSummarySchema = z.object({
  /** Destinations whose curve has at least one draft month. */
  pending_curves: z.number().int().nonnegative(),
  pending_events: z.number().int().nonnegative(),
  destinations: z.array(seasonReviewDestinationSchema),
});
export type SeasonReviewSummary = z.infer<typeof seasonReviewSummarySchema>;

export const seasonReviewCurvesSchema = z.object({ items: z.array(seasonReviewCurveSchema) });
export const seasonReviewEventsSchema = z.object({ items: z.array(seasonReviewEventSchema) });
