/**
 * Travelpayouts booking statistics (`POST /statistics/v1/execute_query`): the actions (bookings)
 * made through our links since a date, each with the sub id its click carried, the partner's
 * programme, the price, our commission (paid or still processing) and its state. Amounts are
 * requested in USD.
 */
import { z } from 'zod';

import type { SupplierHttp } from '../../core/http';

const STATISTICS_ENDPOINT = 'statistics_actions';
const DEFAULT_BASE_URL = 'https://api.travelpayouts.com';
export const STATISTICS_PAGE_LIMIT = 1000;

const FIELDS = [
  'action_id',
  'campaign_id',
  'sub_id',
  'price_usd',
  'paid_profit_usd',
  'processing_profit_usd',
  'state',
  'date',
  'updated_at',
] as const;

const money = z.union([z.string(), z.number()]).nullish();

const actionSchema = z.object({
  action_id: z.string(),
  campaign_id: z.number().int().nullish(),
  sub_id: z.string().nullish(),
  price_usd: money,
  paid_profit_usd: money,
  processing_profit_usd: money,
  state: z.enum(['processing', 'paid', 'cancelled']),
  date: z.string(),
  updated_at: z.string(),
});

const responseSchema = z.object({
  results: z.array(actionSchema),
  total_rows: z.number().int().nonnegative(),
});

export interface TravelpayoutsAction {
  readonly externalId: string;
  readonly campaignId: number | null;
  readonly subId: string | null;
  readonly status: 'processing' | 'paid' | 'cancelled';
  /** US cents. */
  readonly priceMinor: number | null;
  /** US cents: paid commission once paid, the processing estimate before. */
  readonly commissionMinor: number;
  readonly occurredOn: string;
  /** `YYYY-MM-DD HH:MM:SS` in UTC, as reported. */
  readonly updatedAt: string;
}

export interface ActionsPage {
  readonly actions: readonly TravelpayoutsAction[];
  readonly totalRows: number;
}

function cents(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const amount = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : null;
}

export function mapAction(action: z.infer<typeof actionSchema>): TravelpayoutsAction {
  const commission =
    action.state === 'paid'
      ? cents(action.paid_profit_usd)
      : (cents(action.processing_profit_usd) ?? cents(action.paid_profit_usd));
  return {
    externalId: action.action_id,
    campaignId: action.campaign_id ?? null,
    subId: action.sub_id ?? null,
    status: action.state,
    priceMinor: cents(action.price_usd),
    commissionMinor: commission ?? 0,
    occurredOn: action.date,
    updatedAt: action.updated_at,
  };
}

export async function fetchActionsSince(
  http: SupplierHttp,
  config: { readonly token: string; readonly baseUrl?: string },
  since: string,
  offset = 0,
): Promise<ActionsPage> {
  const body = await http.sendJson(
    {
      supplier: 'travelpayouts',
      endpoint: STATISTICS_ENDPOINT,
      url: new URL('/statistics/v1/execute_query', config.baseUrl ?? DEFAULT_BASE_URL),
      method: 'POST',
      headers: { 'X-Access-Token': config.token, Accept: 'application/json' },
      body: JSON.stringify({
        fields: FIELDS,
        filters: [
          { field: 'type', op: 'eq', value: 'action' },
          { field: 'date', op: 'ge', value: since },
        ],
        sort: [{ field: 'date', order: 'asc' }],
        offset,
        limit: STATISTICS_PAGE_LIMIT,
      }),
      timeoutMs: 60_000,
    },
    responseSchema,
  );
  return { actions: body.results.map(mapAction), totalRows: body.total_rows };
}
