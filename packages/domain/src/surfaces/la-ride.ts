/**
 * The ride Live Activity: after a member checks a Grab fare for a leg, the lock screen keeps the
 * fare range and the pickup ETA from that quote, with a deep link back into Grab. There is no live
 * driver tracking (Grab offers none to partners), so it is a quote, never a trip in progress.
 */
import { z } from 'zod';

import { pitchMajorUnits } from '../pitches/validate';
import { laLine, unixSeconds, unixSecondsSchema } from './la-common';

/** A quote is shown this long; after that the activity ends (prices move). */
export const LA_RIDE_TTL_MS = 30 * 60_000;

export const rideLaAttributesSchema = z.object({
  trip_id: z.uuid(),
  quote_id: z.uuid(),
  provider: z.enum(['grab']),
  /** "Villa → Warung Biah Biah". */
  route: z.string().max(60),
});
export type RideLaAttributes = z.infer<typeof rideLaAttributesSchema>;

export const rideLaStateSchema = z.object({
  seq: z.number().int().nonnegative(),
  state: z.enum(['quoted', 'expired']),
  service_name: z.string().max(40),
  fare_low: z.number().nonnegative(),
  fare_high: z.number().nonnegative(),
  currency: z.string().length(3),
  eta_min: z.number().int().nonnegative(),
  surge: z.boolean(),
  fetched_at: unixSecondsSchema,
  deep_link: z.string().max(300),
});
export type RideLaState = z.infer<typeof rideLaStateSchema>;

export interface RideLaInput {
  readonly tripId: string;
  readonly quoteId: string;
  readonly fromName: string | null;
  readonly toName: string;
  readonly serviceName: string;
  readonly fareLowMinor: number;
  readonly fareHighMinor: number;
  readonly currency: string;
  readonly etaMin: number;
  readonly surge: 'none' | 'low' | 'high' | 'fractional';
  readonly fetchedAt: Date;
  readonly deepLink: string;
}

export function buildRideLaAttributes(input: RideLaInput): RideLaAttributes {
  const route = input.fromName === null ? input.toName : `${input.fromName} → ${input.toName}`;
  return {
    trip_id: input.tripId,
    quote_id: input.quoteId,
    provider: 'grab',
    route: laLine(route, 60),
  };
}

export function buildRideLaState(input: RideLaInput, now: Date, seq: number): RideLaState {
  const expired = now.getTime() - input.fetchedAt.getTime() >= LA_RIDE_TTL_MS;
  return {
    seq,
    state: expired ? 'expired' : 'quoted',
    service_name: laLine(input.serviceName, 40),
    fare_low: pitchMajorUnits(input.fareLowMinor, input.currency),
    fare_high: pitchMajorUnits(input.fareHighMinor, input.currency),
    currency: input.currency,
    eta_min: input.etaMin,
    surge: input.surge !== 'none',
    fetched_at: unixSeconds(input.fetchedAt),
    deep_link: input.deepLink,
  };
}
