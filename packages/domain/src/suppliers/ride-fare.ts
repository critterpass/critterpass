/**
 * Estimated ride fares from published local tariffs and the real route, for `GET /v1/rides/quote`
 * while no ride app gives us a live quote. A tariff is one ride class in one destination (metered
 * taxi, ride-hail car, ride-hail bike), each figure taken from a regulator's or operator's own page
 * and kept with its link and the date it was checked. The range is always labelled an estimate.
 *
 * - Low end: the standard rates over the route (flag fall, distance beyond what the flag fall
 *   covers, and time where the tariff charges it for the whole trip).
 * - High end: the upper rates where the tariff publishes them (a regulator's upper band, a meter's
 *   night rates); otherwise, for ride-hail classes, the standard fare times `RIDE_HAIL_PEAK_FACTOR`.
 *   Meters that charge time only in slow traffic get every minute in traffic charged on the high
 *   end: an upper bound, since a real meter charges time instead of distance while crawling.
 * - Each end is at least the class's minimum fare. Low rounds down and high rounds up to the
 *   tariff's local unit, so the rounded range still holds the tariff price.
 * - Extras (an airport pickup fee, a dispatch fee for booking by phone or app) come beside the range,
 *   not inside it: whether they apply depends on how and where the ride starts.
 */
import { z } from 'zod';

export const RIDE_CLASSES = ['metered_taxi', 'ride_hail_car', 'ride_hail_bike'] as const;
export const rideClassSchema = z.enum(RIDE_CLASSES);
export type RideClass = z.infer<typeof rideClassSchema>;

/** What a range rests on: a meter tariff, a government band, or an operator's own fare page. */
export const RIDE_FARE_BASES = ['meter_tariff', 'regulated_band', 'operator_rates'] as const;
export type RideFareBasis = (typeof RIDE_FARE_BASES)[number];

export const RIDE_FARE_EXTRAS = ['airport_pickup', 'dispatch'] as const;
export type RideFareExtra = (typeof RIDE_FARE_EXTRAS)[number];

/**
 * The surge allowance for ride-hail classes with no published upper rates: operators publish no
 * surge cap, so the high end allows up to one and a half times the standard fare. Real surges can
 * exceed it, which is one reason the range is called an estimate.
 */
export const RIDE_HAIL_PEAK_FACTOR = 1.5;

export const RIDE_FARE_COPY_KEY = 'suppliers.rides.tariff_estimate';

const amount = z.number().finite().nonnegative();

export const rideRateSchema = z
  .object({
    /** Flag fall (or the band's minimum charge), in major units of the tariff currency. */
    base_fare: amount,
    /** Distance the base fare already covers. */
    included_km: amount,
    per_km: amount,
    /** A different distance rate from `from_km` on (Reykjavik's after the fourth km). */
    later: z.object({ from_km: amount, per_km: amount }).strict().nullable(),
    /** Charged per minute; `null` where the tariff has no time charge. */
    per_min: amount.nullable(),
    minimum_fare: amount.nullable(),
  })
  .strict()
  .refine((r) => r.later === null || r.later.from_km >= r.included_km, {
    message: 'the later rate starts after the included distance',
  });
export type RideRate = z.infer<typeof rideRateSchema>;

export const rideTariffSourceSchema = z
  .object({
    url: z.url({ protocol: /^https$/u }),
    /** Which figures this page gives, as the page words them (`¥100 per 271 m`). */
    covers: z.string().trim().min(1).max(240),
    checked_on: z.iso.date(),
  })
  .strict();

export const rideTariffSchema = z
  .object({
    /** `<destination>:<ride class>`, the item's stable key. */
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*:(metered_taxi|ride_hail_car|ride_hail_bike)$/u),
    destination: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    ride_class: rideClassSchema,
    /** Who publishes or charges the fare: an operator, or the regulator whose band it is. */
    operator: z.string().trim().min(1).max(80),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    basis: z.enum(RIDE_FARE_BASES),
    standard: rideRateSchema,
    /** The upper band or the night rates, where the tariff publishes them. */
    upper: rideRateSchema.nullable(),
    /** `whole_trip`: every minute is charged; `slow_traffic`: a meter's waiting-time charge. */
    time_charge: z.enum(['whole_trip', 'slow_traffic']),
    extras: z.array(z.object({ kind: z.enum(RIDE_FARE_EXTRAS), amount }).strict()),
    /** The local rounding unit in major units (IDR 1000, JPY 10, EUR 0.5). */
    round_to: z.number().finite().positive(),
    sources: z.array(rideTariffSourceSchema).min(1),
  })
  .strict()
  .refine((t) => t.id === `${t.destination}:${t.ride_class}`, {
    message: 'id must be destination:class',
  })
  .refine((t) => t.basis !== 'regulated_band' || t.upper !== null, {
    message: 'a regulated band has its upper rates',
  });
export type RideTariff = z.infer<typeof rideTariffSchema>;

export interface RideRoute {
  readonly distanceM: number;
  /** Minutes in traffic. */
  readonly minutes: number;
}

export interface RideFareRange {
  readonly rideClass: RideClass;
  /** Major units of `currency`, multiples of the tariff's rounding unit. */
  readonly low: number;
  readonly high: number;
  readonly currency: string;
  readonly basis: RideFareBasis;
  /** The multiplier behind the high end, when it is the ride-hail peak allowance. */
  readonly peakFactor: number | null;
  /** True when the minimum fare, not the route, set the low end. */
  readonly minimumApplied: boolean;
}

function routeCharge(rate: RideRate, route: RideRoute, chargeTime: boolean): number {
  const km = route.distanceM / 1000;
  const later = rate.later;
  const firstEnd = later === null ? km : Math.min(km, later.from_km);
  let distance = rate.per_km * Math.max(0, firstEnd - rate.included_km);
  if (later !== null) distance += later.per_km * Math.max(0, km - later.from_km);
  const time = chargeTime && rate.per_min !== null ? rate.per_min * route.minutes : 0;
  return rate.base_fare + distance + time;
}

function routeFare(rate: RideRate, route: RideRoute, chargeTime: boolean): number {
  return Math.max(routeCharge(rate, route, chargeTime), rate.minimum_fare ?? 0);
}

/** Whole multiples of `unit`, clear of float noise (0.1 + 0.2). */
function snap(units: number, unit: number): number {
  return Number((units * unit).toFixed(6));
}

function roundDown(value: number, unit: number): number {
  return snap(Math.floor(value / unit + 1e-9), unit);
}

function roundUp(value: number, unit: number): number {
  return snap(Math.ceil(value / unit - 1e-9), unit);
}

export function estimateRideFare(tariff: RideTariff, route: RideRoute): RideFareRange {
  const wholeTrip = tariff.time_charge === 'whole_trip';
  const low = routeFare(tariff.standard, route, wholeTrip);
  const peakFactor =
    tariff.upper === null && tariff.ride_class !== 'metered_taxi' ? RIDE_HAIL_PEAK_FACTOR : null;
  const upper = routeFare(tariff.upper ?? tariff.standard, route, true) * (peakFactor ?? 1);
  const lowRounded = roundDown(low, tariff.round_to);
  return {
    rideClass: tariff.ride_class,
    low: lowRounded,
    high: Math.max(roundUp(Math.max(upper, low), tariff.round_to), lowRounded),
    currency: tariff.currency,
    basis: tariff.basis,
    peakFactor,
    minimumApplied: routeCharge(tariff.standard, route, wholeTrip) < low,
  };
}

/** The oldest date any figure of the tariff was checked on. */
export function tariffCheckedOn(tariff: RideTariff): string {
  return tariff.sources.map((s) => s.checked_on).sort()[0] ?? '';
}

export interface RideFareAmount {
  readonly low_minor: number;
  readonly high_minor: number;
  readonly currency: string;
}

export interface RideFareEstimateOption extends RideFareAmount {
  readonly ride_class: RideClass;
  readonly operator: string;
  readonly basis: RideFareBasis;
  readonly peak_factor: number | null;
  readonly minimum_applied: boolean;
  /** Charged only on some rides (an airport pickup, a phone or app booking); not in the range. */
  readonly extras: readonly { readonly kind: RideFareExtra; readonly amount_minor: number }[];
  /** The range in the crew's settlement currency at the latest stored rates; null without a rate. */
  readonly crew:
    (RideFareAmount & { readonly fx_as_of: string; readonly fx_stale: boolean }) | null;
  readonly sources: readonly {
    readonly url: string;
    readonly covers: string;
    readonly checked_on: string;
  }[];
  /** The oldest date a figure behind this range was checked. */
  readonly checked_at: string;
  /** False until the owner approves the tariff batch in the console. */
  readonly reviewed: boolean;
}

/** `fare_estimate` on `GET /v1/rides/quote`: tariff ranges over the routed trip, never a live quote. */
export interface RideFareEstimate {
  readonly copy_key: typeof RIDE_FARE_COPY_KEY;
  readonly distance_m: number;
  readonly duration_min: number;
  /** True when the duration reflects live or predicted traffic. */
  readonly traffic: boolean;
  readonly options: readonly RideFareEstimateOption[];
}
