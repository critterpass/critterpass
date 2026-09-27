/**
 * Travel-data domain events (docs/api-contracts.md §2.4 naming): a nightly fare drop for a crew, a
 * material forecast change on a trip, and a hazard level change at a trip's destination. Payloads
 * carry ids, enum values and code-computed numbers only; the watch job (`weather.watch`) and the tip
 * strip read them from `domain_events`.
 */
import { z } from 'zod';

import { hazardKindSchema, hazardLevelSchema, hazardSourceSchema, monthKeySchema } from './types';

export const TRAVEL_DATA_EVENT_TYPES = [
  'fare.dropped',
  'forecast.changed',
  'hazard.changed',
] as const;
export type TravelDataEventType = (typeof TRAVEL_DATA_EVENT_TYPES)[number];

/** Why a forecast change is material for a plan item (see `watchForecast`). */
export const FORECAST_CHANGE_REASONS = ['rain', 'waves', 'heat', 'cold'] as const;
export const forecastChangeReasonSchema = z.enum(FORECAST_CHANGE_REASONS);
export type ForecastChangeReason = z.infer<typeof forecastChangeReasonSchema>;

export const fareDroppedPayloadSchema = z
  .object({
    crew_id: z.uuid(),
    destination_id: z.uuid(),
    month: monthKeySchema,
    origin: z.string().regex(/^[A-Z]{3}$/),
    price_minor: z.number().int().nonnegative(),
    previous_min_minor: z.number().int().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    /** Whole-percent drop against the previous 7-day minimum (≥ the drop threshold). */
    delta_pct: z.number().int().positive(),
  })
  .strict();
export type FareDroppedPayload = z.infer<typeof fareDroppedPayloadSchema>;

export const forecastChangeSchema = z
  .object({
    item_stable_id: z.uuid(),
    reason: forecastChangeReasonSchema,
    date: z.iso.date(),
  })
  .strict();
export type ForecastChange = z.infer<typeof forecastChangeSchema>;

export const forecastChangedPayloadSchema = z
  .object({
    trip_id: z.uuid(),
    destination_id: z.uuid(),
    changes: z.array(forecastChangeSchema).min(1),
    /** 0–100: how much of the plan the changes touch (see `watchForecast`). */
    impact: z.number().int().min(0).max(100),
  })
  .strict();
export type ForecastChangedPayload = z.infer<typeof forecastChangedPayloadSchema>;

export const hazardChangedPayloadSchema = z
  .object({
    trip_id: z.uuid(),
    destination_id: z.uuid(),
    hazard_id: z.uuid(),
    kind: hazardKindSchema,
    source: hazardSourceSchema,
    subject: z.string().min(1),
    from_level: hazardLevelSchema.nullable(),
    to_level: hazardLevelSchema,
    impact: z.number().int().min(0).max(100),
  })
  .strict();
export type HazardChangedPayload = z.infer<typeof hazardChangedPayloadSchema>;

export const TRAVEL_DATA_EVENT_PAYLOADS = {
  'fare.dropped': fareDroppedPayloadSchema,
  'forecast.changed': forecastChangedPayloadSchema,
  'hazard.changed': hazardChangedPayloadSchema,
} as const satisfies Record<TravelDataEventType, z.ZodType>;
