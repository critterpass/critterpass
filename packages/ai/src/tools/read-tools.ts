/** Read tools (docs/api-contracts.md §6): data from code-owned sources, never written by the model. */
import { POI_CATEGORIES } from '@cp/domain';
import { z } from 'zod';

import {
  id,
  isoDate,
  isoInstant,
  minor,
  currency,
  latLng,
  tripOnly,
  series,
  forecastInput,
  proposedOp,
  costDelta,
  spec,
  placeResult,
} from './tool-parts';

export const READ_TOOL_SPECS = {
  places_search: spec(
    'Search curated places in the trip\'s destination by name (accents, word order and words like "hotel" or "khách sạn" do not matter) or near a point, a place_id, a place named in near_name (e.g. the hotel as the traveller typed it) or the trip\'s stay (near_stay). Name only places this returns. There are no ratings: recommended marks places the guide recommends (recommended_only keeps only those), with why_go.',
    'CGDR',
    'read',
    z.object({
      query: z.string().optional(),
      near: latLng.optional(),
      place_id: id.optional(),
      near_name: z.string().optional(),
      near_stay: z.boolean().optional(),
      recommended_only: z.boolean().optional(),
      category: z.enum(POI_CATEGORIES).optional(),
      open_at: isoInstant.optional(),
      dietary: z.array(z.string()).optional(),
      limit: z.number().int().max(20).optional(),
    }),
    z.array(placeResult),
  ),
  place_details: spec(
    'Details of one place. Quote hours only when verified_at is set.',
    'CGDR',
    'read',
    z.object({ poi_id: id, fields: z.array(z.string()).optional() }),
    z.object({
      hours: z.array(
        z.object({
          day: z.string(),
          spans: z.array(z.object({ start: z.string(), end: z.string() })),
        }),
      ),
      price_level: z.number().int().nullable(),
      indoor: z.boolean().nullable(),
      verified_at: z.string().nullable(),
      booking_notes: z.string().nullable().optional(),
      accessibility: z.array(z.string()).optional(),
    }),
  ),
  crowd_forecast: spec(
    'Crowd levels for a place on a date: hourly when known (else null), plus the month level.',
    'CDR',
    'read',
    z.object({ poi_id: id, date: isoDate }),
    z.object({
      hourly: z.array(z.number()).nullable(),
      best_window: z.object({ start: z.string(), end: z.string() }).nullable(),
      month: z
        .object({
          crowd_index: z.number().int(),
          colour_role: z.enum(['cheapest', 'peak', 'normal']),
          highlight_tag: z.string().nullable(),
        })
        .nullable(),
    }),
  ),
  weather: spec(
    'Hourly weather and alerts. Copy times and temperatures verbatim.',
    'CGRB',
    'read',
    forecastInput,
    series({
      temp_c: z.number(),
      chance_of_rain: z.number(),
      precip_mm: z.number(),
      wind_kph: z.number(),
      code: z.string(),
    }),
  ),
  marine: spec(
    'Hourly sea conditions and alerts. Copy values verbatim.',
    'CGRB',
    'read',
    forecastInput,
    series({ wave_m: z.number(), swell_m: z.number(), sea_temp_c: z.number().nullable() }),
  ),
  route_eta: spec(
    'Travel time between points. Leave-by times come from the planner, not from you.',
    'CGR',
    'read',
    z.object({
      origins: z.array(latLng),
      dest: latLng,
      mode: z.enum(['walk', 'drive', 'ride', 'transit', 'bike']),
      depart_at: isoInstant.optional(),
    }),
    z.object({ minutes: z.number(), distance_m: z.number(), traffic: z.boolean() }),
  ),
  fare_calendar: spec(
    'Cheapest seen fares per day for a month. Say "~price (seen time)".',
    'CDB',
    'read',
    z.object({
      origins: z.array(z.string()),
      dest: z.string(),
      month: z.string().describe('YYYY-MM'),
    }),
    z.array(
      z.object({
        origin: z.string(),
        date: isoDate,
        price_minor: minor,
        currency,
        seen_at: isoInstant,
      }),
    ),
  ),
  flight_status: spec(
    'Live flight status. Cite the source and time.',
    'CRB',
    'read',
    z.object({ flight_no: z.string(), date: isoDate }),
    z.object({
      status: z.string(),
      sched: isoInstant,
      est: isoInstant.nullable(),
      gate: z.string().nullable(),
      source: z.string(),
      at: isoInstant,
    }),
  ),
  fx: spec(
    'Convert an amount between currencies at the stored snapshot rate.',
    'CG',
    'read',
    z.object({ amount_minor: minor, from: currency, to: currency }),
    z.object({ amount_minor: minor, rate: z.number(), snapshot_id: id }),
  ),
  crew_profiles: spec(
    'Crew first names, taste tags, dietary flags (with consent), pace and chronotype.',
    'CGDR',
    'read',
    tripOnly,
    z.array(
      z.object({
        uid: id,
        first_name: z.string(),
        taste_tags: z.array(z.string()),
        dietary_flags: z.array(z.string()),
        pace: z.string().nullable(),
        chronotype: z.string().nullable(),
      }),
    ),
  ),
  plan_read: spec(
    "The trip's days and current plan. Any change must cite its version as base_version; version is null while the trip has no plan yet.",
    'CGDRB',
    'read',
    z.object({ trip_id: id, day: z.number().int().optional() }),
    z.object({
      version: id.nullable(),
      days: z.array(
        z.object({
          day_no: z.number().int(),
          date: isoDate.nullable(),
          items: z.array(
            z.object({
              item_id: id,
              title: z.string(),
              poi_id: id.nullable(),
              starts_at: isoInstant.nullable(),
              ends_at: isoInstant.nullable(),
              category: z.string().nullable(),
            }),
          ),
        }),
      ),
    }),
  ),
  bookings_read: spec(
    'Crew-visible bookings. Quote deadlines verbatim.',
    'CGRB',
    'read',
    tripOnly,
    z.array(
      z.object({
        booking_id: id,
        kind: z.string(),
        when: isoInstant.nullable(),
        where: z.string().nullable(),
        cancel_deadline: isoInstant.nullable(),
        status: z.string(),
      }),
    ),
  ),
  balances_read: spec(
    'Who owes whom, from the cost engine.',
    'CGB',
    'read',
    tripOnly,
    z.object({
      currency,
      per_member_net: z.array(z.object({ uid: id, net_minor: minor })),
      settle_plan: z.array(z.object({ from_uid: id, to_uid: id, amount_minor: minor })),
    }),
  ),
  cost_quote: spec(
    'Per-person cost change of proposed plan changes. Word the number; never compute it.',
    'CGDR',
    'read',
    z.object({ trip_id: id, ops: z.array(proposedOp) }),
    costDelta,
  ),
  fit_check: spec(
    'Whether a place fits the plan on a day.',
    'CD',
    'read',
    z.object({ trip_id: id, poi_id: id, day: z.number().int().optional() }),
    z.object({
      status: z.enum(['fits', 'tight', 'no']),
      day: z.number().int().nullable(),
      reason_code: z.string(),
    }),
  ),
  bookable_activity: spec(
    'Bookable offers for a place. Never say "held" unless a hold is returned.',
    'CG',
    'read',
    z.object({ poi_id: id, date: isoDate, pax: z.number().int() }),
    z.object({
      offers: z.array(
        z.object({
          offer_ref: z.string(),
          supplier: z.string(),
          price_from_minor: minor,
          currency,
          hold_supported: z.boolean(),
        }),
      ),
    }),
  ),
  ride_quote: spec(
    'Ride fare range and pickup time. Never claim a car is booked.',
    'CG',
    'read',
    z.object({ from: latLng, to: latLng }),
    z.object({
      provider: z.string(),
      fare_range_minor: z.object({ min: minor, max: minor }),
      currency,
      eta_min: z.number(),
      deep_link_ref: z.string(),
    }),
  ),
  phrase_card: spec(
    'A curated phrase card in the local language.',
    'CGB',
    'read',
    z.object({
      purpose: z.string(),
      language: z.string(),
      register: z.enum(['casual', 'polite', 'formal']),
      address: z.string().optional(),
    }),
    z.object({ text: z.string(), gloss: z.string(), audio_ref: z.string().nullable() }),
  ),
  help_context: spec(
    'Curated emergency numbers, nearby facilities and phrases. Personalise wording only.',
    'C',
    'read',
    z.object({ lat: z.number(), lng: z.number(), trip_id: id }),
    z.object({
      emergency_numbers: z.array(z.object({ service: z.string(), number: z.string() })),
      facilities: z.array(
        z.object({
          poi_id: id.nullable(),
          name: z.string(),
          kind: z.string(),
          distance_m: z.number(),
        }),
      ),
      phrases: z.array(z.object({ text: z.string(), gloss: z.string() })),
    }),
  ),
} as const;
