/**
 * `supplier.affiliate_conversions` (daily): imports the bookings partners report for our links into
 * `affiliate_conversions`, joined back to the click by its opaque sub id. The last 90 days are read
 * again every run, so a booking that moves from processing to paid or cancelled is updated in
 * place (one row per partner action). A report row whose sub id names no click of ours is still
 * kept (commission records), with no click.
 */
import { withSystem } from '@cp/db';
import { SUPPLIER_QUEUES } from '@cp/domain';
import {
  fetchActionsSince,
  STATISTICS_PAGE_LIMIT,
  type SupplierHttp,
  type TravelpayoutsAction,
} from '@cp/suppliers';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';

/** How far back each run re-reads, to catch state changes on earlier bookings. */
export const CONVERSIONS_LOOKBACK_DAYS = 90;
/** Guard against a runaway report: pages per run. */
const MAX_PAGES = 50;

export interface ConversionsDeps {
  readonly http: SupplierHttp;
  readonly token: string;
}

function sinceDate(now: Date): string {
  return new Date(now.getTime() - CONVERSIONS_LOOKBACK_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** `YYYY-MM-DD HH:MM:SS` (UTC, as reported) to an instant. */
function reportedAt(value: string, fallback: Date): Date {
  const at = new Date(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(at.getTime()) ? fallback : at;
}

async function upsert(pool: pg.Pool, actions: readonly TravelpayoutsAction[], now: Date) {
  if (actions.length === 0) return 0;
  return withSystem(pool, async (tx) => {
    let written = 0;
    for (const action of actions) {
      const result = await tx.query(
        `INSERT INTO affiliate_conversions (partner, external_id, sub_id, click_id, campaign_id,
           status, price_minor, commission_minor, currency, occurred_on, reported_at)
         SELECT coalesce(c.partner, 'travelpayouts'), $1, $2, c.id, $3, $4, $5, $6, 'USD', $7, $8
           FROM (SELECT 1) one
           LEFT JOIN affiliate_clicks c ON c.sub_id = $2
         ON CONFLICT (partner, external_id) DO UPDATE SET
           status = EXCLUDED.status,
           price_minor = EXCLUDED.price_minor,
           commission_minor = EXCLUDED.commission_minor,
           reported_at = EXCLUDED.reported_at
         WHERE affiliate_conversions.reported_at < EXCLUDED.reported_at
            OR affiliate_conversions.status <> EXCLUDED.status`,
        [
          action.externalId,
          action.subId,
          action.campaignId,
          action.status,
          action.priceMinor,
          action.commissionMinor,
          action.occurredOn,
          reportedAt(action.updatedAt, now),
        ],
      );
      written += result.rowCount ?? 0;
    }
    return written;
  });
}

export async function importConversions(
  pool: pg.Pool,
  deps: ConversionsDeps,
  now: Date = new Date(),
): Promise<{ readonly read: number; readonly written: number }> {
  const since = sinceDate(now);
  let read = 0;
  let written = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { actions, totalRows } = await fetchActionsSince(
      deps.http,
      { token: deps.token },
      since,
      page * STATISTICS_PAGE_LIMIT,
    );
    read += actions.length;
    written += await upsert(pool, actions, now);
    if (actions.length < STATISTICS_PAGE_LIMIT || read >= totalRows) break;
  }
  return { read, written };
}

export function affiliateConversionsJob(
  deps: ConversionsDeps,
): JobDefinition<Record<string, unknown>> {
  return defineJob({
    queue: SUPPLIER_QUEUES.affiliateConversions,
    schema: z.object({}).passthrough(),
    handler: async (_data, ctx) => ({ ...(await importConversions(ctx.pool, deps)) }),
  });
}
