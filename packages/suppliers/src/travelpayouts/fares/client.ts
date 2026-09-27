/**
 * Travelpayouts Aviasales Data API v3 `prices_for_dates` (the search-only capability of the
 * `travelpayouts` adapter, docs/api-contracts.md §7): the cheapest round trips Aviasales users found
 * in the last ~48 h for one origin, destination and departure month. Estimates only, never a
 * bookable fare (we never book flights). The token travels in the `X-Access-Token` header, never in
 * the URL, so it cannot reach logs or the audit table.
 */
import { z } from 'zod';

import type { SupplierHttp } from '../../core/http';

export const TRAVELPAYOUTS_SUPPLIER = 'travelpayouts';
export const PRICES_FOR_DATES_ENDPOINT = 'prices_for_dates';
const DEFAULT_BASE_URL = 'https://api.travelpayouts.com';
/** Round trips per month the API returns at most per page; one page holds a month's cheapest. */
const PAGE_LIMIT = 100;

export const travelpayoutsPriceSchema = z.object({
  origin: z.string(),
  destination: z.string(),
  origin_airport: z.string().optional(),
  destination_airport: z.string().optional(),
  price: z.number().nonnegative(),
  departure_at: z.string(),
  return_at: z.string().optional(),
  transfers: z.number().int().nonnegative(),
  return_transfers: z.number().int().nonnegative().optional(),
  duration: z.number().int().nonnegative().optional(),
  duration_to: z.number().int().nonnegative().optional(),
  duration_back: z.number().int().nonnegative().optional(),
  link: z.string().optional(),
});
export type TravelpayoutsPrice = z.infer<typeof travelpayoutsPriceSchema>;

const pricesForDatesResponseSchema = z.object({
  success: z.boolean(),
  currency: z.string(),
  data: z.array(travelpayoutsPriceSchema),
});

export interface TravelpayoutsFaresConfig {
  readonly token: string;
  readonly baseUrl?: string;
}

export interface FareMonthQuery {
  readonly origin: string;
  readonly destination: string;
  /** `YYYY-MM` departure month. */
  readonly month: string;
}

export interface FareMonthResult {
  /** Lower-case ISO 4217 code as the API echoes it (`usd`). */
  readonly currency: string;
  readonly prices: readonly TravelpayoutsPrice[];
}

/** Every fare is requested in USD so cells compare across origins; readers convert via FX. */
export const FARE_QUERY_CURRENCY = 'usd';

export function pricesForDatesUrl(query: FareMonthQuery, baseUrl = DEFAULT_BASE_URL): URL {
  const url = new URL('/aviasales/v3/prices_for_dates', baseUrl);
  const params: Record<string, string> = {
    origin: query.origin,
    destination: query.destination,
    departure_at: query.month,
    return_at: query.month,
    one_way: 'false',
    direct: 'false',
    sorting: 'price',
    unique: 'false',
    currency: FARE_QUERY_CURRENCY,
    limit: String(PAGE_LIMIT),
    page: '1',
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

export async function fetchFareMonth(
  http: SupplierHttp,
  config: TravelpayoutsFaresConfig,
  query: FareMonthQuery,
  signal?: AbortSignal,
): Promise<FareMonthResult> {
  const body = await http.getJson(
    {
      supplier: TRAVELPAYOUTS_SUPPLIER,
      endpoint: PRICES_FOR_DATES_ENDPOINT,
      url: pricesForDatesUrl(query, config.baseUrl),
      headers: { 'X-Access-Token': config.token, Accept: 'application/json' },
      timeoutMs: 30_000,
      ...(signal !== undefined ? { signal } : {}),
    },
    pricesForDatesResponseSchema,
  );
  if (!body.success) return { currency: body.currency, prices: [] };
  return { currency: body.currency, prices: body.data };
}
