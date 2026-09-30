/**
 * Viator Partner API v2 transport (docs.viator.com/partner-api/technical): every call carries the
 * `exp-api-key` header, `Accept: application/json;version=2.0` and the language, waits its turn in
 * the rolling 10-second limiter, and goes through the audited supplier HTTP client (reads retried,
 * writes sent once). Booking is the one call allowed the full 120 s: Viator may take that long to
 * reach an operator, and a booking sent twice is a double charge on the traveller's card.
 */
import type { z } from 'zod';

import { SUPPLIER_TIMEOUT_CAP_MS } from '../core/egress';
import type { SupplierHttp } from '../core/http';
import type { RollingLimiter } from './rate-limit';

export const VIATOR_SUPPLIER = 'viator';
export const VIATOR_SANDBOX_URL = 'https://api.sandbox.viator.com/partner';
export const VIATOR_PRODUCTION_URL = 'https://api.viator.com/partner';

export interface ViatorConfig {
  readonly apiKey: string;
  /** `VIATOR_SANDBOX_URL` or `VIATOR_PRODUCTION_URL`. */
  readonly baseUrl: string;
  readonly language?: string;
  /** Origin the Viator payment form is hosted on (our payment page). */
  readonly hostingUrl: string;
}

export interface ViatorTransport {
  readonly http: SupplierHttp;
  readonly config: ViatorConfig;
  readonly limiter: RollingLimiter;
}

export interface ViatorCall {
  /** Fixed audit and limiter label (`cart_hold`), never the URL. */
  readonly endpoint: string;
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export function viatorUrl(config: ViatorConfig, path: string, query?: ViatorCall['query']): URL {
  const url = new URL(`${config.baseUrl.replace(/\/$/, '')}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return url;
}

export async function viatorCall<T>(
  transport: ViatorTransport,
  call: ViatorCall,
  schema: z.ZodType<T>,
): Promise<T> {
  await transport.limiter.acquire(call.endpoint);
  const request = {
    supplier: VIATOR_SUPPLIER,
    endpoint: call.endpoint,
    url: viatorUrl(transport.config, call.path, call.query),
    method: call.method,
    headers: {
      'exp-api-key': transport.config.apiKey,
      Accept: 'application/json;version=2.0',
      'Accept-Language': transport.config.language ?? 'en-US',
    },
    timeoutMs: call.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    ...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }),
  };
  return call.method === 'GET'
    ? transport.http.getJson(request, schema)
    : transport.http.sendJson(request, schema);
}

export const VIATOR_BOOK_TIMEOUT_MS = SUPPLIER_TIMEOUT_CAP_MS;
