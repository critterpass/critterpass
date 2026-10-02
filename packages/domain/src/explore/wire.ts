/**
 * Wire shapes of the api's Explore reads (docs/api-contracts-explore.md): the destination guide,
 * a place's trip context and the sponsored slot. The app parses every answer with these, so a
 * malformed answer is a failed refresh, never shown.
 */
import { z } from 'zod';

import { destinationInsightsSchema } from '../travel-data/wire';

const sponsoredItemSchema = z.object({
  placement_id: z.string(),
  partner: z.string(),
  poi_id: z.string(),
  name: z.string(),
  category: z.string(),
  disclosure: z.string(),
});
export type SponsoredItemWire = z.infer<typeof sponsoredItemSchema>;

const destinationPickSchema = z.object({
  poi_id: z.string(),
  name: z.string(),
  name_local: z.string().nullable(),
  category: z.string(),
  tags: z.array(z.string()),
  must_see: z.boolean(),
  why_go: z.string().nullable(),
  taste_matches: z.number(),
});
export type DestinationPickWire = z.infer<typeof destinationPickSchema>;

const picksEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('organic'), item: destinationPickSchema }),
  z.object({ kind: z.literal('sponsored'), label: z.string(), item: sponsoredItemSchema }),
]);
export type PicksEntryWire = z.infer<typeof picksEntrySchema>;

export const exploreDestinationSchema = destinationInsightsSchema.extend({
  trip_id: z.string().nullable(),
  origins: z.array(z.object({ origin: z.string(), user_ids: z.array(z.string()) })),
  home_airport_missing: z.boolean(),
  picks: z.array(picksEntrySchema),
});
export type ExploreDestinationWire = z.infer<typeof exploreDestinationSchema>;

export const placeContextSchema = z.object({
  poi_id: z.string(),
  trip_id: z.string(),
  stay: z.object({ distance_m: z.number(), minutes: z.number(), estimate: z.boolean() }).nullable(),
  crowd: z
    .object({
      date: z.string(),
      best_window: z.object({ start: z.string(), end: z.string(), level: z.number() }).nullable(),
    })
    .nullable(),
  crew: z.object({ saved_by: z.array(z.string()), yes_by: z.array(z.string()) }),
  qna: z.object({ text: z.string(), source_at: z.string(), updated_at: z.string() }).nullable(),
  in_plan: z
    .object({ day_no: z.number(), stable_id: z.string(), starts_at: z.string().nullable() })
    .nullable(),
  suggested_slot: z
    .object({
      day_no: z.number(),
      date: z.string(),
      starts_at: z.string(),
      ends_at: z.string(),
      reason: z.enum(['quiet_window', 'free_gap']),
    })
    .nullable(),
  add_mode: z.enum(['apply', 'changeset']),
  base_version: z.string().nullable(),
});
export type PlaceContextWire = z.infer<typeof placeContextSchema>;

export const sponsoredSlotResponseSchema = z.object({
  slot: sponsoredItemSchema.extend({ label: z.string() }).nullable(),
});
export type SponsoredSlotResponse = z.infer<typeof sponsoredSlotResponseSchema>;
