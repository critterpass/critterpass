/**
 * Wire shapes of the api's travel-data reads (docs/api-contracts.md §5.5): `/v1/fares`,
 * `/v1/destinations/{id}`, `/v1/places/{id}/crowds`, `/v1/weather[/marine]` and `/v1/hazards`.
 * The app parses every answer with these, so a malformed answer is a failed refresh, never shown.
 */
import { z } from 'zod';

import {
  fareDaySchema,
  marineHourSchema,
  seasonColourRoleSchema,
  tideSchema,
  weatherAlertSchema,
  weatherDaySchema,
  weatherHourSchema,
} from './types';

const instant = z.string();
const nullableInstant = instant.nullable();

export const fareViewWireSchema = z.object({
  origin: z.string(),
  state: z.enum(['ok', 'stale', 'missing']),
  source: z.string(),
  price_minor: z.number().nullable(),
  currency: z.string(),
  depart_on: z.string().nullable(),
  return_on: z.string().nullable(),
  transfers: z.number().nullable(),
  duration_min: z.number().nullable(),
  fastest_duration_min: z.number().nullable(),
  days: z.array(fareDaySchema),
  seen_at: nullableInstant,
  fetched_at: nullableInstant,
  checked_at: nullableInstant,
  via_hub: z.string().nullable(),
});
export type FareViewWire = z.infer<typeof fareViewWireSchema>;

export const faresResponseSchema = z.object({
  destination_id: z.string(),
  dest_iata: z.string().nullable(),
  month: z.string(),
  fares: z.array(fareViewWireSchema),
});
export type FaresResponse = z.infer<typeof faresResponseSchema>;

const seasonMonthViewSchema = z.object({
  month: z.number().int().min(1).max(12),
  crowd_index: z.number(),
  price_index: z.number().nullable(),
  price_index_source: z.enum(['editorial', 'fares']),
  highlight_tag: z.string().nullable(),
  colour_role: seasonColourRoleSchema,
  source: z.string(),
  source_url: z.string().nullable(),
  reviewed_at: instant,
});

const fxChipSchema = z.object({
  from: z.object({ amount_minor: z.number(), currency: z.string() }),
  to: z.object({ amount_minor: z.number(), currency: z.string() }),
  rate: z.number(),
  snapshot_id: z.string(),
  as_of: z.string(),
  source: z.string(),
  stale: z.boolean(),
});

export const destinationInsightsSchema = z.object({
  destination: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    currency: z.string().nullable(),
    tz: z.string().nullable(),
  }),
  month: z.string(),
  curve: z.array(seasonMonthViewSchema).nullable(),
  best_months: z.array(z.number()),
  highlights: z.array(z.object({ month: z.number(), tag: z.string() })),
  events: z.array(
    z.object({
      key: z.string(),
      kind: z.string(),
      name: z.string(),
      starts_on: z.string(),
      ends_on: z.string(),
      confidence: z.string(),
      source: z.string(),
      source_url: z.string().nullable(),
      forecast_updated_at: nullableInstant,
    }),
  ),
  fares: z.array(fareViewWireSchema),
  fx: fxChipSchema.nullable(),
});
export type DestinationInsights = z.infer<typeof destinationInsightsSchema>;

const crowdMonthSchema = z.object({
  month: z.number(),
  crowd_index: z.number(),
  colour_role: seasonColourRoleSchema,
  highlight_tag: z.string().nullable(),
});

export const crowdsResponseSchema = z.object({
  poi_id: z.string(),
  date: z.string(),
  hourly: z.array(z.number()).nullable(),
  best_window: z.object({ start: z.string(), end: z.string(), level: z.number() }).nullable(),
  source: z.string().nullable(),
  fetched_at: nullableInstant,
  month: crowdMonthSchema.nullable(),
  curve: z.array(crowdMonthSchema).nullable(),
  curve_source: z.string().nullable(),
});
export type CrowdsResponse = z.infer<typeof crowdsResponseSchema>;

const attributionSchema = z.object({ text: z.string(), url: z.string() });

export const weatherResponseSchema = z.object({
  source: z.string().nullable(),
  attribution: attributionSchema,
  point: z
    .object({
      key: z.string(),
      lat: z.number(),
      lng: z.number(),
      elevation_m: z.number().nullable(),
      distance_km: z.number(),
    })
    .nullable(),
  elevation_adjusted_to: z.number().nullable(),
  fetched_at: nullableInstant,
  checked_at: nullableInstant,
  stale: z.boolean(),
  hourly: z.array(weatherHourSchema),
  days: z.array(weatherDaySchema.extend({ date: z.string() })),
  alerts: z.array(weatherAlertSchema),
});
export type WeatherResponse = z.infer<typeof weatherResponseSchema>;

export const marineResponseSchema = z.object({
  source: z.string().nullable(),
  attribution: attributionSchema,
  point: z.object({ lat: z.number(), lng: z.number(), distance_km: z.number() }).nullable(),
  fetched_at: nullableInstant,
  checked_at: nullableInstant,
  stale: z.boolean(),
  hourly: z.array(marineHourSchema),
  tides: z.array(tideSchema).nullable(),
});
export type MarineResponse = z.infer<typeof marineResponseSchema>;

export const hazardsResponseSchema = z.object({
  destination_id: z.string(),
  alerts: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      subject: z.string(),
      level: z.number().int().min(1).max(4),
      level_label: z.string(),
      headline: z.string(),
      source: z.string(),
      source_url: z.string(),
      issued_at: instant,
      expires_at: nullableInstant,
      fetched_at: instant,
      stale: z.boolean(),
    }),
  ),
});
export type HazardsResponse = z.infer<typeof hazardsResponseSchema>;
