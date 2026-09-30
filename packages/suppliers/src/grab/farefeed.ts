/**
 * Grab Farefeed (developer.grab.com/docs/partner-farefeed): `POST /farefeed/v1/estimate` answers,
 * per Grab service, the minutes to pickup, the fare range, a surge notice and a deep link that
 * opens Grab with pickup and drop-off filled in. It is an estimate, never a booking: nothing here
 * orders a car, and Grab tracks the ride inside its own app.
 */
import { z } from 'zod';

import type { SupplierHttp } from '../core/http';
import { GRAB_SUPPLIER, type GrabConfig, type GrabTokenSource } from './oauth';

export interface FarefeedPoint {
  readonly lat: number;
  readonly lng: number;
  readonly address?: string;
}

const surgeSchema = z.enum(['NONE', 'LOW_SURGE', 'HIGH_SURGE', 'FRACTIONAL_SURGE']);

const serviceSchema = z.object({
  serviceID: z.number(),
  serviceName: z.string(),
  eta: z.number().nonnegative(),
  fare: z.object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    minFare: z.number().nonnegative(),
    maxFare: z.number().nonnegative(),
  }),
  deepLink: z.url(),
  directDeepLink: z.string().optional(),
  surgeNotice: surgeSchema.optional(),
});
const estimateSchema = z.object({ services: z.array(serviceSchema) });

export interface FarefeedService {
  readonly serviceId: number;
  readonly name: string;
  readonly etaMin: number;
  readonly currency: string;
  readonly minFare: number;
  readonly maxFare: number;
  readonly deepLink: string;
  readonly surge: 'none' | 'low' | 'high' | 'fractional';
}

const SURGE = {
  NONE: 'none',
  LOW_SURGE: 'low',
  HIGH_SURGE: 'high',
  FRACTIONAL_SURGE: 'fractional',
} as const;

function point(p: FarefeedPoint) {
  return {
    latitude: p.lat,
    longitude: p.lng,
    ...(p.address === undefined ? {} : { address: p.address.slice(0, 200) }),
  };
}

export async function fetchFarefeed(
  http: SupplierHttp,
  config: GrabConfig,
  tokens: GrabTokenSource,
  pickUp: FarefeedPoint,
  dropOff: FarefeedPoint,
): Promise<FarefeedService[]> {
  const token = await tokens.token();
  const reply = await http.sendJson(
    {
      supplier: GRAB_SUPPLIER,
      endpoint: 'farefeed_estimate',
      url: `${config.baseUrl.replace(/\/$/, '')}/farefeed/v1/estimate`,
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pickUp: point(pickUp), dropOff: point(dropOff) }),
      timeoutMs: 10_000,
    },
    estimateSchema,
  );
  return reply.services
    .filter((service) => service.fare.maxFare >= service.fare.minFare)
    .map((service) => ({
      serviceId: service.serviceID,
      name: service.serviceName,
      etaMin: Math.round(service.eta),
      currency: service.fare.currency,
      minFare: service.fare.minFare,
      maxFare: service.fare.maxFare,
      deepLink: service.deepLink,
      surge: SURGE[service.surgeNotice ?? 'NONE'],
    }));
}

/** The service a card leads with: the soonest pickup, then the lowest fare. */
export function leadService(services: readonly FarefeedService[]): FarefeedService | undefined {
  return [...services].sort((a, b) => a.etaMin - b.etaMin || a.minFare - b.minFare)[0];
}
