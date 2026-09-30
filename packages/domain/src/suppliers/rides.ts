/**
 * Rides (docs/product-decisions.md §5 "Ride" row, 3h-3): we never book a car and never show a live
 * one. A quote is Grab's own fare range and pickup time with an "Open Grab" deep link (Farefeed,
 * behind its partner switch); without it, or where Grab does not run, the traveller gets plain app
 * links (Grab, Gojek, Uber) and a phrase card with the address in the local script. After the ride,
 * `log_ride` keeps the leg and, with an amount, splits it as a crew expense.
 */
import { z } from 'zod';

import { currencyCodeSchema, moneyMinorSchema } from '../money/expense-schema';
import type { RideFareEstimate } from './ride-fare';

export const RIDE_PROVIDERS = ['grab', 'gojek', 'uber', 'taxi', 'transfer', 'driver'] as const;
export const rideProviderSchema = z.enum(RIDE_PROVIDERS);
export type RideProvider = z.infer<typeof rideProviderSchema>;

/** The ride apps a market has, in the order the card offers them. */
export type RideApp = Extract<RideProvider, 'grab' | 'gojek' | 'uber'>;

/**
 * Where each ride app runs, by the destination's country (name or ISO code). Grab covers Southeast
 * Asia, Gojek Indonesia and Singapore; Uber stands in elsewhere. A country listed nowhere gets the
 * phrase card and a taxi.
 */
const GRAB_COUNTRIES = [
  ['SG', 'singapore'],
  ['MY', 'malaysia'],
  ['ID', 'indonesia'],
  ['TH', 'thailand'],
  ['VN', 'vietnam'],
  ['PH', 'philippines'],
  ['KH', 'cambodia'],
  ['MM', 'myanmar'],
] as const;
const GOJEK_COUNTRIES = [
  ['ID', 'indonesia'],
  ['SG', 'singapore'],
] as const;
const UBER_COUNTRIES = [
  ['US', 'united states'],
  ['GB', 'united kingdom'],
  ['FR', 'france'],
  ['PT', 'portugal'],
  ['ES', 'spain'],
  ['IT', 'italy'],
  ['DE', 'germany'],
  ['NL', 'netherlands'],
  ['JP', 'japan'],
  ['KR', 'south korea'],
  ['TW', 'taiwan'],
  ['HK', 'hong kong'],
  ['AU', 'australia'],
  ['NZ', 'new zealand'],
  ['MX', 'mexico'],
  ['BR', 'brazil'],
  ['PE', 'peru'],
  ['CL', 'chile'],
  ['CO', 'colombia'],
  ['AR', 'argentina'],
  ['AE', 'united arab emirates'],
  ['ZA', 'south africa'],
  ['IN', 'india'],
  ['LK', 'sri lanka'],
  ['CA', 'canada'],
] as const;

function listed(table: readonly (readonly [string, string])[], country: string): boolean {
  const key = country.trim().toLowerCase();
  return table.some(([iso, name]) => iso.toLowerCase() === key || name === key);
}

/** The ride apps offered in `country`, Grab first; empty = phrase card and taxi only. */
export function rideAppsFor(country: string | null): RideApp[] {
  if (country === null || country.trim() === '') return [];
  const apps: RideApp[] = [];
  if (listed(GRAB_COUNTRIES, country)) apps.push('grab');
  if (listed(GOJEK_COUNTRIES, country)) apps.push('gojek');
  if (apps.length === 0 && listed(UBER_COUNTRIES, country)) apps.push('uber');
  return apps;
}

export const SURGE_NOTICES = ['none', 'low', 'high', 'fractional'] as const;
export type SurgeNotice = (typeof SURGE_NOTICES)[number];

const point = z
  .string()
  .regex(/^-?\d{1,2}(\.\d{1,7})?,-?\d{1,3}(\.\d{1,7})?$/u, 'lat,lng')
  .transform((value) => {
    const [lat, lng] = value.split(',').map(Number) as [number, number];
    return { lat, lng };
  })
  .refine(({ lat, lng }) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180, 'out of range');

/** `GET /v1/rides/quote`: the drop-off is a place; the pickup is a place or where the phone is. */
export const rideQuoteQuerySchema = z
  .object({
    trip_id: z.uuid(),
    to_poi: z.uuid(),
    from_poi: z.uuid().optional(),
    from: point.optional(),
  })
  .strict()
  .refine((query) => (query.from_poi === undefined) !== (query.from === undefined), {
    message: 'give exactly one of from_poi or from',
  });
export type RideQuoteQuery = z.infer<typeof rideQuoteQuerySchema>;

export interface RideLink {
  readonly provider: RideApp;
  /** Opens the app with the trip pre-filled where the app takes it. */
  readonly app_url: string;
  /** Where the app is not installed: its web or store page. */
  readonly fallback_url: string;
}

export interface RideEstimate {
  readonly quote_id: string;
  readonly provider: 'grab';
  readonly service: string;
  readonly eta_min: number;
  readonly fare_low_minor: number;
  readonly fare_high_minor: number;
  readonly currency: string;
  readonly surge: SurgeNotice;
  readonly fetched_at: string;
  /** Grab's own deep link with pickup and drop-off pre-filled. */
  readonly deep_link: string;
}

/** Copy keys (docs/product-decisions.md §5): an estimate only when Grab gave one. */
export const RIDE_COPY_KEYS = {
  estimate: 'suppliers.rides.grab_estimate',
  links: 'suppliers.rides.open_app',
  phraseCard: 'suppliers.rides.phrase_card',
} as const;

export interface RideQuoteResult {
  readonly copy_key: (typeof RIDE_COPY_KEYS)[keyof typeof RIDE_COPY_KEYS];
  readonly estimate: RideEstimate | null;
  /**
   * Fare ranges from published local tariffs over the routed trip, when Grab gave no estimate and
   * the destination has tariffs; always shown as an estimate.
   */
  readonly fare_estimate: RideFareEstimate | null;
  readonly links: readonly RideLink[];
  /** The drop-off for the driver: its name and address in the local script where we have it. */
  readonly phrase_card: {
    readonly poi_id: string;
    readonly name: string;
    readonly name_local: string | null;
    readonly address: string | null;
  };
}

export const logRidePayloadSchema = z
  .object({
    ride_id: z.uuid(),
    trip_id: z.uuid(),
    /** The plan leg the ride covers (a plan item's stable id, or the app's own leg key). */
    leg_ref: z.string().trim().min(1).max(120),
    provider: rideProviderSchema,
    amount_minor: moneyMinorSchema.optional(),
    currency: currencyCodeSchema.optional(),
    /** Who rode; the split goes between them (default: the caller). */
    attendee_ids: z.array(z.uuid()).min(1).max(16).optional(),
    /** The expense id the app chose, so a replay finds the same expense. */
    expense_id: z.uuid().optional(),
    fx_snapshot_id: z.uuid().optional(),
    quote_id: z.uuid().optional(),
  })
  .strict()
  .refine((payload) => (payload.amount_minor === undefined) === (payload.currency === undefined), {
    message: 'amount and currency come together',
  })
  .refine((payload) => payload.amount_minor === undefined || payload.expense_id !== undefined, {
    message: 'an amount needs the expense id',
  });
export type LogRidePayload = z.infer<typeof logRidePayloadSchema>;

export interface LogRideResult {
  readonly ride_id: string;
  readonly expense_id: string | null;
}
