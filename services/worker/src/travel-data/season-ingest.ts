/**
 * `season.ingest` (docs/api-contracts-async.md §2.3: weekly, daily while in season): recomputes
 * each live destination's month `price_index` from the nightly fare cells once at least three
 * origins have a fresh fare for a month, marking those months `price_index_source = 'fares'`.
 * Editorial fields and review state are never touched; months without enough fare coverage keep
 * their editorial index. The cron fires daily at 04:00 SGT; the job does its work on Mondays and on
 * every day of a blossom or foliage window (from 30 days before it opens), when prices move fastest.
 */
import { withSystem } from '@cp/db';
import {
  FARE_REFRESH_TZ,
  FARE_STALE_HOURS,
  priceIndexFromFares,
  toLocalWallTime,
  TRAVEL_DESTINATIONS,
  type MonthFareSample,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../boss/define-job';

const IN_SEASON_LEAD_DAYS = 30;

/** Monday in SGT, or inside (or 30 days ahead of) a reviewed blossom/foliage window. */
export async function isSeasonIngestDay(tx: pg.PoolClient, now: Date): Promise<boolean> {
  const today = toLocalWallTime(now, FARE_REFRESH_TZ).date;
  if (new Date(`${today}T00:00:00Z`).getUTCDay() === 1) return true;
  const { rows } = await tx.query(
    `SELECT 1 FROM season_events
      WHERE kind IN ('blossom', 'foliage') AND reviewed_at IS NOT NULL
        AND $1::date BETWEEN starts_on - $2::int AND ends_on
      LIMIT 1`,
    [today, IN_SEASON_LEAD_DAYS],
  );
  return rows.length > 0;
}

export interface SeasonIngestReport {
  readonly destinations: number;
  readonly monthsUpdated: number;
}

/** Recomputes fare-driven price indexes for every live destination; idempotent. */
export async function recomputeSeasonPriceIndexes(
  tx: pg.PoolClient,
  now: Date,
): Promise<SeasonIngestReport> {
  const { rows: destinations } = await tx.query<{ id: string; slug: string }>(
    'SELECT id, slug FROM destinations WHERE slug = ANY ($1)',
    [Object.keys(TRAVEL_DESTINATIONS)],
  );
  let monthsUpdated = 0;
  for (const destination of destinations) {
    const destIata = TRAVEL_DESTINATIONS[destination.slug]?.airports[0];
    if (destIata === undefined) continue;
    const { rows } = await tx.query<{ month: number; origin_iata: string; price: string }>(
      `SELECT extract(month FROM month)::int AS month, origin_iata, min(price_minor) AS price
         FROM fare_cells
        WHERE dest_iata = $1 AND price_minor IS NOT NULL
          AND fetched_at > $2::timestamptz - make_interval(hours => $3)
        GROUP BY 1, 2`,
      [destIata, now, FARE_STALE_HOURS],
    );
    const byMonth = new Map<number, Map<string, number>>();
    for (const row of rows) {
      const prices = byMonth.get(row.month) ?? new Map<string, number>();
      prices.set(row.origin_iata, Number(row.price));
      byMonth.set(row.month, prices);
    }
    const samples: MonthFareSample[] = [...byMonth].map(([month, pricesByOrigin]) => ({
      month,
      pricesByOrigin,
    }));
    for (const [month, index] of priceIndexFromFares(samples)) {
      const result = await tx.query(
        `UPDATE season_months SET price_index = $3, price_index_source = 'fares'
          WHERE destination_id = $1 AND month = $2
            AND (price_index IS DISTINCT FROM $3 OR price_index_source <> 'fares')`,
        [destination.id, month, index],
      );
      monthsUpdated += result.rowCount ?? 0;
    }
  }
  return { destinations: destinations.length, monthsUpdated };
}

export function seasonIngestJob(): AnyJobDefinition {
  return defineJob({
    queue: 'season.ingest',
    schema: z.object({ force: z.boolean().optional() }).nullish(),
    async handler(data, { pool, logger }) {
      const now = new Date();
      const report = await withSystem(pool, async (tx) => {
        if (data?.force !== true && !(await isSeasonIngestDay(tx, now))) return null;
        return recomputeSeasonPriceIndexes(tx, now);
      });
      logger.info({ ...(report ?? { skipped: true }) }, 'season ingest finished');
      return report === null ? { skipped: true } : { ...report };
    },
  });
}
